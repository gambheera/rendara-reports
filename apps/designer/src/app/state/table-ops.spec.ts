import { describe, expect, it } from 'vitest';
import { isValidElement } from '@rendara/report-schema';
import type { DataTableElement, DataTableGroup, Frame } from '@rendara/report-schema';
import {
  DEFAULT_COLUMN_WIDTH_MM,
  DEFAULT_GROUP_BY,
  addTableColumn,
  addTableGroup,
  moveTableColumn,
  nextColumnKey,
  removeTableColumn,
  removeTableGroup,
  setTableColumnAlign,
  setTableColumnHeader,
  setTableColumnWidth,
  setTableGroupBy,
} from './table-ops';

const FRAME: Frame = { xMm: 15, yMm: 60, wMm: 120, hMm: null };

function table(overrides: Partial<DataTableElement> = {}): DataTableElement {
  return {
    id: 'el_tbl',
    type: 'dataTable',
    frame: FRAME,
    z: 1,
    source: { arrayExpr: 'items' },
    columns: [
      { key: 'col1', header: 'Column 1', cell: { expr: '$.col1' }, widthMm: 60 },
      { key: 'col2', header: 'Column 2', cell: { expr: '$.col2' }, widthMm: 60 },
    ],
    repeatHeaderOnEachPage: true,
    keepTogether: false,
    ...overrides,
  };
}

/** Asserts a helper result is present (not a no-op) and narrows it for further use. */
function ok<T>(value: T | null | undefined): T {
  expect(value).not.toBeNull();
  expect(value).not.toBeUndefined();
  return value as T;
}

/** Re-applies a column/group patch onto the element so we can assert it validates. */
function withColumns(el: DataTableElement, columns: DataTableElement['columns']): DataTableElement {
  return { ...el, columns };
}
function withGroups(el: DataTableElement, groups: DataTableElement['groups']): DataTableElement {
  return groups === undefined ? omitGroups(el) : { ...el, groups };
}
function omitGroups(el: DataTableElement): DataTableElement {
  const next: { groups?: readonly DataTableGroup[] } & Omit<DataTableElement, 'groups'> = { ...el };
  delete next.groups;
  return next as DataTableElement;
}

describe('nextColumnKey', () => {
  it('returns the next free col{n} for a fresh table', () => {
    expect(nextColumnKey(table().columns)).toBe('col3');
  });

  it('skips keys already taken, even out of sequence', () => {
    const columns = [
      { key: 'col3', header: 'A', cell: { expr: '$.a' }, widthMm: 40 },
      { key: 'col1', header: 'B', cell: { expr: '$.b' }, widthMm: 40 },
    ];
    // length+1 = 3 is taken, so it must advance to col4.
    expect(nextColumnKey(columns)).toBe('col4');
  });

  it('handles non-conforming keys by falling back to length-based', () => {
    const columns = [{ key: 'desc', header: 'D', cell: { expr: '$.d' }, widthMm: 40 }];
    expect(nextColumnKey(columns)).toBe('col2');
  });
});

describe('addTableColumn', () => {
  it('appends a valid, uniquely-keyed column and reports its key', () => {
    const el = table();
    const { columns, key } = addTableColumn(el);
    expect(key).toBe('col3');
    expect(columns).toHaveLength(3);
    expect(columns[2]).toEqual({
      key: 'col3',
      header: 'Column 3',
      cell: { expr: '$.col3' },
      widthMm: DEFAULT_COLUMN_WIDTH_MM,
    });
    // Original is untouched (immutability) and the result round-trips through the schema.
    expect(el.columns).toHaveLength(2);
    expect(isValidElement(withColumns(el, columns))).toBe(true);
  });
});

describe('removeTableColumn', () => {
  it('removes the named column', () => {
    const el = table();
    const result = removeTableColumn(el, 'col1');
    expect(result).not.toBeNull();
    const { columns, groups } = ok(result);
    expect(columns.map((c) => c.key)).toEqual(['col2']);
    expect(groups).toBeUndefined();
    expect(isValidElement(withColumns(el, columns))).toBe(true);
  });

  it('is a no-op for the last remaining column (≥1 column rule)', () => {
    const el = table({
      columns: [{ key: 'col1', header: 'Only', cell: { expr: '$.col1' }, widthMm: 60 }],
    });
    expect(removeTableColumn(el, 'col1')).toBeNull();
  });

  it('is a no-op for an unknown key', () => {
    expect(removeTableColumn(table(), 'nope')).toBeNull();
  });

  it('prunes group aggregates that aligned under the removed column', () => {
    const groups: DataTableGroup[] = [
      {
        groupBy: '$.cat',
        header: { label: { expr: '$.cat' } },
        footer: {
          aggregates: [
            { columnKey: 'col1', binding: { expr: '$sum($.col1)' } },
            { columnKey: 'col2', binding: { expr: '$sum($.col2)' } },
          ],
        },
      },
    ];
    const el = table({ groups });
    const { columns, groups: nextGroups } = ok(removeTableColumn(el, 'col1'));
    expect(nextGroups?.[0].footer?.aggregates).toEqual([
      { columnKey: 'col2', binding: { expr: '$sum($.col2)' } },
    ]);
    // No dangling reference to the removed column → still schema-valid.
    expect(isValidElement(withGroups(withColumns(el, columns), nextGroups))).toBe(true);
  });

  it('drops an emptied aggregates array entirely', () => {
    const groups: DataTableGroup[] = [
      {
        groupBy: '$.cat',
        footer: { aggregates: [{ columnKey: 'col1', binding: { expr: '$x' } }] },
      },
    ];
    const el = table({ groups });
    const result = removeTableColumn(el, 'col1');
    expect(result?.groups?.[0].footer).toEqual({});
  });
});

describe('moveTableColumn', () => {
  it('moves a column to a new index immutably', () => {
    const el = addThirdColumn(table());
    const columns = ok(moveTableColumn(el, 0, 2));
    expect(columns.map((c) => c.key)).toEqual(['col2', 'col3', 'col1']);
    expect(el.columns.map((c) => c.key)).toEqual(['col1', 'col2', 'col3']);
    expect(isValidElement(withColumns(el, columns))).toBe(true);
  });

  it('returns null for equal or out-of-range indices', () => {
    const el = table();
    expect(moveTableColumn(el, 1, 1)).toBeNull();
    expect(moveTableColumn(el, -1, 0)).toBeNull();
    expect(moveTableColumn(el, 0, 5)).toBeNull();
  });
});

describe('setTableColumnHeader', () => {
  it('sets the header label of the named column only', () => {
    const columns = setTableColumnHeader(table(), 'col2', 'Amount');
    expect(columns[1].header).toBe('Amount');
    expect(columns[0].header).toBe('Column 1');
  });

  it('allows an empty header', () => {
    const columns = setTableColumnHeader(table(), 'col1', '');
    expect(columns[0].header).toBe('');
    expect(isValidElement(withColumns(table(), columns))).toBe(true);
  });
});

describe('setTableColumnWidth', () => {
  it('sets a rounded positive width', () => {
    const columns = ok(setTableColumnWidth(table(), 'col1', 32.46));
    expect(columns[0].widthMm).toBe(32.5);
    expect(isValidElement(withColumns(table(), columns))).toBe(true);
  });

  it('rejects non-positive or non-finite widths', () => {
    expect(setTableColumnWidth(table(), 'col1', 0)).toBeNull();
    expect(setTableColumnWidth(table(), 'col1', -5)).toBeNull();
    expect(setTableColumnWidth(table(), 'col1', NaN)).toBeNull();
  });
});

describe('setTableColumnAlign', () => {
  it('sets the alignment of the named column', () => {
    const columns = setTableColumnAlign(table(), 'col2', 'right');
    expect(columns[1].align).toBe('right');
    expect(columns[0].align).toBeUndefined();
    expect(isValidElement(withColumns(table(), columns))).toBe(true);
  });
});

describe('addTableGroup', () => {
  it('appends a default group to a table with none', () => {
    const groups = addTableGroup(table());
    expect(groups).toEqual([{ groupBy: DEFAULT_GROUP_BY }]);
    expect(isValidElement(withGroups(table(), groups))).toBe(true);
  });

  it('appends to existing groups and honours an explicit groupBy', () => {
    const el = table({ groups: [{ groupBy: '$.a' }] });
    const groups = addTableGroup(el, '$.b');
    expect(groups.map((g) => g.groupBy)).toEqual(['$.a', '$.b']);
  });
});

describe('removeTableGroup', () => {
  it('removes the group at index', () => {
    const el = table({ groups: [{ groupBy: '$.a' }, { groupBy: '$.b' }] });
    const groups = removeTableGroup(el, 0);
    expect(groups).toEqual([{ groupBy: '$.b' }]);
  });

  it('returns undefined when removing the last group (omit the key)', () => {
    const el = table({ groups: [{ groupBy: '$.a' }] });
    expect(removeTableGroup(el, 0)).toBeUndefined();
  });

  it('returns null for an out-of-range index or no groups', () => {
    expect(removeTableGroup(table(), 0)).toBeNull();
    expect(removeTableGroup(table({ groups: [{ groupBy: '$.a' }] }), 3)).toBeNull();
  });
});

describe('setTableGroupBy', () => {
  it('sets the groupBy of the indexed group', () => {
    const el = table({ groups: [{ groupBy: '$.a' }, { groupBy: '$.b' }] });
    const groups = ok(setTableGroupBy(el, 1, '$.c'));
    expect(groups.map((g) => g.groupBy)).toEqual(['$.a', '$.c']);
    expect(isValidElement(withGroups(el, groups))).toBe(true);
  });

  it('returns null for an out-of-range index or no groups', () => {
    expect(setTableGroupBy(table(), 0, '$.x')).toBeNull();
    expect(setTableGroupBy(table({ groups: [{ groupBy: '$.a' }] }), 2, '$.x')).toBeNull();
  });
});

/** Adds a third column so reorder tests have three keys to shuffle. */
function addThirdColumn(el: DataTableElement): DataTableElement {
  return withColumns(el, addTableColumn(el).columns);
}
