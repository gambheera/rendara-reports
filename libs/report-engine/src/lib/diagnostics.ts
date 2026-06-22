/**
 * Missing/invalid-data diagnostics (E2-S6) — the host-facing **errors/warnings
 * report** the binding resolver surfaces so a viewer can show graceful output
 * when its data is incomplete (brief §6, acceptance for E2-S6).
 *
 * E2-S5's resolver is already **fail-soft**: a missing path or a bad expression
 * never crashes — it yields the binding's `fallback` (or blank). What it did not
 * yet do is *tell the host why*. A type mismatch (a `currency:USD` token over the
 * string `"abc"`) and a genuinely-missing path both silently became the fallback,
 * indistinguishable from a value the author intended to be empty. This module adds
 * the missing signal: a small, structured {@link Diagnostic} stream the resolver
 * emits alongside the resolved values, partitionable into **errors** (something
 * the author must fix) and **warnings** (the output is still usable, but data was
 * absent or didn't fit its format).
 *
 * It introduces **no** new evaluation path — every expression still runs through
 * the JSONata sandbox (E2-S1), so the project's no-`eval`/`new Function` rule is
 * untouched. A diagnostic is pure description; producing one never re-evaluates.
 *
 * ## Severity is a function of the code (not author-chosen)
 * Each {@link DiagnosticCode} maps to a fixed {@link DiagnosticSeverity} via
 * {@link severityFor}, so the two can never drift:
 *
 * | Code               | Severity  | Means                                              |
 * |--------------------|-----------|----------------------------------------------------|
 * | `expression-error` | `error`   | the expression failed to compile/evaluate          |
 * | `missing-value`    | `warning` | the expression resolved to `null`/`undefined`      |
 * | `format-mismatch`  | `warning` | a value was present but couldn't be coerced to the format's type |
 * | `invalid-format`   | `warning` | the format token's type is known but its argument is invalid |
 *
 * `missing-value` is a warning, not an error: an absent optional field is a normal
 * condition (the fallback is exactly the intended behaviour), but the host may
 * still want to flag *which* bindings fell back. `format-mismatch` /
 * `invalid-format` are likewise non-fatal — the value/token was simply unusable
 * for that format, so the fallback stood in.
 *
 * ## Location
 * Every diagnostic optionally carries a {@link DiagnosticLocation} pinpointing
 * where it arose (which element, column, row, group, and the binding {@link
 * DiagnosticRole role}). All fields are optional so a standalone
 * {@link resolveBinding} call can omit context entirely.
 */

import type { ExpressionError } from './expression';
import type { FormatStatus } from './format';

/** How serious a {@link Diagnostic} is: a must-fix `error` or an advisory `warning`. */
export type DiagnosticSeverity = 'error' | 'warning';

/**
 * What kind of problem a {@link Diagnostic} reports. Each code has a fixed
 * {@link severityFor severity}; see the module doc's table.
 */
export type DiagnosticCode =
  | 'expression-error'
  | 'missing-value'
  | 'format-mismatch'
  | 'invalid-format';

/**
 * The binding slot a diagnostic arose at — useful context for a host that wants
 * to point an author at the offending part of the template.
 *
 * - `element` — a scalar element's `binding`.
 * - `cell` — a table column's per-row `cell` binding.
 * - `columnFooter` — a column's `footer` (grand-total) aggregate.
 * - `source` — a table's `source.arrayExpr`.
 * - `groupBy` — a group's `groupBy` partition expression.
 * - `groupLabel` — a group band's `label`.
 * - `groupAggregate` — a group band's per-column aggregate (subtotal).
 */
export type DiagnosticRole =
  | 'element'
  | 'cell'
  | 'columnFooter'
  | 'source'
  | 'groupBy'
  | 'groupLabel'
  | 'groupAggregate';

/**
 * Where a {@link Diagnostic} arose. Every field is optional: a table cell carries
 * `elementId`/`columnKey`/`rowIndex`/`role`, a group subtotal carries
 * `elementId`/`columnKey`/`groupKey`/`role`, and a standalone binding may carry
 * none.
 */
export interface DiagnosticLocation {
  /** Id of the {@link TemplateElement} the binding belongs to. */
  readonly elementId?: string;
  /** Key of the table column, when the binding is a cell/footer/group aggregate. */
  readonly columnKey?: string;
  /** 0-based source-array index, when the binding is a detail-row cell or `groupBy`. */
  readonly rowIndex?: number;
  /** Readable group identity, when the binding is a group label/aggregate. */
  readonly groupKey?: string;
  /** Which binding slot the diagnostic arose at. */
  readonly role?: DiagnosticRole;
}

/**
 * A single structured problem found while resolving bindings against the Data
 * JSON. Collected (never thrown) and surfaced to the host via the resolver
 * results; partition a stream with {@link summarizeDiagnostics}.
 */
export interface Diagnostic {
  /** Fixed by {@link code} via {@link severityFor}. */
  readonly severity: DiagnosticSeverity;
  /** What went wrong (see {@link DiagnosticCode}). */
  readonly code: DiagnosticCode;
  /** Human-readable description. */
  readonly message: string;
  /** The offending expression string, when applicable. */
  readonly expr?: string;
  /** Where the problem arose, when known. */
  readonly location?: DiagnosticLocation;
  /** The underlying expression error, present iff `code === 'expression-error'`. */
  readonly error?: ExpressionError;
}

/** Maps a {@link DiagnosticCode} to its fixed {@link DiagnosticSeverity}. */
export function severityFor(code: DiagnosticCode): DiagnosticSeverity {
  return code === 'expression-error' ? 'error' : 'warning';
}

/**
 * Builds an `expression-error` (severity `error`) diagnostic wrapping a failed
 * compile/evaluate {@link ExpressionError}, carrying its message/expr through.
 */
export function expressionDiagnostic(
  error: ExpressionError,
  location?: DiagnosticLocation,
): Diagnostic {
  return {
    severity: 'error',
    code: 'expression-error',
    message: error.message,
    expr: error.expr,
    error,
    ...(location ? { location } : {}),
  };
}

/**
 * Builds a `missing-value` (severity `warning`) diagnostic for an expression that
 * resolved cleanly to `null`/`undefined` (a missing path / empty aggregate),
 * meaning the binding's `fallback` (or blank) was substituted.
 */
export function missingValueDiagnostic(
  expr: string,
  location?: DiagnosticLocation,
): Diagnostic {
  return {
    severity: 'warning',
    code: 'missing-value',
    message: `Expression resolved to no value; used fallback: ${expr}`,
    expr,
    ...(location ? { location } : {}),
  };
}

/**
 * Builds a warning for a non-`ok`, non-`empty` {@link FormatStatus}: `mismatch`
 * → `format-mismatch` (a present value of the wrong type for the format token),
 * `bad-token` → `invalid-format` (a known token type with an invalid argument).
 * Returns `undefined` for the `ok`/`empty` statuses, which are not format
 * problems (`empty` is handled as a {@link missingValueDiagnostic}).
 */
export function formatDiagnostic(
  status: FormatStatus,
  expr: string,
  token: string | null | undefined,
  location?: DiagnosticLocation,
): Diagnostic | undefined {
  if (status === 'mismatch') {
    return {
      severity: 'warning',
      code: 'format-mismatch',
      message: `Value could not be formatted as '${token ?? ''}'; used fallback: ${expr}`,
      expr,
      ...(location ? { location } : {}),
    };
  }
  if (status === 'bad-token') {
    return {
      severity: 'warning',
      code: 'invalid-format',
      message: `Invalid format token '${token ?? ''}'; used fallback: ${expr}`,
      expr,
      ...(location ? { location } : {}),
    };
  }
  return undefined;
}

/** A partitioned, host-facing view of a diagnostic stream (the E2-S6 "report"). */
export interface DiagnosticReport {
  /** Diagnostics with `severity: 'error'`, in stream order. */
  readonly errors: readonly Diagnostic[];
  /** Diagnostics with `severity: 'warning'`, in stream order. */
  readonly warnings: readonly Diagnostic[];
  /** `true` iff there is at least one error. */
  readonly hasErrors: boolean;
  /** `true` iff there is at least one warning. */
  readonly hasWarnings: boolean;
}

/**
 * Partitions a flat diagnostic stream into the host-facing {@link DiagnosticReport}
 * (errors vs. warnings, with quick `has*` flags). Pure and order-preserving.
 */
export function summarizeDiagnostics(
  diagnostics: readonly Diagnostic[],
): DiagnosticReport {
  const errors = diagnostics.filter((d) => d.severity === 'error');
  const warnings = diagnostics.filter((d) => d.severity === 'warning');
  return {
    errors,
    warnings,
    hasErrors: errors.length > 0,
    hasWarnings: warnings.length > 0,
  };
}
