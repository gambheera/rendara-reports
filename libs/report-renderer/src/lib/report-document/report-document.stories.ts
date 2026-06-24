import type { Meta, StoryObj } from '@storybook/angular';
import { goldenTabularReportTemplate } from '@rendara/report-schema';
import { paginate, type ResolvedDataTable, type ResolvedRow } from '@rendara/report-engine';

import { ReportDocument } from './report-document';

/**
 * E4-S4 multi-page document renderer stories. They mount a real multi-page
 * document: the tabular-report golden paginated by the engine, rendered as a
 * stack of page sheets at a chosen zoom, in continuous or single layout. The
 * table is pre-resolved here (Storybook mounts synchronously; the engine resolves
 * bindings upstream) so the page count + slicing come from the real paginator.
 */

const REGIONS = ['North', 'South', 'East', 'West'] as const;
const COLUMNS = ['product', 'category', 'units', 'revenue'] as const;

/** Builds one resolved detail row from its four column display strings. */
function row(index: number, texts: readonly string[]): ResolvedRow {
  return {
    index,
    data: {},
    cells: COLUMNS.map((key, i) => ({
      columnKey: key,
      value: { raw: texts[i], formatted: texts[i] },
    })),
  };
}

/** Generates enough grouped rows to span several pages. */
const rows: ResolvedRow[] = Array.from({ length: 64 }, (_, i) =>
  row(i, [
    `Product ${i + 1}`,
    i % 2 === 0 ? 'Lighting' : 'Furniture',
    String((i % 9) + 1),
    '$1,200.00',
  ]),
);

const resolved: ResolvedDataTable = {
  rows,
  groups: REGIONS.map((region, g) => {
    const groupRows = rows.slice(g * 16, g * 16 + 16);
    return {
      key: region,
      keyValue: region,
      rows: groupRows,
      header: {
        label: { raw: `Region: ${region}`, formatted: `Region: ${region}` },
        aggregates: [],
      },
      footer: {
        aggregates: [
          { columnKey: 'units', value: { raw: '80', formatted: '80' } },
          { columnKey: 'revenue', value: { raw: '$19,200.00', formatted: '$19,200.00' } },
        ],
      },
    };
  }),
  columnFooters: [
    { columnKey: 'units', value: { raw: '320', formatted: '320' } },
    { columnKey: 'revenue', value: { raw: '$76,800.00', formatted: '$76,800.00' } },
  ],
  errors: [],
  diagnostics: [],
};

const document = paginate(goldenTabularReportTemplate, new Map([['el_rpt_table', resolved]]));

const meta: Meta<ReportDocument> = {
  title: 'report-renderer/ReportDocument',
  component: ReportDocument,
  tags: ['autodocs'],
  args: {
    document,
    template: goldenTabularReportTemplate,
    zoom: 0.5,
    layout: 'continuous',
    background: null,
  },
};

export default meta;

type Story = StoryObj<ReportDocument>;

/** Every page stacked continuously at 50% zoom. */
export const Continuous: Story = {};

/** A tighter zoom showing more pages at once. */
export const ContinuousSmall: Story = {
  args: { zoom: 0.35 },
};

/** Fit-width: the renderer scales each page to the visible width (measured live). */
export const FitWidth: Story = {
  args: { zoom: 'fit-width' },
};

/** Single-page layout showing the second page only. */
export const SinglePage: Story = {
  args: { layout: 'single', currentPage: 2, zoom: 0.7 },
};
