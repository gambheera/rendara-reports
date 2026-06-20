/**
 * Canonical golden fixtures (E1-S8): the reference templates — each paired with a
 * sample Data JSON — used as the basis for tests across the whole monorepo
 * (validation here, and later pagination/render/visual tests in the engine,
 * renderer, and viewer libs).
 *
 * **This TS module is the single source of truth.** `tools/generate-fixtures.ts`
 * serializes each golden to committed `.json` artifacts under
 * `libs/report-schema/fixtures/<name>/{template.json,data.json}`;
 * `fixtures.spec.ts` fails if a committed file drifts from the in-code source
 * (mirroring how `json-schema.spec.ts` guards the generated schema). Because each
 * template is declared `: RendaraTemplate`, the goldens are also checked against
 * the model at compile time, and the spec asserts every one passes `validate()`.
 *
 * Sample content follows the canonical reconciliation choices (brief §12.3):
 * the invoice is *Acme Corp → Northwind Trading Ltd, `INV-2042`, 17 Jun 2026*;
 * units are mm; the accent is `#4F46E5`.
 *
 * Three goldens, covering the distinct layout/data shapes later epics must
 * handle (backlog E1-S8):
 *   • **invoice**        — text + data table + column total (A4 portrait).
 *   • **certificate**    — absolute layout + image + shapes, no table (A4 landscape).
 *   • **tabular-report** — a large grouped table with subtotals + grand total.
 */

import type { RendaraTemplate } from './template';

/**
 * A golden fixture: a named, validated {@link RendaraTemplate} paired with a
 * sample Data JSON whose shape the template's bindings resolve over. `name` is
 * the on-disk folder of the committed artifacts.
 */
export interface GoldenFixture {
  /** Stable kebab-case identifier and on-disk folder name. */
  readonly name: string;
  /** The reference template (passes `validate()`). */
  readonly template: RendaraTemplate;
  /** Arbitrary sample data the template's expressions resolve against. */
  readonly data: unknown;
}

// ---------------------------------------------------------------------------
// 1. Invoice — text + data table + column total.
// ---------------------------------------------------------------------------

/**
 * The canonical invoice: a header logo, issuer/customer text bindings, a
 * line-items data table with a per-row currency cell and an `$sum` column footer
 * (grand total), a fixed total block, and a page-number footer. Content width is
 * the A4 portrait body: 210 − 15 − 15 = 180 mm.
 */
export const goldenInvoiceTemplate: RendaraTemplate = {
  schemaVersion: '1.0.0',
  metadata: {
    name: 'Invoice — Acme Corp',
    id: 'fixture-invoice-0001',
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
  header: {
    elements: [
      {
        id: 'el_inv_logo',
        type: 'image',
        frame: { xMm: 15, yMm: 12, wMm: 40, hMm: 14 },
        src: 'https://assets.rendara.dev/acme-logo.png',
        fit: 'contain',
        z: 1,
      },
    ],
  },
  body: {
    elements: [
      {
        id: 'el_inv_title',
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
        id: 'el_inv_number',
        type: 'text',
        frame: { xMm: 130, yMm: 18, wMm: 65, hMm: 8 },
        binding: { expr: 'invoice.number', format: null, fallback: '' },
        style: { align: { horizontal: 'right', vertical: 'middle' } },
        z: 1,
      },
      {
        id: 'el_inv_date',
        type: 'text',
        frame: { xMm: 130, yMm: 26, wMm: 65, hMm: 6 },
        binding: { expr: 'invoice.date', format: 'date:medium', fallback: '' },
        style: { align: { horizontal: 'right', vertical: 'middle' } },
        z: 1,
      },
      {
        id: 'el_inv_bill_to_label',
        type: 'text',
        frame: { xMm: 15, yMm: 38, wMm: 80, hMm: 5 },
        text: 'Bill To',
        style: { font: { weight: 'bold' } },
        z: 1,
      },
      {
        id: 'el_inv_customer',
        type: 'text',
        frame: { xMm: 15, yMm: 44, wMm: 90, hMm: 6 },
        binding: { expr: 'invoice.customer.name', format: null, fallback: '' },
        z: 1,
      },
      {
        id: 'el_inv_customer_addr',
        type: 'text',
        frame: { xMm: 15, yMm: 50, wMm: 90, hMm: 12 },
        binding: { expr: 'invoice.customer.address', format: null, fallback: '' },
        z: 1,
      },
      {
        id: 'el_inv_rule',
        type: 'shape',
        shape: 'line',
        frame: { xMm: 15, yMm: 68, wMm: 180, hMm: 0 },
        style: { stroke: { color: '#94A3B8', widthMm: 0.2, style: 'solid' } },
        z: 0,
      },
      {
        id: 'el_inv_table',
        type: 'dataTable',
        frame: { xMm: 15, yMm: 74, wMm: 180, hMm: null },
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
      {
        id: 'el_inv_total_label',
        type: 'text',
        frame: { xMm: 110, yMm: 250, wMm: 50, hMm: 8 },
        text: 'Total Due',
        style: {
          font: { weight: 'bold' },
          align: { horizontal: 'right', vertical: 'middle' },
        },
        z: 1,
      },
      {
        id: 'el_inv_total',
        type: 'text',
        frame: { xMm: 160, yMm: 250, wMm: 35, hMm: 8 },
        binding: { expr: 'invoice.total', format: 'currency:USD', fallback: '' },
        style: {
          font: { weight: 'bold' },
          align: { horizontal: 'right', vertical: 'middle' },
        },
        z: 1,
      },
    ],
  },
  footer: {
    elements: [
      {
        id: 'el_inv_page',
        type: 'text',
        frame: { xMm: 15, yMm: 282, wMm: 180, hMm: 6 },
        text: 'Page {{pageNumber}} of {{pageCount}}',
        style: { align: { horizontal: 'center', vertical: 'middle' } },
        z: 1,
      },
    ],
  },
};

/** Sample data the {@link goldenInvoiceTemplate} bindings resolve over. */
export const goldenInvoiceData = {
  invoice: {
    number: 'INV-2042',
    date: '2026-06-17',
    issuer: { name: 'Acme Corp', email: 'billing@acme.example' },
    customer: {
      name: 'Northwind Trading Ltd',
      address: '42 Commerce Way\nPortland, OR 97201',
    },
    lineItems: [
      { description: 'Design consultation', quantity: 8, unitPrice: 120, amount: 960 },
      { description: 'Template implementation', quantity: 1, unitPrice: 1500, amount: 1500 },
      { description: 'Priority support (monthly)', quantity: 3, unitPrice: 200, amount: 600 },
    ],
    subtotal: 3060,
    tax: 244.8,
    total: 3304.8,
  },
};

// ---------------------------------------------------------------------------
// 2. Certificate — absolute layout + image + shapes.
// ---------------------------------------------------------------------------

/**
 * A certificate of completion: a framing rectangle, a decorative rule line, an
 * ellipse "seal", a logo image, and centred text bindings — no data table. It
 * exercises every non-table element type in a purely absolute layout. A4
 * landscape (297 × 210 mm).
 */
export const goldenCertificateTemplate: RendaraTemplate = {
  schemaVersion: '1.0.0',
  metadata: {
    name: 'Certificate of Completion',
    id: 'fixture-certificate-0001',
    createdAt: '2026-06-17T00:00:00.000Z',
    locale: 'en-US',
  },
  page: {
    size: 'A4',
    orientation: 'landscape',
    marginsMm: { top: 20, right: 15, bottom: 20, left: 15 },
    units: 'mm',
    defaultFont: { family: 'Inter', sizePt: 12 },
    background: null,
  },
  header: { elements: [] },
  body: {
    elements: [
      {
        id: 'el_cert_border',
        type: 'shape',
        shape: 'rect',
        frame: { xMm: 10, yMm: 10, wMm: 277, hMm: 190 },
        style: { stroke: { color: '#4F46E5', widthMm: 1.5, style: 'solid' } },
        z: 0,
      },
      {
        id: 'el_cert_rule',
        type: 'shape',
        shape: 'line',
        frame: { xMm: 40, yMm: 74, wMm: 217, hMm: 0 },
        style: { stroke: { color: '#4F46E5', widthMm: 0.4, style: 'solid' } },
        z: 1,
      },
      {
        id: 'el_cert_seal',
        type: 'shape',
        shape: 'ellipse',
        frame: { xMm: 128, yMm: 150, wMm: 40, hMm: 40 },
        style: {
          fill: '#EEF2FF',
          stroke: { color: '#4F46E5', widthMm: 0.6, style: 'solid' },
        },
        z: 1,
      },
      {
        id: 'el_cert_logo',
        type: 'image',
        frame: { xMm: 128, yMm: 22, wMm: 40, hMm: 14 },
        src: 'https://assets.rendara.dev/rendara-academy.png',
        fit: 'contain',
        z: 2,
      },
      {
        id: 'el_cert_title',
        type: 'text',
        frame: { xMm: 40, yMm: 44, wMm: 217, hMm: 16 },
        text: 'Certificate of Completion',
        style: {
          font: { family: 'Inter', sizePt: 32, weight: 'bold', style: 'normal' },
          color: '#4F46E5',
          align: { horizontal: 'center', vertical: 'middle' },
        },
        z: 2,
      },
      {
        id: 'el_cert_presented',
        type: 'text',
        frame: { xMm: 40, yMm: 82, wMm: 217, hMm: 8 },
        text: 'This certificate is proudly presented to',
        style: { align: { horizontal: 'center', vertical: 'middle' } },
        z: 2,
      },
      {
        id: 'el_cert_recipient',
        type: 'text',
        frame: { xMm: 40, yMm: 92, wMm: 217, hMm: 14 },
        binding: { expr: 'certificate.recipient', format: null, fallback: '' },
        style: {
          font: { family: 'Inter', sizePt: 28, weight: 'normal', style: 'italic' },
          align: { horizontal: 'center', vertical: 'middle' },
        },
        z: 2,
      },
      {
        id: 'el_cert_course_intro',
        type: 'text',
        frame: { xMm: 40, yMm: 110, wMm: 217, hMm: 8 },
        text: 'for successfully completing',
        style: { align: { horizontal: 'center', vertical: 'middle' } },
        z: 2,
      },
      {
        id: 'el_cert_course',
        type: 'text',
        frame: { xMm: 40, yMm: 120, wMm: 217, hMm: 10 },
        binding: { expr: 'certificate.course', format: null, fallback: '' },
        style: {
          font: { family: 'Inter', sizePt: 18, weight: 'bold', style: 'normal' },
          align: { horizontal: 'center', vertical: 'middle' },
        },
        z: 2,
      },
      {
        id: 'el_cert_date',
        type: 'text',
        frame: { xMm: 40, yMm: 138, wMm: 110, hMm: 8 },
        binding: { expr: 'certificate.completedOn', format: 'date:long', fallback: '' },
        style: { align: { horizontal: 'left', vertical: 'middle' } },
        z: 2,
      },
      {
        id: 'el_cert_signatory',
        type: 'text',
        frame: { xMm: 147, yMm: 138, wMm: 110, hMm: 8 },
        binding: { expr: 'certificate.signatory', format: null, fallback: '' },
        style: { align: { horizontal: 'right', vertical: 'middle' } },
        z: 2,
      },
      {
        id: 'el_cert_seal_label',
        type: 'text',
        frame: { xMm: 128, yMm: 166, wMm: 40, hMm: 8 },
        binding: { expr: 'certificate.issuer', format: null, fallback: '' },
        style: {
          font: { family: 'Inter', sizePt: 8, weight: 'bold', style: 'normal' },
          color: '#4F46E5',
          align: { horizontal: 'center', vertical: 'middle' },
        },
        z: 3,
      },
    ],
  },
  footer: { elements: [] },
};

/** Sample data the {@link goldenCertificateTemplate} bindings resolve over. */
export const goldenCertificateData = {
  certificate: {
    recipient: 'Jane A. Smith',
    course: 'Advanced Report Design',
    completedOn: '2026-06-17',
    issuer: 'Rendara Academy',
    signatory: 'Dr. A. Turing, Director',
  },
};

// ---------------------------------------------------------------------------
// 3. Tabular report — large table + grouping.
// ---------------------------------------------------------------------------

/**
 * A regional sales report: a single wide data table grouped by region, with a
 * per-group header label, per-group subtotal footers (`$sum` of units and
 * revenue), and a grand-total column footer on revenue. Built to drive grouping
 * + pagination tests in later epics, so its sample data carries many rows across
 * several groups. A4 landscape; table body width 297 − 15 − 15 = 267 mm.
 */
export const goldenTabularReportTemplate: RendaraTemplate = {
  schemaVersion: '1.0.0',
  metadata: {
    name: 'Regional Sales Report',
    id: 'fixture-tabular-report-0001',
    createdAt: '2026-06-17T00:00:00.000Z',
    locale: 'en-US',
  },
  page: {
    size: 'A4',
    orientation: 'landscape',
    marginsMm: { top: 20, right: 15, bottom: 20, left: 15 },
    units: 'mm',
    defaultFont: { family: 'Inter', sizePt: 9 },
    background: null,
  },
  header: { elements: [] },
  body: {
    elements: [
      {
        id: 'el_rpt_title',
        type: 'text',
        frame: { xMm: 15, yMm: 16, wMm: 200, hMm: 10 },
        text: 'Regional Sales Report',
        style: {
          font: { family: 'Inter', sizePt: 20, weight: 'bold', style: 'normal' },
          color: '#4F46E5',
          align: { horizontal: 'left', vertical: 'middle' },
        },
        z: 1,
      },
      {
        id: 'el_rpt_period',
        type: 'text',
        frame: { xMm: 15, yMm: 27, wMm: 200, hMm: 6 },
        binding: { expr: 'salesReport.period', format: null, fallback: '' },
        z: 1,
      },
      {
        id: 'el_rpt_table',
        type: 'dataTable',
        frame: { xMm: 15, yMm: 38, wMm: 267, hMm: null },
        source: { arrayExpr: 'salesReport.rows' },
        columns: [
          { key: 'product', header: 'Product', cell: { expr: '$.product' }, widthMm: 90 },
          { key: 'category', header: 'Category', cell: { expr: '$.category' }, widthMm: 60 },
          {
            key: 'units',
            header: 'Units',
            cell: { expr: '$.units', format: 'number:0' },
            footer: { expr: '$sum(salesReport.rows.units)', format: 'number:0' },
            widthMm: 35,
            align: 'right',
          },
          {
            key: 'unitPrice',
            header: 'Unit Price',
            cell: { expr: '$.unitPrice', format: 'currency:USD' },
            widthMm: 41,
            align: 'right',
          },
          {
            key: 'revenue',
            header: 'Revenue',
            cell: { expr: '$.revenue', format: 'currency:USD' },
            footer: { expr: '$sum(salesReport.rows.revenue)', format: 'currency:USD' },
            widthMm: 41,
            align: 'right',
          },
        ],
        groups: [
          {
            groupBy: '$.region',
            header: { label: { expr: '"Region: " & $.region' } },
            footer: {
              aggregates: [
                { columnKey: 'units', binding: { expr: '$sum($.units)', format: 'number:0' } },
                {
                  columnKey: 'revenue',
                  binding: { expr: '$sum($.revenue)', format: 'currency:USD' },
                },
              ],
            },
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
        id: 'el_rpt_page',
        type: 'text',
        frame: { xMm: 15, yMm: 200, wMm: 267, hMm: 6 },
        text: 'Page {{pageNumber}} of {{pageCount}}',
        style: { align: { horizontal: 'center', vertical: 'middle' } },
        z: 1,
      },
    ],
  },
};

/** Sample data the {@link goldenTabularReportTemplate} bindings resolve over. */
export const goldenTabularReportData = {
  salesReport: {
    period: 'Q2 2026 (Apr–Jun)',
    rows: [
      {
        region: 'North',
        product: 'Aurora Desk Lamp',
        category: 'Lighting',
        units: 120,
        unitPrice: 45,
        revenue: 5400,
      },
      {
        region: 'North',
        product: 'Borealis Floor Lamp',
        category: 'Lighting',
        units: 64,
        unitPrice: 110,
        revenue: 7040,
      },
      {
        region: 'North',
        product: 'Cedar Side Table',
        category: 'Furniture',
        units: 38,
        unitPrice: 130,
        revenue: 4940,
      },
      {
        region: 'North',
        product: 'Dune Lounge Chair',
        category: 'Furniture',
        units: 22,
        unitPrice: 320,
        revenue: 7040,
      },
      {
        region: 'South',
        product: 'Ember Pendant',
        category: 'Lighting',
        units: 95,
        unitPrice: 75,
        revenue: 7125,
      },
      {
        region: 'South',
        product: 'Fjord Bookshelf',
        category: 'Furniture',
        units: 30,
        unitPrice: 210,
        revenue: 6300,
      },
      {
        region: 'South',
        product: 'Grove Coffee Table',
        category: 'Furniture',
        units: 41,
        unitPrice: 160,
        revenue: 6560,
      },
      {
        region: 'South',
        product: 'Harbor Wall Sconce',
        category: 'Lighting',
        units: 150,
        unitPrice: 38,
        revenue: 5700,
      },
      {
        region: 'South',
        product: 'Isle Bar Stool',
        category: 'Furniture',
        units: 88,
        unitPrice: 95,
        revenue: 8360,
      },
      {
        region: 'West',
        product: 'Juniper Reading Lamp',
        category: 'Lighting',
        units: 110,
        unitPrice: 52,
        revenue: 5720,
      },
      {
        region: 'West',
        product: 'Kelp Dining Chair',
        category: 'Furniture',
        units: 76,
        unitPrice: 140,
        revenue: 10640,
      },
      {
        region: 'West',
        product: 'Larch Console',
        category: 'Furniture',
        units: 19,
        unitPrice: 290,
        revenue: 5510,
      },
      {
        region: 'West',
        product: 'Maple Task Light',
        category: 'Lighting',
        units: 134,
        unitPrice: 48,
        revenue: 6432,
      },
      {
        region: 'West',
        product: 'Nimbus Accent Lamp',
        category: 'Lighting',
        units: 57,
        unitPrice: 89,
        revenue: 5073,
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Registry.
// ---------------------------------------------------------------------------

/**
 * Every golden fixture, in a stable order. The `name` of each entry is the
 * on-disk folder of its committed `template.json` / `data.json` artifacts
 * (`libs/report-schema/fixtures/<name>/`). Consumers in other libs can iterate
 * this to drive table-driven tests over all goldens.
 */
export const GOLDEN_FIXTURES: readonly GoldenFixture[] = [
  { name: 'invoice', template: goldenInvoiceTemplate, data: goldenInvoiceData },
  { name: 'certificate', template: goldenCertificateTemplate, data: goldenCertificateData },
  {
    name: 'tabular-report',
    template: goldenTabularReportTemplate,
    data: goldenTabularReportData,
  },
];
