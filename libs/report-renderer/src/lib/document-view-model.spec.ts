import { describe, expect, it } from 'vitest';
import type { RendaraTemplate } from '@rendara/report-schema';
import {
  mmToPx,
  paginate,
  type PaginatedDocument,
  type ResolvedDataTable,
} from '@rendara/report-engine';

import {
  buildDocumentViewModel,
  MAX_ZOOM,
  MIN_ZOOM,
  resolveZoomFactor,
  slotSize,
  type SheetSize,
} from './document-view-model';

/**
 * Pure document view-model tests (E4-S4). These pin the zoom-mode math
 * (number/fit-width/fit-page/clamping/fallback), the scaled slot box, and the
 * N-page model the renderer paints — all without DOM or Angular. The multi-page
 * document is synthesised from a long table (the real goldens fit one page), fed
 * through the real paginator so the page count + geometry are genuine.
 */

/** An A4-portrait sheet in px (the shape every page of the synthetic doc has). */
const A4_PORTRAIT: SheetSize = { widthPx: mmToPx(210), heightPx: mmToPx(297) };

/** A minimal A4-portrait template with one two-column table that grows to fill pages. */
function syntheticTemplate(): RendaraTemplate {
  return {
    schemaVersion: '1.0.0',
    metadata: {
      name: 'Synthetic Doc',
      id: 'fixture-doc-vm-0001',
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
          id: 'el_doc_table',
          type: 'dataTable',
          frame: { xMm: 15, yMm: 30, wMm: 180, hMm: null },
          source: { arrayExpr: 'rows' },
          columns: [
            { key: 'a', header: 'A', cell: { expr: '$.a' }, widthMm: 90 },
            { key: 'b', header: 'B', cell: { expr: '$.b' }, widthMm: 90, align: 'right' },
          ],
          repeatHeaderOnEachPage: true,
          keepTogether: false,
          z: 1,
        },
      ],
    },
    footer: { elements: [] },
  };
}

/** Paginates a synthetic table with `rowCount` pre-resolved rows into a multi-page doc. */
function multiPageDoc(rowCount = 70): { doc: PaginatedDocument; template: RendaraTemplate } {
  const template = syntheticTemplate();
  const rows = Array.from({ length: rowCount }, (_, i) => ({
    index: i,
    data: {},
    cells: [
      { columnKey: 'a', value: { raw: `Item ${i}`, formatted: `Item ${i}` } },
      { columnKey: 'b', value: { raw: String(i), formatted: String(i) } },
    ],
  }));
  const resolved: ResolvedDataTable = { rows, columnFooters: [], errors: [], diagnostics: [] };
  return { doc: paginate(template, new Map([['el_doc_table', resolved]])), template };
}

describe('resolveZoomFactor (E4-S4)', () => {
  it('returns a numeric spec directly', () => {
    expect(resolveZoomFactor(1, A4_PORTRAIT)).toBe(1);
    expect(resolveZoomFactor(0.75, A4_PORTRAIT)).toBe(0.75);
    expect(resolveZoomFactor(2, A4_PORTRAIT)).toBe(2);
  });

  it('clamps a numeric spec into [MIN_ZOOM, MAX_ZOOM] and rejects non-positive/NaN', () => {
    expect(resolveZoomFactor(100, A4_PORTRAIT)).toBe(MAX_ZOOM);
    expect(resolveZoomFactor(0.0001, A4_PORTRAIT)).toBe(MIN_ZOOM);
    expect(resolveZoomFactor(0, A4_PORTRAIT)).toBe(MIN_ZOOM);
    expect(resolveZoomFactor(-1, A4_PORTRAIT)).toBe(MIN_ZOOM);
    expect(resolveZoomFactor(Number.NaN, A4_PORTRAIT)).toBe(MIN_ZOOM);
  });

  it('fit-width scales the page width to fill the viewport width', () => {
    const viewport = { widthPx: A4_PORTRAIT.widthPx / 2, heightPx: 10_000 };
    expect(resolveZoomFactor('fit-width', A4_PORTRAIT, viewport)).toBeCloseTo(0.5, 10);
  });

  it('fit-page takes the smaller of the width/height factors so the whole page fits', () => {
    // Wide-but-short viewport: height is the binding constraint.
    const viewport = { widthPx: A4_PORTRAIT.widthPx, heightPx: A4_PORTRAIT.heightPx / 4 };
    expect(resolveZoomFactor('fit-page', A4_PORTRAIT, viewport)).toBeCloseTo(0.25, 10);
    // Tall-but-narrow viewport: width is the binding constraint.
    const narrow = { widthPx: A4_PORTRAIT.widthPx / 3, heightPx: A4_PORTRAIT.heightPx };
    expect(resolveZoomFactor('fit-page', A4_PORTRAIT, narrow)).toBeCloseTo(1 / 3, 10);
  });

  it('falls back to 1 for a fit mode when no (positive) viewport is known', () => {
    expect(resolveZoomFactor('fit-width', A4_PORTRAIT)).toBe(1);
    expect(resolveZoomFactor('fit-page', A4_PORTRAIT, null)).toBe(1);
    expect(resolveZoomFactor('fit-width', A4_PORTRAIT, { widthPx: 0, heightPx: 100 })).toBe(1);
  });
});

describe('slotSize (E4-S4)', () => {
  it('scales the sheet box by the zoom factor', () => {
    expect(slotSize({ widthPx: 800, heightPx: 1000 }, 0.5)).toEqual({
      widthPx: 400,
      heightPx: 500,
    });
    expect(slotSize({ widthPx: 800, heightPx: 1000 }, 1)).toEqual({
      widthPx: 800,
      heightPx: 1000,
    });
  });
});

describe('buildDocumentViewModel (E4-S4)', () => {
  it('builds one page view-model per document page, in order', () => {
    const { doc, template } = multiPageDoc();
    expect(doc.pageCount).toBeGreaterThanOrEqual(2);

    const vm = buildDocumentViewModel(doc, { template });
    expect(vm.pageCount).toBe(doc.pageCount);
    expect(vm.pages).toHaveLength(doc.pageCount);
    expect(vm.pages.map((p) => p.pageNumber)).toEqual(doc.pages.map((p) => p.pageNumber));
  });

  it('resolves and applies one zoom factor to every page sheet', () => {
    const { doc, template } = multiPageDoc();
    const vm = buildDocumentViewModel(doc, { zoom: 0.6, template });
    expect(vm.zoom).toBe(0.6);
    expect(vm.pages.every((p) => p.zoom === 0.6)).toBe(true);
  });

  it('resolves a fit-width zoom against the supplied viewport', () => {
    const { doc } = multiPageDoc();
    const sheetW = doc.geometry.pagePx.widthPx;
    const vm = buildDocumentViewModel(doc, {
      zoom: 'fit-width',
      viewport: { widthPx: sheetW / 2, heightPx: 10_000 },
    });
    expect(vm.zoom).toBeCloseTo(0.5, 10);
    expect(vm.pages.every((p) => p.zoom === vm.zoom)).toBe(true);
  });

  it('exposes the shared sheet size from the document geometry', () => {
    const { doc } = multiPageDoc();
    const vm = buildDocumentViewModel(doc);
    expect(vm.sheet).toEqual({
      widthPx: doc.geometry.pagePx.widthPx,
      heightPx: doc.geometry.pagePx.heightPx,
    });
  });

  it('forwards the template so page tables are painted', () => {
    const { doc, template } = multiPageDoc();
    const vm = buildDocumentViewModel(doc, { template });
    // The long table renders on every page slice, so each page carries a table.
    expect(vm.pages.every((p) => p.tables.length > 0)).toBe(true);
  });

  it('defaults the zoom to 1 when none is supplied', () => {
    const { doc } = multiPageDoc();
    expect(buildDocumentViewModel(doc).zoom).toBe(1);
  });

  it('defaults the mode to "view" and forwards an explicit mode to every page (E4-S6)', () => {
    const { doc, template } = multiPageDoc();

    const viewVm = buildDocumentViewModel(doc, { template });
    expect(viewVm.mode).toBe('view');
    expect(viewVm.pages.every((p) => p.mode === 'view')).toBe(true);

    const designVm = buildDocumentViewModel(doc, { template, mode: 'design' });
    expect(designVm.mode).toBe('design');
    expect(designVm.pages.every((p) => p.mode === 'design')).toBe(true);
  });

  it('forwards the document-level watermark to every page (E4-S7)', () => {
    // The watermark is a render-time concern echoed onto the document by `paginate`.
    const template = syntheticTemplate();
    const rows = Array.from({ length: 70 }, (_, i) => ({
      index: i,
      data: {},
      cells: [
        { columnKey: 'a', value: { raw: `Item ${i}`, formatted: `Item ${i}` } },
        { columnKey: 'b', value: { raw: String(i), formatted: String(i) } },
      ],
    }));
    const resolved: ResolvedDataTable = { rows, columnFooters: [], errors: [], diagnostics: [] };
    const doc = paginate(template, new Map([['el_doc_table', resolved]]), {
      watermark: { type: 'text', text: 'CONFIDENTIAL', opacity: 0.15, angleDeg: -45 },
    });
    expect(doc.pageCount).toBeGreaterThanOrEqual(2);

    const vm = buildDocumentViewModel(doc, { template });
    expect(vm.pages.every((p) => p.watermark?.kind === 'text')).toBe(true);
    expect(vm.pages.every((p) => p.watermark?.text === 'CONFIDENTIAL')).toBe(true);
  });

  it('leaves every page watermark null when the document has none (E4-S7)', () => {
    const { doc, template } = multiPageDoc();
    const vm = buildDocumentViewModel(doc, { template });
    expect(vm.pages.every((p) => p.watermark === null)).toBe(true);
  });
});
