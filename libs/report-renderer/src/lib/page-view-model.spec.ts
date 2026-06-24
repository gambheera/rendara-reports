import { describe, expect, it } from 'vitest';
import {
  goldenCertificateData,
  goldenCertificateTemplate,
  goldenInvoiceData,
  goldenInvoiceTemplate,
  goldenTabularReportData,
  goldenTabularReportTemplate,
  type RendaraTemplate,
} from '@rendara/report-schema';
import {
  DEFAULT_DPI,
  mmToPx,
  paginate,
  ptToPx,
  resolveElement,
  type PaginatedDocument,
  type ResolvedDataTable,
  type Watermark,
} from '@rendara/report-engine';
import { resolveDataTable } from '@rendara/report-engine';
import { isDataTableElement } from '@rendara/report-schema';

import {
  boxDecorationStyle,
  buildPageViewModel,
  buildWatermarkView,
  DEFAULT_PAGE_BACKGROUND,
  designAnchorAttrs,
  elementStyle,
  printableStyle,
  sanitizeImageUrl,
  sheetStyle,
  type ElementBoxView,
  type ImageContentView,
  type PageViewModel,
  type ShapeContentView,
  type TableView,
  type TextContentView,
} from './page-view-model';

/** Finds a box by id, throwing (not returning undefined) when absent. */
function boxById(vm: PageViewModel, id: string): ElementBoxView {
  const found = vm.elements.find((e) => e.id === id);
  if (!found) throw new Error(`expected an element box with id "${id}"`);
  return found;
}

/**
 * Pure view-model tests (E4-S1). These are the authoritative position-correctness
 * gate: they pin sheet/printable px (units→px), background resolution, zoom
 * pass-through, element box positions, and paint order against the engine's own
 * `mmToPx` so no brittle literals creep in.
 */

/** Certificate has no data table, so an empty resolved-tables map paginates it. */
function paginateCertificate(): PaginatedDocument {
  return paginate(goldenCertificateTemplate, new Map());
}

async function paginateInvoice(): Promise<PaginatedDocument> {
  const resolved = new Map<string, ResolvedDataTable>();
  for (const element of goldenInvoiceTemplate.body.elements) {
    if (isDataTableElement(element)) {
      resolved.set(element.id, await resolveDataTable(element, {}));
    }
  }
  return paginate(goldenInvoiceTemplate, resolved);
}

describe('buildPageViewModel (E4-S1)', () => {
  it('sizes the sheet to the A4-landscape page in px (units→px)', () => {
    const doc = paginateCertificate();
    const vm = buildPageViewModel(doc.pages[0], doc.geometry);

    // Certificate is A4 landscape: 297 × 210 mm.
    expect(vm.sheet.widthPx).toBe(mmToPx(297));
    expect(vm.sheet.heightPx).toBe(mmToPx(210));
  });

  it('insets the printable area by the page margins', () => {
    const doc = paginateCertificate();
    const vm = buildPageViewModel(doc.pages[0], doc.geometry);

    // margins: top 20, right 15, bottom 20, left 15.
    expect(vm.printable.leftPx).toBe(mmToPx(15));
    expect(vm.printable.topPx).toBe(mmToPx(20));
    expect(vm.printable.widthPx).toBe(mmToPx(297 - 15 - 15));
    expect(vm.printable.heightPx).toBe(mmToPx(210 - 20 - 20));
  });

  it('defaults the background to white when none is supplied', () => {
    const doc = paginateCertificate();
    expect(buildPageViewModel(doc.pages[0], doc.geometry).background).toBe(DEFAULT_PAGE_BACKGROUND);
  });

  it('uses a supplied background colour, ignoring empty strings', () => {
    const doc = paginateCertificate();
    expect(
      buildPageViewModel(doc.pages[0], doc.geometry, { background: '#102030' }).background,
    ).toBe('#102030');
    expect(buildPageViewModel(doc.pages[0], doc.geometry, { background: '' }).background).toBe(
      DEFAULT_PAGE_BACKGROUND,
    );
    expect(buildPageViewModel(doc.pages[0], doc.geometry, { background: null }).background).toBe(
      DEFAULT_PAGE_BACKGROUND,
    );
  });

  it('carries the zoom factor through untouched (default 1)', () => {
    const doc = paginateCertificate();
    expect(buildPageViewModel(doc.pages[0], doc.geometry).zoom).toBe(1);
    expect(buildPageViewModel(doc.pages[0], doc.geometry, { zoom: 1.5 }).zoom).toBe(1.5);
  });

  it('positions every fixed body element as an absolute px box', () => {
    const doc = paginateCertificate();
    const vm = buildPageViewModel(doc.pages[0], doc.geometry);

    // The certificate is purely absolute body content (no header/footer/table).
    expect(vm.elements).toHaveLength(goldenCertificateTemplate.body.elements.length);

    const border = vm.elements.find((e) => e.id === 'el_cert_border');
    expect(border).toMatchObject({
      type: 'shape',
      leftPx: mmToPx(10),
      topPx: mmToPx(10),
      widthPx: mmToPx(277),
      heightPx: mmToPx(190),
      zIndex: 0,
    });

    const title = vm.elements.find((e) => e.id === 'el_cert_title');
    expect(title).toMatchObject({
      type: 'text',
      leftPx: mmToPx(40),
      topPx: mmToPx(44),
      widthPx: mmToPx(217),
      heightPx: mmToPx(16),
      zIndex: 2,
    });
  });

  it('flattens header → body → footer, z-sorted within each band', async () => {
    // The invoice exercises all three bands: a header logo, body content, and a
    // footer page-number text. Cross-band depth is left to CSS z-index (carried
    // as zIndex), so the global list need not be sorted — but each band's slice
    // inherits the engine's z-ascending paint order.
    const doc = await paginateInvoice();
    const page = doc.pages[0];
    const vm = buildPageViewModel(page, doc.geometry);

    const headerIds = page.header.map((e) => e.id);
    const bodyIds = page.elements.map((e) => e.id);
    const footerIds = page.footer.map((e) => e.id);
    expect(vm.elements.map((e) => e.id)).toEqual([...headerIds, ...bodyIds, ...footerIds]);

    expect(headerIds).toContain('el_inv_logo');
    expect(bodyIds).toContain('el_inv_title');
    expect(footerIds).toContain('el_inv_page');

    // zIndex mirrors each source element's z, and the body slice is z-ascending.
    const bodyBoxes = vm.elements.filter((e) => bodyIds.includes(e.id));
    const bodyZs = bodyBoxes.map((e) => e.zIndex);
    expect([...bodyZs]).toEqual([...bodyZs].sort((a, b) => a - b));
  });

  it('passes a null (growing) element height through as null', () => {
    // Synthesise a page whose single element has an unknown height.
    const doc = paginateCertificate();
    const growing = {
      ...doc.pages[0],
      header: [],
      footer: [],
      elements: [
        {
          ...doc.pages[0].elements[0],
          boxPx: { ...doc.pages[0].elements[0].boxPx, hPx: null },
        },
      ],
    };
    const vm = buildPageViewModel(growing, doc.geometry);
    expect(vm.elements[0].heightPx).toBeNull();
  });
});

describe('shared style helpers (E4-S1)', () => {
  it('emits sheet styles with size, background and the zoom transform', () => {
    const doc = paginateCertificate();
    const vm = buildPageViewModel(doc.pages[0], doc.geometry, {
      zoom: 1.25,
      background: '#fafafa',
    });
    const style = sheetStyle(vm);

    expect(style['width']).toBe(`${mmToPx(297)}px`);
    expect(style['height']).toBe(`${mmToPx(210)}px`);
    expect(style['background']).toBe('#fafafa');
    expect(style['transform']).toBe('scale(1.25)');
    expect(style['transform-origin']).toBe('top left');
  });

  it('emits printable-area styles inset by the margins', () => {
    const doc = paginateCertificate();
    const style = printableStyle(buildPageViewModel(doc.pages[0], doc.geometry));

    expect(style['position']).toBe('absolute');
    expect(style['left']).toBe(`${mmToPx(15)}px`);
    expect(style['top']).toBe(`${mmToPx(20)}px`);
  });

  it('adds the flex column + box decoration for a text box', () => {
    const style = elementStyle({
      id: 't',
      type: 'text',
      leftPx: 0,
      topPx: 0,
      widthPx: 50,
      heightPx: 20,
      zIndex: 1,
      content: { kind: 'text', text: 'hi', textStyle: {} },
      boxStyle: { 'justify-content': 'center', background: '#eee' },
    });
    expect(style['display']).toBe('flex');
    expect(style['flex-direction']).toBe('column');
    expect(style['box-sizing']).toBe('border-box');
    // Box decoration is merged in.
    expect(style['justify-content']).toBe('center');
    expect(style['background']).toBe('#eee');
  });

  it('emits absolute element styles, with auto height for a growing box', () => {
    const fixed = elementStyle({
      id: 'a',
      type: 'text',
      leftPx: 10,
      topPx: 20,
      widthPx: 30,
      heightPx: 40,
      zIndex: 3,
      content: { kind: 'empty' },
      boxStyle: {},
    });
    expect(fixed).toMatchObject({
      position: 'absolute',
      left: '10px',
      top: '20px',
      width: '30px',
      height: '40px',
      'z-index': '3',
    });

    const growing = elementStyle({
      id: 'b',
      type: 'dataTable',
      leftPx: 0,
      topPx: 0,
      widthPx: 100,
      heightPx: null,
      zIndex: 1,
      content: { kind: 'empty' },
      boxStyle: {},
    });
    expect(growing['height']).toBe('auto');
  });
});

/**
 * Element content + per-type style (E4-S2). Drives the certificate golden with
 * its bindings resolved (so data-bound text carries real values) and asserts the
 * text/shape/image content views and their styles.
 */
async function resolveCertificateValues(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const element of goldenCertificateTemplate.body.elements) {
    const resolved = await resolveElement(element, goldenCertificateData);
    if (resolved) map.set(element.id, resolved.formatted);
  }
  return map;
}

describe('buildPageViewModel content (E4-S2)', () => {
  it('leaves boxes empty when no template is supplied (E4-S1 behaviour)', () => {
    const doc = paginateCertificate();
    const vm = buildPageViewModel(doc.pages[0], doc.geometry);
    expect(vm.elements.every((e) => e.content.kind === 'empty')).toBe(true);
  });

  it('renders a static text element with its font, colour and alignment', () => {
    const doc = paginateCertificate();
    const vm = buildPageViewModel(doc.pages[0], doc.geometry, {
      template: goldenCertificateTemplate,
    });
    const title = boxById(vm, 'el_cert_title');
    const content = title.content as TextContentView;

    expect(content.kind).toBe('text');
    expect(content.text).toBe('Certificate of Completion');
    expect(content.textStyle['font-family']).toBe('Inter');
    expect(content.textStyle['font-size']).toBe(`${ptToPx(32)}px`);
    expect(content.textStyle['font-weight']).toBe('bold');
    expect(content.textStyle['color']).toBe('#4F46E5');
    expect(content.textStyle['text-align']).toBe('center');
    expect(content.textStyle['white-space']).toBe('pre-wrap');
    // Vertical alignment lands on the host box as a flex justify-content.
    expect(title.boxStyle['justify-content']).toBe('center');
  });

  it('falls back to the document default font when an element overrides nothing', () => {
    const doc = paginateCertificate();
    const vm = buildPageViewModel(doc.pages[0], doc.geometry, {
      template: goldenCertificateTemplate,
    });
    // el_cert_presented has no font override; default is Inter 12pt.
    const presented = boxById(vm, 'el_cert_presented');
    const content = presented.content as TextContentView;
    expect(content.textStyle['font-family']).toBe('Inter');
    expect(content.textStyle['font-size']).toBe(`${ptToPx(12)}px`);
  });

  it('renders a bound text element from the resolved-values map', async () => {
    const doc = paginateCertificate();
    const vm = buildPageViewModel(doc.pages[0], doc.geometry, {
      template: goldenCertificateTemplate,
      resolvedValues: await resolveCertificateValues(),
    });
    const recipient = boxById(vm, 'el_cert_recipient');
    expect((recipient.content as TextContentView).text).toBe('Jane A. Smith');
  });

  it('prefers a page-token resolvedText over the literal and binding', () => {
    // The invoice footer carries `Page {{pageNumber}} of {{pageCount}}`.
    const doc = paginate(goldenInvoiceTemplate, new Map());
    const vm = buildPageViewModel(doc.pages[0], doc.geometry, {
      template: goldenInvoiceTemplate,
    });
    const page = boxById(vm, 'el_inv_page');
    expect((page.content as TextContentView).text).toBe('Page 1 of 1');
  });

  it('renders a bound text as empty when its value is absent from the map', () => {
    const doc = paginateCertificate();
    const vm = buildPageViewModel(doc.pages[0], doc.geometry, {
      template: goldenCertificateTemplate,
      // no resolvedValues
    });
    const recipient = boxById(vm, 'el_cert_recipient');
    expect((recipient.content as TextContentView).text).toBe('');
  });

  it('renders a rectangle shape inset by half the stroke, with stroke + no fill', () => {
    const doc = paginateCertificate();
    const vm = buildPageViewModel(doc.pages[0], doc.geometry, {
      template: goldenCertificateTemplate,
    });
    const border = boxById(vm, 'el_cert_border');
    const content = border.content as ShapeContentView;

    expect(content.kind).toBe('shape');
    expect(content.shape).toBe('rect');
    const halfStroke = mmToPx(1.5) / 2;
    expect(content.rect).toEqual({
      x: halfStroke,
      y: halfStroke,
      width: mmToPx(277) - mmToPx(1.5),
      height: mmToPx(190) - mmToPx(1.5),
    });
    expect(content.stroke).toMatchObject({ color: '#4F46E5', widthPx: mmToPx(1.5), dashArray: null });
    expect(content.fill).toBeNull();
  });

  it('renders a line shape corner-to-corner (degenerate height → horizontal rule)', () => {
    const doc = paginateCertificate();
    const vm = buildPageViewModel(doc.pages[0], doc.geometry, {
      template: goldenCertificateTemplate,
    });
    const rule = boxById(vm, 'el_cert_rule');
    const content = rule.content as ShapeContentView;
    expect(content.shape).toBe('line');
    expect(content.line).toEqual({ x1: 0, y1: 0, x2: mmToPx(217), y2: 0 });
    expect(content.svgHeightPx).toBe(0);
  });

  it('renders an ellipse with both a fill and a stroke', () => {
    const doc = paginateCertificate();
    const vm = buildPageViewModel(doc.pages[0], doc.geometry, {
      template: goldenCertificateTemplate,
    });
    const seal = boxById(vm, 'el_cert_seal');
    const content = seal.content as ShapeContentView;
    expect(content.shape).toBe('ellipse');
    expect(content.fill).toBe('#EEF2FF');
    expect(content.ellipse).toMatchObject({ cx: mmToPx(40) / 2, cy: mmToPx(40) / 2 });
    expect(content.stroke).toMatchObject({ color: '#4F46E5' });
  });

  it('renders an image with its object-fit and a sanitised https src', () => {
    const doc = paginateCertificate();
    const vm = buildPageViewModel(doc.pages[0], doc.geometry, {
      template: goldenCertificateTemplate,
    });
    const logo = boxById(vm, 'el_cert_logo');
    const content = logo.content as ImageContentView;
    expect(content.kind).toBe('image');
    expect(content.imageStyle['object-fit']).toBe('contain');
    expect(content.src).toBe('https://assets.rendara.dev/rendara-academy.png');
  });
});

/**
 * Data-table slices (E4-S3). Drives the real engine (resolve → paginate, which
 * works under Vitest) over the invoice (plain) and tabular-report (grouped)
 * goldens, then asserts the positioned table view: container geometry, per-kind
 * rows, cell text + alignment, band labels, aggregates, repeated and continued
 * headers, and that every row matches the engine's page-absolute slice model.
 */
async function paginateGolden(
  template: RendaraTemplate,
  data: unknown,
): Promise<PaginatedDocument> {
  const resolved = new Map<string, ResolvedDataTable>();
  for (const element of template.body.elements) {
    if (isDataTableElement(element)) {
      resolved.set(element.id, await resolveDataTable(element, data));
    }
  }
  return paginate(template, resolved);
}

/** The single table view on a page, failing the test when absent. */
function onlyTable(vm: PageViewModel): TableView {
  if (vm.tables.length !== 1) throw new Error(`expected exactly one table, got ${vm.tables.length}`);
  return vm.tables[0];
}

describe('buildPageViewModel tables (E4-S3)', () => {
  it('omits tables when no template is supplied (cannot place without the frame)', async () => {
    const doc = await paginateGolden(goldenInvoiceTemplate, goldenInvoiceData);
    const vm = buildPageViewModel(doc.pages[0], doc.geometry);
    expect(vm.tables).toHaveLength(0);
  });

  it('positions the table at the element frame left / slice top, sized to its columns', async () => {
    const doc = await paginateGolden(goldenInvoiceTemplate, goldenInvoiceData);
    const slice = doc.pages[0].tables[0];
    const table = onlyTable(
      buildPageViewModel(doc.pages[0], doc.geometry, { template: goldenInvoiceTemplate }),
    );

    expect(table.elementId).toBe('el_inv_table');
    // The table's left edge is its element frame's x (xMm: 15), page-absolute.
    expect(table.leftPx).toBe(mmToPx(15));
    // The slice top is the engine's page-absolute slice yPx (authored yMm: 74).
    expect(table.topPx).toBe(slice.yPx);
    // Width is the sum of the slice's column widths (90 + 20 + 35 + 35 = 180 mm),
    // up to float accumulation across the four columns.
    expect(table.widthPx).toBeCloseTo(mmToPx(180), 6);
    expect(table.widthPx).toBe(slice.columns.reduce((sum, c) => sum + c.widthPx, 0));
    expect(table.zIndex).toBe(1);
  });

  it('renders header, detail and grand-total rows with cell text and alignment', async () => {
    const doc = await paginateGolden(goldenInvoiceTemplate, goldenInvoiceData);
    const table = onlyTable(
      buildPageViewModel(doc.pages[0], doc.geometry, { template: goldenInvoiceTemplate }),
    );

    const header = table.rows.find((r) => r.kind === 'header');
    expect(header?.cells.map((c) => c.text)).toEqual(['Description', 'Qty', 'Unit Price', 'Amount']);
    // Column alignment is carried onto each cell's style (Qty/Unit Price/Amount right).
    expect(header?.cells.map((c) => c.cellStyle['text-align'])).toEqual([
      'left',
      'right',
      'right',
      'right',
    ]);

    const details = table.rows.filter((r) => r.kind === 'detail');
    expect(details).toHaveLength(goldenInvoiceData.invoice.lineItems.length);
    expect(details[0].cells.map((c) => c.text)).toEqual([
      'Design consultation',
      '8',
      '$120.00',
      '$960.00',
    ]);

    // The grand-total column footer carries the summed amount under the amount column.
    const footer = table.rows.find((r) => r.kind === 'columnFooter');
    const amountCell = footer?.cells.find((c) => c.columnKey === 'amt');
    expect(amountCell?.text).toBe('$3,060.00');
    expect(footer?.cells.find((c) => c.columnKey === 'desc')?.text).toBe('');
  });

  it('emits the table palette as themeable CSS custom properties (E4-S5)', async () => {
    const doc = await paginateGolden(goldenInvoiceTemplate, goldenInvoiceData);
    const table = onlyTable(
      buildPageViewModel(doc.pages[0], doc.geometry, { template: goldenInvoiceTemplate }),
    );

    // The header fill and detail-row separator are `var(--rdr-…, default)` so a
    // host can re-theme the palette while the default keeps the pixels unchanged.
    const header = table.rows.find((r) => r.kind === 'header');
    expect(header?.rowStyle['background']).toBe('var(--rdr-table-header-fill, #F1F5F9)');
    expect(header?.rowStyle['border-bottom']).toBe(
      '1px solid var(--rdr-table-total-rule, #334155)',
    );

    const detail = table.rows.find((r) => r.kind === 'detail');
    expect(detail?.rowStyle['border-bottom']).toBe(
      '1px solid var(--rdr-table-detail-rule, #E2E8F0)',
    );
  });

  it('matches the engine slice model: each row at its page-absolute y, slice-relative', async () => {
    const doc = await paginateGolden(goldenInvoiceTemplate, goldenInvoiceData);
    const slice = doc.pages[0].tables[0];
    const table = onlyTable(
      buildPageViewModel(doc.pages[0], doc.geometry, { template: goldenInvoiceTemplate }),
    );

    expect(table.rows).toHaveLength(slice.rows.length);
    table.rows.forEach((row, i) => {
      expect(row.kind).toBe(slice.rows[i].kind);
      expect(row.topPx).toBe(slice.rows[i].yPx - slice.yPx);
      expect(row.heightPx).toBe(slice.rows[i].heightPx);
    });
  });

  it('renders group header labels, subtotal footers and a grand total (grouped)', async () => {
    const doc = await paginateGolden(goldenTabularReportTemplate, goldenTabularReportData);
    const lastPage = doc.pages[doc.pageCount - 1];
    const firstTable = onlyTable(
      buildPageViewModel(doc.pages[0], doc.geometry, { template: goldenTabularReportTemplate }),
    );

    // Group headers carry a full-width band label, e.g. "Region: North".
    const groupHeaders = firstTable.rows.filter((r) => r.kind === 'groupHeader');
    expect(groupHeaders.length).toBeGreaterThanOrEqual(1);
    expect(groupHeaders[0].label?.text).toBe('Region: North');
    expect(groupHeaders[0].label?.labelStyle['font-weight']).toBe('700');

    // Group footers carry per-column subtotals (units + revenue) and no label.
    // North's units subtotal is 120 + 64 + 38 + 22 = 244.
    const groupFooter = firstTable.rows.find((r) => r.kind === 'groupFooter');
    expect(groupFooter?.label).toBeNull();
    expect(groupFooter?.cells.find((c) => c.columnKey === 'units')?.text).toBe('244');

    // The grand total lands on the last page's slice; the rendered cell must equal
    // the engine's own column-footer value (no re-derivation of the sum here).
    const grandSlice = lastPage.tables[0].rows.find((r) => r.kind === 'columnFooter');
    const grandTable = onlyTable(
      buildPageViewModel(lastPage, doc.geometry, { template: goldenTabularReportTemplate }),
    );
    const grand = grandTable.rows.find((r) => r.kind === 'columnFooter');
    const expectedUnits = grandSlice?.cells.find((c) => c.columnKey === 'units')?.text;
    expect(grand?.cells.find((c) => c.columnKey === 'units')?.text).toBe(expectedUnits);
  });

  it('repeats the header on a continuation page (repeatHeaderOnEachPage)', () => {
    const template = syntheticTableTemplate();
    const rows = Array.from({ length: 80 }, (_, i) => ({
      index: i,
      data: {},
      cells: [
        { columnKey: 'a', value: { raw: `Item ${i}`, formatted: `Item ${i}` } },
        { columnKey: 'b', value: { raw: String(i), formatted: String(i) } },
      ],
    }));
    const resolved: ResolvedDataTable = { rows, columnFooters: [], errors: [], diagnostics: [] };
    const doc = paginate(template, new Map([['el_syn', resolved]]));

    expect(doc.pageCount).toBeGreaterThanOrEqual(2);
    const page2 = buildPageViewModel(doc.pages[1], doc.geometry, { template });
    const table = onlyTable(page2);
    // The continuation slice re-emits the table header at its top.
    expect(table.rows[0].kind).toBe('header');
    expect(table.rows[0].cells.map((c) => c.text)).toEqual(['A', 'B']);
  });

  it('flags a continued group header repeated across a page break', () => {
    const template = syntheticTableTemplate({ grouped: true });
    const rows = Array.from({ length: 80 }, (_, i) => ({
      index: i,
      data: {},
      cells: [
        { columnKey: 'a', value: { raw: `Item ${i}`, formatted: `Item ${i}` } },
        { columnKey: 'b', value: { raw: String(i), formatted: String(i) } },
      ],
    }));
    const resolved: ResolvedDataTable = {
      rows,
      groups: [
        {
          key: 'All',
          keyValue: 'All',
          rows,
          header: { label: { raw: 'Group All', formatted: 'Group All' }, aggregates: [] },
          footer: { aggregates: [] },
        },
      ],
      columnFooters: [],
      errors: [],
      diagnostics: [],
    };
    const doc = paginate(template, new Map([['el_syn', resolved]]));

    expect(doc.pageCount).toBeGreaterThanOrEqual(2);
    const table = onlyTable(buildPageViewModel(doc.pages[1], doc.geometry, { template }));
    const continued = table.rows.find((r) => r.kind === 'groupHeader' && r.continued);
    expect(continued).toBeDefined();
    expect(continued?.label?.text).toContain('(continued)');
  });
});

/** A minimal A4-portrait table template (optionally grouped) for synthetic pagination tests. */
function syntheticTableTemplate(options?: { grouped?: boolean }): RendaraTemplate {
  return {
    schemaVersion: '1.0.0',
    metadata: {
      name: 'Synthetic',
      id: 'fixture-synthetic-0001',
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
          id: 'el_syn',
          type: 'dataTable',
          frame: { xMm: 15, yMm: 30, wMm: 180, hMm: null },
          source: { arrayExpr: 'rows' },
          columns: [
            { key: 'a', header: 'A', cell: { expr: '$.a' }, widthMm: 90 },
            { key: 'b', header: 'B', cell: { expr: '$.b' }, widthMm: 90, align: 'right' },
          ],
          ...(options?.grouped
            ? { groups: [{ groupBy: '$.g', header: { label: { expr: '"Group All"' } } }] }
            : {}),
          repeatHeaderOnEachPage: true,
          keepTogether: false,
          z: 1,
        },
      ],
    },
    footer: { elements: [] },
  };
}

describe('boxDecorationStyle (E4-S2)', () => {
  it('maps fill, per-side border (mm→px), padding and vertical alignment', () => {
    const style = boxDecorationStyle(
      {
        fill: '#fee',
        border: { bottom: { widthMm: 0.5, style: 'dashed', color: '#333' } },
        padding: { top: 1, right: 2, bottom: 3, left: 4 },
      },
      undefined,
      'bottom',
    );
    expect(style['background']).toBe('#fee');
    expect(style['border-bottom']).toBe(`${mmToPx(0.5)}px dashed #333`);
    expect(style['padding-top']).toBe(`${mmToPx(1)}px`);
    expect(style['padding-left']).toBe(`${mmToPx(4)}px`);
    expect(style['justify-content']).toBe('flex-end');
  });

  it('omits a border whose style is none or width is zero', () => {
    expect(boxDecorationStyle({ border: { top: { style: 'none', widthMm: 2 } } }, undefined, undefined)[
      'border-top'
    ]).toBeUndefined();
    expect(
      boxDecorationStyle({ border: { top: { style: 'solid', widthMm: 0 } } }, undefined, undefined)[
        'border-top'
      ],
    ).toBeUndefined();
  });
});

describe('sanitizeImageUrl (E4-S2 security)', () => {
  it('allows http, https, image data URIs, and relative/protocol-relative URLs', () => {
    expect(sanitizeImageUrl('https://cdn.example/logo.png')).toBe('https://cdn.example/logo.png');
    expect(sanitizeImageUrl('http://cdn.example/logo.png')).toBe('http://cdn.example/logo.png');
    expect(sanitizeImageUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(sanitizeImageUrl('/assets/logo.png')).toBe('/assets/logo.png');
    expect(sanitizeImageUrl('logo.png')).toBe('logo.png');
    expect(sanitizeImageUrl('//cdn.example/logo.png')).toBe('//cdn.example/logo.png');
  });

  it('blocks javascript:, vbscript:, file: and non-image data URIs', () => {
    expect(sanitizeImageUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeImageUrl('vbscript:msgbox(1)')).toBeNull();
    expect(sanitizeImageUrl('file:///etc/passwd')).toBeNull();
    expect(sanitizeImageUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('neutralises case- and whitespace-obfuscated javascript: URLs', () => {
    expect(sanitizeImageUrl('JavaScript:alert(1)')).toBeNull();
    expect(sanitizeImageUrl('  javascript:alert(1)')).toBeNull();
    expect(sanitizeImageUrl('java\tscript:alert(1)')).toBeNull();
    expect(sanitizeImageUrl('java\nscript:alert(1)')).toBeNull();
    expect(sanitizeImageUrl(' javascript:alert(1)')).toBeNull();
  });

  it('returns null for absent or empty sources', () => {
    expect(sanitizeImageUrl(null)).toBeNull();
    expect(sanitizeImageUrl(undefined)).toBeNull();
    expect(sanitizeImageUrl('')).toBeNull();
    expect(sanitizeImageUrl('   ')).toBeNull();
  });
});

/**
 * Design-mode hooks (E4-S6). The view-model carries a `mode` and the pure
 * `designAnchorAttrs` produces the additive selection-anchor attributes — `null`
 * in view mode (so callers emit nothing and view output is byte-stable).
 */
describe('design-mode hooks (E4-S6)', () => {
  it('defaults the mode to "view"', () => {
    const doc = paginateCertificate();
    expect(buildPageViewModel(doc.pages[0], doc.geometry).mode).toBe('view');
  });

  it('carries an explicit design mode through', () => {
    const doc = paginateCertificate();
    expect(buildPageViewModel(doc.pages[0], doc.geometry, { mode: 'design' }).mode).toBe('design');
    expect(buildPageViewModel(doc.pages[0], doc.geometry, { mode: 'view' }).mode).toBe('view');
  });

  it('designAnchorAttrs returns null in view mode (no anchors emitted)', () => {
    const frame = { leftPx: 10, topPx: 20, widthPx: 30, heightPx: 40 };
    expect(designAnchorAttrs('element', frame, 'view')).toBeNull();
    expect(designAnchorAttrs('table', frame, 'view')).toBeNull();
  });

  it('designAnchorAttrs exposes the role + natural-px frame in design mode', () => {
    const frame = { leftPx: 10, topPx: 20, widthPx: 30, heightPx: 40 };
    expect(designAnchorAttrs('element', frame, 'design')).toEqual({
      'data-rdr-hit': 'element',
      'data-rdr-x': '10',
      'data-rdr-y': '20',
      'data-rdr-w': '30',
      'data-rdr-h': '40',
    });
    expect(designAnchorAttrs('table', frame, 'design')).toMatchObject({ 'data-rdr-hit': 'table' });
  });

  it('omits data-rdr-h for a growing (auto-height) element', () => {
    const frame = { leftPx: 10, topPx: 20, widthPx: 30, heightPx: null };
    const attrs = designAnchorAttrs('element', frame, 'design');
    expect(attrs).not.toBeNull();
    expect(attrs).not.toHaveProperty('data-rdr-h');
    expect(attrs).toMatchObject({ 'data-rdr-w': '30' });
  });

  it('builds anchors straight from a real element box frame', () => {
    const doc = paginateCertificate();
    const vm = buildPageViewModel(doc.pages[0], doc.geometry, {
      template: goldenCertificateTemplate,
      mode: 'design',
    });
    const border = boxById(vm, 'el_cert_border');
    expect(designAnchorAttrs('element', border, vm.mode)).toEqual({
      'data-rdr-hit': 'element',
      'data-rdr-x': `${border.leftPx}`,
      'data-rdr-y': `${border.topPx}`,
      'data-rdr-w': `${border.widthPx}`,
      'data-rdr-h': `${border.heightPx}`,
    });
  });
});

/**
 * Watermark (E4-S7). `buildWatermarkView` resolves the document-level config into
 * the centred, rotated overlay the renderer stamps behind the content: text vs.
 * image, opacity clamp, angle, URL sanitisation, and the null cases. The page
 * view-model surfaces it on `PageViewModel.watermark` (null by default).
 */
const TEXT_WATERMARK: Watermark = {
  type: 'text',
  text: 'CONFIDENTIAL',
  opacity: 0.15,
  angleDeg: -45,
  color: '#9CA3AF',
};

describe('buildWatermarkView (E4-S7)', () => {
  it('returns null when there is no watermark config', () => {
    expect(buildWatermarkView(null, DEFAULT_DPI)).toBeNull();
    expect(buildWatermarkView(undefined, DEFAULT_DPI)).toBeNull();
  });

  it('builds a centred, non-interactive, rotated text overlay', () => {
    const view = buildWatermarkView(TEXT_WATERMARK, DEFAULT_DPI);
    expect(view).not.toBeNull();
    expect(view?.kind).toBe('text');
    expect(view?.text).toBe('CONFIDENTIAL');
    expect(view?.src).toBeNull();

    // The layer covers the whole sheet, is non-interactive, sits behind content,
    // and carries the opacity.
    expect(view?.layerStyle).toMatchObject({
      position: 'absolute',
      width: '100%',
      height: '100%',
      'pointer-events': 'none',
      'z-index': '0',
      opacity: '0.15',
    });
    // The caption is rotated and painted in the configured colour at the default size.
    expect(view?.innerStyle['transform']).toBe('rotate(-45deg)');
    expect(view?.innerStyle['color']).toBe('#9CA3AF');
    expect(view?.innerStyle['white-space']).toBe('nowrap');
    expect(view?.innerStyle['font-size']).toBe(`${ptToPx(72, DEFAULT_DPI)}px`);
  });

  it('falls back to the themeable colour token and default size when unset', () => {
    const view = buildWatermarkView(
      { type: 'text', text: 'DRAFT', opacity: 0.2, angleDeg: 0 },
      DEFAULT_DPI,
    );
    expect(view?.innerStyle['color']).toBe('var(--rdr-watermark-color, #9CA3AF)');
    expect(view?.innerStyle['font-size']).toBe(`${ptToPx(72, DEFAULT_DPI)}px`);
    expect(view?.innerStyle['transform']).toBe('rotate(0deg)');
  });

  it('honours an explicit font size (pt→px)', () => {
    const view = buildWatermarkView(
      { type: 'text', text: 'DRAFT', opacity: 0.2, angleDeg: -30, fontSizePt: 48 },
      DEFAULT_DPI,
    );
    expect(view?.innerStyle['font-size']).toBe(`${ptToPx(48, DEFAULT_DPI)}px`);
  });

  it('clamps opacity into [0, 1] and degrades a non-finite angle to 0deg', () => {
    expect(buildWatermarkView({ ...TEXT_WATERMARK, opacity: 2 }, DEFAULT_DPI)?.layerStyle['opacity']).toBe(
      '1',
    );
    expect(
      buildWatermarkView({ ...TEXT_WATERMARK, opacity: -1 }, DEFAULT_DPI)?.layerStyle['opacity'],
    ).toBe('0');
    expect(
      buildWatermarkView({ ...TEXT_WATERMARK, opacity: Number.NaN }, DEFAULT_DPI)?.layerStyle[
        'opacity'
      ],
    ).toBe('1');
    expect(
      buildWatermarkView({ ...TEXT_WATERMARK, angleDeg: Number.POSITIVE_INFINITY }, DEFAULT_DPI)
        ?.innerStyle['transform'],
    ).toBe('rotate(0deg)');
  });

  it('returns null for a text watermark with an empty (or whitespace-only) caption', () => {
    expect(buildWatermarkView({ type: 'text', text: '', opacity: 0.2, angleDeg: 0 }, DEFAULT_DPI)).toBeNull();
    expect(
      buildWatermarkView({ type: 'text', text: '   ', opacity: 0.2, angleDeg: 0 }, DEFAULT_DPI),
    ).toBeNull();
    expect(buildWatermarkView({ type: 'text', opacity: 0.2, angleDeg: 0 }, DEFAULT_DPI)).toBeNull();
  });

  it('builds an image overlay with a sanitised src and rotation', () => {
    const view = buildWatermarkView(
      { type: 'image', src: 'https://cdn.example/seal.png', opacity: 0.3, angleDeg: -45 },
      DEFAULT_DPI,
    );
    expect(view?.kind).toBe('image');
    expect(view?.src).toBe('https://cdn.example/seal.png');
    expect(view?.text).toBeNull();
    expect(view?.innerStyle['transform']).toBe('rotate(-45deg)');
    expect(view?.innerStyle['max-width']).toBe('60%');
  });

  it('blocks a dangerous image src (security) → null', () => {
    expect(
      buildWatermarkView(
        { type: 'image', src: 'javascript:alert(1)', opacity: 0.3, angleDeg: 0 },
        DEFAULT_DPI,
      ),
    ).toBeNull();
    expect(
      buildWatermarkView({ type: 'image', opacity: 0.3, angleDeg: 0 }, DEFAULT_DPI),
    ).toBeNull();
  });

  it('surfaces on the page view-model, defaulting to null', () => {
    const doc = paginateCertificate();
    expect(buildPageViewModel(doc.pages[0], doc.geometry).watermark).toBeNull();

    const vm = buildPageViewModel(doc.pages[0], doc.geometry, { watermark: TEXT_WATERMARK });
    expect(vm.watermark?.kind).toBe('text');
    expect(vm.watermark?.text).toBe('CONFIDENTIAL');
  });
});
