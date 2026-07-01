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
 * (E8-S1): a title, page-navigation and zoom groups, Print / Export / Watermark /
 * Download-source (E8-S5) / Find (E8-S6) / thumbnail-rail toggle (E8-S7) action
 * buttons and a host custom-action slot, each shown/hidden via `config.toolbar`.
 * These stories feed it the canonical invoice
 * golden so the body shows a live, paginated report.
 *
 * **E9-S6** treats this file as the documented **viewer-state gallery** — a live
 * example per state (Default, Themed, Paginated, Zoom, toolbar variants, Export,
 * Watermark, Download-source, Search, thumbnail rail, and the Empty / No-data /
 * Error feedback states) — alongside the generated TypeDoc input/output reference
 * (`pnpm docs:build`) and the README quick-start. `tags: ['autodocs']` renders the
 * component's typed API into Storybook's Docs tab from the same source.
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
 * Export PDF (E8-S3): click **Export PDF** in the toolbar to open the dialog
 * (filename · pages · include watermark) and download a selectable-text, vector
 * PDF generated in the browser. `config.exportFilename` and `config.pdfMetadata`
 * pre-fill the filename and the PDF `/Info`; a host can swap in its own
 * `config.pdfExporter` (e.g. a server-side Puppeteer route).
 */
export const Export: Story = {
  args: {
    template: invoice.template,
    data: paginatedData,
    config: {
      initialZoom: 'fit-width',
      pageMode: 'continuous',
      exportFilename: 'invoice-acme.pdf',
      pdfMetadata: { title: 'Invoice INV-2042', author: 'Acme Corp' },
    },
  },
};

/**
 * Watermark (E8-S4): click **Watermark** in the toolbar to open the dialog
 * (enable · text/image · opacity · angle · color, with a live preview) and stamp
 * a watermark on every page. This story starts with a `config.watermark`
 * pre-applied, so the diagonal "CONFIDENTIAL" overlay shows on load and seeds the
 * dialog; the same watermark is honoured in print and PDF export.
 */
export const Watermark: Story = {
  args: {
    template: invoice.template,
    data: paginatedData,
    config: {
      initialZoom: 'fit-width',
      pageMode: 'continuous',
      watermark: { type: 'text', text: 'CONFIDENTIAL', opacity: 0.15, angleDeg: -45 },
    },
  },
};

/**
 * Download source (E8-S5): click **Download source** in the toolbar to save the
 * report's source — its validated template — as a `.json` file. The filename comes
 * from `config.sourceFilename` (here `acme-invoice-template`), else the document
 * title; re-importing the file yields an equivalent template (schema round-trip).
 */
export const DownloadSource: Story = {
  args: {
    template: invoice.template,
    data: invoice.data,
    config: {
      initialZoom: 'fit-width',
      pageMode: 'continuous',
      sourceFilename: 'acme-invoice-template',
    },
  },
};

/**
 * In-report search (E8-S6): click the **Find in report** (magnifier) toolbar
 * action to open a compact Find bar, then type a query. Matching runs are
 * highlighted across every page, the count reads `N / total`, and the prev/next
 * buttons (or Enter / Shift+Enter) step the active match into view. Search is a
 * screen-only aid — it never changes Print or PDF output. Hide it with
 * `config.toolbar.search: false`.
 */
export const Search: Story = {
  args: {
    template: invoice.template,
    data: invoice.data,
    config: { initialZoom: 'fit-width', pageMode: 'continuous' },
  },
};

/**
 * Optional thumbnail rail (E8-S7): the left page rail is now optional. The
 * **Toggle page thumbnails** toolbar button shows/hides it at runtime (a hidden
 * rail leaves the DOM), and its initial visibility is `config.thumbnails`. Here it
 * starts hidden, giving the report the full width; click the toggle to reveal it.
 * Hide the toggle button itself with `config.toolbar.thumbnails: false`.
 */
export const NoThumbnailRail: Story = {
  args: {
    template: invoice.template,
    data: invoice.data,
    config: { initialZoom: 'fit-width', pageMode: 'continuous', thumbnails: false },
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
