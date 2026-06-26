import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, MIN_ZOOM } from '@rendara/report-renderer';

import {
  canZoomIn,
  canZoomOut,
  formatZoomPercent,
  isFitMode,
  zoomIn,
  zoomOptions,
  zoomOut,
  zoomSpecToValue,
  zoomValueToSpec,
  ZOOM_LEVELS,
} from './viewer-zoom';

/**
 * Unit tests for the pure zoom helpers (E7-S4). The fit-math itself is covered by
 * the shared renderer's `resolveZoomFactor` tests; here we exercise the viewer's
 * ladder stepping, bounds, percent formatting and the dropdown value/option model
 * exhaustively without mounting Angular.
 */

describe('isFitMode', () => {
  it('narrows the fit-mode keywords and rejects numeric specs', () => {
    expect(isFitMode('fit-width')).toBe(true);
    expect(isFitMode('fit-page')).toBe(true);
    expect(isFitMode(1)).toBe(false);
    expect(isFitMode(0.5)).toBe(false);
  });
});

describe('zoomIn', () => {
  it('steps up to the next ladder level above the current factor', () => {
    expect(zoomIn(1)).toBe(1.25);
    expect(zoomIn(0.5)).toBe(0.75);
  });

  it('steps up from a resolved fit factor that is between ladder rungs', () => {
    expect(zoomIn(0.62)).toBe(0.75);
    expect(zoomIn(0.26)).toBe(0.5);
  });

  it('clamps to MAX_ZOOM at and beyond the top of the ladder', () => {
    expect(zoomIn(3)).toBe(MAX_ZOOM);
    expect(zoomIn(MAX_ZOOM)).toBe(MAX_ZOOM);
    expect(zoomIn(10)).toBe(MAX_ZOOM);
  });
});

describe('zoomOut', () => {
  it('steps down to the next ladder level below the current factor', () => {
    expect(zoomOut(1)).toBe(0.75);
    expect(zoomOut(1.25)).toBe(1);
  });

  it('steps down from a resolved fit factor that is between ladder rungs', () => {
    expect(zoomOut(0.62)).toBe(0.5);
    expect(zoomOut(0.4)).toBe(0.25);
  });

  it('clamps to MIN_ZOOM at and below the bottom of the ladder', () => {
    expect(zoomOut(0.25)).toBe(MIN_ZOOM);
    expect(zoomOut(MIN_ZOOM)).toBe(MIN_ZOOM);
    expect(zoomOut(0.05)).toBe(MIN_ZOOM);
  });
});

describe('canZoomIn / canZoomOut', () => {
  it('reflects whether the resolved factor is inside the bounds', () => {
    expect(canZoomIn(1)).toBe(true);
    expect(canZoomOut(1)).toBe(true);
  });

  it('disables stepping at the respective bound', () => {
    expect(canZoomIn(MAX_ZOOM)).toBe(false);
    expect(canZoomOut(MIN_ZOOM)).toBe(false);
    expect(canZoomIn(MIN_ZOOM)).toBe(true);
    expect(canZoomOut(MAX_ZOOM)).toBe(true);
  });
});

describe('formatZoomPercent', () => {
  it('renders a whole-percent readout, rounding to the nearest percent', () => {
    expect(formatZoomPercent(1)).toBe('100%');
    expect(formatZoomPercent(0.5)).toBe('50%');
    expect(formatZoomPercent(0.625)).toBe('63%');
    expect(formatZoomPercent(2)).toBe('200%');
  });
});

describe('zoomSpecToValue / zoomValueToSpec', () => {
  it('round-trips fit modes', () => {
    expect(zoomSpecToValue('fit-width')).toBe('fit-width');
    expect(zoomValueToSpec('fit-width')).toBe('fit-width');
    expect(zoomValueToSpec('fit-page')).toBe('fit-page');
  });

  it('round-trips numeric factors', () => {
    expect(zoomSpecToValue(1)).toBe('1');
    expect(zoomSpecToValue(0.75)).toBe('0.75');
    expect(zoomValueToSpec('0.75')).toBe(0.75);
  });

  it('clamps an out-of-range numeric value', () => {
    expect(zoomValueToSpec('99')).toBe(MAX_ZOOM);
  });

  it('falls back to fit-width for an unparseable or non-positive value', () => {
    expect(zoomValueToSpec('nonsense')).toBe('fit-width');
    expect(zoomValueToSpec('0')).toBe('fit-width');
    expect(zoomValueToSpec('-1')).toBe('fit-width');
  });
});

describe('zoomOptions', () => {
  it('lists the two fit modes first, then the level ladder in order', () => {
    const options = zoomOptions('fit-width');
    expect(options[0]).toEqual({ value: 'fit-width', label: 'Fit width' });
    expect(options[1]).toEqual({ value: 'fit-page', label: 'Fit page' });
    const levels = options.slice(2).map((o) => Number(o.value));
    expect(levels).toEqual([...ZOOM_LEVELS]);
  });

  it('labels each level as a percent', () => {
    const hundred = zoomOptions('fit-width').find((o) => o.value === '1');
    expect(hundred?.label).toBe('100%');
  });

  it('always includes an option matching the active numeric spec, in order', () => {
    const options = zoomOptions(1.1);
    const match = options.find((o) => o.value === zoomSpecToValue(1.1));
    expect(match).toBeDefined();
    // The spliced level keeps the ladder sorted (1 before 1.1 before 1.25).
    const levels = options.slice(2).map((o) => Number(o.value));
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(levels).toContain(1.1);
  });

  it('does not duplicate a numeric spec already on the ladder', () => {
    const options = zoomOptions(1);
    const ones = options.filter((o) => o.value === '1');
    expect(ones).toHaveLength(1);
  });
});
