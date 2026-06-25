import { describe, expect, it } from 'vitest';
import type { Frame } from '@rendara/report-schema';
import { mmToPx } from '@rendara/report-engine';
import {
  MIN_SIZE_MM,
  RESIZE_HANDLES,
  moveFrame,
  nudgeFrame,
  nudgeStepMm,
  resizeFrame,
  selectionBoxPx,
} from './frame-ops';

/** A4 portrait sheet, the default page the canvas clamps frames within. */
const A4: { readonly widthMm: number; readonly heightMm: number } = {
  widthMm: 210,
  heightMm: 297,
};

const frame: Frame = { xMm: 50, yMm: 60, wMm: 40, hMm: 20 };

describe('moveFrame', () => {
  it('translates the frame and rounds to 0.1 mm', () => {
    expect(moveFrame(frame, 10.04, -5.06, A4)).toEqual({
      xMm: 60,
      yMm: 54.9,
      wMm: 40,
      hMm: 20,
    });
  });

  it('clamps the element onto the sheet (no negative origin)', () => {
    expect(moveFrame(frame, -1000, -1000, A4)).toMatchObject({ xMm: 0, yMm: 0 });
  });

  it('clamps the far edges so the whole element stays on the page', () => {
    // 40×20 on a 210×297 sheet → max origin (170, 277).
    expect(moveFrame(frame, 1000, 1000, A4)).toMatchObject({ xMm: 170, yMm: 277 });
  });

  it('clamps only the top of a growing (null-height) element', () => {
    const growing: Frame = { xMm: 10, yMm: 10, wMm: 120, hMm: null };
    expect(moveFrame(growing, 0, 1000, A4)).toMatchObject({ yMm: 297, hMm: null });
  });
});

describe('nudgeStepMm / nudgeFrame', () => {
  it('nudges 1 mm normally and 10 mm with Shift', () => {
    expect(nudgeStepMm(false)).toBe(1);
    expect(nudgeStepMm(true)).toBe(10);
  });

  it('nudges by translating and clamping like a move', () => {
    expect(nudgeFrame(frame, 1, 0, A4)).toMatchObject({ xMm: 51 });
    expect(nudgeFrame(frame, 0, -1, A4)).toMatchObject({ yMm: 59 });
  });
});

describe('resizeFrame', () => {
  it('grows the width from the east handle, pinning the left edge', () => {
    expect(resizeFrame(frame, 'e', 10, 0, A4)).toEqual({ xMm: 50, yMm: 60, wMm: 50, hMm: 20 });
  });

  it('moves the left edge from the west handle, pinning the right edge', () => {
    // Drag left edge +10 → x 60, w 30 (right edge 90 stays put).
    expect(resizeFrame(frame, 'w', 10, 0, A4)).toEqual({ xMm: 60, yMm: 60, wMm: 30, hMm: 20 });
  });

  it('grows the height from the south handle, pinning the top edge', () => {
    expect(resizeFrame(frame, 's', 0, 10, A4)).toEqual({ xMm: 50, yMm: 60, wMm: 40, hMm: 30 });
  });

  it('moves the top edge from the north handle, pinning the bottom edge', () => {
    expect(resizeFrame(frame, 'n', 0, 10, A4)).toEqual({ xMm: 50, yMm: 70, wMm: 40, hMm: 10 });
  });

  it('drags both axes from a corner handle', () => {
    expect(resizeFrame(frame, 'se', 10, 5, A4)).toEqual({ xMm: 50, yMm: 60, wMm: 50, hMm: 25 });
    expect(resizeFrame(frame, 'nw', 10, 5, A4)).toEqual({ xMm: 60, yMm: 65, wMm: 30, hMm: 15 });
  });

  it('stops the dragged edge at the minimum size rather than crossing its anchor', () => {
    // Pull the east edge far left: width floors at MIN_SIZE_MM, left edge stays.
    expect(resizeFrame(frame, 'e', -1000, 0, A4)).toMatchObject({ xMm: 50, wMm: MIN_SIZE_MM });
    // Pull the west edge far right: it stops MIN_SIZE_MM short of the right edge (90).
    expect(resizeFrame(frame, 'w', 1000, 0, A4)).toMatchObject({
      xMm: 90 - MIN_SIZE_MM,
      wMm: MIN_SIZE_MM,
    });
  });

  it('clamps a growing edge to the sheet bounds', () => {
    expect(resizeFrame(frame, 'e', 1000, 0, A4)).toMatchObject({ wMm: A4.widthMm - 50 });
    expect(resizeFrame(frame, 's', 0, 1000, A4)).toMatchObject({ hMm: A4.heightMm - 60 });
  });

  it('leaves an auto-height element growing — vertical handles never set a height', () => {
    const growing: Frame = { xMm: 10, yMm: 10, wMm: 120, hMm: null };
    expect(resizeFrame(growing, 's', 0, 50, A4)).toMatchObject({ hMm: null });
    expect(resizeFrame(growing, 'n', 0, 50, A4)).toMatchObject({ hMm: null, yMm: 10 });
    // Its width still resizes from a side handle.
    expect(resizeFrame(growing, 'e', 10, 0, A4)).toMatchObject({ wMm: 130, hMm: null });
  });

  it('exposes all eight handles', () => {
    expect([...RESIZE_HANDLES].sort()).toEqual(['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w']);
  });
});

describe('selectionBoxPx', () => {
  it('maps the frame to scaled px (mm → px at 96 dpi × zoom)', () => {
    const box = selectionBoxPx(frame, 2);
    expect(box.leftPx).toBeCloseTo(mmToPx(50) * 2, 6);
    expect(box.topPx).toBeCloseTo(mmToPx(60) * 2, 6);
    expect(box.widthPx).toBeCloseTo(mmToPx(40) * 2, 6);
    expect(box.heightPx).toBeCloseTo(mmToPx(20) * 2, 6);
  });

  it('uses the measured fallback height for a null- or zero-height element', () => {
    const growing: Frame = { xMm: 10, yMm: 10, wMm: 120, hMm: null };
    expect(selectionBoxPx(growing, 1, 84).heightPx).toBe(84);

    const line: Frame = { xMm: 10, yMm: 10, wMm: 40, hMm: 0 };
    expect(selectionBoxPx(line, 1, 3).heightPx).toBe(3);
  });
});
