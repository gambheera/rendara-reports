import { describe, expect, it } from 'vitest';
import type { Frame } from '@rendara/report-schema';
import type { RectMm } from './frame-ops';
import {
  GRID_MM,
  type SnapGeometry,
  computeSnap,
  snapResizedFrame,
  snapTargets,
  snapValueToGrid,
} from './snapping';

/** A small page geometry for the snap tests (asymmetric margins to keep them honest). */
const GEO: SnapGeometry = {
  pageMm: { widthMm: 200, heightMm: 300 },
  printable: { leftMm: 15, topMm: 20, rightMm: 25, bottomMm: 30 },
};

/** Disables guide targets so a test exercises grid snapping in isolation. */
const NO_TARGETS = { vertical: [], horizontal: [] };

describe('snapValueToGrid', () => {
  it('rounds to the nearest grid multiple', () => {
    expect(snapValueToGrid(12, 5)).toBe(10);
    expect(snapValueToGrid(13, 5)).toBe(15);
    expect(snapValueToGrid(12.5, 5)).toBe(15); // .5 rounds up
  });

  it('leaves the value unchanged for a non-positive grid', () => {
    expect(snapValueToGrid(7.3, 0)).toBe(7.3);
    expect(snapValueToGrid(7.3, -5)).toBe(7.3);
  });
});

describe('snapTargets', () => {
  it('emits page edges, centre lines and printable margins with no elements', () => {
    const { vertical, horizontal } = snapTargets([], GEO);
    expect(vertical.map((t) => t.posMm)).toEqual([0, 200, 100, 15, 175]);
    expect(horizontal.map((t) => t.posMm)).toEqual([0, 300, 150, 20, 270]);
    // Page-level guides span the whole sheet.
    expect(vertical[0]).toMatchObject({ minMm: 0, maxMm: 300 });
    expect(horizontal[0]).toMatchObject({ minMm: 0, maxMm: 200 });
  });

  it("adds an element's left/centre/right and top/middle/bottom edges", () => {
    const el: Frame = { xMm: 50, yMm: 60, wMm: 20, hMm: 10 };
    const { vertical, horizontal } = snapTargets([el], GEO);
    expect(vertical.slice(0, 3).map((t) => t.posMm)).toEqual([50, 60, 70]);
    expect(horizontal.slice(0, 3).map((t) => t.posMm)).toEqual([60, 70, 65]);
    // The vertical guide spans the element's y-range.
    expect(vertical[0]).toMatchObject({ minMm: 60, maxMm: 70 });
  });

  it('treats a growing element as its top edge for the bottom/middle', () => {
    const grow: Frame = { xMm: 10, yMm: 40, wMm: 30, hMm: null };
    const { horizontal } = snapTargets([grow], GEO);
    expect(horizontal.slice(0, 3).map((t) => t.posMm)).toEqual([40, 40, 40]);
  });
});

describe('computeSnap', () => {
  const movingAt = (xMm: number, yMm: number): RectMm => ({ xMm, yMm, wMm: 20, hMm: 10 });
  const threshold = 3;

  it('snaps a near edge to an element guide and reports it', () => {
    const targets = snapTargets([{ xMm: 50, yMm: 60, wMm: 20, hMm: 10 }], GEO);
    // Left edge at 48 is 2 mm from the element's left at 50 (within threshold).
    const result = computeSnap(movingAt(48, 200), targets, threshold, GRID_MM, true);
    expect(result.dxMm).toBe(2);
    expect(result.guides).toHaveLength(1);
    expect(result.guides[0]).toMatchObject({ axis: 'x', posMm: 50 });
    // The guide spans from the element top (60) to the moving box bottom (210).
    expect(result.guides[0]).toMatchObject({ startMm: 60, endMm: 210 });
  });

  it('falls back to grid snap (no guide) when nothing is within threshold', () => {
    // y has no nearby target; 203 grid-snaps to 205, silently.
    const result = computeSnap(movingAt(100, 203), NO_TARGETS, threshold, GRID_MM, true);
    expect(result.dyMm).toBe(2);
    expect(result.guides).toHaveLength(0);
  });

  it('picks the closest target when several are in range', () => {
    const targets = {
      vertical: [
        { posMm: 47, minMm: 0, maxMm: 10 },
        { posMm: 49, minMm: 0, maxMm: 10 },
      ],
      horizontal: [],
    };
    // Left edge 48: 49 is closer (1) than 47 (1)… tie → first wins (47, offset -1).
    expect(computeSnap(movingAt(48, 0), targets, threshold, 0, true).dxMm).toBe(-1);
    // Move the box so only the nearer one is decisive.
    expect(computeSnap(movingAt(50, 0), targets, threshold, 0, true).dxMm).toBe(-1);
  });

  it('does nothing and shows no guides when snapping is disabled', () => {
    const targets = snapTargets([{ xMm: 50, yMm: 60, wMm: 20, hMm: 10 }], GEO);
    const result = computeSnap(movingAt(48, 203), targets, threshold, GRID_MM, false);
    expect(result).toEqual({ dxMm: 0, dyMm: 0, guides: [] });
  });
});

describe('snapResizedFrame', () => {
  it('snaps a dragged east edge to the grid, growing the width', () => {
    const out = snapResizedFrame({ xMm: 50, yMm: 60, wMm: 23, hMm: 10 }, 'e', 5);
    // right edge 73 → 75 → width 25; left edge pinned.
    expect(out).toMatchObject({ xMm: 50, wMm: 25 });
  });

  it('snaps a dragged west edge to the grid, pinning the right edge', () => {
    const out = snapResizedFrame({ xMm: 12, yMm: 0, wMm: 20, hMm: 10 }, 'w', 5);
    // right edge stays at 32; left snaps 12 → 10 → width 22.
    expect(out).toMatchObject({ xMm: 10, wMm: 22 });
  });

  it('snaps a dragged south edge to the grid, growing the height', () => {
    const out = snapResizedFrame({ xMm: 0, yMm: 20, wMm: 10, hMm: 23 }, 's', 5);
    // bottom edge 43 → 45 → height 25.
    expect(out).toMatchObject({ yMm: 20, hMm: 25 });
  });

  it('leaves a growing element vertically untouched', () => {
    const frame: Frame = { xMm: 0, yMm: 0, wMm: 20, hMm: null };
    expect(snapResizedFrame(frame, 's', 5)).toEqual(frame);
  });

  it('returns the frame unchanged for a non-positive grid', () => {
    const frame: Frame = { xMm: 12, yMm: 0, wMm: 23, hMm: 10 };
    expect(snapResizedFrame(frame, 'e', 0)).toBe(frame);
  });
});
