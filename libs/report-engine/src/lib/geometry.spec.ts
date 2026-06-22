import { describe, expect, it } from 'vitest';
import { resolvePage } from '@rendara/report-schema';

import { computePageGeometry } from './geometry';
import { mmToPx } from './units';

describe('computePageGeometry — A4 portrait (defaults)', () => {
  const geo = computePageGeometry(resolvePage({ size: 'A4' }));

  it('reports the A4 sheet in mm and px at 96 DPI', () => {
    expect(geo.dpi).toBe(96);
    expect(geo.pageMm).toEqual({ widthMm: 210, heightMm: 297 });
    expect(geo.pagePx.widthPx).toBeCloseTo(793.700787, 5);
    expect(geo.pagePx.heightPx).toBeCloseTo(1122.519685, 5);
  });

  it('insets the printable area by the default 15/20 mm margins', () => {
    // 210 - 15 - 15 = 180 ; 297 - 20 - 20 = 257
    expect(geo.printable.sizeMm).toEqual({ widthMm: 180, heightMm: 257 });
    expect(geo.printable.sizePx.widthPx).toBeCloseTo(mmToPx(180), 9);
    expect(geo.printable.sizePx.heightPx).toBeCloseTo(mmToPx(257), 9);
  });

  it('places the printable origin at the top/left margins', () => {
    expect(geo.printable.leftMm).toBe(15);
    expect(geo.printable.topMm).toBe(20);
    expect(geo.printable.rightMm).toBe(15);
    expect(geo.printable.bottomMm).toBe(20);
    expect(geo.printable.leftPx).toBeCloseTo(mmToPx(15), 9);
    expect(geo.printable.topPx).toBeCloseTo(mmToPx(20), 9);
  });
});

describe('computePageGeometry — Letter portrait (defaults)', () => {
  const geo = computePageGeometry(resolvePage({ size: 'Letter' }));

  it('reports the Letter sheet in mm and px', () => {
    expect(geo.pageMm).toEqual({ widthMm: 215.9, heightMm: 279.4 });
    expect(geo.pagePx.widthPx).toBeCloseTo(mmToPx(215.9), 9);
    expect(geo.pagePx.heightPx).toBeCloseTo(mmToPx(279.4), 9);
  });

  it('insets the printable area by the default margins', () => {
    expect(geo.printable.sizeMm.widthMm).toBeCloseTo(215.9 - 30, 9);
    expect(geo.printable.sizeMm.heightMm).toBeCloseTo(279.4 - 40, 9);
  });
});

describe('computePageGeometry — orientation', () => {
  it('swaps named-size dimensions for landscape', () => {
    const geo = computePageGeometry(
      resolvePage({ size: 'A4', orientation: 'landscape' })
    );
    expect(geo.pageMm).toEqual({ widthMm: 297, heightMm: 210 });
    // 297 - 30 = 267 ; 210 - 40 = 170
    expect(geo.printable.sizeMm).toEqual({ widthMm: 267, heightMm: 170 });
  });
});

describe('computePageGeometry — custom size', () => {
  it('takes custom dimensions literally and applies margins', () => {
    const geo = computePageGeometry(
      resolvePage({
        size: { widthMm: 100, heightMm: 200 },
        marginsMm: { top: 10, right: 5, bottom: 10, left: 5 },
      })
    );
    expect(geo.pageMm).toEqual({ widthMm: 100, heightMm: 200 });
    expect(geo.printable.sizeMm).toEqual({ widthMm: 90, heightMm: 180 });
  });

  it('ignores orientation for custom sizes', () => {
    const portrait = computePageGeometry(
      resolvePage({ size: { widthMm: 100, heightMm: 200 } })
    );
    const landscape = computePageGeometry(
      resolvePage({
        size: { widthMm: 100, heightMm: 200 },
        orientation: 'landscape',
      })
    );
    expect(landscape.pageMm).toEqual(portrait.pageMm);
  });
});

describe('computePageGeometry — DPI', () => {
  it('scales px values at a print resolution while mm stay fixed', () => {
    const geo = computePageGeometry(resolvePage({ size: 'A4' }), 300);
    expect(geo.dpi).toBe(300);
    expect(geo.pageMm).toEqual({ widthMm: 210, heightMm: 297 });
    expect(geo.pagePx.widthPx).toBeCloseTo(mmToPx(210, 300), 9);
    expect(geo.printable.sizePx.widthPx).toBeCloseTo(mmToPx(180, 300), 9);
  });
});
