import { describe, expect, it } from 'vitest';
import {
  goldenCertificateTemplate,
  type RendaraTemplate,
} from '@rendara/report-schema';

import { layoutStaticPage } from './layout';
import { mmToPx } from './units';

/**
 * Builds a minimal A4-portrait template whose bands hold the given elements, so
 * each test controls exactly the frames/z/bands under test. The page is A4
 * portrait (210 × 297 mm) with default 20/15 margins.
 */
function template(bands: Partial<{
  header: RendaraTemplate['header']['elements'];
  body: RendaraTemplate['body']['elements'];
  footer: RendaraTemplate['footer']['elements'];
}>): RendaraTemplate {
  return {
    schemaVersion: '1.0.0',
    metadata: {
      name: 'Test',
      id: 'test-0001',
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
    header: { elements: bands.header ?? [] },
    body: { elements: bands.body ?? [] },
    footer: { elements: bands.footer ?? [] },
  };
}

function textEl(
  id: string,
  frame: { xMm: number; yMm: number; wMm: number; hMm: number | null },
  z = 1
): RendaraTemplate['body']['elements'][number] {
  return { id, type: 'text', frame, text: id, z };
}

describe('layoutStaticPage — frames to absolute px boxes', () => {
  it('converts an mm frame to page-absolute px at the default DPI', () => {
    const layout = layoutStaticPage(
      template({ body: [textEl('a', { xMm: 15, yMm: 30, wMm: 80, hMm: 8 })] })
    );

    const [a] = layout.elements;
    expect(a.boxPx).toEqual({
      xPx: mmToPx(15),
      yPx: mmToPx(30),
      wPx: mmToPx(80),
      hPx: mmToPx(8),
    });
    expect(a.frameMm).toEqual({ xMm: 15, yMm: 30, wMm: 80, hMm: 8 });
  });

  it('converts at a custom (print) DPI while mm frames stay fixed', () => {
    const layout = layoutStaticPage(
      template({ body: [textEl('a', { xMm: 15, yMm: 30, wMm: 80, hMm: 8 })] }),
      300
    );

    expect(layout.geometry.dpi).toBe(300);
    expect(layout.elements[0].boxPx.xPx).toBeCloseTo(mmToPx(15, 300), 9);
    expect(layout.elements[0].boxPx.wPx).toBeCloseTo(mmToPx(80, 300), 9);
  });

  it('carries the page geometry from E3-S1 through unchanged', () => {
    const layout = layoutStaticPage(template({ body: [] }));
    expect(layout.geometry.pageMm).toEqual({ widthMm: 210, heightMm: 297 });
    expect(layout.elements).toEqual([]);
  });

  it('preserves a null (growing) height as hPx: null', () => {
    const layout = layoutStaticPage(
      template({ body: [textEl('tbl', { xMm: 15, yMm: 60, wMm: 180, hMm: null })] })
    );
    expect(layout.elements[0].boxPx.hPx).toBeNull();
    expect(layout.elements[0].frameMm.hMm).toBeNull();
  });
});

describe('layoutStaticPage — z-order', () => {
  it('sorts by z ascending (lower z paints first / behind)', () => {
    const layout = layoutStaticPage(
      template({
        body: [
          textEl('top', { xMm: 0, yMm: 0, wMm: 10, hMm: 10 }, 5),
          textEl('back', { xMm: 0, yMm: 0, wMm: 10, hMm: 10 }, 0),
          textEl('mid', { xMm: 0, yMm: 0, wMm: 10, hMm: 10 }, 2),
        ],
      })
    );
    expect(layout.elements.map((e) => e.id)).toEqual(['back', 'mid', 'top']);
  });

  it('breaks z ties by band order (header, body, footer) then document order', () => {
    const layout = layoutStaticPage(
      template({
        header: [textEl('h', { xMm: 0, yMm: 0, wMm: 10, hMm: 10 }, 1)],
        body: [
          textEl('b1', { xMm: 0, yMm: 0, wMm: 10, hMm: 10 }, 1),
          textEl('b2', { xMm: 0, yMm: 0, wMm: 10, hMm: 10 }, 1),
        ],
        footer: [textEl('f', { xMm: 0, yMm: 0, wMm: 10, hMm: 10 }, 1)],
      })
    );
    expect(layout.elements.map((e) => e.id)).toEqual(['h', 'b1', 'b2', 'f']);
    expect(layout.elements.map((e) => e.band)).toEqual([
      'header',
      'body',
      'body',
      'footer',
    ]);
    // document order is recorded per band
    expect(layout.elements.map((e) => e.order)).toEqual([0, 0, 1, 0]);
  });

  it('lets a low-z body element paint behind a higher-z header element', () => {
    const layout = layoutStaticPage(
      template({
        header: [textEl('h', { xMm: 0, yMm: 0, wMm: 10, hMm: 10 }, 9)],
        body: [textEl('b', { xMm: 0, yMm: 0, wMm: 10, hMm: 10 }, 1)],
      })
    );
    expect(layout.elements.map((e) => e.id)).toEqual(['b', 'h']);
  });
});

describe('layoutStaticPage — clipping rules', () => {
  it('leaves a fully-contained element unclipped', () => {
    const layout = layoutStaticPage(
      template({ body: [textEl('a', { xMm: 15, yMm: 30, wMm: 80, hMm: 8 })] })
    );
    const [a] = layout.elements;
    expect(a.overflowsPage).toBe(false);
    expect(a.clippedPx).toEqual(a.boxPx);
  });

  it('does NOT clip to the printable area — a margin element is kept whole', () => {
    // 10 mm sits inside the 10 mm page edge but outside the 15 mm printable area;
    // it must survive (this is the certificate-border case).
    const layout = layoutStaticPage(
      template({ body: [textEl('border', { xMm: 10, yMm: 10, wMm: 190, hMm: 277 })] })
    );
    const [b] = layout.elements;
    expect(b.overflowsPage).toBe(false);
    expect(b.clippedPx).toEqual(b.boxPx);
  });

  it('clips a partially off-page element to the page intersection', () => {
    // Page is 210 mm wide; this box runs 150..250 mm, so it clips at 210.
    const layout = layoutStaticPage(
      template({ body: [textEl('wide', { xMm: 150, yMm: 30, wMm: 100, hMm: 8 })] })
    );
    const [w] = layout.elements;
    expect(w.overflowsPage).toBe(true);
    expect(w.clippedPx).toEqual({
      xPx: mmToPx(150),
      yPx: mmToPx(30),
      // clipped width is the clamped-edge difference (page right − left).
      wPx: layout.geometry.pagePx.widthPx - mmToPx(150),
      hPx: mmToPx(8),
    });
  });

  it('clips an element straddling the top edge', () => {
    const layout = layoutStaticPage(
      template({ body: [textEl('high', { xMm: 15, yMm: -5, wMm: 80, hMm: 20 })] })
    );
    const [h] = layout.elements;
    expect(h.overflowsPage).toBe(true);
    expect(h.clippedPx).toEqual({
      xPx: mmToPx(15),
      yPx: 0,
      wPx: mmToPx(80),
      // clipped height is the clamped-edge difference (bottom − top, top = 0).
      hPx: mmToPx(-5) + mmToPx(20),
    });
  });

  it('clips an element straddling the left edge', () => {
    const layout = layoutStaticPage(
      template({ body: [textEl('left', { xMm: -10, yMm: 30, wMm: 40, hMm: 8 })] })
    );
    const [l] = layout.elements;
    expect(l.overflowsPage).toBe(true);
    expect(l.clippedPx).toEqual({
      xPx: 0,
      yPx: mmToPx(30),
      // clipped width is the clamped-edge difference (right − left, left = 0).
      wPx: mmToPx(-10) + mmToPx(40),
      hPx: mmToPx(8),
    });
  });

  it('clips an element straddling the bottom edge', () => {
    // Page is 297 mm tall; this box runs 290..310 mm, clipping at 297.
    const layout = layoutStaticPage(
      template({ body: [textEl('low', { xMm: 15, yMm: 290, wMm: 80, hMm: 20 })] })
    );
    const [l] = layout.elements;
    expect(l.overflowsPage).toBe(true);
    expect(l.clippedPx).toEqual({
      xPx: mmToPx(15),
      yPx: mmToPx(290),
      wPx: mmToPx(80),
      hPx: layout.geometry.pagePx.heightPx - mmToPx(290),
    });
  });

  it('clips a null-height element straddling the top edge to yPx 0', () => {
    const layout = layoutStaticPage(
      template({ body: [textEl('tbl', { xMm: 15, yMm: -5, wMm: 100, hMm: null })] })
    );
    const [t] = layout.elements;
    expect(t.overflowsPage).toBe(true);
    expect(t.clippedPx).toEqual({
      xPx: mmToPx(15),
      yPx: 0,
      wPx: mmToPx(100),
      hPx: null,
    });
  });

  it('reports clippedPx: null for an element wholly off the sheet', () => {
    const layout = layoutStaticPage(
      template({ body: [textEl('gone', { xMm: 300, yMm: 30, wMm: 20, hMm: 8 })] })
    );
    const [g] = layout.elements;
    expect(g.overflowsPage).toBe(true);
    expect(g.clippedPx).toBeNull();
  });

  it('keeps a zero-height line inside the page (not treated as off-page)', () => {
    // A `line` shape has zero height; it is visible and fully on the sheet, so
    // it must survive clipping with hPx: 0 rather than become clippedPx: null.
    const layout = layoutStaticPage(
      template({
        body: [
          { id: 'rule', type: 'shape', shape: 'line', frame: { xMm: 15, yMm: 60, wMm: 180, hMm: 0 }, z: 0 },
        ],
      })
    );
    const [rule] = layout.elements;
    expect(rule.overflowsPage).toBe(false);
    expect(rule.clippedPx).toEqual({
      xPx: mmToPx(15),
      yPx: mmToPx(60),
      wPx: mmToPx(180),
      hPx: 0,
    });
  });

  it('clips a null-height element horizontally and at the top, leaving hPx null', () => {
    const layout = layoutStaticPage(
      template({ body: [textEl('tbl', { xMm: 150, yMm: 30, wMm: 100, hMm: null })] })
    );
    const [t] = layout.elements;
    // overflow considers only known edges (x/width/top); width overflows here.
    expect(t.overflowsPage).toBe(true);
    expect(t.clippedPx).toEqual({
      xPx: mmToPx(150),
      yPx: mmToPx(30),
      wPx: layout.geometry.pagePx.widthPx - mmToPx(150),
      hPx: null,
    });
  });

  it('returns clippedPx: null for a null-height element below the sheet', () => {
    const layout = layoutStaticPage(
      template({ body: [textEl('tbl', { xMm: 15, yMm: 400, wMm: 100, hMm: null })] })
    );
    expect(layout.elements[0].clippedPx).toBeNull();
  });
});

describe('layoutStaticPage — certificate golden snapshot', () => {
  it('matches the committed baseline layout', () => {
    const layout = layoutStaticPage(goldenCertificateTemplate);
    expect(layout).toMatchSnapshot();
  });
});
