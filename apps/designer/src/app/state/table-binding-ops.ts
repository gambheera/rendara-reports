/**
 * Pure, framework-agnostic helpers backing the Properties panel's data-table
 * **Data Binding** editors (E6-S8): pick the table's array **source**, bind each
 * column's per-row **cell** expression (row scope `$`) and format, and toggle
 * **aggregates** — a column footer (grand total) and a per-group subtotal — built
 * from a small function registry (`$sum`/`$average`/`$count`/`$min`/`$max`).
 *
 * They turn a raw panel interaction into an immutable `source` / `columns` /
 * `groups` value the designer store applies via `updateElement`, producing schema
 * exactly shaped like the engine's golden fixtures (`$sum(invoice.lineItems.amount)`
 * for a column total, `$sum($.units)` for a group subtotal) so a bound table
 * round-trips cleanly (E6-S8 QA).
 *
 * Everything here is pure so the component stays thin and the logic carries the
 * high coverage bar. Aggregate expressions are plain JSONata strings consumed by
 * the engine's sandboxed resolver — there is no `eval`/`new Function` here (a
 * project hard rule); this module only assembles the strings.
 *
 * Scope note (mirrors the engine resolver, `resolve.ts`): a column `cell.expr`
 * evaluates with `$` bound to the **row**; a column `footer.expr` (grand total)
 * evaluates over the data **root**, so it targets the absolute array path; a group
 * footer `aggregate.binding` evaluates over the group's **rows array**, so it
 * targets the row-relative field.
 */

import type { FieldNode } from '@rendara/report-engine';
import type {
  DataTableColumn,
  DataTableElement,
  DataTableGroup,
  ElementBinding,
  GroupAggregate,
  GroupBand,
} from '@rendara/report-schema';

/** The JSONata aggregate functions offered in the footer/subtotal pickers. */
export type AggregateFn = 'sum' | 'average' | 'count' | 'min' | 'max';

/** One choice in an aggregate-function picker: the {@link AggregateFn} and its label. */
export interface AggregateOption {
  readonly fn: AggregateFn;
  readonly label: string;
}

/** The aggregate functions, in the order the pickers present them (brief §6). */
export const AGGREGATE_FUNCTIONS: readonly AggregateOption[] = [
  { fn: 'sum', label: 'Sum' },
  { fn: 'average', label: 'Average' },
  { fn: 'count', label: 'Count' },
  { fn: 'min', label: 'Min' },
  { fn: 'max', label: 'Max' },
];

/** Matches the function name of an aggregate expression like `$sum(...)`. */
const AGGREGATE_RE = /^\$(sum|average|count|min|max)\(/;

// --- source ------------------------------------------------------------------

/** Builds the table's {@link DataTableElement.source} from a (trimmed) array expression. */
export function setTableSource(arrayExpr: string): DataTableSourcePatch {
  return { source: { arrayExpr: arrayExpr.trim() } };
}

/** The `{ source }` patch shape `updateElement` applies for a source edit. */
export interface DataTableSourcePatch {
  readonly source: { readonly arrayExpr: string };
}

// --- column cell binding -----------------------------------------------------

/**
 * Sets the `key` column's per-row {@link DataTableColumn.cell} expression (row
 * scope `$`), **preserving** its format. The expression is trimmed; a blank value
 * is allowed (it leaves the cell empty until re-bound) and keeps the column
 * schema-valid (`cell` is always present).
 */
export function setColumnCellExpr(
  el: DataTableElement,
  key: string,
  expr: string,
): readonly DataTableColumn[] {
  return el.columns.map((column) =>
    column.key === key ? { ...column, cell: { ...column.cell, expr: expr.trim() } } : column,
  );
}

/**
 * Sets (or clears) the `key` column's cell **format** token: a non-empty token is
 * stored, `null`/blank drops the `format` key so the cell shows its raw value and
 * the exported JSON stays minimal. The cell expression is untouched.
 */
export function setColumnCellFormat(
  el: DataTableElement,
  key: string,
  format: string | null,
): readonly DataTableColumn[] {
  const token = format === null ? '' : format.trim();
  return el.columns.map((column) =>
    column.key === key ? { ...column, cell: withFormat(column.cell, token) } : column,
  );
}

// --- column footer (grand total) ---------------------------------------------

/**
 * Whether the `column` can carry an aggregate: its cell must be a **simple row
 * path** (`$.field`, a dotted path, or the bare row `$`) so a clean total can be
 * built. A computed cell (e.g. `$.qty * $.price`) has no single field to fold, so
 * the aggregate toggles are disabled for it.
 */
export function canAggregate(column: DataTableColumn): boolean {
  return rowFieldOf(column.cell.expr) !== null;
}

/** The aggregate function of the `key` column's footer (grand total), or `null` when none. */
export function columnFooterFn(el: DataTableElement, key: string): AggregateFn | null {
  const column = el.columns.find((c) => c.key === key);
  return column?.footer ? aggregateFnOf(column.footer.expr) : null;
}

/**
 * Sets the `key` column's footer to a **grand total** over the data root: `$fn(`
 * arrayExpr.field`)` for sum/average/min/max (the absolute array path, matching
 * `$sum(invoice.lineItems.amount)`), or `$count(arrayExpr)` (row count) for count.
 * The footer inherits the column's cell **format** so a currency column totals as
 * currency. Returns `null` (a no-op) when the cell is not a simple field
 * ({@link canAggregate}).
 */
export function setColumnFooter(
  el: DataTableElement,
  key: string,
  fn: AggregateFn,
): readonly DataTableColumn[] | null {
  const column = el.columns.find((c) => c.key === key);
  if (!column) {
    return null;
  }
  const field = rowFieldOf(column.cell.expr);
  if (field === null) {
    return null;
  }
  const expr = grandTotalExpr(fn, el.source.arrayExpr.trim(), field);
  const footer = withFormat({ expr }, column.cell.format ?? '');
  return el.columns.map((c) => (c.key === key ? { ...c, footer } : c));
}

/** Removes the `key` column's footer (grand total) — the "hide footer aggregate" path. */
export function clearColumnFooter(
  el: DataTableElement,
  key: string,
): readonly DataTableColumn[] {
  return el.columns.map((column) => {
    if (column.key !== key || column.footer === undefined) {
      return column;
    }
    const next: Omit<DataTableColumn, 'footer'> & { footer?: ElementBinding } = { ...column };
    delete next.footer;
    return next;
  });
}

// --- group footer subtotal ---------------------------------------------------

/**
 * The aggregate function of the `key` column's per-group subtotal (read from the
 * first group that declares one), or `null` when no group totals this column. The
 * editor applies one function across every group, so the first is representative.
 */
export function columnGroupAggFn(el: DataTableElement, key: string): AggregateFn | null {
  for (const group of el.groups ?? []) {
    const aggregate = group.footer?.aggregates?.find((a) => a.columnKey === key);
    if (aggregate) {
      return aggregateFnOf(aggregate.binding.expr);
    }
  }
  return null;
}

/**
 * Adds (or replaces) the `key` column's subtotal in **every** group's footer band:
 * `$fn($.field)` over the group's rows array (`$count($)` for count), inheriting
 * the column's cell format. A group with no footer band gains one. Returns `null`
 * (a no-op) when the table has no groups or the cell is not a simple field.
 */
export function setColumnGroupAggregate(
  el: DataTableElement,
  key: string,
  fn: AggregateFn,
): readonly DataTableGroup[] | null {
  const column = el.columns.find((c) => c.key === key);
  if (!column || el.groups === undefined || el.groups.length === 0) {
    return null;
  }
  const field = rowFieldOf(column.cell.expr);
  if (field === null) {
    return null;
  }
  const binding = withFormat({ expr: subtotalExpr(fn, field) }, column.cell.format ?? '');
  const aggregate: GroupAggregate = { columnKey: key, binding };
  return el.groups.map((group) => upsertAggregate(group, aggregate));
}

/**
 * Removes the `key` column's subtotal from every group's footer band, dropping a
 * footer band (and the `groups` aggregates) left empty so the table never carries
 * a stray band. Returns `null` (a no-op) when the table has no groups.
 */
export function clearColumnGroupAggregate(
  el: DataTableElement,
  key: string,
): readonly DataTableGroup[] | null {
  if (el.groups === undefined || el.groups.length === 0) {
    return null;
  }
  return el.groups.map((group) => removeAggregate(group, key));
}

// --- autocomplete suggestions ------------------------------------------------

/**
 * The de-duplicated **array** paths from the introspected field tree, for the
 * Data Source autocomplete (e.g. `invoice.lineItems`). Depth-first document order.
 */
export function collectArrayPaths(root: FieldNode): readonly string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  const visit = (node: FieldNode): void => {
    if (node.kind === 'array' && node.path !== '' && !seen.has(node.path)) {
      seen.add(node.path);
      paths.push(node.path);
    }
    for (const child of node.children ?? []) {
      visit(child);
    }
  };
  visit(root);
  return paths;
}

/**
 * The de-duplicated **row-relative** field paths (`$.field`) under the array at
 * `arrayExpr`, for a column cell's `FX` autocomplete. Returns `[]` when no array
 * node matches `arrayExpr`. The array-element placeholder (`[]`) is skipped; its
 * descendants contribute their `rowPath` (set only inside an array element).
 */
export function collectRowFieldPaths(
  root: FieldNode,
  arrayExpr: string,
): readonly string[] {
  const target = arrayExpr.trim();
  const arrayNode = findArrayNode(root, target);
  if (!arrayNode) {
    return [];
  }
  const paths: string[] = [];
  const seen = new Set<string>();
  const visit = (node: FieldNode): void => {
    if (node.rowPath !== undefined && node.name !== '[]' && !seen.has(node.rowPath)) {
      seen.add(node.rowPath);
      paths.push(node.rowPath);
    }
    for (const child of node.children ?? []) {
      visit(child);
    }
  };
  for (const child of arrayNode.children ?? []) {
    visit(child);
  }
  return paths;
}

// --- internals ---------------------------------------------------------------

/** First array node in the tree whose `path` equals `arrayExpr`, or `undefined`. */
function findArrayNode(root: FieldNode, arrayExpr: string): FieldNode | undefined {
  if (root.kind === 'array' && root.path === arrayExpr) {
    return root;
  }
  for (const child of root.children ?? []) {
    const found = findArrayNode(child, arrayExpr);
    if (found) {
      return found;
    }
  }
  return undefined;
}

/**
 * The row-relative field a simple cell expression targets: `''` for the bare row
 * `$`, the dotted path for `$.a.b`, or `null` when the cell is a computed
 * expression (operators, function calls) with no single field to aggregate.
 */
function rowFieldOf(cellExpr: string): string | null {
  const expr = cellExpr.trim();
  if (expr === '$') {
    return '';
  }
  if (expr.startsWith('$.')) {
    const rest = expr.slice(2);
    return /^[A-Za-z_`][\w.`]*$/.test(rest) ? rest : null;
  }
  return null;
}

/** A grand-total expression over the data root (column footer scope). */
function grandTotalExpr(fn: AggregateFn, arrayExpr: string, field: string): string {
  if (fn === 'count') {
    return `$count(${arrayExpr})`;
  }
  const target = field === '' ? arrayExpr : `${arrayExpr}.${field}`;
  return `$${fn}(${target})`;
}

/** A subtotal expression over a group's rows array (group footer scope). */
function subtotalExpr(fn: AggregateFn, field: string): string {
  if (fn === 'count') {
    return '$count($)';
  }
  return field === '' ? `$${fn}($)` : `$${fn}($.${field})`;
}

/** The {@link AggregateFn} an aggregate expression uses, or `null` when it is not a known aggregate. */
function aggregateFnOf(expr: string): AggregateFn | null {
  const match = AGGREGATE_RE.exec(expr.trim());
  return match ? (match[1] as AggregateFn) : null;
}

/** Returns `binding` with `format` set (non-empty token) or removed (blank). */
function withFormat(binding: ElementBinding, token: string): ElementBinding {
  if (token === '') {
    const next: Omit<ElementBinding, 'format'> & { format?: string | null } = { ...binding };
    delete next.format;
    return next;
  }
  return { ...binding, format: token };
}

/** Adds or replaces `aggregate` in a group's footer band (creating the band if absent). */
function upsertAggregate(group: DataTableGroup, aggregate: GroupAggregate): DataTableGroup {
  const band: GroupBand = group.footer ?? {};
  const existing = band.aggregates ?? [];
  const aggregates = existing.some((a) => a.columnKey === aggregate.columnKey)
    ? existing.map((a) => (a.columnKey === aggregate.columnKey ? aggregate : a))
    : [...existing, aggregate];
  return { ...group, footer: { ...band, aggregates } };
}

/** Removes the `key` aggregate from a group's footer, dropping an emptied band entirely. */
function removeAggregate(group: DataTableGroup, key: string): DataTableGroup {
  const band = group.footer;
  if (!band?.aggregates) {
    return group;
  }
  const aggregates = band.aggregates.filter((a) => a.columnKey !== key);
  if (aggregates.length > 0) {
    return { ...group, footer: { ...band, aggregates } };
  }
  // No aggregates left: keep a label-only band, else drop the footer entirely.
  if (band.label !== undefined) {
    const nextBand: Omit<GroupBand, 'aggregates'> & { aggregates?: readonly GroupAggregate[] } = {
      ...band,
    };
    delete nextBand.aggregates;
    return { ...group, footer: nextBand };
  }
  const nextGroup: Omit<DataTableGroup, 'footer'> & { footer?: GroupBand } = { ...group };
  delete nextGroup.footer;
  return nextGroup;
}
