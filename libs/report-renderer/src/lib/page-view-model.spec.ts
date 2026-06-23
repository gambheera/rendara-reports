import { describe, expect, it } from 'vitest';
import { goldenCertificateTemplate, goldenInvoiceTemplate } from '@rendara/report-schema';
import {
  mmToPx,
  paginate,
  type PaginatedDocument,
  type ResolvedDataTable,
} from '@rendara/report-engine';
import { resolveDataTable } from '@rendara/report-engine';
import { isDataTableElement } from '@rendara/report-schema';

import {
  buildPageViewModel,
  DEFAULT_PAGE_BACKGROUND,
  elementStyle,
  printableStyle,
  sheetStyle,
} from './page-view-model';

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

  it('emits absolute element styles, with auto height for a growing box', () => {
    const fixed = elementStyle({
      id: 'a',
      type: 'text',
      leftPx: 10,
      topPx: 20,
      widthPx: 30,
      heightPx: 40,
      zIndex: 3,
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
    });
    expect(growing['height']).toBe('auto');
  });
});
