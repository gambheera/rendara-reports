import {
  paginate,
  resolveDataTable,
  resolveElement,
  type PaginatedDocument,
  type ResolveOptions,
  type ResolvedDataTable,
  type Watermark,
} from '@rendara/report-engine';
import {
  migrate,
  validate,
  type RendaraTemplate,
  type TemplateElement,
} from '@rendara/report-schema';

import type { ViewerError } from './viewer-api';

/**
 * The viewer's **render pipeline** (E7-S2): the framework-agnostic
 * validate → bind → paginate function the {@link ReportViewer} component drives.
 *
 * It runs the *exact same* shared engine path the designer preview uses (brief
 * §7, "one renderer, two modes"):
 *
 * 1. **Validate** — a raw JSON string is `JSON.parse`d, then any input is run
 *    through {@link migrate} (carrying an older `schemaVersion` forward) and
 *    {@link validate}d against the current schema. Migrating *before* validating
 *    is what lets an older template load.
 * 2. **Bind** — every bound text/image element is resolved to its display string
 *    (the renderer's `resolvedValues` map) and every data table is resolved to
 *    its rows + aggregates ({@link resolveDataTable}), all through the sandboxed
 *    JSONata + `Intl` engine. No `eval`/`new Function`.
 * 3. **Paginate** — {@link paginate} lays the bound document out into a
 *    multi-page {@link PaginatedDocument} the shared renderer paints.
 *
 * The function is **total**: it never throws. Each stage failure is mapped to a
 * surfaced {@link ViewerError} (kind `validation` / `binding` / `render`) so the
 * component can emit `(error)` instead of crashing (the friendly error *UI*
 * lands in E7-S5). A `null`/blank template — or a valid template with no `data`
 * to bind (`null`/`undefined`) — yields the `empty` status, which E7-S5 paints as
 * the "No data to display" placeholder. (An empty object `{}` counts as data and
 * renders, so a fully-static template still shows.)
 *
 * Because resolution and pagination are deterministic and locale-pinned to the
 * template's own `metadata.locale`, the document this produces for a given
 * template + data is byte-for-byte the engine's shared baseline — so the goldens
 * render in the viewer exactly as the engine snapshots them (story QA).
 */

/** Tuning for {@link runPipeline}. */
export interface PipelineOptions {
  /**
   * BCP-47 locale for `Intl` formatting. Defaults to the template's own
   * `metadata.locale`, which keeps the viewer's output identical to the engine's
   * golden baseline.
   */
  readonly locale?: string;
  /** Watermark stamped behind every page (brief §8 `config.watermark`); `null` for none. */
  readonly watermark?: Watermark | null;
}

/**
 * Outcome of {@link runPipeline}, a discriminated union:
 *
 * - `empty` — no template to render (`null` or a blank string).
 * - `error` — a stage failed; `error` is the surfaced {@link ViewerError}.
 * - `rendered` — the validated `template`, its paginated `document` and the
 *   `resolvedValues` map the shared renderer needs to paint bound elements.
 */
export type PipelineResult =
  | { readonly status: 'empty' }
  | { readonly status: 'error'; readonly error: ViewerError }
  | {
      readonly status: 'rendered';
      readonly template: RendaraTemplate;
      readonly document: PaginatedDocument;
      readonly resolvedValues: ReadonlyMap<string, string>;
    };

/** All elements across the header, body and footer bands, in band order. */
function collectElements(template: RendaraTemplate): readonly TemplateElement[] {
  return [...template.header.elements, ...template.body.elements, ...template.footer.elements];
}

/**
 * Normalises the `template` input into a validated {@link RendaraTemplate}, or a
 * `validation` {@link ViewerError}, or `null` for an empty input. A string is
 * parsed as JSON first; any value is then migrated to the current schema and
 * validated.
 */
function normaliseTemplate(
  template: RendaraTemplate | string | null,
): RendaraTemplate | ViewerError | null {
  if (template === null) {
    return null;
  }

  let parsed: unknown = template;
  if (typeof template === 'string') {
    if (template.trim() === '') {
      return null;
    }
    try {
      parsed = JSON.parse(template);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      return { kind: 'validation', message: `Template is not valid JSON: ${detail}` };
    }
  }

  const migrated = migrate(parsed);
  if (!migrated.ok) {
    return {
      kind: 'validation',
      message: `Template failed validation: ${migrated.errors[0]?.message ?? 'could not migrate template'}`,
    };
  }

  const validated = validate(migrated.value);
  if (!validated.ok) {
    return {
      kind: 'validation',
      message: `Template failed validation: ${validated.errors[0]?.message ?? 'invalid template'}`,
      details: validated.errors,
    };
  }

  return validated.value;
}

/**
 * Resolves the display strings of every **bound** text/image element in
 * `template` against `data`, keyed by element id. Elements with no binding are
 * omitted — the renderer paints their static literal — exactly as the designer
 * preview does, so the two views agree.
 */
async function resolveBoundValues(
  template: RendaraTemplate,
  data: unknown,
  options?: ResolveOptions,
): Promise<Map<string, string>> {
  const bound = collectElements(template).filter(
    (el) => (el.type === 'text' || el.type === 'image') && el.binding !== undefined,
  );
  const entries = await Promise.all(
    bound.map(async (el): Promise<[string, string]> => {
      const resolved = await resolveElement(el, data, options);
      return [el.id, resolved?.formatted ?? ''];
    }),
  );
  return new Map(entries);
}

/** Resolves every data table in `template` against `data`, keyed by element id. */
async function resolveTables(
  template: RendaraTemplate,
  data: unknown,
  options?: ResolveOptions,
): Promise<Map<string, ResolvedDataTable>> {
  const tables = collectElements(template).filter((el) => el.type === 'dataTable');
  const entries = await Promise.all(
    tables.map(
      async (el): Promise<[string, ResolvedDataTable]> => [
        el.id,
        await resolveDataTable(el, data, options),
      ],
    ),
  );
  return new Map(entries);
}

/** Builds a `render` {@link ViewerError} from an unknown thrown cause. */
function renderError(kind: 'binding' | 'render', cause: unknown): ViewerError {
  const detail = cause instanceof Error ? cause.message : String(cause);
  const what = kind === 'binding' ? 'bind data' : 'render report';
  return { kind, message: `Failed to ${what}: ${detail}` };
}

/**
 * Runs the validate → bind → paginate pipeline for a template + data pair.
 * Total: every failure is returned as a {@link PipelineResult}, never thrown.
 */
export async function runPipeline(
  template: RendaraTemplate | string | null,
  data: unknown,
  options?: PipelineOptions,
): Promise<PipelineResult> {
  const normalised = normaliseTemplate(template);
  if (normalised === null) {
    return { status: 'empty' };
  }
  if ('kind' in normalised) {
    return { status: 'error', error: normalised };
  }

  // A valid template with no data to bind is the "No data to display" empty
  // state (E7-S5), not an error: the host simply hasn't supplied data yet. An
  // empty object `{}` is data — a static template still renders.
  if (data === null || data === undefined) {
    return { status: 'empty' };
  }

  const resolveOptions: ResolveOptions = {
    locale: options?.locale ?? normalised.metadata.locale,
  };

  let resolvedValues: ReadonlyMap<string, string>;
  let resolvedTables: ReadonlyMap<string, ResolvedDataTable>;
  try {
    [resolvedValues, resolvedTables] = await Promise.all([
      resolveBoundValues(normalised, data, resolveOptions),
      resolveTables(normalised, data, resolveOptions),
    ]);
  } catch (cause) {
    return { status: 'error', error: renderError('binding', cause) };
  }

  try {
    const document = paginate(normalised, resolvedTables, {
      watermark: options?.watermark ?? null,
    });
    return { status: 'rendered', template: normalised, document, resolvedValues };
  } catch (cause) {
    return { status: 'error', error: renderError('render', cause) };
  }
}
