/**
 * Sandboxed expression evaluation (E2-S1) — the engine's safe gateway for every
 * template expression (element bindings, table cell/footer/aggregate
 * expressions, `visibleWhen`, `arrayExpr`, `groupBy`; brief §5, §6).
 *
 * All evaluation goes through **JSONata**, a JSON-native query/transform
 * language that is sandboxed: an expression can only see the `scope` it is given
 * plus JSONata's own built-ins. It has **no access to JS globals** and cannot
 * execute host code — there is no `eval`/`new Function` anywhere in this path
 * (a project hard rule). JSONata compiles expressions to its own AST and walks
 * it; it never hands a string to the JS engine.
 *
 * Two layers, mirroring how the rest of the codebase reports problems
 * (a discriminated success/failure {@link Result}, never a raw throw):
 *
 * 1. **Compile** — {@link compileExpression} parses an expression string once
 *    and caches the outcome (the compiled expression *or* the compile error),
 *    keyed by the string. Parsing is synchronous and throws on syntax errors,
 *    which are caught and mapped to a structured {@link ExpressionError}.
 * 2. **Evaluate** — {@link evaluate} runs a (cached) compiled expression against
 *    a scope. JSONata 2.x evaluation is **asynchronous** (it returns a Promise),
 *    so `evaluate` is async; runtime errors (e.g. invoking a non-function) are
 *    caught and returned as structured errors.
 *
 * Compile-once/cache matters because the same expression is evaluated many times
 * — once per data row for a table column, once per page for a footer total — and
 * parsing is the expensive step.
 */

import jsonata, { type Expression } from 'jsonata';

import { type ExpressionError, toExpressionError } from './expression-error';

export type { ExpressionError, ExpressionErrorKind } from './expression-error';

/**
 * A compiled, cached JSONata expression ready to {@link evaluate}. Opaque to
 * callers; reuse it (or just pass the same string) to skip re-parsing.
 */
export type CompiledExpression = Expression;

/** A discriminated success/failure result, matching the schema lib's house style. */
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/** Result of {@link compileExpression}: the compiled expression or a compile error. */
export type CompileResult = Result<CompiledExpression, ExpressionError>;

/** Result of {@link evaluate}: the resolved value or a compile/evaluate error. */
export type EvaluateResult<T = unknown> = Result<T, ExpressionError>;

/**
 * Upper bound on distinct cached expressions. Templates have a bounded, small
 * set of expression strings, but the cache is capped so a pathological caller
 * (or a long-lived process churning through many templates) can't grow it
 * without limit. On overflow the oldest entry is evicted (insertion-ordered
 * `Map`).
 */
export const MAX_CACHE_ENTRIES = 1000;

/**
 * Compile-once cache, keyed by the raw expression string. Stores the whole
 * {@link CompileResult} — caching a *failed* parse is just as valuable as a
 * successful one, since a bad expression would otherwise be re-parsed (and
 * re-thrown) on every evaluation attempt.
 */
const cache = new Map<string, CompileResult>();

/**
 * Parses `expr` into a reusable compiled expression, **caching the outcome**.
 * Synchronous and total: a syntax error is returned as a structured
 * {@link ExpressionError} (`kind: 'compile'`), never thrown.
 *
 * Calling twice with the same string returns the *same* cached result, so the
 * underlying parse happens once.
 */
export function compileExpression(expr: string): CompileResult {
  const cached = cache.get(expr);
  if (cached !== undefined) {
    return cached;
  }

  let result: CompileResult;
  try {
    result = { ok: true, value: jsonata(expr) };
  } catch (err) {
    result = { ok: false, error: toExpressionError('compile', expr, err) };
  }

  if (cache.size >= MAX_CACHE_ENTRIES) {
    // Size is at the cap (>0), so an oldest key is guaranteed to exist.
    const oldest = cache.keys().next().value as string;
    cache.delete(oldest);
  }
  cache.set(expr, result);
  return result;
}

/**
 * Evaluates `expr` against `scope` in the JSONata sandbox and returns the
 * resolved value as a structured {@link EvaluateResult}. Total: it never throws
 * — a compile error short-circuits with the compile failure, and a runtime
 * error is caught and returned as `kind: 'evaluate'`.
 *
 * `scope` is the JSON the expression runs over (for a table cell, bind the
 * current row so `$` resolves to it). Optional `bindings` exposes named
 * variables (`$name`) to the expression and is an **engine-trusted** extension
 * point — unlike `scope`, a function placed in `bindings` is callable. Never
 * forward template- or data-supplied values into `bindings`.
 *
 * The compiled expression is cached, so repeated calls with the same string
 * re-use the parse. Async because JSONata 2.x evaluation returns a Promise.
 */
export async function evaluate(
  expr: string,
  scope: unknown,
  bindings?: Record<string, unknown>,
): Promise<EvaluateResult> {
  const compiled = compileExpression(expr);
  if (!compiled.ok) {
    return compiled;
  }

  try {
    const value: unknown = await compiled.value.evaluate(scope, bindings);
    return { ok: true, value };
  } catch (err) {
    return { ok: false, error: toExpressionError('evaluate', expr, err) };
  }
}

/** Removes every cached compiled expression. For test isolation / lifecycle. */
export function clearExpressionCache(): void {
  cache.clear();
}

/** Number of distinct expressions currently cached. For introspection / tests. */
export function expressionCacheSize(): number {
  return cache.size;
}
