import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import { Component } from '@angular/core';
import { goldenTabularReportTemplate } from '@rendara/report-schema';
import { paginate, type ResolvedDataTable, type ResolvedRow } from '@rendara/report-engine';

import { ReportSurface } from './report-surface';

/**
 * E4-S5 opt-in Shadow-DOM surface stories. They mount a real paginated document
 * inside `<rdr-report-surface>` — a shadow root — so the rendered report is fully
 * isolated from the surrounding page. The `HostileHost` story wraps it in a
 * container with deliberately hostile global CSS to show the boundary holds, and
 * `Themed` overrides `--rdr-*` tokens to re-theme through the boundary.
 */

const REGIONS = ['North', 'South', 'East', 'West'] as const;
const COLUMNS = ['product', 'category', 'units', 'revenue'] as const;

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
      header: { label: { raw: `Region: ${region}`, formatted: `Region: ${region}` }, aggregates: [] },
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

/** A wrapper that surrounds the surface with hostile global CSS + a leak-check sibling. */
@Component({
  selector: 'rdr-hostile-host',
  imports: [ReportSurface],
  styles: [
    `
      :host {
        display: block;
        padding: 16px;
        background: #e5e7eb;
      }
      /* Deliberately hostile: would wreck an unshielded renderer. */
      :host ::ng-deep .hostile * {
        color: red !important;
        font-family: 'Comic Sans MS' !important;
      }
      :host ::ng-deep .hostile div {
        border: 4px solid red !important;
      }
      .victim {
        margin: 0 0 12px;
        font-weight: 700;
      }
    `,
  ],
  template: `<div class="hostile">
    <p class="victim">Host content (the renderer must not restyle me, and I must not reach inside).</p>
    <rdr-report-surface [document]="doc" [template]="template" [zoom]="0.5" />
  </div>`,
})
class HostileHostComponent {
  readonly doc = document;
  readonly template = goldenTabularReportTemplate;
}

const meta: Meta<ReportSurface> = {
  title: 'report-renderer/ReportSurface',
  component: ReportSurface,
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

type Story = StoryObj<ReportSurface>;

/** The document rendered inside a shadow root (isolated by default). */
export const Default: Story = {};

/** The same document themed via `--rdr-*` overrides applied through the boundary. */
export const Themed: Story = {
  decorators: [
    (storyFn) => {
      const story = storyFn();
      return {
        ...story,
        template: `<div style="--rdr-table-header-fill:#FCE7F3; --rdr-table-group-fill:#FDF2F8; --rdr-table-total-rule:#BE185D; --rdr-page-shadow:0 6px 18px rgba(190,24,93,.25)">${story.template}</div>`,
      };
    },
  ],
};

/** Surrounded by hostile global CSS to demonstrate the shadow boundary holds. */
export const HostileHost: StoryObj<HostileHostComponent> = {
  decorators: [moduleMetadata({ imports: [HostileHostComponent] })],
  render: () => ({ template: `<rdr-hostile-host />` }),
};
