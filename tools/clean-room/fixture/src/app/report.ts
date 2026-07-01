/**
 * A self-contained invoice report (template + data) for the clean-room consumer.
 *
 * The app depends only on `@rendara/report-viewer`, so — like `viewer-demo` — it
 * builds the template inline and hands it to the viewer as a JSON string (the
 * viewer validates/migrates strings). Enough line items to paginate past one
 * page, so the smoke test can assert the footer's `Page 1 of N` token resolved.
 */

interface SampleLineItem {
  readonly description: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly amount: number;
}

function buildLineItems(count: number): readonly SampleLineItem[] {
  return Array.from({ length: count }, (_, i): SampleLineItem => {
    const quantity = (i % 5) + 1;
    const unitPrice = 50 + (i % 12) * 25;
    return {
      description: `Service line item ${i + 1}`,
      quantity,
      unitPrice,
      amount: quantity * unitPrice,
    };
  });
}

/** Sample data the template's bindings resolve over. */
export const SAMPLE_DATA = {
  invoice: {
    number: 'INV-2042',
    customer: { name: 'Northwind Trading Ltd' },
    lineItems: buildLineItems(40),
  },
};

/** A multi-page invoice template (A4 portrait) matching the schema contract. */
const SAMPLE_TEMPLATE = {
  schemaVersion: '1.0.0',
  metadata: {
    name: 'Invoice — Acme Corp',
    id: 'clean-room-invoice-0001',
    createdAt: '2026-06-17T00:00:00.000Z',
    locale: 'en-US',
  },
  page: {
    size: 'A4',
    orientation: 'portrait',
    marginsMm: { top: 20, right: 15, bottom: 20, left: 15 },
    units: 'mm',
    defaultFont: { family: 'Inter', sizePt: 10 },
    background: null,
  },
  header: { elements: [] },
  body: {
    elements: [
      {
        id: 'el_title',
        type: 'text',
        frame: { xMm: 15, yMm: 16, wMm: 100, hMm: 12 },
        text: 'INVOICE',
        style: {
          font: { family: 'Inter', sizePt: 24, weight: 'bold', style: 'normal' },
          color: '#4F46E5',
          align: { horizontal: 'left', vertical: 'middle' },
        },
        z: 1,
      },
      {
        id: 'el_customer',
        type: 'text',
        frame: { xMm: 15, yMm: 30, wMm: 120, hMm: 6 },
        binding: { expr: 'invoice.customer.name', format: null, fallback: '' },
        z: 1,
      },
      {
        id: 'el_table',
        type: 'dataTable',
        frame: { xMm: 15, yMm: 40, wMm: 180, hMm: null },
        source: { arrayExpr: 'invoice.lineItems' },
        columns: [
          { key: 'desc', header: 'Description', cell: { expr: '$.description' }, widthMm: 90 },
          {
            key: 'qty',
            header: 'Qty',
            cell: { expr: '$.quantity', format: 'number:0' },
            widthMm: 20,
            align: 'right',
          },
          {
            key: 'unit',
            header: 'Unit Price',
            cell: { expr: '$.unitPrice', format: 'currency:USD' },
            widthMm: 35,
            align: 'right',
          },
          {
            key: 'amt',
            header: 'Amount',
            cell: { expr: '$.amount', format: 'currency:USD' },
            footer: { expr: '$sum(invoice.lineItems.amount)', format: 'currency:USD' },
            widthMm: 35,
            align: 'right',
          },
        ],
        repeatHeaderOnEachPage: true,
        keepTogether: false,
        z: 1,
      },
    ],
  },
  footer: {
    elements: [
      {
        id: 'el_page',
        type: 'text',
        frame: { xMm: 15, yMm: 282, wMm: 180, hMm: 6 },
        text: 'Page {{pageNumber}} of {{pageCount}}',
        style: { align: { horizontal: 'center', vertical: 'middle' } },
        z: 1,
      },
    ],
  },
};

/** The template handed to the viewer as a JSON string (validated on input). */
export const SAMPLE_TEMPLATE_JSON = JSON.stringify(SAMPLE_TEMPLATE);
