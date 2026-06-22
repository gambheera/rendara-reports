import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DPI,
  MM_PER_INCH,
  PT_PER_INCH,
  inToPx,
  mmToPt,
  mmToPx,
  ptToMm,
  ptToPx,
  pxToIn,
  pxToMm,
  pxToPt,
  pxToUnit,
  unitToPx,
} from './units';

/** Tight tolerance for float comparisons of pure multiply/divide conversions. */
const EPS = 1e-9;

describe('constants', () => {
  it('uses the documented physical and CSS reference values', () => {
    expect(MM_PER_INCH).toBe(25.4);
    expect(PT_PER_INCH).toBe(72);
    expect(DEFAULT_DPI).toBe(96);
  });
});

describe('px conversions at the default 96 DPI', () => {
  it('1 inch = 96 px', () => {
    expect(inToPx(1)).toBe(96);
    expect(pxToIn(96)).toBe(1);
  });

  it('25.4 mm (1 inch) = 96 px', () => {
    expect(mmToPx(MM_PER_INCH)).toBeCloseTo(96, 9);
    expect(pxToMm(96)).toBeCloseTo(MM_PER_INCH, 9);
  });

  it('72 pt (1 inch) = 96 px', () => {
    expect(ptToPx(PT_PER_INCH)).toBeCloseTo(96, 9);
    expect(pxToPt(96)).toBeCloseTo(PT_PER_INCH, 9);
  });

  it('0 maps to 0 in every direction', () => {
    expect(mmToPx(0)).toBe(0);
    expect(ptToPx(0)).toBe(0);
    expect(inToPx(0)).toBe(0);
    expect(pxToMm(0)).toBe(0);
  });
});

describe('px conversions honour a configurable DPI', () => {
  it('300 DPI: 1 inch = 300 px', () => {
    expect(inToPx(1, 300)).toBe(300);
    expect(mmToPx(MM_PER_INCH, 300)).toBeCloseTo(300, 9);
    expect(ptToPx(PT_PER_INCH, 300)).toBeCloseTo(300, 9);
  });

  it('rejects a non-positive or non-finite DPI', () => {
    expect(() => mmToPx(10, 0)).toThrow(RangeError);
    expect(() => mmToPx(10, -96)).toThrow(RangeError);
    expect(() => inToPx(1, Number.NaN)).toThrow(RangeError);
    expect(() => pxToIn(1, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('mm <-> pt are DPI-independent', () => {
  it('25.4 mm = 72 pt', () => {
    expect(mmToPt(MM_PER_INCH)).toBeCloseTo(PT_PER_INCH, 9);
    expect(ptToMm(PT_PER_INCH)).toBeCloseTo(MM_PER_INCH, 9);
  });
});

describe('round-trips (QA)', () => {
  const samples = [0, 0.5, 1, 10, 12.7, 210, 297, 1234.5678];
  const dpis = [DEFAULT_DPI, 72, 150, 300];

  it('mm -> px -> mm preserves the value across DPIs', () => {
    for (const dpi of dpis) {
      for (const mm of samples) {
        expect(pxToMm(mmToPx(mm, dpi), dpi)).toBeCloseTo(mm, 9);
      }
    }
  });

  it('pt -> px -> pt preserves the value across DPIs', () => {
    for (const dpi of dpis) {
      for (const pt of samples) {
        expect(pxToPt(ptToPx(pt, dpi), dpi)).toBeCloseTo(pt, 9);
      }
    }
  });

  it('in -> px -> in preserves the value across DPIs', () => {
    for (const dpi of dpis) {
      for (const inches of samples) {
        expect(pxToIn(inToPx(inches, dpi), dpi)).toBeCloseTo(inches, 9);
      }
    }
  });

  it('mm -> pt -> mm preserves the value', () => {
    for (const mm of samples) {
      expect(ptToMm(mmToPt(mm))).toBeCloseTo(mm, 9);
    }
  });
});

describe('unitToPx / pxToUnit dispatch on the authoring unit', () => {
  it('matches the dedicated converter for each unit', () => {
    expect(unitToPx(10, 'mm')).toBeCloseTo(mmToPx(10), 9);
    expect(unitToPx(10, 'pt')).toBeCloseTo(ptToPx(10), 9);
    expect(unitToPx(2, 'in')).toBe(inToPx(2));

    expect(pxToUnit(96, 'mm')).toBeCloseTo(pxToMm(96), 9);
    expect(pxToUnit(96, 'pt')).toBeCloseTo(pxToPt(96), 9);
    expect(pxToUnit(96, 'in')).toBe(pxToIn(96));
  });

  it('round-trips per unit at a non-default DPI', () => {
    for (const unit of ['mm', 'pt', 'in'] as const) {
      expect(pxToUnit(unitToPx(42, unit, 150), unit, 150)).toBeCloseTo(42, EPS);
    }
  });
});
