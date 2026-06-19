/**
 * Binding model behavior (E1-S5): a focused validator for an {@link
 * ElementBinding} slot.
 *
 * `binding.ts` declares the binding *type*; this file owns its *behavior* — a
 * small, self-contained `validateBinding` shared by every binding location
 * (element `binding`, table column `cell`/`footer`, group-band `label` and
 * aggregates), so the binding model is unit-testable today.
 *
 * Scope note (same as `page-settings.ts` / `style-validation.ts` /
 * `element-validation.ts`): this is **not** the general template validator. The
 * ajv-backed `validate()`/`RendaraValidationError` API is **E1-S6** and will
 * fold these checks in; here we ship just enough to reject malformed bindings
 * with clear, path-pointed messages (E1-S5 QA). The expression *grammar* is the
 * engine's concern (**E2-S1**) — here `expr` is only required to be a non-empty
 * string; the format-token grammar is **E2-S2**'s.
 */

import type { ElementBinding } from './binding';

/** A single binding problem, with a dotted path to the offending field. */
export interface BindingError {
  readonly path: string;
  readonly message: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Focused binding validation (E1-S5 QA). Checks the required `expr` and the
 * optional `format`/`fallback` modifiers of one {@link ElementBinding},
 * returning one {@link BindingError} per problem (an empty array means valid).
 *
 * `basePath` prefixes every reported path (defaults to `binding`); callers pass
 * the binding's location, e.g. `<id>.binding`, `<id>.columns[0].cell`, or
 * `<id>.groups[0].footer.aggregates[1].binding`.
 *
 * Rules:
 * - `expr` — required, non-empty string (the binding's essence).
 * - `format` — optional; `null`/absent means "no formatting"; a present non-null
 *   value must be a non-empty token string (mirrors `validateStyle`'s `format`).
 * - `fallback` — optional; `null`/absent means "no fallback"; a present non-null
 *   value must be a string. Unlike `format`, an empty string `''` is allowed (an
 *   explicit "show nothing").
 *
 * Defensive `typeof` checks are used throughout because this may run over
 * untrusted parsed JSON, not just well-typed objects.
 */
export function validateBinding(binding: ElementBinding, basePath = 'binding'): BindingError[] {
  const errors: BindingError[] = [];

  if (!isNonEmptyString(binding.expr)) {
    errors.push({
      path: `${basePath}.expr`,
      message: `Binding '${basePath}' must have a non-empty expression string, got ${JSON.stringify(binding.expr)}.`,
    });
  }

  // `null` is a legal "no formatting" value; only a present non-null token is checked.
  if (
    binding.format !== undefined &&
    binding.format !== null &&
    !isNonEmptyString(binding.format)
  ) {
    errors.push({
      path: `${basePath}.format`,
      message: `Binding format token must be null or a non-empty string, got ${JSON.stringify(binding.format)}.`,
    });
  }

  // `fallback` is a literal display string: `null`/absent = none, and `''` is a
  // legal explicit "show nothing", so only a present non-null non-string fails.
  if (
    binding.fallback !== undefined &&
    binding.fallback !== null &&
    typeof binding.fallback !== 'string'
  ) {
    errors.push({
      path: `${basePath}.fallback`,
      message: `Binding fallback must be null or a string, got ${JSON.stringify(binding.fallback)}.`,
    });
  }

  return errors;
}

/** Convenience boolean wrapper over {@link validateBinding}. */
export function isValidBinding(binding: ElementBinding): boolean {
  return validateBinding(binding).length === 0;
}
