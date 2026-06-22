import {
  goldenInvoiceData,
  goldenInvoiceTemplate,
  goldenTabularReportData,
  goldenTabularReportTemplate,
  type DataTableElement,
  type TemplateElement,
} from '@rendara/report-schema';
import { describe, expect, it } from 'vitest';

import { summarizeDiagnostics, type Diagnostic } from './diagnostics';
import {
  resolveBinding,
  resolveDataTable,
  resolveElement,
  type ResolvedDataTable,
} from './resolve';

// --- fixture helpers ---------------------------------------------------------

/** Pulls the (only) data table out of a golden template's body by id. */
function tableFromGolden(
  template: typeof goldenInvoiceTemplate,
  id: string,
): DataTableElement {
  const el = template.body.elements.find((e) => e.id === id);
  if (!el || el.type !== 'dataTable') {
    throw new Error(`no data table '${id}' in template`);
  }
  return el;
}

const invoiceTable = tableFromGolden(goldenInvoiceTemplate, 'el_inv_table');
const reportTable = tableFromGolden(goldenTabularReportTemplate, 'el_rpt_table');

/** Builds a minimal valid data table for focused, inline-data tests. */
function makeTable(overrides: Partial<DataTableElement> = {}): DataTableElement {
  return {
    id: 'el_t',
    type: 'dataTable',
    frame: { xMm: 0, yMm: 0, wMm: 100, hMm: null },
    source: { arrayExpr: 'items' },
    columns: [{ key: 'amt', header: 'Amount', cell: { expr: '$.amount' }, widthMm: 40 }],
    repeatHeaderOnEachPage: true,
    keepTogether: false,
    z: 1,
    ...overrides,
  };
}

/** Looks up a resolved aggregate by column key. */
function agg(aggregates: ResolvedDataTable['columnFooters'], columnKey: string) {
  const found = aggregates.find((a) => a.columnKey === columnKey);
  if (!found) {
    throw new Error(`no aggregate for column '${columnKey}'`);
  }
  return found;
}

/** Looks up a resolved cell by column key within a row. */
function cell(row: ResolvedDataTable['rows'][number], columnKey: string) {
  const found = row.cells.find((c) => c.columnKey === columnKey);
  if (!found) {
    throw new Error(`no cell for column '${columnKey}'`);
  }
  return found;
}

// --- resolveBinding ----------------------------------------------------------

describe('resolveBinding', () => {
  it('evaluates and formats with the binding format token', async () => {
    const res = await resolveBinding(
      { expr: 'price', format: 'currency:USD' },
      { price: 1234.5 },
    );
    expect(res.raw).toBe(1234.5);
    expect(res.formatted).toBe('$1,234.50');
    expect(res.error).toBeUndefined();
  });

  it('uses the binding locale for formatting', async () => {
    const res = await resolveBinding(
      { expr: 'price', format: 'currency:EUR' },
      { price: 1234.5 },
      { locale: 'de-DE' },
    );
    // de-DE groups with '.', decimal ',', currency symbol trailing.
    expect(res.formatted).toContain('1.234,50');
  });

  it('falls back when the path is missing', async () => {
    const res = await resolveBinding(
      { expr: 'nope.here', format: null, fallback: 'N/A' },
      { price: 1 },
    );
    expect(res.raw).toBeUndefined();
    expect(res.formatted).toBe('N/A');
    expect(res.error).toBeUndefined();
  });

  it('falls back to blank when no fallback is configured', async () => {
    const res = await resolveBinding({ expr: 'nope' }, {});
    expect(res.formatted).toBe('');
  });

  it('preserves an explicit empty-string fallback', async () => {
    const res = await resolveBinding({ expr: 'nope', fallback: '' }, {});
    expect(res.formatted).toBe('');
  });

  it('returns the fallback and a structured error on a bad expression', async () => {
    const res = await resolveBinding({ expr: '1 +', fallback: '—' }, {});
    expect(res.raw).toBeUndefined();
    expect(res.formatted).toBe('—');
    expect(res.error?.kind).toBe('compile');
    expect(res.error?.expr).toBe('1 +');
  });

  it('never throws on a runtime error (invoking a non-function)', async () => {
    const res = await resolveBinding({ expr: '$notAFunction()' }, {});
    expect(res.error).toBeDefined();
    expect(res.formatted).toBe('');
  });
});

// --- resolveElement ----------------------------------------------------------

describe('resolveElement', () => {
  it('resolves a bound text element over the root data', async () => {
    const el = goldenInvoiceTemplate.body.elements.find((e) => e.id === 'el_inv_customer');
    const res = await resolveElement(el as TemplateElement, goldenInvoiceData);
    expect(res?.raw).toBe('Northwind Trading Ltd');
    expect(res?.formatted).toBe('Northwind Trading Ltd');
  });

  it('formats a bound text element with its format token', async () => {
    const el = goldenInvoiceTemplate.body.elements.find((e) => e.id === 'el_inv_total');
    const res = await resolveElement(el as TemplateElement, goldenInvoiceData);
    expect(res?.raw).toBe(3304.8);
    expect(res?.formatted).toBe('$3,304.80');
  });

  it('returns the static literal for an unbound text element', async () => {
    const el: TemplateElement = {
      id: 'el_lit',
      type: 'text',
      frame: { xMm: 0, yMm: 0, wMm: 10, hMm: 5 },
      text: 'INVOICE',
      z: 1,
    };
    const res = await resolveElement(el, {});
    expect(res).toEqual({ raw: 'INVOICE', formatted: 'INVOICE' });
  });

  it('prefers a dynamic binding over a static literal on a text element', async () => {
    const el: TemplateElement = {
      id: 'el_both',
      type: 'text',
      frame: { xMm: 0, yMm: 0, wMm: 10, hMm: 5 },
      text: 'static',
      binding: { expr: 'name' },
      z: 1,
    };
    const res = await resolveElement(el, { name: 'dynamic' });
    expect(res?.formatted).toBe('dynamic');
  });

  it('resolves an image binding, and falls back to a static src', async () => {
    const bound: TemplateElement = {
      id: 'el_img',
      type: 'image',
      frame: { xMm: 0, yMm: 0, wMm: 10, hMm: 5 },
      binding: { expr: 'logo' },
      fit: 'contain',
      z: 1,
    };
    expect((await resolveElement(bound, { logo: 'a.png' }))?.formatted).toBe('a.png');

    const staticImg: TemplateElement = { ...bound, binding: undefined, src: 'b.png' };
    expect((await resolveElement(staticImg, {}))?.formatted).toBe('b.png');
  });

  it('returns undefined for shapes and data tables (no scalar value)', async () => {
    const shape: TemplateElement = {
      id: 'el_s',
      type: 'shape',
      shape: 'line',
      frame: { xMm: 0, yMm: 0, wMm: 10, hMm: 0 },
      z: 0,
    };
    expect(await resolveElement(shape, {})).toBeUndefined();
    expect(await resolveElement(invoiceTable, goldenInvoiceData)).toBeUndefined();
  });
});

// --- resolveDataTable: rows --------------------------------------------------

describe('resolveDataTable — rows', () => {
  it('expands rows in source order with `$` bound to each row', async () => {
    const res = await resolveDataTable(invoiceTable, goldenInvoiceData);
    expect(res.rows).toHaveLength(3);
    expect(res.rows.map((r) => r.index)).toEqual([0, 1, 2]);
    expect(cell(res.rows[0], 'desc').value.formatted).toBe('Design consultation');
    expect(cell(res.rows[0], 'amt').value.raw).toBe(960);
    expect(cell(res.rows[0], 'amt').value.formatted).toBe('$960.00');
    expect(cell(res.rows[2], 'qty').value.formatted).toBe('3');
    expect(res.errors).toEqual([]);
  });

  it('keeps cells in declared column order', async () => {
    const res = await resolveDataTable(invoiceTable, goldenInvoiceData);
    expect(res.rows[0].cells.map((c) => c.columnKey)).toEqual(['desc', 'qty', 'unit', 'amt']);
  });

  it('wraps a single non-array source value into one row', async () => {
    const res = await resolveDataTable(makeTable(), { items: { amount: 42 } });
    expect(res.rows).toHaveLength(1);
    expect(cell(res.rows[0], 'amt').value.raw).toBe(42);
  });

  it('yields no rows for a missing source path', async () => {
    const res = await resolveDataTable(makeTable(), {});
    expect(res.rows).toEqual([]);
  });

  it('collects the error from a bad source expression', async () => {
    const res = await resolveDataTable(makeTable({ source: { arrayExpr: '1 +' } }), {});
    expect(res.rows).toEqual([]);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0].kind).toBe('compile');
  });
});

// --- resolveDataTable: column footers (grand totals) -------------------------

describe('resolveDataTable — column footers / grand totals', () => {
  it('computes the column footer over the root data', async () => {
    const res = await resolveDataTable(invoiceTable, goldenInvoiceData);
    const total = agg(res.columnFooters, 'amt');
    expect(total.value.raw).toBe(960 + 1500 + 600);
    expect(total.value.formatted).toBe('$3,060.00');
  });

  it('only emits footers for columns that declare one', async () => {
    const res = await resolveDataTable(invoiceTable, goldenInvoiceData);
    expect(res.columnFooters.map((f) => f.columnKey)).toEqual(['amt']);
  });
});

// --- aggregate edge cases ----------------------------------------------------

describe('resolveDataTable — aggregate edge cases', () => {
  const footerTable = makeTable({
    columns: [
      {
        key: 'amt',
        header: 'Amount',
        cell: { expr: '$.amount' },
        footer: { expr: '$sum(items.amount)', format: 'number:0.00' },
        widthMm: 40,
      },
    ],
  });

  it('an empty array sums to undefined → fallback (JSONata $sum semantics)', async () => {
    const res = await resolveDataTable(footerTable, { items: [] });
    expect(res.rows).toEqual([]);
    const total = agg(res.columnFooters, 'amt');
    expect(total.value.raw).toBeUndefined();
    expect(total.value.formatted).toBe('');
  });

  it('a single row sums to that row’s value', async () => {
    const res = await resolveDataTable(footerTable, { items: [{ amount: 42 }] });
    expect(res.rows).toHaveLength(1);
    expect(agg(res.columnFooters, 'amt').value.raw).toBe(42);
  });

  it('skips missing fields in a sum (they are not counted)', async () => {
    const res = await resolveDataTable(footerTable, {
      items: [{ amount: 10 }, {}, { amount: 30 }],
    });
    expect(agg(res.columnFooters, 'amt').value.raw).toBe(40);
  });

  it('fails soft on an explicit null in a numeric aggregate', async () => {
    const res = await resolveDataTable(footerTable, {
      items: [{ amount: 10 }, { amount: null }, { amount: 30 }],
    });
    const total = agg(res.columnFooters, 'amt');
    expect(total.value.raw).toBeUndefined();
    expect(total.value.formatted).toBe('');
    expect(total.value.error).toBeDefined();
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it('supports avg / count / min / max via JSONata', async () => {
    const data = { items: [{ n: 10 }, { n: 20 }, { n: 30 }] };
    const build = (expr: string) =>
      makeTable({
        columns: [
          { key: 'n', header: 'N', cell: { expr: '$.n' }, footer: { expr }, widthMm: 40 },
        ],
      });
    const avg = await resolveDataTable(build('$average(items.n)'), data);
    const count = await resolveDataTable(build('$count(items.n)'), data);
    const min = await resolveDataTable(build('$min(items.n)'), data);
    const max = await resolveDataTable(build('$max(items.n)'), data);
    expect(agg(avg.columnFooters, 'n').value.raw).toBe(20);
    expect(agg(count.columnFooters, 'n').value.raw).toBe(3);
    expect(agg(min.columnFooters, 'n').value.raw).toBe(10);
    expect(agg(max.columnFooters, 'n').value.raw).toBe(30);
  });
});

// --- grouping ----------------------------------------------------------------

describe('resolveDataTable — grouping', () => {
  it('partitions rows by groupBy in first-seen order', async () => {
    const res = await resolveDataTable(reportTable, goldenTabularReportData);
    expect(res.groups?.map((g) => g.key)).toEqual(['North', 'South', 'West']);
    const counts = res.groups?.map((g) => g.rows.length);
    expect(counts).toEqual([4, 5, 5]);
  });

  it('resolves the group label against a representative row, not the rows array', async () => {
    const res = await resolveDataTable(reportTable, goldenTabularReportData);
    // A label evaluated over the rows array would stringify the whole sequence.
    expect(res.groups?.[0].header?.label?.formatted).toBe('Region: North');
  });

  it('keeps a group’s rows in source order and shares them with the flat list', async () => {
    const res = await resolveDataTable(reportTable, goldenTabularReportData);
    const north = res.groups?.[0];
    expect(north?.rows.map((r) => r.index)).toEqual([0, 1, 2, 3]);
    // Same ResolvedRow objects, not copies.
    expect(north?.rows[0]).toBe(res.rows[0]);
  });

  it('resolves per-group subtotal aggregates over the group’s rows', async () => {
    const res = await resolveDataTable(reportTable, goldenTabularReportData);
    const north = res.groups?.[0];
    const units = north?.footer?.aggregates.find((a) => a.columnKey === 'units');
    expect(units?.value.raw).toBe(120 + 64 + 38 + 22);
  });

  it('omits the groups view entirely when the element declares no grouping', async () => {
    const res = await resolveDataTable(invoiceTable, goldenInvoiceData);
    expect(res.groups).toBeUndefined();
  });

  it('produces no groups for an empty source', async () => {
    const res = await resolveDataTable(reportTable, { salesReport: { rows: [] } });
    expect(res.groups).toEqual([]);
  });

  it('partitions by non-string groupBy values (number, boolean, object, nil)', async () => {
    const grouped = makeTable({
      groups: [{ groupBy: '$.k' }],
      columns: [{ key: 'v', header: 'V', cell: { expr: '$.v' }, widthMm: 40 }],
    });

    const numeric = await resolveDataTable(grouped, {
      items: [{ k: 1, v: 'a' }, { k: 1, v: 'b' }, { k: 2, v: 'c' }],
    });
    expect(numeric.groups?.map((g) => g.key)).toEqual(['1', '2']);
    expect(numeric.groups?.map((g) => g.keyValue)).toEqual([1, 2]);

    const bool = await resolveDataTable(grouped, {
      items: [{ k: true, v: 'a' }, { k: false, v: 'b' }],
    });
    expect(bool.groups?.map((g) => g.key)).toEqual(['true', 'false']);

    const obj = await resolveDataTable(grouped, {
      items: [{ k: { id: 1 }, v: 'a' }, { k: { id: 1 }, v: 'b' }, { k: { id: 2 }, v: 'c' }],
    });
    // Equal-shaped objects fold into one bucket; a different shape is its own.
    expect(obj.groups).toHaveLength(2);

    const nil = await resolveDataTable(grouped, { items: [{ v: 'a' }, { v: 'b' }] });
    expect(nil.groups).toHaveLength(1);
    expect(nil.groups?.[0].key).toBe('');
    expect(nil.groups?.[0].keyValue).toBeUndefined();
  });

  it('collects an error per row and folds into one nil group on a bad groupBy', async () => {
    const grouped = makeTable({
      groups: [{ groupBy: '1 +' }],
      columns: [{ key: 'v', header: 'V', cell: { expr: '$.v' }, widthMm: 40 }],
    });
    const res = await resolveDataTable(grouped, { items: [{ v: 'a' }, { v: 'b' }] });
    expect(res.groups).toHaveLength(1);
    expect(res.groups?.[0].keyValue).toBeUndefined();
    expect(res.errors.length).toBeGreaterThanOrEqual(2);
  });
});

// --- reconciliation: subtotals → grand total ---------------------------------

describe('resolveDataTable — grouped totals reconcile to the grand total', () => {
  it('sums each group subtotal back to the column grand total', async () => {
    const res = await resolveDataTable(reportTable, goldenTabularReportData);

    for (const columnKey of ['units', 'revenue'] as const) {
      const grand = agg(res.columnFooters, columnKey).value.raw as number;
      const sumOfSubtotals = (res.groups ?? []).reduce((acc, group) => {
        const sub = group.footer?.aggregates.find((a) => a.columnKey === columnKey);
        return acc + (sub?.value.raw as number);
      }, 0);
      expect(sumOfSubtotals).toBe(grand);
    }
  });

  it('matches the grand total independently computed from the sample data', async () => {
    const res = await resolveDataTable(reportTable, goldenTabularReportData);
    const expectedRevenue = goldenTabularReportData.salesReport.rows.reduce(
      (acc, r) => acc + r.revenue,
      0,
    );
    expect(agg(res.columnFooters, 'revenue').value.raw).toBe(expectedRevenue);
  });
});

// --- determinism -------------------------------------------------------------

describe('resolveDataTable — determinism', () => {
  it('produces an identical model across repeated runs', async () => {
    const a = await resolveDataTable(reportTable, goldenTabularReportData);
    const b = await resolveDataTable(reportTable, goldenTabularReportData);
    expect(a).toEqual(b);
  });
});

// --- E2-S6: missing/invalid-data diagnostics ---------------------------------

/** Finds the single diagnostic with the given code (asserting there is exactly one). */
function only(diagnostics: readonly Diagnostic[], code: Diagnostic['code']): Diagnostic {
  const found = diagnostics.filter((d) => d.code === code);
  if (found.length !== 1) {
    throw new Error(`expected exactly one '${code}', found ${found.length}`);
  }
  return found[0];
}

describe('resolveBinding — diagnostics (E2-S6)', () => {
  it('emits no diagnostics when the value resolves and formats cleanly', async () => {
    const res = await resolveBinding({ expr: 'price', format: 'currency:USD' }, { price: 10 });
    expect(res.diagnostics).toBeUndefined();
  });

  it('emits a missing-value warning (with location) when the path resolves to nothing', async () => {
    const res = await resolveBinding(
      { expr: 'nope', fallback: 'N/A' },
      {},
      undefined,
      { elementId: 'el_1', role: 'element' },
    );
    expect(res.formatted).toBe('N/A');
    expect(res.error).toBeUndefined();
    const d = only(res.diagnostics ?? [], 'missing-value');
    expect(d.severity).toBe('warning');
    expect(d.expr).toBe('nope');
    expect(d.location).toEqual({ elementId: 'el_1', role: 'element' });
  });

  it('emits a format-mismatch warning when a present value is the wrong type', async () => {
    const res = await resolveBinding({ expr: 'amount', format: 'currency:USD' }, { amount: 'oops' });
    expect(res.formatted).toBe('');
    const d = only(res.diagnostics ?? [], 'format-mismatch');
    expect(d.severity).toBe('warning');
    expect(d.expr).toBe('amount');
  });

  it('emits an invalid-format warning for a bad format token argument', async () => {
    const res = await resolveBinding({ expr: 'amount', format: 'currency:US' }, { amount: 10 });
    const d = only(res.diagnostics ?? [], 'invalid-format');
    expect(d.severity).toBe('warning');
  });

  it('emits an expression-error diagnostic (and keeps error) on a bad expression', async () => {
    const res = await resolveBinding({ expr: '1 +' }, {}, undefined, {
      elementId: 'el_1',
      columnKey: 'amt',
      role: 'cell',
    });
    const d = only(res.diagnostics ?? [], 'expression-error');
    expect(d.severity).toBe('error');
    expect(d.error).toBe(res.error);
    expect(d.location?.role).toBe('cell');
  });
});

describe('resolveElement — diagnostics (E2-S6)', () => {
  it('tags a bound element’s warning with its element id and role', async () => {
    const el: TemplateElement = {
      id: 'el_x',
      type: 'text',
      frame: { xMm: 0, yMm: 0, wMm: 10, hMm: 5 },
      binding: { expr: 'missing.path' },
      z: 1,
    };
    const res = await resolveElement(el, {});
    const d = only(res?.diagnostics ?? [], 'missing-value');
    expect(d.location).toEqual({ elementId: 'el_x', role: 'element' });
  });

  it('produces no diagnostics for a static (unbound) element', async () => {
    const el: TemplateElement = {
      id: 'el_lit',
      type: 'text',
      frame: { xMm: 0, yMm: 0, wMm: 10, hMm: 5 },
      text: 'INVOICE',
      z: 1,
    };
    const res = await resolveElement(el, {});
    expect(res?.diagnostics).toBeUndefined();
  });
});

describe('resolveDataTable — diagnostics (E2-S6)', () => {
  it('aggregates per-cell warnings with row/column locations; errors stays the error subset', async () => {
    const table = makeTable({
      columns: [{ key: 'amt', header: 'Amount', cell: { expr: '$.amount', format: 'currency:USD' }, widthMm: 40 }],
    });
    const res = await resolveDataTable(table, { items: [{ amount: 10 }, {}, { amount: 'bad' }] });

    const missing = only(res.diagnostics, 'missing-value');
    expect(missing.location).toEqual({ elementId: 'el_t', columnKey: 'amt', rowIndex: 1, role: 'cell' });
    const mismatch = only(res.diagnostics, 'format-mismatch');
    expect(mismatch.location?.rowIndex).toBe(2);
    // Both are warnings, so the back-compat errors list stays empty.
    expect(res.errors).toEqual([]);
  });

  it('tags a source-expression failure with the source role and surfaces it as an error', async () => {
    const res = await resolveDataTable(makeTable({ source: { arrayExpr: '1 +' } }), {});
    const d = only(res.diagnostics, 'expression-error');
    expect(d.location).toEqual({ elementId: 'el_t', role: 'source' });
    expect(res.errors).toHaveLength(1);
  });

  it('tags group label / aggregate / groupBy diagnostics with the group key and role', async () => {
    const grouped = makeTable({
      groups: [
        {
          groupBy: '$.region',
          header: { label: { expr: '$.missingLabel' } },
          footer: { aggregates: [{ columnKey: 'amt', binding: { expr: '$sum($.amount)', format: 'currency:US' } }] },
        },
      ],
      columns: [{ key: 'amt', header: 'Amount', cell: { expr: '$.amount' }, widthMm: 40 }],
    });
    const res = await resolveDataTable(grouped, { items: [{ region: 'North', amount: 10 }] });

    const labelWarn = res.diagnostics.find((d) => d.location?.role === 'groupLabel');
    expect(labelWarn?.code).toBe('missing-value');
    expect(labelWarn?.location?.groupKey).toBe('North');

    const aggWarn = res.diagnostics.find((d) => d.location?.role === 'groupAggregate');
    expect(aggWarn?.code).toBe('invalid-format');
    expect(aggWarn?.location).toEqual({
      elementId: 'el_t',
      columnKey: 'amt',
      groupKey: 'North',
      role: 'groupAggregate',
    });
  });
});

describe('partial data (E2-S6) — values where present, fallback elsewhere', () => {
  /** A deep clone of the golden invoice data with selected fields removed. */
  function partialInvoiceData() {
    const data = structuredClone(goldenInvoiceData) as {
      invoice: {
        customer: { name?: string };
        lineItems: { amount?: number }[];
      };
    };
    delete data.invoice.customer.name; // a missing scalar binding
    delete data.invoice.lineItems[1].amount; // a missing cell within one row
    return data;
  }

  it('resolves present values and falls back on the missing customer name', async () => {
    const data = partialInvoiceData();
    const customer = goldenInvoiceTemplate.body.elements.find((e) => e.id === 'el_inv_customer');
    const res = await resolveElement(customer as TemplateElement, data);
    expect(res?.formatted).toBe(''); // fallback, no crash
    expect(only(res?.diagnostics ?? [], 'missing-value').location?.elementId).toBe('el_inv_customer');
  });

  it('falls back on the one missing amount cell but renders the rest, and the grand total skips it', async () => {
    const data = partialInvoiceData();
    const res = await resolveDataTable(invoiceTable, data);

    // Row 0 present, row 1 amount missing → blank, row 2 present.
    expect(cell(res.rows[0], 'amt').value.formatted).toBe('$960.00');
    expect(cell(res.rows[1], 'amt').value.formatted).toBe('');
    expect(cell(res.rows[2], 'amt').value.formatted).toBe('$600.00');

    // The one warning is for the missing cell; nothing crashed and no hard errors.
    const report = summarizeDiagnostics(res.diagnostics);
    expect(report.hasErrors).toBe(false);
    expect(report.warnings.some((w) => w.code === 'missing-value' && w.location?.rowIndex === 1)).toBe(
      true,
    );

    // $sum skips the missing field, so the grand total is the sum of the present amounts.
    expect(agg(res.columnFooters, 'amt').value.raw).toBe(960 + 600);
  });
});
