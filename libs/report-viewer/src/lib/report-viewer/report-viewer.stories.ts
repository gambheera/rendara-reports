import type { Meta, StoryObj } from '@storybook/angular';
import { GOLDEN_FIXTURES } from '@rendara/report-schema';

import { ReportViewer } from './report-viewer';

/** The canonical invoice golden, used to drive a live render in the stories. */
const invoice = GOLDEN_FIXTURES[0];

/** The invoice golden with many line items so it paginates — drives the nav controls. */
const paginatedData = {
  invoice: {
    ...(invoice.data as { invoice: Record<string, unknown> }).invoice,
    lineItems: Array.from({ length: 120 }, (_, i) => ({
      description: `Line item ${i + 1}`,
      quantity: 1,
      unitPrice: 100,
      amount: 100,
    })),
  },
};

/**
 * `report-viewer` carries its **public component API** (E7-S1) — the brief-§8
 * inputs (`template`, `data`, `config`, `theme`) and outputs (`rendered`,
 * `pageChange`, `error`) — and the **render pipeline** (E7-S2): it validates,
 * binds and paginates the template+data through the shared engine and paints the
 * result with the shared renderer. It carries the **configurable toolbar**
 * (E8-S1): a title, page-navigation and zoom groups, Print / Export / Watermark
 * action buttons and a host custom-action slot, each shown/hidden via
 * `config.toolbar`. These stories feed it the canonical invoice golden so the
 * body shows a live, paginated report.
 */
const meta: Meta<ReportViewer> = {
  title: 'report-viewer/ReportViewer',
  component: ReportViewer,
  tags: ['autodocs'],
  argTypes: {
    template: {
      description:
        'A validated RendaraTemplate or a raw JSON string. `null` shows the empty state.',
      control: false,
    },
    data: { description: 'Arbitrary host JSON bound into the template.', control: false },
    config: {
      description: 'Runtime config: locale, initialZoom, toolbar, watermark, pageMode.',
      control: 'object',
    },
    theme: {
      description: 'CSS custom-property (`--rdr-*`) overrides applied to the viewer host.',
      control: 'object',
    },
    rendered: { description: 'Emits `{ pageCount }` once a render completes (E7-S2).' },
    pageChange: { description: 'Emits `{ current, total }` on page change (E7-S3).' },
    error: { description: 'Emits a surfaced validation/binding/render failure (E7-S5).' },
  },
};

export default meta;

type Story = StoryObj<ReportViewer>;

export const Default: Story = {
  args: {
    template: invoice.template,
    data: invoice.data,
    config: { initialZoom: 'fit-width', pageMode: 'continuous' },
  },
};

export const Themed: Story = {
  args: {
    template: invoice.template,
    data: invoice.data,
    theme: { '--rdr-accent': '#4f46e5' },
    config: { initialZoom: 'fit-width', pageMode: 'continuous' },
  },
};

/**
 * A multi-page report in single-page mode (E7-S3): the thumbnail rail, the
 * `‹ 1 / N ›` controls and the `Page x of y` status drive page navigation.
 */
export const Paginated: Story = {
  args: {
    template: invoice.template,
    data: paginatedData,
    config: { initialZoom: 'fit-width', pageMode: 'single' },
  },
};

/**
 * Interactive zoom (E7-S4): the toolbar's `−` / `%` / `+` stepper and the
 * `Fit width ▾` dropdown drive the zoom. This story starts at an explicit 75% so
 * the readout and dropdown show a concrete level; switch to `Fit width` / `Fit
 * page` to see the report re-fit to the container.
 */
export const Zoom: Story = {
  args: {
    template: invoice.template,
    data: invoice.data,
    config: { initialZoom: 0.75, pageMode: 'continuous' },
  },
};

/**
 * Configured toolbar (E8-S1): `config.toolbar` shows/hides each control. Here the
 * Print, Export and Watermark action buttons are hidden, leaving only the title,
 * page navigation and zoom — a hidden control is absent from the DOM, not just
 * visually hidden.
 */
export const ConfiguredToolbar: Story = {
  args: {
    template: invoice.template,
    data: invoice.data,
    config: {
      initialZoom: 'fit-width',
      pageMode: 'continuous',
      toolbar: { print: false, export: false, watermark: false },
    },
  },
};

/**
 * Custom toolbar action (E8-S1): a host projects its own button into the toolbar
 * through the `[rdr-toolbar-actions]` content slot, sitting alongside the
 * built-in actions.
 */
export const CustomToolbarAction: Story = {
  render: (args) => ({
    props: args,
    template: `
      <rdr-report-viewer
        [template]="template"
        [data]="data"
        [config]="config"
        style="display:block;height:600px"
      >
        <button rdr-toolbar-actions class="rdr-viewer-nav-btn" aria-label="Refresh">⟳</button>
      </rdr-report-viewer>
    `,
  }),
  args: {
    template: invoice.template,
    data: invoice.data,
    config: { initialZoom: 'fit-width', pageMode: 'continuous' },
  },
};

/**
 * Empty state (E7-S5): no template supplied — the viewer shows the calm
 * "No data to display" placeholder instead of a blank area.
 */
export const Empty: Story = {
  args: { template: null },
};

/**
 * Empty state (E7-S5) from missing *data*: a valid template with `null` data
 * settles to the same "No data to display" placeholder — the host simply hasn't
 * provided a data JSON yet (no error is emitted).
 */
export const NoData: Story = {
  args: { template: invoice.template, data: null },
};

/**
 * Error state (E7-S5): a schema-invalid template is *surfaced*, never thrown —
 * the viewer shows the danger icon, the reason, and a **View details**
 * disclosure for the structured validator problems, and emits `(error)`.
 */
export const Error: Story = {
  args: {
    template: { schemaVersion: '1.0.0' } as unknown as (typeof invoice)['template'],
    data: invoice.data,
  },
};
