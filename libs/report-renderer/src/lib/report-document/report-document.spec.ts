import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/angular';
import type { RendaraTemplate } from '@rendara/report-schema';
import {
  mmToPx,
  paginate,
  type PaginatedDocument,
  type ResolvedDataTable,
} from '@rendara/report-engine';

import { ReportDocument } from './report-document';

/**
 * Component tests (E4-S4, QA: "multi-page golden renders correct page count;
 * zoom levels visually snapshotted"). Builds a synthetic multi-page document (a
 * long table fed through the real paginator under Vitest — the real goldens fit
 * one page) and asserts: the page count painted in continuous layout, single-page
 * selection, the resolved zoom transform for numeric and fit specs, and the
 * `zoomChange` output.
 */

/** A minimal A4-portrait template with one two-column table that grows to fill pages. */
function syntheticTemplate(): RendaraTemplate {
  return {
    schemaVersion: '1.0.0',
    metadata: {
      name: 'Synthetic Doc',
      id: 'fixture-doc-cmp-0001',
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

/** Queries a required element, failing the test (not returning `null`) when absent. */
function el(root: ParentNode, selector: string): HTMLElement {
  const found = root.querySelector<HTMLElement>(selector);
  if (found === null) throw new Error(`expected to find "${selector}"`);
  return found;
}

describe('ReportDocument (E4-S4)', () => {
  it('renders one sheet per page in continuous layout, numbered in order', async () => {
    const { doc, template } = multiPageDoc();
    expect(doc.pageCount).toBeGreaterThanOrEqual(2);

    const { container } = await render(ReportDocument, {
      inputs: { document: doc, template },
    });

    const slots = container.querySelectorAll<HTMLElement>('.rdr-page-slot');
    expect(slots).toHaveLength(doc.pageCount);

    const sheets = container.querySelectorAll<HTMLElement>('.rdr-page');
    expect(sheets).toHaveLength(doc.pageCount);

    const numbers = Array.from(slots).map((s) => s.getAttribute('data-page-number'));
    expect(numbers).toEqual(doc.pages.map((p) => String(p.pageNumber)));
  });

  it('renders only the current page in single layout', async () => {
    const { doc, template } = multiPageDoc();
    const { container } = await render(ReportDocument, {
      inputs: { document: doc, template, layout: 'single', currentPage: 2 },
    });

    const slots = container.querySelectorAll<HTMLElement>('.rdr-page-slot');
    expect(slots).toHaveLength(1);
    expect(slots[0].getAttribute('data-page-number')).toBe('2');
  });

  it('clamps an out-of-range current page in single layout', async () => {
    const { doc, template } = multiPageDoc();
    const { container } = await render(ReportDocument, {
      inputs: { document: doc, template, layout: 'single', currentPage: 9999 },
    });
    const slot = el(container, '.rdr-page-slot');
    expect(slot.getAttribute('data-page-number')).toBe(String(doc.pageCount));
  });

  it('applies a numeric zoom as a scale transform on every page sheet', async () => {
    const { doc, template } = multiPageDoc();
    const { container } = await render(ReportDocument, {
      inputs: { document: doc, template, zoom: 0.5 },
    });

    const sheets = container.querySelectorAll<HTMLElement>('.rdr-page');
    expect(sheets.length).toBeGreaterThanOrEqual(2);
    for (const sheet of Array.from(sheets)) {
      expect(sheet.style.transform).toBe('scale(0.5)');
    }
  });

  it('sizes each page slot to the scaled box so pages stack at the zoom', async () => {
    const { doc, template } = multiPageDoc();
    const { container } = await render(ReportDocument, {
      inputs: { document: doc, template, zoom: 0.5 },
    });

    const slot = el(container, '.rdr-page-slot');
    // A4 portrait sheet scaled by 0.5.
    expect(slot.style.width).toBe(`${mmToPx(210) * 0.5}px`);
    expect(slot.style.height).toBe(`${mmToPx(297) * 0.5}px`);
  });

  it('resolves a fit-width zoom against an explicit availableSize', async () => {
    const { doc, template } = multiPageDoc();
    const sheetW = doc.geometry.pagePx.widthPx;
    const { container } = await render(ReportDocument, {
      inputs: {
        document: doc,
        template,
        zoom: 'fit-width',
        availableSize: { widthPx: sheetW / 2, heightPx: 10_000 },
      },
    });
    const sheet = el(container, '.rdr-page');
    expect(sheet.style.transform).toBe('scale(0.5)');
  });

  it('emits the resolved factor via zoomChange', async () => {
    const { doc, template } = multiPageDoc();
    const zoomChange = vi.fn();
    await render(ReportDocument, {
      inputs: { document: doc, template, zoom: 0.75 },
      on: { zoomChange },
    });
    expect(zoomChange).toHaveBeenCalledWith(0.75);
  });

  it('forwards the document-level watermark to every page (E4-S7)', async () => {
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

    const { container } = await render(ReportDocument, {
      inputs: { document: doc, template },
    });

    const watermarks = container.querySelectorAll<HTMLElement>('.rdr-watermark');
    // One watermark overlay per page sheet, each carrying the caption.
    expect(watermarks).toHaveLength(doc.pageCount);
    for (const layer of Array.from(watermarks)) {
      expect(layer.querySelector('.rdr-watermark-text')?.textContent?.trim()).toBe('CONFIDENTIAL');
    }
  });

  it('renders no watermark overlay when the document has none (E4-S7)', async () => {
    const { doc, template } = multiPageDoc();
    const { container } = await render(ReportDocument, {
      inputs: { document: doc, template },
    });
    expect(container.querySelector('.rdr-watermark')).toBeNull();
  });

  it('measures the host via ResizeObserver to drive fit modes (no availableSize)', async () => {
    // jsdom has no ResizeObserver; install a controllable mock so the measurement
    // path runs and a simulated resize updates the resolved fit-width zoom.
    type Rect = { width: number; height: number };
    type RoCb = (entries: ReadonlyArray<{ contentRect: Rect }>) => void;
    // A holder so the closure variable isn't flow-narrowed to its initial null.
    const resize: { fire: ((rect: Rect) => void) | null } = { fire: null };
    class MockResizeObserver {
      constructor(private readonly cb: RoCb) {}
      observe(): void {
        resize.fire = (rect) => this.cb([{ contentRect: rect }]);
      }
      unobserve(): void {
        resize.fire = null;
      }
      disconnect(): void {
        resize.fire = null;
      }
    }
    const original = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = MockResizeObserver;

    try {
      const { doc, template } = multiPageDoc();
      const sheetW = doc.geometry.pagePx.widthPx;
      const { container, detectChanges, fixture } = await render(ReportDocument, {
        inputs: { document: doc, template, zoom: 'fit-width' },
      });

      // Before any measurement, fit-width falls back to 100%.
      expect(el(container, '.rdr-page').style.transform).toBe('scale(1)');

      // Simulate the host being measured at half the page width.
      resize.fire?.({ width: sheetW / 2, height: 10_000 });
      detectChanges();
      await fixture.whenStable();

      expect(el(container, '.rdr-page').style.transform).toBe('scale(0.5)');
    } finally {
      (globalThis as { ResizeObserver?: unknown }).ResizeObserver = original;
    }
  });
});
