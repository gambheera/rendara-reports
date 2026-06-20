/**
 * Structured expression-error model and normalizer for the sandboxed evaluator
 * (E2-S1). Kept in its own module so the mapping from JSONata's loosely-typed
 * thrown values to a stable shape can be unit-tested directly, without having to
 * coax JSONata into emitting every field combination.
 *
 * `toExpressionError` is intentionally **not** re-exported from the package
 * entrypoint — it is an internal helper. The {@link ExpressionError} /
 * {@link ExpressionErrorKind} types are public (re-exported by `./expression`)
 * because they appear in the evaluator's result type.
 */

/**
 * Where an {@link ExpressionError} arose: `'compile'` for a syntax/parse error
 * (the expression never ran), `'evaluate'` for a runtime error while evaluating
 * against a scope.
 */
export type ExpressionErrorKind = 'compile' | 'evaluate';

/**
 * A structured expression problem. Returned inside a failed result;
 * `evaluate`/`compileExpression` never throw it.
 *
 * `position`, `token`, and `code` are surfaced from JSONata when present
 * (e.g. `code: 'S0201'` at `position: 3` for a syntax error, `code: 'T1006'`
 * for "attempted to invoke a non-function"), and are absent otherwise.
 */
export interface ExpressionError {
  readonly kind: ExpressionErrorKind;
  /** Human-readable message (from JSONata, or a generic fallback). */
  readonly message: string;
  /** The offending expression string. */
  readonly expr: string;
  /** Character offset of the error within the expression, if reported. */
  readonly position?: number;
  /** The token at the error site, if reported. */
  readonly token?: string;
  /** JSONata's error code (e.g. `S0201`, `T1006`), if reported. */
  readonly code?: string;
}

/**
 * Normalizes an unknown caught value (JSONata throws plain error-shaped objects)
 * into a stable {@link ExpressionError}. Reads `message`/`position`/`token`/`code`
 * defensively, falling back to a generic message and omitting fields that are
 * absent or of the wrong type. Total — never throws.
 */
export function toExpressionError(
  kind: ExpressionErrorKind,
  expr: string,
  err: unknown,
): ExpressionError {
  const e = (err ?? {}) as Record<string, unknown>;
  const message = typeof e['message'] === 'string' ? e['message'] : `Expression ${kind} error`;
  const position = typeof e['position'] === 'number' ? e['position'] : undefined;
  const token = typeof e['token'] === 'string' ? e['token'] : undefined;
  const code = typeof e['code'] === 'string' ? e['code'] : undefined;
  return { kind, message, expr, position, token, code };
}
