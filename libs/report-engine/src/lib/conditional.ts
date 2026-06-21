/**
 * Conditional visibility & conditional styling (E2-S3) — the engine's gateway
 * for "show/hide and restyle based on data" (brief §6). Builds directly on the
 * sandboxed evaluator (E2-S1): every condition is a JSONata boolean expression
 * run through {@link evaluate}, so there is no `eval`/`new Function` here either
 * (a project hard rule).
 *
 * Two pure, async, **total** (never-throw) entry points:
 *
 * 1. **Visibility** — {@link evaluateVisibility} evaluates an element's
 *    `visibleWhen` against a data scope and returns a concrete boolean (plus any
 *    structured error). The schema already carries `visibleWhen` on every
 *    element, so this binds straight to it.
 * 2. **Conditional style** — {@link resolveConditionalStyle} takes a base
 *    {@link ElementStyle} plus an ordered list of `when → style` {@link StyleRule}s
 *    and merges the overrides of every matching rule into one concrete style.
 *    The {@link StyleRule} shape is an **engine-level** type (the Template JSON
 *    schema does not yet model conditional style rules; adding one is a separate,
 *    versioned schema story). The resolver is ready for that field when it lands.
 *
 * ## Fail-safe default (documented)
 * A condition that throws — a compile or runtime {@link ExpressionError} —
 * **fails safe**: visibility defaults to **visible** and a style rule is
 * **skipped** (its override is not applied). The rationale is that an authoring
 * mistake in a condition must never silently *hide* content or wipe a base
 * style; instead the content stays and the structured error is surfaced for the
 * host to report (richer missing-data warnings are E2-S6). The visibility
 * default is overridable via {@link VisibilityOptions.defaultOnError}.
 *
 * A condition that evaluates **cleanly to a falsy value** (e.g. a missing data
 * path resolving to `undefined`) is *not* an error: it correctly hides the
 * element / does not apply the rule. Truthiness follows JSONata's `$boolean`
 * semantics (see {@link jsonataBoolean}), not JavaScript's, so coercion matches
 * the expression language.
 */

import type { ElementStyle } from '@rendara/report-schema';

import { evaluate, type ExpressionError } from './expression';

/**
 * Coerces a JSONata evaluation result to a boolean using **JSONata `$boolean`
 * semantics** (deliberately *not* JS truthiness):
 *
 * - `null`/`undefined` → `false`
 * - boolean → itself
 * - number → `false` for `0`/`NaN`, else `true`
 * - string → `false` when empty, else `true`
 * - array → `true` if **any** element coerces to `true` (recursively); `[]` → `false`
 * - function → `false`
 * - object → `true` when it has at least one own key; `{}` → `false`
 */
export function jsonataBoolean(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0 && !Number.isNaN(value);
  }
  if (typeof value === 'string') {
    return value.length > 0;
  }
  if (Array.isArray(value)) {
    return value.some((v) => jsonataBoolean(v));
  }
  if (typeof value === 'function') {
    return false;
  }
  if (typeof value === 'object') {
    return Object.keys(value).length > 0;
  }
  return false;
}

// --- visibility --------------------------------------------------------------

/** Options for {@link evaluateVisibility}. */
export interface VisibilityOptions {
  /**
   * Visibility used when the condition **errors** (compile or runtime). Defaults
   * to `true` (fail safe → visible); see the module doc.
   */
  readonly defaultOnError?: boolean;
}

/**
 * Outcome of {@link evaluateVisibility}: the resolved `visible` flag, plus the
 * structured `error` when the condition failed to compile/evaluate (in which
 * case `visible` is the {@link VisibilityOptions.defaultOnError} default).
 */
export interface VisibilityResult {
  readonly visible: boolean;
  readonly error?: ExpressionError;
}

/**
 * Evaluates an element's `visibleWhen` condition against `scope`.
 *
 * - `null`/`undefined`/blank `visibleWhen` → **visible** (no condition = always
 *   shown), with no evaluation.
 * - Otherwise the expression is evaluated in the sandbox and its result coerced
 *   via {@link jsonataBoolean}.
 * - A compile/runtime error → the {@link VisibilityOptions.defaultOnError}
 *   default (visible unless overridden), and the error is returned for the host.
 *
 * Total — never throws.
 */
export async function evaluateVisibility(
  visibleWhen: string | null | undefined,
  scope: unknown,
  options?: VisibilityOptions,
): Promise<VisibilityResult> {
  if (visibleWhen === null || visibleWhen === undefined || visibleWhen.trim() === '') {
    return { visible: true };
  }

  const result = await evaluate(visibleWhen, scope);
  if (!result.ok) {
    return { visible: options?.defaultOnError ?? true, error: result.error };
  }
  return { visible: jsonataBoolean(result.value) };
}

// --- conditional style -------------------------------------------------------

/**
 * One conditional-style rule (engine-level type): when `when` evaluates truthy
 * over the data scope, its `style` overrides are merged onto the element's base
 * style. Rules apply in array order, so a later matching rule wins over an
 * earlier one for any field they both set.
 */
export interface StyleRule {
  /** JSONata boolean expression gating this rule's `style`. */
  readonly when: string;
  /** Partial style overrides applied (merged) when `when` is truthy. */
  readonly style: ElementStyle;
}

/**
 * Outcome of {@link resolveConditionalStyle}: the concrete merged `style` and
 * the structured `errors` of any rule whose condition failed to compile/evaluate
 * (those rules are skipped — fail safe).
 */
export interface ResolveStyleResult {
  readonly style: ElementStyle;
  readonly errors: readonly ExpressionError[];
}

/**
 * Resolves conditional style rules to a single concrete {@link ElementStyle}.
 *
 * Starts from `base` (an empty style if absent) and, for each rule in order
 * whose `when` evaluates truthy, deep-merges its `style` overrides on top. A rule
 * whose condition **errors** is skipped (its error is collected); a rule whose
 * condition is cleanly falsy simply does not apply.
 *
 * Total — never throws.
 */
export async function resolveConditionalStyle(
  base: ElementStyle | undefined,
  rules: readonly StyleRule[] | undefined,
  scope: unknown,
): Promise<ResolveStyleResult> {
  let style: ElementStyle = base ?? {};
  const errors: ExpressionError[] = [];

  for (const rule of rules ?? []) {
    const result = await evaluate(rule.when, scope);
    if (!result.ok) {
      errors.push(result.error);
      continue;
    }
    if (jsonataBoolean(result.value)) {
      style = mergeStyle(style, rule.style);
    }
  }

  return { style, errors };
}

/**
 * Deep-merges `override` onto `base` one level into the nested style sub-objects
 * (font, border, align, padding, stroke), so a partial override (e.g. only
 * `border.bottom`) does not clobber sibling fields the base set. Scalar fields
 * and `null` from `override` win. Plain objects are merged recursively; anything
 * else replaces.
 */
function mergeStyle(base: ElementStyle, override: ElementStyle): ElementStyle {
  return deepMerge(
    base as Record<string, unknown>,
    override as Record<string, unknown>,
  ) as ElementStyle;
}

/** True for a mergeable plain object (not null, not an array). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Recursively merges `override` onto `base`. Keys present on `override` win;
 * when both sides hold a plain object they merge, otherwise `override` replaces.
 */
function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = out[key];
    out[key] = isPlainObject(existing) && isPlainObject(value)
      ? deepMerge(existing, value)
      : value;
  }
  return out;
}
