/**
 * The Template JSON validator API (E1-S6): `validate()` and `parse()`.
 *
 * This is the *general* template validator the earlier focused validators
 * (`validatePageSettings`, `validateStyle`, `validateElement`,
 * `validateBinding`) said would "fold their checks in". It runs in two layers:
 *
 * 1. **Structural** — ajv compiles {@link TEMPLATE_JSON_SCHEMA} (shape, required
 *    keys, enums, ranges, the element discriminated union). ajv errors are
 *    mapped to human-readable, dot/bracket-pathed {@link RendaraValidationError}s.
 * 2. **Semantic** — only if the structure is sound, the cross-field/referential
 *    rules JSON Schema can't express run: margins leaving a positive content
 *    area, group aggregates referencing real columns, a text/image element
 *    carrying *either* a literal or a binding, a table having at least one
 *    column (brief §5, §6).
 *
 * Layering short-circuits: structurally-broken input returns ajv errors only, so
 * the semantic pass never walks malformed data. The validator is compiled once
 * at module load and reused.
 *
 * (The hard rule against `eval`/`new Function` concerns *template expressions* —
 * the engine's JSONata sandbox — not schema validation. ajv compiles this schema
 * into a plain JS validator function here at module load, using no template-
 * supplied code.)
 */

import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';

import { validateElement } from './element-validation';
import { TEMPLATE_JSON_SCHEMA } from './json-schema';
import { validatePageSettings } from './page-settings';
import type { Band, RendaraTemplate } from './template';

/**
 * A single validation problem: a dot/bracket path to the offending field and a
 * human-readable message. `keyword` is the failing rule — an ajv keyword
 * (`required`, `enum`, `additionalProperties`, …), `'semantic'` for a
 * cross-field rule, or `'parse'` for malformed JSON.
 */
export interface RendaraValidationError {
  readonly path: string;
  readonly message: string;
  readonly keyword: string;
}

/**
 * A discriminated success/failure result. On success, `value` is the input
 * narrowed to the validated type; on failure, `errors` lists every problem
 * found.
 */
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: E };

/** ajv instance: collect all errors, honour the `discriminator` keyword. */
const ajv = new Ajv({ allErrors: true, discriminator: true, strict: false });
addFormats(ajv);

const validateStructure: ValidateFunction = ajv.compile(TEMPLATE_JSON_SCHEMA);

/**
 * Converts an ajv `instancePath` (`/body/elements/0/frame/wMm`) plus an optional
 * trailing key into a dot/bracket path (`body.elements[0].frame.wMm`). Numeric
 * segments become `[n]`; the empty root path renders as `(root)`.
 */
function toPath(instancePath: string, extraKey?: string): string {
  const segments = instancePath.split('/').filter((s) => s.length > 0);
  if (extraKey !== undefined) {
    segments.push(extraKey);
  }
  if (segments.length === 0) {
    return '(root)';
  }
  return segments.reduce((acc, raw) => {
    // ajv escapes `/` as ~1 and `~` as ~0 in JSON Pointer segments.
    const seg = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (/^\d+$/.test(seg)) {
      return `${acc}[${seg}]`;
    }
    return acc.length === 0 ? seg : `${acc}.${seg}`;
  }, '');
}

/** Builds a human-readable message + precise path for one ajv error. */
function fromAjvError(error: ErrorObject): RendaraValidationError {
  const at = (extra?: string): string => toPath(error.instancePath, extra);

  switch (error.keyword) {
    case 'required': {
      const key = (error.params as { missingProperty: string }).missingProperty;
      return {
        path: at(key),
        message: `Missing required property '${key}' at '${at()}'.`,
        keyword: error.keyword,
      };
    }
    case 'additionalProperties': {
      const key = (error.params as { additionalProperty: string }).additionalProperty;
      return {
        path: at(key),
        message: `Unexpected property '${key}' at '${at()}'.`,
        keyword: error.keyword,
      };
    }
    case 'enum': {
      const allowed = (error.params as { allowedValues: readonly unknown[] }).allowedValues;
      return {
        path: at(),
        message: `Value at '${at()}' must be one of: ${allowed
          .map((v) => JSON.stringify(v))
          .join(', ')}.`,
        keyword: error.keyword,
      };
    }
    case 'discriminator': {
      // A missing/unknown `type` discriminant on an element.
      return {
        path: at('type'),
        message: `Invalid or missing element 'type' discriminant at '${at()}'.`,
        keyword: error.keyword,
      };
    }
    default:
      return {
        path: at(),
        message: `Value at '${at()}' ${error.message ?? 'is invalid'}.`,
        keyword: error.keyword,
      };
  }
}

/**
 * ajv's discriminator emits a `discriminator` error *and*, for a non-matching
 * branch, may add generic `oneOf`/per-branch noise. Drop the noisy `oneOf`
 * wrapper so callers see the precise per-field or discriminator error.
 */
function mapAjvErrors(errors: readonly ErrorObject[] | null | undefined): RendaraValidationError[] {
  return (errors ?? []).filter((e) => e.keyword !== 'oneOf').map(fromAjvError);
}

/** The three page bands, in document order, for the semantic element pass. */
const BAND_NAMES = ['header', 'body', 'footer'] as const;

/**
 * Runs the cross-field/referential checks JSON Schema can't express over a
 * structurally-valid template, prefixing each focused-validator path with its
 * location in the template.
 */
function collectSemanticErrors(template: RendaraTemplate): RendaraValidationError[] {
  const errors: RendaraValidationError[] = [];

  for (const error of validatePageSettings(template.page)) {
    errors.push({ path: error.path, message: error.message, keyword: 'semantic' });
  }

  for (const band of BAND_NAMES) {
    const elements = (template[band] as Band).elements;
    elements.forEach((element, index) => {
      for (const error of validateElement(element)) {
        errors.push({
          path: `${band}.elements[${index}].${error.path}`,
          message: error.message,
          keyword: 'semantic',
        });
      }
    });
  }

  return errors;
}

/**
 * Validates an already-parsed template object (E1-S6). Returns a {@link Result}:
 * on success the input narrowed to {@link RendaraTemplate}; on failure every
 * structural *or* semantic problem found, each with a path and friendly message.
 *
 * Structural (ajv) and semantic checks are layered: if the shape is wrong, only
 * the ajv errors are returned (the semantic pass is skipped so it never walks
 * malformed data).
 */
export function validate(template: unknown): Result<RendaraTemplate, RendaraValidationError[]> {
  if (!validateStructure(template)) {
    return { ok: false, errors: mapAjvErrors(validateStructure.errors) };
  }
  const semantic = collectSemanticErrors(template as RendaraTemplate);
  if (semantic.length > 0) {
    return { ok: false, errors: semantic };
  }
  return { ok: true, value: template as RendaraTemplate };
}

/**
 * Parses (if a string) and validates a template (E1-S6). A string is `JSON.parse`d
 * first; malformed JSON returns a single `'parse'` error rather than throwing.
 * An object is validated as-is. Either way the result is the same {@link Result}
 * shape as {@link validate}.
 */
export function parse(input: string | object): Result<RendaraTemplate, RendaraValidationError[]> {
  let parsed: unknown = input;
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input);
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      return {
        ok: false,
        errors: [
          { path: '(root)', message: `Template is not valid JSON: ${reason}`, keyword: 'parse' },
        ],
      };
    }
  }
  return validate(parsed);
}

/** Convenience boolean wrapper over {@link validate}. */
export function isValidTemplate(template: unknown): template is RendaraTemplate {
  return validate(template).ok;
}
