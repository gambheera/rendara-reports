/**
 * Binding resolver & aggregates (E2-S5) — the engine pass that turns a validated
 * template element plus the Data JSON into **resolved values**: the raw value and
 * its formatted display string for every bound element, every table cell (with
 * the current row bound to JSONata `$`), and every aggregate (column footers /
 * grand totals and per-group subtotals). It is what the pagination engine (E3)
 * and shared renderer (E4) consume so they never touch raw expressions
 * themselves (brief §6, §7).
 *
 * This module is the composition layer over the three E2 pieces already built:
 * the sandboxed evaluator ({@link evaluate}, E2-S1), the `Intl` formatting layer
 * ({@link formatValue}, E2-S2), and the schema's binding/table/group models. It
 * adds **no** new evaluation path — every expression still goes through JSONata,
 * so there is no `eval`/`new Function` here (a project hard rule), and the
 * aggregate arithmetic (`$sum`/`$average`/`$count`/`$min`/`$max`) is JSONata's
 * own. The resolver's job is the **scoping and partitioning** around those calls.
 *
 * ## Scope rules (which data each expression sees as `$`)
 * These mirror the golden fixtures exactly and are the contract callers rely on:
 *
 * | Expression                               | `$` is bound to                     |
 * |------------------------------------------|-------------------------------------|
 * | element `binding.expr`                   | the whole Data JSON (root)          |
 * | table column `cell.expr`                 | the current **row**                 |
 * | `source.arrayExpr`                       | root (resolves the detail array)    |
 * | column `footer.expr` (grand total)       | root — so `$sum(a.b.amount)` works  |
 * | group `groupBy`                          | each **row** (to partition)         |
 * | group band `label`                       | the group's **first/representative row** |
 * | group band `aggregate.binding`           | the group's **rows array**          |
 *
 * The split for group bands is deliberate: a label like `"Region: " & $.region`
 * reads a per-row field (so it needs a single row), whereas an aggregate like
 * `$sum($.units)` folds over the whole group (so it needs the rows array). A
 * label evaluated against the rows array would stringify the whole sequence.
 *
 * ## Determinism
 * Output ordering is fully deterministic: rows follow source-array order (each
 * carries its source {@link ResolvedRow.index}); groups appear in **first-seen**
 * order of their `groupBy` value; columns and band aggregates follow declared
 * order. Re-running the resolver on the same inputs yields an identical model.
 *
 * ## Missing data, errors & warnings (fail-soft)
 * Every entry point is **total** — it never throws. A binding whose expression
 * fails to compile/evaluate yields its `fallback` (or blank) as the formatted
 * string, an `undefined` raw value, and a structured {@link ExpressionError} on
 * the value *and* collected into {@link ResolvedDataTable.errors} for the host.
 * Per JSONata semantics an aggregate over an **empty** array is `undefined` (→
 * fallback), **missing** fields are skipped, and an explicit **null** in a numeric
 * aggregate raises a typed error that is captured rather than thrown.
 *
 * On top of that, **E2-S6** adds a host-facing {@link Diagnostic} stream so the
 * resolver doesn't just fall back silently but says *why* it did: a missing path
 * (→ `missing-value`), a present value that didn't fit its format (→
 * `format-mismatch`), or an invalid format token (→ `invalid-format`) each emit a
 * warning, while a compile/evaluate failure emits an `expression-error`. These
 * appear on every {@link ResolvedBinding.diagnostics} and are aggregated onto
 * {@link ResolvedDataTable.diagnostics}; the legacy {@link ResolvedDataTable.errors}
 * list is retained as the error-severity subset that carries an
 * {@link ExpressionError}. Partition a stream for display with
 * {@link summarizeDiagnostics}.
 *
 * ## Grouping scope
 * A single (primary) grouping level — `element.groups[0]` — is resolved here.
 * Nested grouping levels, cross-page group continuation, and carry-over subtotals
 * are a *pagination* concern owned by **E3-S6**; this module only partitions the
 * rows and resolves each group's band labels/aggregates.
 */

import type {
  DataTableElement,
  ElementBinding,
  GroupBand,
  TemplateElement,
} from '@rendara/report-schema';

import {
  type Diagnostic,
  type DiagnosticLocation,
  expressionDiagnostic,
  formatDiagnostic,
  missingValueDiagnostic,
} from './diagnostics';
import { evaluate, type ExpressionError } from './expression';
import { formatValueDetailed } from './format';

/** Locale/time-zone context for formatting resolved values (passed to {@link formatValue}). */
export interface ResolveOptions {
  /** BCP-47 locale tag for `Intl` formatting. Defaults to `'en-US'` (see {@link formatValue}). */
  readonly locale?: string;
  /** IANA time zone for date formatting. Defaults to `'UTC'` (for determinism). */
  readonly timeZone?: string;
}

/**
 * A single resolved binding: the JSONata-evaluated {@link raw} value, its
 * {@link formatted} display string (after the format token + fallback), and the
 * structured {@link error} when evaluation failed (in which case `raw` is
 * `undefined` and `formatted` is the fallback).
 */
export interface ResolvedBinding {
  /** The raw evaluated value (`undefined` on error or a missing path). */
  readonly raw: unknown;
  /** The display string after formatting / fallback substitution. */
  readonly formatted: string;
  /** Present iff the expression failed to compile or evaluate. */
  readonly error?: ExpressionError;
  /**
   * Diagnostics raised while resolving this binding (E2-S6): an `expression-error`
   * when {@link error} is set, otherwise a `missing-value` / `format-mismatch` /
   * `invalid-format` warning when a fallback was substituted. Absent when the
   * value resolved and formatted cleanly. See {@link Diagnostic}.
   */
  readonly diagnostics?: readonly Diagnostic[];
}

/** One resolved table cell: the column it belongs to and its {@link ResolvedBinding}. */
export interface ResolvedCell {
  /** Key of the {@link DataTableColumn} this cell belongs to. */
  readonly columnKey: string;
  /** The resolved cell value (evaluated with `$` bound to the row). */
  readonly value: ResolvedBinding;
}

/**
 * One resolved detail row: its source {@link index} (for deterministic
 * ordering), the raw row {@link data} that was bound to `$`, and the per-column
 * {@link cells} in declared column order.
 */
export interface ResolvedRow {
  /** Position of this row in the source array (0-based). */
  readonly index: number;
  /** The raw row value that was the `$` scope for the cell expressions. */
  readonly data: unknown;
  /** Resolved cells in declared column order. */
  readonly cells: readonly ResolvedCell[];
}

/**
 * One resolved aggregate aligned under a column — a column footer (grand total)
 * or a per-group subtotal.
 */
export interface ResolvedAggregate {
  /** Key of the column this aggregate aligns under. */
  readonly columnKey: string;
  /** The resolved aggregate value. */
  readonly value: ResolvedBinding;
}

/**
 * A resolved group header/footer band: the optional resolved {@link label} and
 * the per-column {@link aggregates} in declared order.
 */
export interface ResolvedBand {
  /** Resolved label (evaluated against the group's representative row), if any. */
  readonly label?: ResolvedBinding;
  /** Resolved per-column aggregates (evaluated over the group's rows). */
  readonly aggregates: readonly ResolvedAggregate[];
}

/**
 * A resolved group: a partition of the table's rows sharing one `groupBy` value,
 * with its resolved header/footer bands. `rows` references the same
 * {@link ResolvedRow} objects that appear in {@link ResolvedDataTable.rows}.
 */
export interface ResolvedGroup {
  /** Readable string identity of the group (`String(keyValue)`, `''` when nil). */
  readonly key: string;
  /** The raw `groupBy` value shared by the group's rows. */
  readonly keyValue: unknown;
  /** The group's rows, in source order. */
  readonly rows: readonly ResolvedRow[];
  /** Resolved header band, if the group defines one. */
  readonly header?: ResolvedBand;
  /** Resolved footer band (subtotals), if the group defines one. */
  readonly footer?: ResolvedBand;
}

/**
 * The fully resolved data table: every detail {@link rows row} (flat, source
 * order), the optional {@link groups partitioned view} (present iff the element
 * declares grouping), the column-footer {@link columnFooters grand totals}, and
 * every {@link errors expression error} collected during resolution.
 */
export interface ResolvedDataTable {
  /** All detail rows in source order (the full, ungrouped list). */
  readonly rows: readonly ResolvedRow[];
  /** Partitioned view when the element declares a (primary) grouping; else absent. */
  readonly groups?: readonly ResolvedGroup[];
  /** Column-footer aggregates (grand totals), one per column that declares a footer. */
  readonly columnFooters: readonly ResolvedAggregate[];
  /**
   * Every {@link ExpressionError} encountered while resolving cells, footers,
   * group bands, the source, and `groupBy` (E2-S5). Retained as the error-severity
   * subset of {@link diagnostics} — the entries whose code is `expression-error`.
   */
  readonly errors: readonly ExpressionError[];
  /**
   * The full host-facing diagnostic stream (E2-S6): every error *and* warning
   * (`missing-value` / `format-mismatch` / `invalid-format`) collected across the
   * whole table, each tagged with its {@link DiagnosticLocation}. Partition for
   * display with {@link summarizeDiagnostics}.
   */
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Resolves one {@link ElementBinding} against `scope`: evaluates `binding.expr`
 * in the JSONata sandbox, then formats the result with `binding.format` and
 * `binding.fallback`. Total — an evaluation failure returns the fallback string,
 * an `undefined` raw value, and the structured error.
 *
 * `scope` is whatever the expression should see as the data root / `$` (the
 * whole Data JSON for an element binding, a single row for a table cell, a rows
 * array for a group aggregate — see the module doc's scope table). `location`
 * tags any emitted {@link Diagnostic} with where the binding sits (E2-S6); it is
 * optional, so a standalone call can omit context.
 */
export async function resolveBinding(
  binding: ElementBinding,
  scope: unknown,
  options?: ResolveOptions,
  location?: DiagnosticLocation,
): Promise<ResolvedBinding> {
  const fallback = binding.fallback ?? undefined;
  const result = await evaluate(binding.expr, scope);

  if (!result.ok) {
    const formatted = formatValueDetailed(undefined, binding.format, { ...options, fallback })
      .formatted;
    return {
      raw: undefined,
      formatted,
      error: result.error,
      diagnostics: [expressionDiagnostic(result.error, location)],
    };
  }

  const { formatted, status } = formatValueDetailed(result.value, binding.format, {
    ...options,
    fallback,
  });
  const diagnostic =
    status === 'empty'
      ? missingValueDiagnostic(binding.expr, location)
      : formatDiagnostic(status, binding.expr, binding.format, location);

  return {
    raw: result.value,
    formatted,
    ...(diagnostic ? { diagnostics: [diagnostic] } : {}),
  };
}

/**
 * Resolves an element's displayed value against the whole Data JSON.
 *
 * - **text** — the {@link TextElement.binding} (resolved over root) when present,
 *   otherwise the static {@link TextElement.text} literal.
 * - **image** — the {@link ImageElement.binding} when present, otherwise the
 *   static {@link ImageElement.src} literal.
 * - **shape** / **dataTable** — `undefined`: shapes carry no value, and tables
 *   are resolved by {@link resolveDataTable}.
 *
 * A dynamic binding always takes precedence over a static literal. Total.
 */
export async function resolveElement(
  element: TemplateElement,
  data: unknown,
  options?: ResolveOptions,
): Promise<ResolvedBinding | undefined> {
  const location: DiagnosticLocation = { elementId: element.id, role: 'element' };
  switch (element.type) {
    case 'text':
      return element.binding
        ? resolveBinding(element.binding, data, options, location)
        : staticValue(element.text);
    case 'image':
      return element.binding
        ? resolveBinding(element.binding, data, options, location)
        : staticValue(element.src);
    case 'shape':
    case 'dataTable':
      return undefined;
  }
}

/**
 * Resolves a {@link DataTableElement} against the Data JSON: expands the bound
 * detail rows (each cell evaluated with `$` bound to its row), computes the
 * column-footer grand totals over the root data, and — when the element declares
 * grouping — partitions the rows and resolves each group's bands. Total; every
 * error is collected onto {@link ResolvedDataTable.errors}. See the module doc
 * for the scope and ordering rules.
 */
export async function resolveDataTable(
  element: DataTableElement,
  data: unknown,
  options?: ResolveOptions,
): Promise<ResolvedDataTable> {
  const diagnostics: Diagnostic[] = [];

  // Source array: evaluated over root, then normalized so a single value or a
  // missing path can't break row expansion (JSONata may collapse singletons).
  const sourceResult = await evaluate(element.source.arrayExpr, data);
  if (!sourceResult.ok) {
    diagnostics.push(
      expressionDiagnostic(sourceResult.error, { elementId: element.id, role: 'source' }),
    );
  }
  const rowData = normalizeArray(sourceResult.ok ? sourceResult.value : undefined);

  // Detail rows, in source order, with `$` bound to each row for its cells.
  const rows: ResolvedRow[] = [];
  for (let index = 0; index < rowData.length; index += 1) {
    const datum = rowData[index];
    const cells: ResolvedCell[] = [];
    for (const column of element.columns) {
      const value = await resolveBinding(column.cell, datum, options, {
        elementId: element.id,
        columnKey: column.key,
        rowIndex: index,
        role: 'cell',
      });
      collect(diagnostics, value);
      cells.push({ columnKey: column.key, value });
    }
    rows.push({ index, data: datum, cells });
  }

  // Column footers (grand totals) — evaluated over root so absolute array paths
  // like `$sum(invoice.lineItems.amount)` resolve.
  const columnFooters: ResolvedAggregate[] = [];
  for (const column of element.columns) {
    if (column.footer) {
      const value = await resolveBinding(column.footer, data, options, {
        elementId: element.id,
        columnKey: column.key,
        role: 'columnFooter',
      });
      collect(diagnostics, value);
      columnFooters.push({ columnKey: column.key, value });
    }
  }

  const primaryGroup = element.groups?.[0];
  const groups = primaryGroup
    ? await resolveGroups(primaryGroup, rows, element.id, options, diagnostics)
    : undefined;

  const errors = errorsOf(diagnostics);
  return { rows, ...(groups ? { groups } : {}), columnFooters, errors, diagnostics };
}

// --- grouping ----------------------------------------------------------------

/**
 * Partitions already-resolved `rows` by the primary group's `groupBy` value
 * (first-seen order) and resolves each group's header/footer bands. The resolved
 * {@link ResolvedRow} objects are shared with the flat row list, not re-resolved.
 */
async function resolveGroups(
  group: NonNullable<DataTableElement['groups']>[number],
  rows: readonly ResolvedRow[],
  elementId: string,
  options: ResolveOptions | undefined,
  diagnostics: Diagnostic[],
): Promise<readonly ResolvedGroup[]> {
  const buckets = new Map<string, { keyValue: unknown; rows: ResolvedRow[] }>();

  for (const row of rows) {
    const keyResult = await evaluate(group.groupBy, row.data);
    if (!keyResult.ok) {
      diagnostics.push(
        expressionDiagnostic(keyResult.error, {
          elementId,
          rowIndex: row.index,
          role: 'groupBy',
        }),
      );
    }
    const keyValue = keyResult.ok ? keyResult.value : undefined;
    const key = groupKey(keyValue);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.rows.push(row);
    } else {
      buckets.set(key, { keyValue, rows: [row] });
    }
  }

  const result: ResolvedGroup[] = [];
  for (const bucket of buckets.values()) {
    const groupKeyStr = displayKey(bucket.keyValue);
    const header = group.header
      ? await resolveBand(group.header, bucket.rows, elementId, groupKeyStr, options, diagnostics)
      : undefined;
    const footer = group.footer
      ? await resolveBand(group.footer, bucket.rows, elementId, groupKeyStr, options, diagnostics)
      : undefined;
    result.push({
      key: groupKeyStr,
      keyValue: bucket.keyValue,
      rows: bucket.rows,
      ...(header ? { header } : {}),
      ...(footer ? { footer } : {}),
    });
  }
  return result;
}

/**
 * Resolves a group's header/footer band: the label against the group's
 * **representative (first) row**, and each aggregate against the group's
 * **rows array** (the raw row data).
 */
async function resolveBand(
  band: GroupBand,
  groupRows: readonly ResolvedRow[],
  elementId: string,
  groupKeyStr: string,
  options: ResolveOptions | undefined,
  diagnostics: Diagnostic[],
): Promise<ResolvedBand> {
  const label = band.label
    ? await resolveBinding(band.label, groupRows[0]?.data, options, {
        elementId,
        groupKey: groupKeyStr,
        role: 'groupLabel',
      })
    : undefined;
  if (label) {
    collect(diagnostics, label);
  }

  const rowsData = groupRows.map((row) => row.data);
  const aggregates: ResolvedAggregate[] = [];
  for (const aggregate of band.aggregates ?? []) {
    const value = await resolveBinding(aggregate.binding, rowsData, options, {
      elementId,
      columnKey: aggregate.columnKey,
      groupKey: groupKeyStr,
      role: 'groupAggregate',
    });
    collect(diagnostics, value);
    aggregates.push({ columnKey: aggregate.columnKey, value });
  }

  return { ...(label ? { label } : {}), aggregates };
}

// --- helpers -----------------------------------------------------------------

/** A static literal value (no expression/format): raw + formatted are the literal. */
function staticValue(literal: string | undefined): ResolvedBinding {
  return { raw: literal, formatted: literal ?? '' };
}

/** Appends a resolved binding's diagnostics (if any) to the shared stream. */
function collect(diagnostics: Diagnostic[], value: ResolvedBinding): void {
  if (value.diagnostics) {
    diagnostics.push(...value.diagnostics);
  }
}

/**
 * The error-severity subset of a diagnostic stream as raw {@link ExpressionError}s
 * — the back-compat {@link ResolvedDataTable.errors} view (E2-S5). Every
 * `expression-error` diagnostic carries its underlying error.
 */
function errorsOf(diagnostics: readonly Diagnostic[]): ExpressionError[] {
  const errors: ExpressionError[] = [];
  for (const d of diagnostics) {
    if (d.error) {
      errors.push(d.error);
    }
  }
  return errors;
}

/**
 * Normalizes a `source.arrayExpr` result into a row array: an array stays as-is,
 * `null`/`undefined` (a missing path) becomes `[]`, and any other single value
 * is wrapped as a one-row array (covering JSONata's singleton-sequence collapse).
 */
function normalizeArray(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === null || value === undefined) {
    return [];
  }
  return [value];
}

/** Readable group identity for {@link ResolvedGroup.key} (`''` for a nil value). */
function displayKey(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

/**
 * Stable string identity for a `groupBy` value, tagged by type so values of
 * different types (e.g. the number `1` and the string `"1"`) can never collide
 * into one bucket. Used only as the internal partition key.
 */
function groupKey(value: unknown): string {
  if (value === null || value === undefined) {
    return 'nil:';
  }
  switch (typeof value) {
    case 'string':
      return 's:' + value;
    case 'number':
      return 'n:' + String(value);
    case 'boolean':
      return 'b:' + String(value);
    default:
      return 'j:' + JSON.stringify(value);
  }
}
