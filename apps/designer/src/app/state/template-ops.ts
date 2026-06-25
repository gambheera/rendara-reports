import {
  DEFAULT_PAGE,
  SCHEMA_VERSION,
  type Band,
  type Page,
  type RendaraTemplate,
  type TemplateElement,
} from '@rendara/report-schema';

/**
 * Pure, framework-agnostic helpers that produce immutable updates to a
 * {@link RendaraTemplate}. They are the substrate for the designer store
 * (E5-S2): every function returns a brand-new template (with new band and
 * element-array references) and never mutates its input, so the store can rely
 * on reference changes to drive change detection and a future undo stack
 * (E5-S9). When an operation targets an id that does not exist, the original
 * template is returned unchanged so callers can detect the no-op by identity.
 */

/** The three band keys an element can live in (brief §5). */
const BAND_KEYS = ['header', 'body', 'footer'] as const;
type BandKey = (typeof BAND_KEYS)[number];

/**
 * Builds a minimal, schema-valid empty document: the default A4 page, the
 * current {@link SCHEMA_VERSION}, a freshly generated id and timestamp, and
 * three empty bands. This is the seed for a new designer session.
 */
export function createEmptyTemplate(): RendaraTemplate {
  const emptyBand: Band = { elements: [] };
  return {
    schemaVersion: SCHEMA_VERSION,
    metadata: {
      name: 'Untitled report',
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      locale: 'en-US',
    },
    page: DEFAULT_PAGE,
    header: emptyBand,
    body: { elements: [] },
    footer: { elements: [] },
  };
}

/** All elements across the header, body and footer bands, in band order. */
export function collectElements(template: RendaraTemplate): readonly TemplateElement[] {
  return BAND_KEYS.flatMap((key) => template[key].elements);
}

/** Finds an element by id across every band, or `undefined` if absent. */
export function findElement(template: RendaraTemplate, id: string): TemplateElement | undefined {
  for (const key of BAND_KEYS) {
    const found = template[key].elements.find((el) => el.id === id);
    if (found) return found;
  }
  return undefined;
}

/** True when an element with `id` exists in any band. */
export function hasElement(template: RendaraTemplate, id: string): boolean {
  return findElement(template, id) !== undefined;
}

/** Returns a copy of `template` with `element` appended to the body band. */
export function addElementToBody(
  template: RendaraTemplate,
  element: TemplateElement,
): RendaraTemplate {
  return {
    ...template,
    body: { elements: [...template.body.elements, element] },
  };
}

/**
 * Returns a copy of `template` with the element matching `id` shallow-merged
 * with `changes`. The merge preserves the element's `type` discriminant, so a
 * caller cannot accidentally change an element's kind. If no element matches,
 * the original template is returned unchanged (by identity).
 */
export function updateElementById(
  template: RendaraTemplate,
  id: string,
  changes: Partial<TemplateElement>,
): RendaraTemplate {
  const key = bandKeyOf(template, id);
  if (key === undefined) return template;

  const elements = template[key].elements.map((el) =>
    el.id === id ? ({ ...el, ...changes, id: el.id, type: el.type } as TemplateElement) : el,
  );
  return { ...template, [key]: { elements } };
}

/**
 * Returns a copy of `template` with several elements patched in one pass: each
 * element whose id is a key of `changesById` is shallow-merged with its changes
 * (preserving `id` and `type`, like {@link updateElementById}). Used by
 * multi-element edits — group move and z-order renumbering (E5-S7) — so the whole
 * batch lands in a single new template reference. Only bands containing a matched
 * id are rebuilt; if nothing matches, the original template is returned unchanged.
 */
export function updateElementsById(
  template: RendaraTemplate,
  changesById: ReadonlyMap<string, Partial<TemplateElement>>,
): RendaraTemplate {
  if (changesById.size === 0) return template;
  let changed = false;
  const next: Partial<Record<BandKey, Band>> = {};
  for (const key of BAND_KEYS) {
    const band = template[key];
    if (!band.elements.some((el) => changesById.has(el.id))) continue;
    changed = true;
    next[key] = {
      elements: band.elements.map((el) => {
        const changes = changesById.get(el.id);
        return changes ? ({ ...el, ...changes, id: el.id, type: el.type } as TemplateElement) : el;
      }),
    };
  }
  return changed ? { ...template, ...next } : template;
}

/**
 * Returns a copy of `template` with the element matching `id` removed from its
 * band. If no element matches, the original template is returned unchanged.
 */
export function removeElementById(template: RendaraTemplate, id: string): RendaraTemplate {
  const key = bandKeyOf(template, id);
  if (key === undefined) return template;

  const elements = template[key].elements.filter((el) => el.id !== id);
  return { ...template, [key]: { elements } };
}

/** Returns a copy of `template` with its page replaced. */
export function setPageOf(template: RendaraTemplate, page: Page): RendaraTemplate {
  return { ...template, page };
}

/** The band key containing `id`, or `undefined` if no band has it. */
function bandKeyOf(template: RendaraTemplate, id: string): BandKey | undefined {
  return BAND_KEYS.find((key) => template[key].elements.some((el) => el.id === id));
}
