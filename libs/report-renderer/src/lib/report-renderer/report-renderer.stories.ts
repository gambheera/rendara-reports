import type { Meta, StoryObj } from '@storybook/angular';
import { goldenCertificateTemplate, goldenInvoiceTemplate } from '@rendara/report-schema';
import { paginate, type ResolvedDataTable } from '@rendara/report-engine';

import { ReportRenderer } from './report-renderer';

/**
 * E4-S1 single-page renderer stories, with E4-S2 content. They mount real
 * rendered output: the certificate golden paginated by the engine, rendered as an
 * absolutely positioned page sheet at a chosen zoom, with each element's text,
 * shapes and image painted. Data-bound text is supplied via `resolvedValues`
 * (the engine resolves bindings upstream); here the certificate's fixed values.
 */
const certificate = paginate(goldenCertificateTemplate, new Map());

/** The certificate golden's resolved data-bound text (see the brief's fixed sample). */
const certificateValues = new Map<string, string>([
  ['el_cert_recipient', 'Jane A. Smith'],
  ['el_cert_course', 'Advanced Report Design'],
  ['el_cert_date', 'June 17, 2026'],
  ['el_cert_signatory', 'Dr. A. Turing, Director'],
  ['el_cert_seal_label', 'Rendara Academy'],
]);

const meta: Meta<ReportRenderer> = {
  title: 'report-renderer/ReportRenderer',
  component: ReportRenderer,
  tags: ['autodocs'],
  args: {
    page: certificate.pages[0],
    geometry: certificate.geometry,
    template: goldenCertificateTemplate,
    resolvedValues: certificateValues,
    zoom: 0.6,
    background: null,
  },
};

export default meta;

type Story = StoryObj<ReportRenderer>;

/** The certificate page at 60% zoom, with text, shapes and image rendered. */
export const Certificate: Story = {};

/** A tinted page background. */
export const TintedBackground: Story = {
  args: { background: '#fafaf5' },
};

/**
 * The invoice golden with its line-items **data table** rendered (E4-S3): a
 * header, three detail rows with right-aligned currency columns and a grand-total
 * footer. The table is pre-resolved here (Storybook mounts synchronously; the
 * engine resolves bindings upstream) so the slice geometry comes from the real
 * paginator.
 */
const invoiceResolved: ResolvedDataTable = {
  rows: [
    invoiceRow(0, ['Design consultation', '8', '$120.00', '$960.00']),
    invoiceRow(1, ['Template implementation', '1', '$1,500.00', '$1,500.00']),
    invoiceRow(2, ['Priority support (monthly)', '3', '$200.00', '$600.00']),
  ],
  columnFooters: [{ columnKey: 'amt', value: { raw: 3060, formatted: '$3,060.00' } }],
  errors: [],
  diagnostics: [],
};

/** Builds one resolved invoice line-item row from its four column display strings. */
function invoiceRow(index: number, texts: readonly string[]): ResolvedDataTable['rows'][number] {
  const keys = ['desc', 'qty', 'unit', 'amt'] as const;
  return {
    index,
    data: {},
    cells: keys.map((key, i) => ({ columnKey: key, value: { raw: texts[i], formatted: texts[i] } })),
  };
}

const invoice = paginate(goldenInvoiceTemplate, new Map([['el_inv_table', invoiceResolved]]));

export const InvoiceTable: Story = {
  args: {
    page: invoice.pages[0],
    geometry: invoice.geometry,
    template: goldenInvoiceTemplate,
    resolvedValues: new Map<string, string>([
      ['el_inv_number', 'INV-2042'],
      ['el_inv_date', 'Jun 17, 2026'],
      ['el_inv_customer', 'Northwind Trading Ltd'],
      ['el_inv_customer_addr', '42 Commerce Way\nPortland, OR 97201'],
      ['el_inv_total', '$3,304.80'],
    ]),
    zoom: 0.7,
  },
};
