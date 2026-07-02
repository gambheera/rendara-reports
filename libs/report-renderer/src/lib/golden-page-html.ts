/**
 * Golden render-fixture composition (E4-S1, content in E4-S2) — the single
 * source for the static HTML that the visual-regression harness snapshots.
 *
 * e2e/visual projects may not import workspace libs (Nx module boundaries), so
 * the pages are pre-rendered here — where importing the engine, schema goldens
 * and the renderer's own serializer is legal — into committed HTML artifacts
 * (`tools/generate-render-fixtures.ts`) that the visual specs load via `fs`.
 * {@link golden-page-html.spec.ts} regenerates these strings and fails if a
 * committed artifact drifts, mirroring the golden-JSON drift guard (E1-S8).
 *
 * Not part of the renderer's public API (absent from `index.ts`): a fixture
 * builder for tests/tooling, kept beside the renderer so it shares the exact same
 * view-model and serializer the component uses.
 *
 * Fixtures:
 *  - **certificate** — the document-first golden (text + shapes + images), with
 *    its data bindings resolved so the snapshot shows real content.
 *  - **element-types** — a compact per-type page (text, line, rect, ellipse,
 *    image) satisfying the E4-S2 QA "per-type visual snapshots", using an inline
 *    data-URI image so it renders deterministically without the network.
 *  - **plain-table** / **grouped-table** (E4-S3) — compact data-table pages
 *    satisfying that story's QA ("visual snapshots for plain + grouped tables").
 *    The fixture generator can't evaluate JSONata (see the certificate note
 *    below), so each table's **resolved** cells/aggregates are supplied as
 *    constants and fed through the real {@link paginate}, so the slicing geometry
 *    the renderer paints is genuine while the content stays deterministic.
 *  - **multi-page-document** (E4-S4) — a whole {@link PaginatedDocument} (a table
 *    long enough to span several pages) serialized through
 *    {@link serializeDocumentToHtml} at a reduced zoom, satisfying that story's QA
 *    ("multi-page golden renders correct page count; zoom levels visually
 *    snapshotted"). Rows are pre-resolved constants fed through the real
 *    paginator, so the page count + slicing are genuine and deterministic.
 *  - **watermark** (E4-S7) — the plain-table page paginated *with* a `CONFIDENTIAL`
 *    text watermark (the engine echoes the render-time config onto the document),
 *    so the centred, rotated overlay is painted behind real content. Satisfies the
 *    story's QA ("visual snapshot with watermark"); the same fixture drives the
 *    print-mode snapshot under `emulateMedia({ media: 'print' })`.
 *  - **print stylesheet** (E4-S8) — not a page but the renderer's `@media print`
 *    rules ({@link renderPrintStylesheetCss}), emitted as `renderer-print.css` so
 *    the harness applies the genuine print stylesheet to *every* golden's
 *    print-mode snapshot. Completes the screen + print baseline (Epic 4 capstone).
 */

import { goldenCertificateTemplate, type RendaraTemplate } from '@rendara/report-schema';
import {
  paginate,
  type ResolvedAggregate,
  type ResolvedDataTable,
  type ResolvedGroup,
  type ResolvedRow,
  type Watermark,
} from '@rendara/report-engine';

import { buildDocumentViewModel } from './document-view-model';
import { buildPageViewModel } from './page-view-model';
import { RENDERER_PRINT_CSS, RENDERER_SURFACE_CSS } from './renderer-styles';
import { serializeDocumentToHtml, serializePageToHtml } from './serialize-page-html';

/** Zoom that fits the A4-landscape certificate sheet within the harness viewport. */
export const CERTIFICATE_FIXTURE_ZOOM = 0.55;

/** Zoom for the compact per-type page (A4 portrait), sized to the harness viewport. */
export const ELEMENT_TYPES_FIXTURE_ZOOM = 0.75;

/**
 * The certificate golden's data-bound text, as the engine's `resolveElement`
 * resolves it over `goldenCertificateData` (recipient/course/issuer/signatory as
 * strings, the completion date via `date:long` in the default en-US/UTC locale).
 *
 * These are supplied as constants rather than computed here on purpose: the
 * fixture generator runs under the node/swc runtime where JSONata's import is
 * broken, so resolving in the generator would silently blank every binding. The
 * real `resolveElement` path is exercised by the renderer's unit/component specs
 * (which run under vitest, where JSONata works) — see `page-view-model.spec.ts`.
 */
const CERTIFICATE_RESOLVED_VALUES: ReadonlyMap<string, string> = new Map([
  ['el_cert_recipient', 'Jane A. Smith'],
  ['el_cert_course', 'Advanced Report Design'],
  ['el_cert_date', 'June 17, 2026'],
  ['el_cert_signatory', 'Dr. A. Turing, Director'],
  ['el_cert_seal_label', 'Rendara Academy'],
]);

/**
 * Renders the certificate golden's first page to the static
 * `<div class="rdr-page">…</div>` HTML snapshotted by the visual harness, with
 * its data-bound text filled from {@link CERTIFICATE_RESOLVED_VALUES}.
 * Deterministic.
 */
export function renderCertificatePageHtml(): string {
  const doc = paginate(goldenCertificateTemplate, new Map());
  const vm = buildPageViewModel(doc.pages[0], doc.geometry, {
    zoom: CERTIFICATE_FIXTURE_ZOOM,
    template: goldenCertificateTemplate,
    resolvedValues: CERTIFICATE_RESOLVED_VALUES,
  });
  return serializePageToHtml(vm);
}

/**
 * Renders the compact per-type page (one of each fixed element type) to its
 * static HTML. Fully static content, so synchronous and deterministic.
 */
export function renderElementTypesPageHtml(): string {
  const doc = paginate(elementTypesTemplate, new Map());
  const vm = buildPageViewModel(doc.pages[0], doc.geometry, {
    zoom: ELEMENT_TYPES_FIXTURE_ZOOM,
    template: elementTypesTemplate,
  });
  return serializePageToHtml(vm);
}

/**
 * A tiny opaque 2×1 PNG (one indigo, one slate pixel) as a data URI, so the
 * per-type fixture's image renders crisply and deterministically with no network.
 */
const SAMPLE_IMAGE_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAFklEQVR4nGNUbpL5z4AEmBhwAEIyAGOcAhpfRrShAAAAAElFTkSuQmCC';

/**
 * A compact A4-portrait page with exactly one of each fixed element type, in a
 * neat vertical stack, exercising the E4-S2 renderers: a styled text block, a
 * horizontal rule (line), a filled+stroked rectangle, a filled+stroked ellipse,
 * and a (data-URI) image. All content is static, so no data is needed.
 */
const elementTypesTemplate: RendaraTemplate = {
  schemaVersion: '1.0.0',
  metadata: {
    name: 'Element Types',
    id: 'fixture-element-types-0001',
    createdAt: '2026-06-17T00:00:00.000Z',
    locale: 'en-US',
  },
  page: {
    size: 'A4',
    orientation: 'portrait',
    marginsMm: { top: 20, right: 15, bottom: 20, left: 15 },
    units: 'mm',
    defaultFont: { family: 'Inter', sizePt: 12 },
    background: null,
  },
  header: { elements: [] },
  body: {
    elements: [
      {
        id: 'el_et_text',
        type: 'text',
        frame: { xMm: 15, yMm: 20, wMm: 180, hMm: 16 },
        text: 'Element renderers — text, shapes, image',
        style: {
          font: { family: 'Inter', sizePt: 18, weight: 'bold', style: 'normal' },
          color: '#4F46E5',
          align: { horizontal: 'center', vertical: 'middle' },
        },
        z: 1,
      },
      {
        id: 'el_et_line',
        type: 'shape',
        shape: 'line',
        frame: { xMm: 15, yMm: 42, wMm: 180, hMm: 0 },
        style: { stroke: { color: '#94A3B8', widthMm: 0.4, style: 'solid' } },
        z: 1,
      },
      {
        id: 'el_et_rect',
        type: 'shape',
        shape: 'rect',
        frame: { xMm: 15, yMm: 50, wMm: 80, hMm: 40 },
        style: {
          fill: '#EEF2FF',
          stroke: { color: '#4F46E5', widthMm: 0.6, style: 'solid' },
        },
        z: 1,
      },
      {
        id: 'el_et_ellipse',
        type: 'shape',
        shape: 'ellipse',
        frame: { xMm: 115, yMm: 50, wMm: 80, hMm: 40 },
        style: {
          fill: '#FEF3C7',
          stroke: { color: '#B45309', widthMm: 0.8, style: 'dashed' },
        },
        z: 1,
      },
      {
        id: 'el_et_image',
        type: 'image',
        frame: { xMm: 15, yMm: 100, wMm: 60, hMm: 30 },
        src: SAMPLE_IMAGE_DATA_URI,
        fit: 'fill',
        z: 1,
      },
    ],
  },
  footer: { elements: [] },
};

// ---------------------------------------------------------------------------
// Table fixtures (E4-S3): plain + grouped data tables.
//
// `paginate` needs an already-resolved table (resolution is async JSONata, which
// the generator runtime can't run — see the certificate note above), so the
// resolved cells/aggregates are hand-authored here as small constants and fed
// through the real engine. The geometry (row heights, slicing) is therefore the
// engine's; only the cell *text* is pinned.
// ---------------------------------------------------------------------------

/** Zoom for the plain-table page (A4 portrait), sized to the harness viewport. */
export const PLAIN_TABLE_FIXTURE_ZOOM = 0.75;

/** Zoom for the grouped-table page (A4 landscape), sized to the harness viewport. */
export const GROUPED_TABLE_FIXTURE_ZOOM = 0.6;

/** Builds a resolved aggregate (column footer / group subtotal) from a display string. */
function resolvedAggregate(columnKey: string, formatted: string): ResolvedAggregate {
  return { columnKey, value: { raw: formatted, formatted } };
}

/** Builds one resolved detail row from its column keys and per-column display strings. */
function resolvedRow(
  index: number,
  columnKeys: readonly string[],
  texts: readonly string[],
): ResolvedRow {
  return {
    index,
    data: {},
    cells: columnKeys.map((key, i) => ({
      columnKey: key,
      value: { raw: texts[i], formatted: texts[i] },
    })),
  };
}

/** Renders the plain-table fixture page to its static HTML. Deterministic. */
export function renderPlainTablePageHtml(): string {
  const doc = paginate(plainTableTemplate, new Map([[PLAIN_TABLE_ID, PLAIN_TABLE_RESOLVED]]));
  const vm = buildPageViewModel(doc.pages[0], doc.geometry, {
    zoom: PLAIN_TABLE_FIXTURE_ZOOM,
    template: plainTableTemplate,
  });
  return serializePageToHtml(vm);
}

/** Renders the grouped-table fixture page to its static HTML. Deterministic. */
export function renderGroupedTablePageHtml(): string {
  const doc = paginate(groupedTableTemplate, new Map([[GROUPED_TABLE_ID, GROUPED_TABLE_RESOLVED]]));
  const vm = buildPageViewModel(doc.pages[0], doc.geometry, {
    zoom: GROUPED_TABLE_FIXTURE_ZOOM,
    template: groupedTableTemplate,
  });
  return serializePageToHtml(vm);
}

const PLAIN_TABLE_ID = 'el_plain_table';
const PLAIN_TABLE_COLUMNS = ['item', 'qty', 'price', 'amount'] as const;

/**
 * A compact A4-portrait page with a single ungrouped data table: a header row,
 * three detail rows (right-aligned numeric columns), and a grand-total column
 * footer — exercising the E4-S3 header / detail / column-footer rendering.
 */
const plainTableTemplate: RendaraTemplate = {
  schemaVersion: '1.0.0',
  metadata: {
    name: 'Plain Table',
    id: 'fixture-plain-table-0001',
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
        id: 'el_plain_title',
        type: 'text',
        frame: { xMm: 15, yMm: 18, wMm: 180, hMm: 10 },
        text: 'Line Items',
        style: {
          font: { family: 'Inter', sizePt: 18, weight: 'bold', style: 'normal' },
          color: '#4F46E5',
          align: { horizontal: 'left', vertical: 'middle' },
        },
        z: 1,
      },
      {
        id: PLAIN_TABLE_ID,
        type: 'dataTable',
        frame: { xMm: 15, yMm: 34, wMm: 180, hMm: null },
        source: { arrayExpr: 'items' },
        columns: [
          { key: 'item', header: 'Item', cell: { expr: '$.item' }, widthMm: 95 },
          {
            key: 'qty',
            header: 'Qty',
            cell: { expr: '$.qty', format: 'number:0' },
            widthMm: 25,
            align: 'right',
          },
          {
            key: 'price',
            header: 'Unit Price',
            cell: { expr: '$.price', format: 'currency:USD' },
            widthMm: 30,
            align: 'right',
          },
          {
            key: 'amount',
            header: 'Amount',
            cell: { expr: '$.amount', format: 'currency:USD' },
            footer: { expr: '$sum(items.amount)', format: 'currency:USD' },
            widthMm: 30,
            align: 'right',
          },
        ],
        repeatHeaderOnEachPage: true,
        keepTogether: false,
        z: 1,
      },
    ],
  },
  footer: { elements: [] },
};

/** Pre-resolved cells/total for {@link plainTableTemplate} (no JSONata at generate time). */
const PLAIN_TABLE_RESOLVED: ResolvedDataTable = {
  rows: [
    resolvedRow(0, PLAIN_TABLE_COLUMNS, ['Aurora Desk Lamp', '12', '$45.00', '$540.00']),
    resolvedRow(1, PLAIN_TABLE_COLUMNS, ['Borealis Floor Lamp', '6', '$110.00', '$660.00']),
    resolvedRow(2, PLAIN_TABLE_COLUMNS, ['Cedar Side Table', '3', '$130.00', '$390.00']),
  ],
  columnFooters: [resolvedAggregate('amount', '$1,590.00')],
  errors: [],
  diagnostics: [],
};

const GROUPED_TABLE_ID = 'el_grouped_table';
const GROUPED_TABLE_COLUMNS = ['product', 'category', 'units', 'revenue'] as const;

/**
 * A compact A4-landscape page with a grouped data table: two region groups, each
 * with a full-width header label, two detail rows, and a subtotal footer band,
 * plus a grand-total column footer — exercising the E4-S3 group header/footer,
 * aggregate and band-label rendering.
 */
const groupedTableTemplate: RendaraTemplate = {
  schemaVersion: '1.0.0',
  metadata: {
    name: 'Grouped Table',
    id: 'fixture-grouped-table-0001',
    createdAt: '2026-06-17T00:00:00.000Z',
    locale: 'en-US',
  },
  page: {
    size: 'A4',
    orientation: 'landscape',
    marginsMm: { top: 20, right: 15, bottom: 20, left: 15 },
    units: 'mm',
    defaultFont: { family: 'Inter', sizePt: 10 },
    background: null,
  },
  header: { elements: [] },
  body: {
    elements: [
      {
        id: 'el_grouped_title',
        type: 'text',
        frame: { xMm: 15, yMm: 18, wMm: 267, hMm: 10 },
        text: 'Regional Sales',
        style: {
          font: { family: 'Inter', sizePt: 18, weight: 'bold', style: 'normal' },
          color: '#4F46E5',
          align: { horizontal: 'left', vertical: 'middle' },
        },
        z: 1,
      },
      {
        id: GROUPED_TABLE_ID,
        type: 'dataTable',
        frame: { xMm: 15, yMm: 34, wMm: 267, hMm: null },
        source: { arrayExpr: 'rows' },
        columns: [
          { key: 'product', header: 'Product', cell: { expr: '$.product' }, widthMm: 110 },
          { key: 'category', header: 'Category', cell: { expr: '$.category' }, widthMm: 67 },
          {
            key: 'units',
            header: 'Units',
            cell: { expr: '$.units', format: 'number:0' },
            footer: { expr: '$sum(rows.units)', format: 'number:0' },
            widthMm: 35,
            align: 'right',
          },
          {
            key: 'revenue',
            header: 'Revenue',
            cell: { expr: '$.revenue', format: 'currency:USD' },
            footer: { expr: '$sum(rows.revenue)', format: 'currency:USD' },
            widthMm: 55,
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
  footer: { elements: [] },
};

/** Builds one resolved group (header label + detail rows + subtotal footer band). */
function resolvedGroup(
  region: string,
  startIndex: number,
  rows: readonly (readonly string[])[],
  unitsSubtotal: string,
  revenueSubtotal: string,
): ResolvedGroup {
  return {
    key: region,
    keyValue: region,
    rows: rows.map((texts, i) => resolvedRow(startIndex + i, GROUPED_TABLE_COLUMNS, texts)),
    header: { label: { raw: `Region: ${region}`, formatted: `Region: ${region}` }, aggregates: [] },
    footer: {
      aggregates: [
        resolvedAggregate('units', unitsSubtotal),
        resolvedAggregate('revenue', revenueSubtotal),
      ],
    },
  };
}

const GROUPED_NORTH = resolvedGroup(
  'North',
  0,
  [
    ['Aurora Desk Lamp', 'Lighting', '120', '$5,400.00'],
    ['Cedar Side Table', 'Furniture', '38', '$4,940.00'],
  ],
  '158',
  '$10,340.00',
);

const GROUPED_SOUTH = resolvedGroup(
  'South',
  2,
  [
    ['Ember Pendant', 'Lighting', '95', '$7,125.00'],
    ['Fjord Bookshelf', 'Furniture', '30', '$6,300.00'],
  ],
  '125',
  '$13,425.00',
);

/** Pre-resolved groups/total for {@link groupedTableTemplate} (no JSONata at generate time). */
const GROUPED_TABLE_RESOLVED: ResolvedDataTable = {
  rows: [...GROUPED_NORTH.rows, ...GROUPED_SOUTH.rows],
  groups: [GROUPED_NORTH, GROUPED_SOUTH],
  columnFooters: [resolvedAggregate('units', '283'), resolvedAggregate('revenue', '$23,765.00')],
  errors: [],
  diagnostics: [],
};

// ---------------------------------------------------------------------------
// Multi-page document fixture (E4-S4): a single long table paginated into
// several pages, serialized as a whole document at a reduced zoom so the
// snapshot shows multiple stacked pages (multi-page + zoom in one artifact).
// Rows are generated deterministically (plain JS, no JSONata) and fed through
// the real paginator, so the page count and slice geometry are genuine.
// ---------------------------------------------------------------------------

/** Zoom for the multi-page document fixture, small enough to show several pages. */
export const MULTI_PAGE_FIXTURE_ZOOM = 0.4;

const MULTI_PAGE_TABLE_ID = 'el_multipage_table';
const MULTI_PAGE_COLUMNS = ['ref', 'description', 'qty', 'amount'] as const;
/** Detail-row count chosen to overflow a single A4-portrait page. */
const MULTI_PAGE_ROW_COUNT = 60;

/** Renders the multi-page document fixture to its static HTML. Deterministic. */
export function renderMultiPageDocumentHtml(): string {
  const doc = paginate(
    multiPageTableTemplate,
    new Map([[MULTI_PAGE_TABLE_ID, MULTI_PAGE_RESOLVED]]),
  );
  const vm = buildDocumentViewModel(doc, {
    zoom: MULTI_PAGE_FIXTURE_ZOOM,
    template: multiPageTableTemplate,
  });
  return serializeDocumentToHtml(vm);
}

/**
 * A compact A4-portrait page with one long data table that spans several pages:
 * a header, {@link MULTI_PAGE_ROW_COUNT} detail rows (repeated header per page),
 * and a grand-total column footer.
 */
const multiPageTableTemplate: RendaraTemplate = {
  schemaVersion: '1.0.0',
  metadata: {
    name: 'Multi-page Document',
    id: 'fixture-multi-page-0001',
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
        id: 'el_multipage_title',
        type: 'text',
        frame: { xMm: 15, yMm: 18, wMm: 180, hMm: 10 },
        text: 'Transaction Ledger',
        style: {
          font: { family: 'Inter', sizePt: 18, weight: 'bold', style: 'normal' },
          color: '#4F46E5',
          align: { horizontal: 'left', vertical: 'middle' },
        },
        z: 1,
      },
      {
        id: MULTI_PAGE_TABLE_ID,
        type: 'dataTable',
        frame: { xMm: 15, yMm: 34, wMm: 180, hMm: null },
        source: { arrayExpr: 'entries' },
        columns: [
          { key: 'ref', header: 'Ref', cell: { expr: '$.ref' }, widthMm: 35 },
          {
            key: 'description',
            header: 'Description',
            cell: { expr: '$.description' },
            widthMm: 95,
          },
          {
            key: 'qty',
            header: 'Qty',
            cell: { expr: '$.qty', format: 'number:0' },
            widthMm: 20,
            align: 'right',
          },
          {
            key: 'amount',
            header: 'Amount',
            cell: { expr: '$.amount', format: 'currency:USD' },
            footer: { expr: '$sum(entries.amount)', format: 'currency:USD' },
            widthMm: 30,
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
        id: 'el_multipage_page',
        type: 'text',
        frame: { xMm: 15, yMm: 282, wMm: 180, hMm: 6 },
        text: 'Page {{pageNumber}} of {{pageCount}}',
        style: {
          font: { family: 'Inter', sizePt: 9, style: 'normal' },
          color: '#64748B',
          align: { horizontal: 'right', vertical: 'middle' },
        },
        z: 1,
      },
    ],
  },
};

/** Builds the {@link MULTI_PAGE_ROW_COUNT} pre-resolved detail rows (deterministic). */
function multiPageRows(): readonly ResolvedRow[] {
  return Array.from({ length: MULTI_PAGE_ROW_COUNT }, (_, i) => {
    const qty = (i % 7) + 1;
    const amount = qty * 25;
    return resolvedRow(i, MULTI_PAGE_COLUMNS, [
      `TX-${String(1001 + i)}`,
      `Ledger entry ${i + 1}`,
      String(qty),
      `$${amount.toFixed(2)}`,
    ]);
  });
}

/** Grand total of the generated amounts ($25 × the qty cycle 1..7 over 60 rows = $5,850). */
const MULTI_PAGE_TOTAL = '$5,850.00';

/** Pre-resolved rows/total for {@link multiPageTableTemplate} (no JSONata at generate time). */
const MULTI_PAGE_RESOLVED: ResolvedDataTable = {
  rows: multiPageRows(),
  columnFooters: [resolvedAggregate('amount', MULTI_PAGE_TOTAL)],
  errors: [],
  diagnostics: [],
};

// ---------------------------------------------------------------------------
// Watermark fixture (E4-S7): the plain-table page paginated with a CONFIDENTIAL
// text watermark. The watermark is a render-time concern (brief §8 / ADR 0007),
// so it arrives via `paginate`'s options and is echoed onto the document, then
// forwarded into the page view-model — exactly the path the viewer drives. The
// same artifact backs both the screen and the print-mode visual snapshots.
// ---------------------------------------------------------------------------

/** Zoom for the watermark fixture page (A4 portrait), sized to the harness viewport. */
export const WATERMARK_FIXTURE_ZOOM = 0.75;

/** The diagonal `CONFIDENTIAL` text watermark stamped on the fixture (mockup defaults). */
const WATERMARK_FIXTURE: Watermark = {
  type: 'text',
  text: 'CONFIDENTIAL',
  opacity: 0.15,
  angleDeg: -45,
  color: '#9CA3AF',
};

/** Renders the watermarked plain-table fixture page to its static HTML. Deterministic. */
export function renderWatermarkPageHtml(): string {
  const doc = paginate(plainTableTemplate, new Map([[PLAIN_TABLE_ID, PLAIN_TABLE_RESOLVED]]), {
    watermark: WATERMARK_FIXTURE,
  });
  const vm = buildPageViewModel(doc.pages[0], doc.geometry, {
    zoom: WATERMARK_FIXTURE_ZOOM,
    template: plainTableTemplate,
    watermark: doc.watermark,
  });
  return serializePageToHtml(vm);
}

// ---------------------------------------------------------------------------
// Search-highlight fixture (E8-S6): the plain-table page rendered with an active
// in-report search query, so the serializer wraps matching runs in
// `<mark class="rdr-mark">` exactly as the viewer's Find feature paints them. The
// first mark is promoted to the active style (`rdr-mark--active`) to capture both
// the match and the current-match treatment in one snapshot. The query matches the
// "Lamp" products in the table, demonstrating highlights inside data-table cells.
// ---------------------------------------------------------------------------

/** Zoom for the search-highlight fixture page (A4 portrait), sized to the harness viewport. */
export const SEARCH_HIGHLIGHT_FIXTURE_ZOOM = 0.75;

/** The in-report search query stamped on the search-highlight fixture. */
const SEARCH_HIGHLIGHT_QUERY = 'Lamp';

/**
 * Renders the plain-table fixture page with the {@link SEARCH_HIGHLIGHT_QUERY}
 * highlight active, then promotes the first match to the active style — the same
 * `<mark>` markup the viewer paints. Deterministic.
 */
export function renderSearchHighlightPageHtml(): string {
  const doc = paginate(plainTableTemplate, new Map([[PLAIN_TABLE_ID, PLAIN_TABLE_RESOLVED]]));
  const vm = buildPageViewModel(doc.pages[0], doc.geometry, {
    zoom: SEARCH_HIGHLIGHT_FIXTURE_ZOOM,
    template: plainTableTemplate,
    highlightQuery: SEARCH_HIGHLIGHT_QUERY,
  });
  const html = serializePageToHtml(vm);
  // The viewer toggles `rdr-mark--active` on the current match via the live DOM;
  // mirror that on the first mark so the snapshot shows the active treatment too.
  return html.replace('<mark class="rdr-mark">', '<mark class="rdr-mark rdr-mark--active">');
}

// ---------------------------------------------------------------------------
// RTL fixture (E10-S2): an Arabic-locale invoice-style table rendered with
// `direction: 'rtl'`, so the visual harness snapshots a real right-to-left page.
// The *layout* is what RTL exercises — the un-aligned heading right-aligns and the
// data-table columns mirror across the table width — so the content stays Latin
// and renders crisply under the harness's Latin fixture font (Arabic glyphs would
// be missing-glyph boxes and non-deterministic). The direction is passed
// explicitly here (the viewer/designer derive it from the locale); `metadata.locale`
// is `ar-EG` to document the intent. Rows are pre-resolved constants fed through
// the real paginator, so the geometry is genuine and deterministic.
// ---------------------------------------------------------------------------

/** Zoom for the RTL table fixture page (A4 portrait), sized to the harness viewport. */
export const RTL_TABLE_FIXTURE_ZOOM = 0.75;

const RTL_TABLE_ID = 'el_rtl_table';
const RTL_TABLE_COLUMNS = ['item', 'qty', 'price', 'amount'] as const;

/**
 * A compact A4-portrait page with an un-aligned heading and a single data table,
 * authored for RTL rendering (locale `ar-EG`). Mirrors the plain-table golden's
 * columns so the RTL snapshot reads against a familiar layout.
 */
const rtlTableTemplate: RendaraTemplate = {
  schemaVersion: '1.0.0',
  metadata: {
    name: 'RTL Invoice',
    id: 'fixture-rtl-table-0001',
    createdAt: '2026-06-17T00:00:00.000Z',
    locale: 'ar-EG',
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
        // No authored horizontal alignment, so it right-aligns under RTL.
        id: 'el_rtl_title',
        type: 'text',
        frame: { xMm: 15, yMm: 18, wMm: 180, hMm: 10 },
        text: 'Invoice — Acme Corp',
        style: {
          font: { family: 'Inter', sizePt: 18, weight: 'bold', style: 'normal' },
          color: '#4F46E5',
        },
        z: 1,
      },
      {
        id: RTL_TABLE_ID,
        type: 'dataTable',
        frame: { xMm: 15, yMm: 34, wMm: 180, hMm: null },
        source: { arrayExpr: 'items' },
        columns: [
          { key: 'item', header: 'Item', cell: { expr: '$.item' }, widthMm: 95 },
          {
            key: 'qty',
            header: 'Qty',
            cell: { expr: '$.qty', format: 'number:0' },
            widthMm: 25,
            align: 'right',
          },
          {
            key: 'price',
            header: 'Unit Price',
            cell: { expr: '$.price', format: 'currency:USD' },
            widthMm: 30,
            align: 'right',
          },
          {
            key: 'amount',
            header: 'Amount',
            cell: { expr: '$.amount', format: 'currency:USD' },
            footer: { expr: '$sum(items.amount)', format: 'currency:USD' },
            widthMm: 30,
            align: 'right',
          },
        ],
        repeatHeaderOnEachPage: true,
        keepTogether: false,
        z: 1,
      },
    ],
  },
  footer: { elements: [] },
};

/** Pre-resolved cells/total for {@link rtlTableTemplate} (no JSONata at generate time). */
const RTL_TABLE_RESOLVED: ResolvedDataTable = {
  rows: [
    resolvedRow(0, RTL_TABLE_COLUMNS, ['Aurora Desk Lamp', '12', '$45.00', '$540.00']),
    resolvedRow(1, RTL_TABLE_COLUMNS, ['Borealis Floor Lamp', '6', '$110.00', '$660.00']),
    resolvedRow(2, RTL_TABLE_COLUMNS, ['Cedar Side Table', '3', '$130.00', '$390.00']),
  ],
  columnFooters: [resolvedAggregate('amount', '$1,590.00')],
  errors: [],
  diagnostics: [],
};

/**
 * Renders the RTL table fixture page to its static HTML, built with
 * `direction: 'rtl'` so the sheet carries `dir="rtl"`, the heading right-aligns and
 * the table columns mirror. Deterministic.
 */
export function renderRtlTablePageHtml(): string {
  const doc = paginate(rtlTableTemplate, new Map([[RTL_TABLE_ID, RTL_TABLE_RESOLVED]]));
  const vm = buildPageViewModel(doc.pages[0], doc.geometry, {
    zoom: RTL_TABLE_FIXTURE_ZOOM,
    template: rtlTableTemplate,
    direction: 'rtl',
  });
  return serializePageToHtml(vm);
}

// ---------------------------------------------------------------------------
// Style-isolation fixture (E4-S5): the exact content of an isolated render root —
// the shared reset/theme/chrome stylesheet plus a serialized report page. The
// e2e attaches a shadow root to a host element (under hostile global CSS) and
// drops this content in, so it exercises the *same* isolation rules the
// `ReportSurface` shadow root carries, without standing up Angular in Playwright.
// The page is the plain-table golden (a reset-sensitive text run + a tokenised
// table fill), serialized at zoom 1 so computed styles are easy to assert.
// ---------------------------------------------------------------------------

/**
 * Renders the inner HTML of an isolated render root: a `<style>` carrying the
 * shared {@link RENDERER_SURFACE_CSS} (reset + theme tokens + chrome) followed by
 * the plain-table golden page. Deterministic. Committed as
 * `__fixtures__/style-isolation.html` and consumed by the style-isolation e2e.
 */
export function renderStyleIsolationContent(): string {
  const doc = paginate(plainTableTemplate, new Map([[PLAIN_TABLE_ID, PLAIN_TABLE_RESOLVED]]));
  const vm = buildPageViewModel(doc.pages[0], doc.geometry, { template: plainTableTemplate });
  return `<style>${RENDERER_SURFACE_CSS}</style>${serializePageToHtml(vm)}`;
}

// ---------------------------------------------------------------------------
// Print stylesheet artifact (E4-S8): the renderer's `@media print` rules, exported
// as a standalone CSS artifact so the visual harness can apply the *genuine* print
// stylesheet to its golden pages under `emulateMedia({ media: 'print' })` (e2e
// projects may not import workspace libs — Nx module boundaries — so the harness
// reads the committed `__fixtures__/renderer-print.css` instead). The shared
// fixture-page helper appends it after the unchanged on-screen chrome, so the
// screen snapshots are byte-stable while the `*-print.png` snapshots exercise the
// real print stylesheet. `golden-page-html.spec.ts` guards the artifact against
// drift, exactly like the HTML fixtures.
// ---------------------------------------------------------------------------

/** Returns the renderer's print stylesheet ({@link RENDERER_PRINT_CSS}) for the harness artifact. */
export function renderPrintStylesheetCss(): string {
  return RENDERER_PRINT_CSS;
}
