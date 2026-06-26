/**
 * Template export / import (E6-S10) — the pure, framework-agnostic bridge between
 * the designer's in-memory document and a portable Template JSON file.
 *
 * Both directions go through the versioned-contract machinery in
 * `@rendara/report-schema` (brief §5), so the designer never invents its own
 * serialization or validation:
 *
 * - **Export** is plain `JSON.stringify` of the current {@link RendaraTemplate}.
 *   The template the store holds is already schema-valid, but callers
 *   {@link validate} it first so the UI can show the "validated" state and refuse
 *   to emit a broken file.
 * - **Import** runs `JSON.parse` → {@link migrate} → {@link validate}. Migrating
 *   *before* validating is what lets an older template load: {@link migrate}
 *   carries a `0.9.0` (or any registered past version) document forward to the
 *   current shape, and only then is it validated against the current schema. A
 *   current-version file passes through `migrate` as an equivalent clone, so the
 *   same path serves both cases (story QA: "invalid/older templates handled").
 *
 * This module is intentionally Angular-free and side-effect-free (no DOM, no
 * downloads, no clipboard) so it is exhaustively unit-testable; the dialog
 * component owns the browser I/O. No `eval`/`new Function` — serialization is
 * `JSON`, and migrations are the schema lib's hand-written transforms.
 */

import {
  CURRENT_SCHEMA_VERSION,
  migrate,
  validate,
  type RendaraTemplate,
  type RendaraValidationError,
} from '@rendara/report-schema';

/** Indentation (spaces) used when pretty-printing exported JSON. */
const PRETTY_INDENT = 2;

/** Options controlling how a template is serialized for export. */
export interface SerializeOptions {
  /** When `true`, emit human-readable 2-space-indented JSON; else a compact line. */
  readonly prettyPrint: boolean;
}

/**
 * Serializes a template to a JSON string (E6-S10). Pretty-print indents with two
 * spaces for a readable file/preview; the compact form is a single minified line.
 * Pure `JSON.stringify` — the template is the source of truth and is emitted as-is
 * (designer-only view-state such as grouping or imported sample data never lives
 * on the template, so it cannot leak into the export).
 */
export function serializeTemplate(
  template: RendaraTemplate,
  { prettyPrint }: SerializeOptions,
): string {
  return JSON.stringify(template, null, prettyPrint ? PRETTY_INDENT : undefined);
}

/**
 * Outcome of {@link importTemplate}. On success the migrated, validated template
 * plus whether a migration actually ran (`migrated`) and the version the file
 * declared (`fromVersion`), so the UI can note "migrated from 0.9.0". On failure,
 * a friendly message list (parse, migration or validation problems).
 */
export type ImportTemplateResult =
  | {
      readonly ok: true;
      readonly template: RendaraTemplate;
      readonly migrated: boolean;
      readonly fromVersion: string | null;
    }
  | { readonly ok: false; readonly errors: readonly string[] };

/** Reads a `schemaVersion` string from an unknown parsed value, or `null`. */
function readVersion(input: unknown): string | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const version = (input as Record<string, unknown>)['schemaVersion'];
  return typeof version === 'string' ? version : null;
}

/** Formats a schema validation problem as a one-line `path: message` string. */
function formatValidationError(error: RendaraValidationError): string {
  return `${error.path}: ${error.message}`;
}

/**
 * Parses, migrates and validates a Template JSON string (E6-S10). The full import
 * pipeline:
 *
 * 1. `JSON.parse` — malformed JSON returns a single friendly parse error.
 * 2. {@link migrate} — older templates are carried forward to the current schema
 *    version; a current-version file passes through unchanged. A missing/unknown
 *    version surfaces the migration runner's message.
 * 3. {@link validate} — the migrated shape is validated against the current schema;
 *    every structural/semantic problem is reported with its path.
 *
 * Never throws: every failure mode comes back as `{ ok: false, errors }`.
 */
export function importTemplate(text: string): ImportTemplateResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return { ok: false, errors: [`That file isn't valid JSON: ${reason}`] };
  }

  const fromVersion = readVersion(parsed);

  const migrated = migrate(parsed);
  if (!migrated.ok) {
    return { ok: false, errors: migrated.errors.map((error) => error.message) };
  }

  const validated = validate(migrated.value);
  if (!validated.ok) {
    return { ok: false, errors: validated.errors.map(formatValidationError) };
  }

  return {
    ok: true,
    template: validated.value,
    migrated: fromVersion !== CURRENT_SCHEMA_VERSION,
    fromVersion,
  };
}

/**
 * Suggests a download filename from the template's metadata name (E6-S10): the
 * name lower-cased, non-alphanumeric runs collapsed to single hyphens and trimmed,
 * suffixed with `.json`. Falls back to `template.json` when the name has no usable
 * characters, so the field is never empty.
 */
export function suggestExportFileName(template: RendaraTemplate): string {
  const slug = template.metadata.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug.length > 0 ? slug : 'template'}.json`;
}
