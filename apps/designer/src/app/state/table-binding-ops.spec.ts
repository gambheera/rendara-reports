import { describe, expect, it } from 'vitest';
import { introspect } from '@rendara/report-engine';
import { isValidElement } from '@rendara/report-schema';
import type { DataTableElement, DataTableGroup, Frame } from '@rendara/report-schema';
import {
  AGGREGATE_FUNCTIONS,
  canAggregate,
  clearColumnFooter,
  clearColumnGroupAggregate,
  collectArrayPaths,
  collectRowFieldPaths,
  columnFooterFn,
  columnGroupAggFn,
  setColumnCellExpr,
  setColumnCellFormat,
  setColumnFooter,
  setColumnGroupAggregate,
  setTableSource,
} from './table-binding-ops';

const FRAME: Frame = { xMm: 15, yMm: 60, wMm: 120, hMm: null };

function table(overrides: Partial<DataTableElement> = {}): DataTableElement {
  return {
    id: 'el_tbl',
    type: 'dataTable',
    frame: FRAME,
    z: 1,
    source: { arrayExpr: 'invoice.lineItems' },
    columns: [
      { key: 'desc', header: 'Description', cell: { expr: '$.description' }, widthMm: 60 },
      {
        key: 'amt',
        header: 'Amount',
        cell: { expr: '$.amount', format: 'currency:USD' },
        widthMm: 40,
        align: 'right',
      },
    ],
    repeatHeaderOnEachPage: true,
    keepTogether: false,
    ...overrides,
  };
}

/** A grouped table, for the group-subtotal helpers. */
function groupedTable(overrides: Partial<DataTableElement> = {}): DataTableElement {
  return table({ groups: [{ groupBy: '$.category' }], ...overrides });
}

/** Re-applies a columns patch so the result can be validated. */
function withColumns(el: DataTableElement, columns: DataTableElement['columns']): DataTableElement {
  return { ...el, columns };
}
/** Re-applies a groups patch so the result can be validated. */
function withGroups(el: DataTableElement, groups: DataTableElement['groups']): DataTableElement {
  if (groups === undefined) {
    const next: { groups?: readonly DataTableGroup[] } & Omit<DataTableElement, 'groups'> = {
      ...el,
    };
    delete next.groups;
    return next as DataTableElement;
  }
  return { ...el, groups };
}

const SAMPLE = {
  invoice: {
    customer: { name: 'Acme Corp' },
    lineItems: [
      { description: 'Widget', amount: 10, category: 'A' },
      { description: 'Gadget', amount: 20, category: 'B' },
    ],
    tags: ['x', 'y'],
  },
};

describe('AGGREGATE_FUNCTIONS', () => {
  it('lists the five JSONata aggregates in picker order', () => {
    expect(AGGREGATE_FUNCTIONS.map((a) => a.fn)).toEqual([
      'sum',
      'average',
      'count',
      'min',
      'max',
    ]);
  });
});

describe('setTableSource', () => {
  it('trims the array expression into a source patch', () => {
    expect(setTableSource('  invoice.lineItems  ')).toEqual({
      source: { arrayExpr: 'invoice.lineItems' },
    });
  });
});

describe('setColumnCellExpr', () => {
  it('sets a column cell expression, trimmed, preserving format', () => {
    const columns = setColumnCellExpr(table(), 'amt', '  $.amount  ');
    const amt = columns.find((c) => c.key === 'amt');
    expect(amt?.cell).toEqual({ expr: '$.amount', format: 'currency:USD' });
  });

  it('leaves other columns untouched and stays schema-valid', () => {
    const el = table();
    const columns = setColumnCellExpr(el, 'desc', '$.description');
    expect(columns.find((c) => c.key === 'amt')).toBe(el.columns[1]);
    expect(isValidElement(withColumns(el, columns))).toBe(true);
  });
});

describe('setColumnCellFormat', () => {
  it('sets a format token on the cell', () => {
    const columns = setColumnCellFormat(table(), 'desc', 'number:0.00');
    expect(columns.find((c) => c.key === 'desc')?.cell).toEqual({
      expr: '$.description',
      format: 'number:0.00',
    });
  });

  it('clears the format key when given null (minimal JSON)', () => {
    const columns = setColumnCellFormat(table(), 'amt', null);
    expect(columns.find((c) => c.key === 'amt')?.cell).toEqual({ expr: '$.amount' });
  });
});

describe('canAggregate', () => {
  it('is true for a simple row path and the bare row', () => {
    expect(canAggregate({ key: 'a', header: 'A', cell: { expr: '$.amount' }, widthMm: 10 })).toBe(
      true,
    );
    expect(canAggregate({ key: 'a', header: 'A', cell: { expr: '$' }, widthMm: 10 })).toBe(true);
    expect(
      canAggregate({ key: 'a', header: 'A', cell: { expr: '$.a.b' }, widthMm: 10 }),
    ).toBe(true);
  });

  it('is false for a computed cell with no single field', () => {
    expect(
      canAggregate({ key: 'a', header: 'A', cell: { expr: '$.qty * $.price' }, widthMm: 10 }),
    ).toBe(false);
    expect(
      canAggregate({ key: 'a', header: 'A', cell: { expr: 'invoice.total' }, widthMm: 10 }),
    ).toBe(false);
  });
});

describe('setColumnFooter / columnFooterFn / clearColumnFooter', () => {
  it('builds a grand total over the root array path, inheriting the cell format', () => {
    const columns = ok(setColumnFooter(table(), 'amt', 'sum'));
    expect(columns.find((c) => c.key === 'amt')?.footer).toEqual({
      expr: '$sum(invoice.lineItems.amount)',
      format: 'currency:USD',
    });
  });

  it('counts rows over the array itself (no field)', () => {
    const columns = ok(setColumnFooter(table(), 'desc', 'count'));
    expect(columns.find((c) => c.key === 'desc')?.footer).toEqual({
      expr: '$count(invoice.lineItems)',
    });
  });

  it('totals the bare-row scalar array as the array path', () => {
    const el = table({
      source: { arrayExpr: 'invoice.tags' },
      columns: [{ key: 'tag', header: 'Tag', cell: { expr: '$' }, widthMm: 40 }],
    });
    const columns = ok(setColumnFooter(el, 'tag', 'max'));
    expect(columns.find((c) => c.key === 'tag')?.footer).toEqual({
      expr: '$max(invoice.tags)',
    });
  });

  it('is a no-op for a computed cell or unknown column', () => {
    const el = table({
      columns: [{ key: 'c', header: 'C', cell: { expr: '$.a * $.b' }, widthMm: 40 }],
    });
    expect(setColumnFooter(el, 'c', 'sum')).toBeNull();
    expect(setColumnFooter(table(), 'nope', 'sum')).toBeNull();
  });

  it('round-trips: detect the function, then clear it', () => {
    const columns = ok(setColumnFooter(table(), 'amt', 'average'));
    const el = withColumns(table(), columns);
    expect(columnFooterFn(el, 'amt')).toBe('average');
    expect(isValidElement(el)).toBe(true);

    const cleared = clearColumnFooter(el, 'amt');
    expect(cleared.find((c) => c.key === 'amt')?.footer).toBeUndefined();
    expect(columnFooterFn(withColumns(el, cleared), 'amt')).toBeNull();
  });
});

describe('group subtotals', () => {
  it('adds a subtotal to every group footer, row-scoped, inheriting format', () => {
    const groups = ok(setColumnGroupAggregate(groupedTable(), 'amt', 'sum'));
    expect(groups[0].footer?.aggregates).toEqual([
      { columnKey: 'amt', binding: { expr: '$sum($.amount)', format: 'currency:USD' } },
    ]);
    expect(isValidElement(withGroups(groupedTable(), groups))).toBe(true);
  });

  it('counts rows as $count($)', () => {
    const groups = ok(setColumnGroupAggregate(groupedTable(), 'desc', 'count'));
    expect(groups[0].footer?.aggregates?.[0].binding.expr).toBe('$count($)');
  });

  it('replaces an existing aggregate for the same column rather than duplicating', () => {
    const first = ok(setColumnGroupAggregate(groupedTable(), 'amt', 'sum'));
    const el = withGroups(groupedTable(), first);
    const second = ok(setColumnGroupAggregate(el, 'amt', 'max'));
    expect(second[0].footer?.aggregates).toHaveLength(1);
    expect(second[0].footer?.aggregates?.[0].binding.expr).toBe('$max($.amount)');
    expect(columnGroupAggFn(withGroups(el, second), 'amt')).toBe('max');
  });

  it('preserves a group label when removing the last aggregate', () => {
    const labelled = groupedTable({
      groups: [{ groupBy: '$.category', footer: { label: { expr: '$.category' } } }],
    });
    const added = ok(setColumnGroupAggregate(labelled, 'amt', 'sum'));
    const cleared = ok(clearColumnGroupAggregate(withGroups(labelled, added), 'amt'));
    expect(cleared[0].footer).toEqual({ label: { expr: '$.category' } });
  });

  it('drops an emptied footer band entirely', () => {
    const added = ok(setColumnGroupAggregate(groupedTable(), 'amt', 'sum'));
    const cleared = ok(clearColumnGroupAggregate(withGroups(groupedTable(), added), 'amt'));
    expect(cleared[0].footer).toBeUndefined();
    expect(isValidElement(withGroups(groupedTable(), cleared))).toBe(true);
  });

  it('is a no-op on an ungrouped table', () => {
    expect(setColumnGroupAggregate(table(), 'amt', 'sum')).toBeNull();
    expect(clearColumnGroupAggregate(table(), 'amt')).toBeNull();
    expect(columnGroupAggFn(table(), 'amt')).toBeNull();
  });
});

describe('collectArrayPaths', () => {
  it('lists every array node path in document order', () => {
    const { root } = introspect(SAMPLE);
    expect(collectArrayPaths(root)).toEqual(['invoice.lineItems', 'invoice.tags']);
  });
});

describe('collectRowFieldPaths', () => {
  it('lists the row-relative fields of the bound array of objects', () => {
    const { root } = introspect(SAMPLE);
    expect(collectRowFieldPaths(root, 'invoice.lineItems')).toEqual([
      '$.description',
      '$.amount',
      '$.category',
    ]);
  });

  it('returns [] for an unknown array path', () => {
    const { root } = introspect(SAMPLE);
    expect(collectRowFieldPaths(root, 'invoice.nope')).toEqual([]);
  });
});

/** Asserts a helper result is present (not a no-op) and narrows it. */
function ok<T>(value: T | null | undefined): T {
  expect(value).not.toBeNull();
  expect(value).not.toBeUndefined();
  return value as T;
}
