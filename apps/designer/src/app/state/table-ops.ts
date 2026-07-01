import type {
  ColumnAlign,
  DataTableColumn,
  DataTableElement,
  DataTableGroup,
  GroupBand,
} from '@rendara/report-schema';

/**
 * Pure, framework-agnostic helpers backing the Properties panel's **data-table
 * structure** editors (E6-S4): add / remove / reorder / resize columns, set a
 * column's header text and alignment, and add / remove / re-key grouping bands.
 *
 * They turn a raw panel interaction into an immutable `columns` / `groups` array
 * the designer store applies via `updateElement`, applying the same guards the
 * schema validator enforces (a table keeps **at least one column**, `widthMm > 0`)
 * so an out-of-range edit is a no-op (`null`) rather than an invalid document.
 * Everything here is pure so the component stays thin and the logic carries the
 * high coverage bar; structure produced here always round-trips through
 * `validateElement` (E6-S4 QA).
 *
 * Scope note: column **cell expressions**, the bound array **source**, and footer
 * **aggregate** functions are *data binding* — that is E6-S8. This module only
 * shapes the table's structure; a freshly-added column gets a valid placeholder
 * cell binding so the table stays schema-valid until it is bound.
 */

/** Column widths are authored in millimetres; default footprint of a new column. */
export const DEFAULT_COLUMN_WIDTH_MM = 40;

/** Rounds a millimetre value to 0.1 mm — enough precision for placement, tidy in the model. */
function roundMm(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * The next unique `col{n}` key for `columns`: the lowest positive `n` whose
 * `col{n}` key is not already taken. Scanning for a free slot (rather than
 * `length + 1`) keeps keys unique even after columns are removed and re-added,
 * so a group aggregate can never silently re-bind to a recycled key.
 */
export function nextColumnKey(columns: readonly DataTableColumn[]): string {
  const taken = new Set(columns.map((column) => column.key));
  let n = columns.length + 1;
  while (taken.has(`col${n}`)) {
    n += 1;
  }
  return `col${n}`;
}

/**
 * Returns `columns` with a new column appended: a unique {@link nextColumnKey}
 * key, a `"Column N"` header (N is the new column count), a valid placeholder
 * cell binding (`$.<key>` — the row's same-named field, so the table stays
 * schema-valid before binding in E6-S8) and the {@link DEFAULT_COLUMN_WIDTH_MM}
 * width. Returns the new column's key alongside, so the caller can select it.
 */
export function addTableColumn(el: DataTableElement): {
  columns: readonly DataTableColumn[];
  key: string;
} {
  const key = nextColumnKey(el.columns);
  const column: DataTableColumn = {
    key,
    header: `Column ${el.columns.length + 1}`,
    cell: { expr: `$.${key}` },
    widthMm: DEFAULT_COLUMN_WIDTH_MM,
  };
  return { columns: [...el.columns, column], key };
}

/**
 * Removes the column with `key`, returning the new `columns` **and** `groups`
 * (any group aggregate that aligned under the removed column is pruned, so the
 * table never references an unknown column — mirrors `validateGroupBand`).
 * Returns `null` (a no-op) when the column is unknown or when it is the **last**
 * one: a data table must keep at least one column (schema rule), so the panel's
 * remove control is simply inert in that case.
 */
export function removeTableColumn(
  el: DataTableElement,
  key: string,
): { columns: readonly DataTableColumn[]; groups?: readonly DataTableGroup[] } | null {
  if (el.columns.length <= 1 || !el.columns.some((column) => column.key === key)) {
    return null;
  }
  const columns = el.columns.filter((column) => column.key !== key);
  if (el.groups === undefined) {
    return { columns };
  }
  return { columns, groups: el.groups.map((group) => pruneGroupColumn(group, key)) };
}

/** Drops any aggregate aligned under `key` from a group's header/footer bands. */
function pruneGroupColumn(group: DataTableGroup, key: string): DataTableGroup {
  return {
    ...group,
    ...(group.header ? { header: pruneBandColumn(group.header, key) } : {}),
    ...(group.footer ? { footer: pruneBandColumn(group.footer, key) } : {}),
  };
}

/** Removes the `key` aggregate from a band, dropping an emptied `aggregates` array entirely. */
function pruneBandColumn(band: GroupBand, key: string): GroupBand {
  if (band.aggregates === undefined) {
    return band;
  }
  const aggregates = band.aggregates.filter((aggregate) => aggregate.columnKey !== key);
  const next: { aggregates?: GroupBand['aggregates'] } & Omit<GroupBand, 'aggregates'> = {
    ...band,
  };
  if (aggregates.length === 0) {
    delete next.aggregates;
  } else {
    next.aggregates = aggregates;
  }
  return next as GroupBand;
}

/**
 * Returns `columns` with the column at `from` moved to `to` (immutable). A no-op
 * (returns `null`) when either index is out of range or they are equal, so an
 * inert drag leaves the document — and the dirty flag — untouched.
 */
export function moveTableColumn(
  el: DataTableElement,
  from: number,
  to: number,
): readonly DataTableColumn[] | null {
  const last = el.columns.length - 1;
  if (from === to || from < 0 || to < 0 || from > last || to > last) {
    return null;
  }
  const columns = [...el.columns];
  const [moved] = columns.splice(from, 1);
  columns.splice(to, 0, moved);
  return columns;
}

/** Sets the `key` column's static header label (empty string allowed — the header is just a label). */
export function setTableColumnHeader(
  el: DataTableElement,
  key: string,
  header: string,
): readonly DataTableColumn[] {
  return el.columns.map((column) => (column.key === key ? { ...column, header } : column));
}

/**
 * Sets the `key` column's width (mm): rejects a non-finite or non-positive value
 * (mirrors `validateColumn`'s `widthMm > 0`), returning `null` so an out-of-range
 * keystroke is a no-op. The accepted value is rounded to 0.1 mm.
 */
export function setTableColumnWidth(
  el: DataTableElement,
  key: string,
  widthMm: number,
): readonly DataTableColumn[] | null {
  if (!Number.isFinite(widthMm) || widthMm <= 0) {
    return null;
  }
  const next = roundMm(widthMm);
  return el.columns.map((column) => (column.key === key ? { ...column, widthMm: next } : column));
}

/** Sets the `key` column's cell/header alignment (left/center/right). */
export function setTableColumnAlign(
  el: DataTableElement,
  key: string,
  align: ColumnAlign,
): readonly DataTableColumn[] {
  return el.columns.map((column) => (column.key === key ? { ...column, align } : column));
}

/** A reasonable starting `groupBy` for a freshly-added group (the row itself, valid JSONata). */
export const DEFAULT_GROUP_BY = '$';

/**
 * Appends a grouping band keyed by `groupBy` (default {@link DEFAULT_GROUP_BY}).
 * The group carries no bands/aggregates yet — those are the binding concern of
 * E6-S8; E6-S4 only declares the grouping structure, which round-trips as-is.
 */
export function addTableGroup(
  el: DataTableElement,
  groupBy: string = DEFAULT_GROUP_BY,
): readonly DataTableGroup[] {
  return [...(el.groups ?? []), { groupBy }];
}

/**
 * Removes the group at `index`, returning the new `groups` array — or `undefined`
 * when that empties the list, so the `groups` key is omitted entirely (the schema
 * treats absent and empty grouping the same, and an absent key keeps the document
 * minimal). Returns `null` (a no-op) when `index` is out of range.
 */
export function removeTableGroup(
  el: DataTableElement,
  index: number,
): readonly DataTableGroup[] | undefined | null {
  const groups = el.groups;
  if (groups === undefined || index < 0 || index >= groups.length) {
    return null;
  }
  const next = groups.filter((_, i) => i !== index);
  return next.length === 0 ? undefined : next;
}

/**
 * Sets the `index` group's `groupBy` expression. A no-op (`null`) when the index
 * is out of range; the expression itself is not evaluated here (that is the
 * engine's job), only stored.
 */
export function setTableGroupBy(
  el: DataTableElement,
  index: number,
  groupBy: string,
): readonly DataTableGroup[] | null {
  const groups = el.groups;
  if (groups === undefined || index < 0 || index >= groups.length) {
    return null;
  }
  return groups.map((group, i) => (i === index ? { ...group, groupBy } : group));
}
