import { describe, expect, it } from 'vitest';
import {
  type DataTableColumn,
  type DataTableElement,
  goldenInvoiceData,
  goldenInvoiceTemplate,
} from '@rendara/report-schema';

import { resolveDataTable, type ResolvedDataTable } from './resolve';
import {
  DEFAULT_TEXT_METRICS,
  layoutTable,
  type TableLayoutOptions,
  wrapLineCount,
} from './table-layout';
import { mmToPx, ptToPx } from './units';

/** The invoice golden's data-table element (desc/qty/unit/amt, amt has a footer). */
function invoiceTableElement(): DataTableElement {
  const el = goldenInvoiceTemplate.body.elements.find(
    (e): e is DataTableElement => e.type === 'dataTable',
  );
  if (!el) {
    throw new Error('invoice golden is expected to contain a data table');
  }
  return el;
}
const invoiceTable = invoiceTableElement();

/** Resolves the invoice golden's table for the realistic-path tests. */
function resolveInvoiceTable(): Promise<ResolvedDataTable> {
  return resolveDataTable(invoiceTable, goldenInvoiceData);
}

/** A copy of the columns with every column-footer aggregate removed. */
function withoutFooters(columns: readonly DataTableColumn[]): DataTableColumn[] {
  return columns.map((col) => ({
    key: col.key,
    header: col.header,
    cell: col.cell,
    widthMm: col.widthMm,
    ...(col.align ? { align: col.align } : {}),
  }));
}

// --- wrapLineCount: the measurement core ------------------------------------

describe('wrapLineCount', () => {
  it('returns 1 for an empty string (a cell still occupies one line)', () => {
    expect(wrapLineCount('', 10)).toBe(1);
  });

  it('returns 1 when the text fits on one line', () => {
    expect(wrapLineCount('hello', 10)).toBe(1);
  });

  it('greedily wraps words that exceed the line budget', () => {
    // hello(5) world(5) foo(3) @ 10 chars: "hello world" is 11 > 10, so world
    // starts line 2 and foo joins it (5+1+3=9).
    expect(wrapLineCount('hello world foo', 10)).toBe(2);
  });

  it('splits a single word longer than the line across multiple lines', () => {
    expect(wrapLineCount('abcdefghijklmnopqrst', 10)).toBe(2); // ceil(20/10)
  });

  it('honours explicit newlines as forced breaks', () => {
    expect(wrapLineCount('a\nb', 10)).toBe(2);
    expect(wrapLineCount('a\n\nb', 10)).toBe(3); // blank middle line counts
  });

  it('guards a non-positive budget by flooring to one char per line', () => {
    expect(wrapLineCount('hello', 0)).toBe(5); // ceil(5/1)
  });

  it('combines wrap + long-word splitting deterministically', () => {
    // aa(2) bbbbbbbbbbbb(12) cc(2) @ 5: aa | bb..(3 lines, remainder 2) cc.
    expect(wrapLineCount('aa bbbbbbbbbbbb cc', 5)).toBe(4);
  });
});

// --- layoutTable: column geometry -------------------------------------------

describe('layoutTable — column widths honoured', () => {
  it('lays columns at cumulative x offsets with authored widths', async () => {
    const resolved = await resolveInvoiceTable();
    const layout = layoutTable(invoiceTable, resolved);

    expect(layout.columns).toEqual([
      { key: 'desc', xPx: 0, widthPx: mmToPx(90), align: 'left' },
      { key: 'qty', xPx: mmToPx(90), widthPx: mmToPx(20), align: 'right' },
      { key: 'unit', xPx: mmToPx(90) + mmToPx(20), widthPx: mmToPx(35), align: 'right' },
      {
        key: 'amt',
        xPx: mmToPx(90) + mmToPx(20) + mmToPx(35),
        widthPx: mmToPx(35),
        align: 'right',
      },
    ]);
    expect(layout.widthPx).toBe(mmToPx(90) + mmToPx(20) + mmToPx(35) + mmToPx(35));
  });

  it('defaults a column with no align to left', async () => {
    const resolved = await resolveInvoiceTable();
    const layout = layoutTable(invoiceTable, resolved);
    expect(layout.columns[0].align).toBe('left'); // desc declares no align
  });
});

// --- layoutTable: row expansion ---------------------------------------------

describe('layoutTable — detail row expansion', () => {
  it('emits header + one detail row per data row + a column-footer row', async () => {
    const resolved = await resolveInvoiceTable();
    const layout = layoutTable(invoiceTable, resolved);

    expect(layout.rows.map((r) => r.kind)).toEqual([
      'header',
      'detail',
      'detail',
      'detail',
      'columnFooter',
    ]);
    // detail rows carry their source index, in source order.
    expect(layout.rows.filter((r) => r.kind === 'detail').map((r) => r.index)).toEqual([0, 1, 2]);
  });

  it('omits the column-footer row when no column declares a footer', async () => {
    const noFooter: DataTableElement = { ...invoiceTable, columns: withoutFooters(invoiceTable.columns) };
    const resolved = await resolveDataTable(noFooter, goldenInvoiceData);
    const layout = layoutTable(noFooter, resolved);

    expect(layout.rows.map((r) => r.kind)).toEqual(['header', 'detail', 'detail', 'detail']);
  });

  it('uses the resolved, formatted display strings for cell text', async () => {
    const resolved = await resolveInvoiceTable();
    const layout = layoutTable(invoiceTable, resolved);

    // Row order is deterministic: [header, detail×3, columnFooter];
    // column order is [desc, qty, unit, amt].
    const firstDetail = layout.rows[1];
    expect(firstDetail.cells[0].text).toBe('Design consultation'); // desc
    expect(firstDetail.cells[3].text).toBe('$960.00'); // amt

    const footer = layout.rows[4];
    expect(footer.cells[3].text).toBe('$3,060.00'); // amt grand total
    expect(footer.cells[0].text).toBe(''); // desc has no footer aggregate
  });

  it('lays out only the header when the bound array is empty', async () => {
    const empty: DataTableElement = {
      ...invoiceTable,
      source: { arrayExpr: 'invoice.missingItems' },
      columns: withoutFooters(invoiceTable.columns),
    };
    const resolved = await resolveDataTable(empty, goldenInvoiceData);
    const layout = layoutTable(empty, resolved);

    expect(layout.rows).toHaveLength(1);
    expect(layout.rows[0].kind).toBe('header');
  });
});

// --- layoutTable: height from content ---------------------------------------

/** A one-column table whose narrow width forces long text to wrap. */
const narrowTable: DataTableElement = {
  id: 'el_narrow',
  type: 'dataTable',
  frame: { xMm: 0, yMm: 0, wMm: 20, hMm: null },
  source: { arrayExpr: 'notes' },
  columns: [{ key: 'note', header: 'Note', cell: { expr: '$.note' }, widthMm: 20 }],
  repeatHeaderOnEachPage: true,
  keepTogether: false,
  z: 1,
};
const narrowData = {
  notes: [{ note: 'This is a very long note that must wrap across several lines in a narrow column' }],
};

describe('layoutTable — per-row height from content', () => {
  it('makes a wrapping detail row taller than a single-line header', async () => {
    const resolved = await resolveDataTable(narrowTable, narrowData);
    const layout = layoutTable(narrowTable, resolved);

    const [header, detail] = layout.rows;
    expect(header.cells[0].lineCount).toBe(1);
    expect(detail.cells[0].lineCount).toBeGreaterThan(1);
    expect(detail.heightPx).toBeGreaterThan(header.heightPx);
  });

  it('sets a row height of (max line count × line height) + vertical padding', async () => {
    const resolved = await resolveDataTable(narrowTable, narrowData);
    const layout = layoutTable(narrowTable, resolved);

    const lineHeightPx = ptToPx(10) * DEFAULT_TEXT_METRICS.lineHeightEm;
    const vPadPx = mmToPx(1) + mmToPx(1); // default top + bottom padding (mm)
    const [header, detail] = layout.rows;
    expect(header.heightPx).toBeCloseTo(1 * lineHeightPx + vPadPx, 9);
    expect(detail.heightPx).toBeCloseTo(detail.cells[0].lineCount * lineHeightPx + vPadPx, 9);
  });

  it('stacks rows at cumulative y offsets summing to the total height', async () => {
    const resolved = await resolveInvoiceTable();
    const layout = layoutTable(invoiceTable, resolved);

    let expectedY = 0;
    let total = 0;
    for (const row of layout.rows) {
      expect(row.yPx).toBeCloseTo(expectedY, 9);
      expectedY += row.heightPx;
      total += row.heightPx;
    }
    expect(layout.heightPx).toBeCloseTo(total, 9);
  });
});

// --- layoutTable: options & determinism -------------------------------------

describe('layoutTable — options & determinism', () => {
  it('honours the configured font size (larger font ⇒ taller rows)', async () => {
    const resolved = await resolveInvoiceTable();
    const small = layoutTable(invoiceTable, resolved, { fontSizePt: 8 });
    const large = layoutTable(invoiceTable, resolved, { fontSizePt: 16 });
    expect(large.rows[0].heightPx).toBeGreaterThan(small.rows[0].heightPx);
  });

  it('honours custom text metrics (wider glyphs ⇒ more wrapped lines)', async () => {
    const resolved = await resolveDataTable(narrowTable, narrowData);
    const base = layoutTable(narrowTable, resolved);
    const wide: TableLayoutOptions = { metrics: { avgCharWidthEm: 1, lineHeightEm: 1.2 } };
    const wider = layoutTable(narrowTable, resolved, wide);

    expect(wider.rows[1].cells[0].lineCount).toBeGreaterThan(base.rows[1].cells[0].lineCount);
  });

  it('converts at a custom DPI while honouring the same mm widths', async () => {
    const resolved = await resolveInvoiceTable();
    const layout = layoutTable(invoiceTable, resolved, { dpi: 300 });
    expect(layout.columns[0].widthPx).toBeCloseTo(mmToPx(90, 300), 9);
  });

  it('is deterministic: re-running yields a deeply-equal layout', async () => {
    const resolved = await resolveInvoiceTable();
    const a = layoutTable(invoiceTable, resolved);
    const b = layoutTable(invoiceTable, resolved);
    expect(a).toEqual(b);
  });
});
