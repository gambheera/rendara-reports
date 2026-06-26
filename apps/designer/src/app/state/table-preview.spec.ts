import { describe, expect, it } from 'vitest';
import type { DataTableElement, RendaraTemplate, TextElement } from '@rendara/report-schema';
import { createEmptyTemplate } from './template-ops';
import { resolveTables } from './table-preview';

/** Builds a template whose body holds the given elements over the empty-doc defaults. */
function templateWith(...elements: (DataTableElement | TextElement)[]): RendaraTemplate {
  const base = createEmptyTemplate();
  return { ...base, body: { elements } };
}

const data = {
  invoice: {
    lineItems: [
      { description: 'Widget', amount: 10, category: 'A' },
      { description: 'Gadget', amount: 20, category: 'A' },
      { description: 'Sprocket', amount: 5, category: 'B' },
    ],
  },
};

function invoiceTable(overrides: Partial<DataTableElement> = {}): DataTableElement {
  return {
    id: 'el_tbl',
    type: 'dataTable',
    frame: { xMm: 15, yMm: 60, wMm: 120, hMm: null },
    z: 1,
    source: { arrayExpr: 'invoice.lineItems' },
    columns: [
      { key: 'desc', header: 'Description', cell: { expr: '$.description' }, widthMm: 80 },
      {
        key: 'amt',
        header: 'Amount',
        cell: { expr: '$.amount', format: 'currency:USD' },
        footer: { expr: '$sum(invoice.lineItems.amount)', format: 'currency:USD' },
        widthMm: 40,
        align: 'right',
      },
    ],
    repeatHeaderOnEachPage: true,
    keepTogether: false,
    ...overrides,
  };
}

describe('resolveTables', () => {
  it('resolves a table to its repeated rows and column-footer grand total', async () => {
    const map = await resolveTables(templateWith(invoiceTable()), data);
    const resolved = map.get('el_tbl');
    expect(resolved?.rows).toHaveLength(3);
    expect(resolved?.rows[0].cells[0].value.formatted).toBe('Widget');
    expect(resolved?.rows[0].cells[1].value.formatted).toBe('$10.00');
    // Grand total across all rows.
    expect(resolved?.columnFooters[0].value.formatted).toBe('$35.00');
  });

  it('resolves per-group subtotals', async () => {
    const table = invoiceTable({
      groups: [
        {
          groupBy: '$.category',
          footer: {
            aggregates: [
              { columnKey: 'amt', binding: { expr: '$sum($.amount)', format: 'currency:USD' } },
            ],
          },
        },
      ],
    });
    const map = await resolveTables(templateWith(table), data);
    const groups = map.get('el_tbl')?.groups;
    expect(groups).toHaveLength(2);
    // Category A: 10 + 20 = 30; Category B: 5.
    expect(groups?.[0].footer?.aggregates[0].value.formatted).toBe('$30.00');
    expect(groups?.[1].footer?.aggregates[0].value.formatted).toBe('$5.00');
  });

  it('resolves to zero rows when the source array is missing (fail-soft)', async () => {
    const table = invoiceTable({ source: { arrayExpr: 'invoice.nope' } });
    const map = await resolveTables(templateWith(table), data);
    expect(map.get('el_tbl')?.rows).toHaveLength(0);
  });

  it('keys every data table by id and ignores non-table elements', async () => {
    const text: TextElement = {
      id: 'el_text',
      type: 'text',
      frame: { xMm: 0, yMm: 0, wMm: 40, hMm: 10 },
      z: 1,
      text: 'Literal',
    };
    const map = await resolveTables(templateWith(text, invoiceTable()), data);
    expect([...map.keys()]).toEqual(['el_tbl']);
  });

  it('is empty for a template with no data tables', async () => {
    const map = await resolveTables(createEmptyTemplate(), data);
    expect(map.size).toBe(0);
  });
});
