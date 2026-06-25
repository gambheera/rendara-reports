import type { Frame } from '@rendara/report-schema';
import { MIN_SIZE_MM, type RectMm, type ResizeHandle } from './frame-ops';

/**
 * The pure geometry behind **snapping & alignment guides** (E5-S8): snapping a
 * value to the canvas grid, collecting the candidate guide lines an element can
 * align to (other elements' edges/centers, the page edges, the printable margins
 * and the page centre lines), and resolving the snap offset + visible guides for
 * a moving selection. Everything here is framework- and DOM-agnostic so it is
 * exhaustively unit-testable; the stateful seam (pointer wiring, the live guide
 * signal) lives in the `SelectionOverlay` component.
 *
 * All measurements are **page-absolute millimetres** (the authoring space frames
 * live in). The on-screen snap *threshold* is a pixel feel, so the component
 * converts it to mm at the current zoom and hands it in — keeping this core
 * deterministic. Offsets are rounded to 0.1 mm, matching the move/resize maths.
 */

/** The canvas snap grid, in mm — matches the 5 mm dotted grid the canvas paints. */
export const GRID_MM = 5;

/** Rounds to 0.1 mm — enough precision for placement, tidy enough for the model. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Snaps `mm` to the nearest multiple of `gridMm`. A non-positive grid is treated
 * as "no grid" and returns the value unchanged, so callers can disable grid snap
 * by passing `0`.
 */
export function snapValueToGrid(mm: number, gridMm: number): number {
  if (gridMm <= 0) return mm;
  return round1(Math.round(mm / gridMm) * gridMm);
}

/**
 * One candidate snap line: the coordinate (mm) the moving element can align to,
 * plus the perpendicular span of whatever produced it (an element's box, or the
 * full page), so the rendered guide can stretch tidily between the two.
 */
export interface SnapTarget {
  readonly posMm: number;
  readonly minMm: number;
  readonly maxMm: number;
}

/** Candidate snap lines split by orientation: vertical (x) and horizontal (y). */
export interface SnapTargets {
  /** Vertical guide lines — `posMm` is an x coordinate; the span is in y. */
  readonly vertical: readonly SnapTarget[];
  /** Horizontal guide lines — `posMm` is a y coordinate; the span is in x. */
  readonly horizontal: readonly SnapTarget[];
}

/** The minimal page geometry snapping needs (structurally a {@link PageGeometry}). */
export interface SnapGeometry {
  readonly pageMm: { readonly widthMm: number; readonly heightMm: number };
  readonly printable: {
    readonly leftMm: number;
    readonly topMm: number;
    readonly rightMm: number;
    readonly bottomMm: number;
  };
}

/** A bottom edge that treats a growing/zero-height element as its top edge. */
function bottomOf(frame: Frame): number {
  return frame.yMm + (frame.hMm ?? 0);
}

/**
 * Collects every line a moving element may snap to: each `other` element's
 * left/center/right (vertical) and top/middle/bottom (horizontal) edges, plus the
 * page's own edges, centre lines and printable-margin lines. Element targets span
 * only that element's box; page-level targets span the full page so their guide
 * reads as a page reference. A growing element contributes its top edge as its
 * bottom (it has no authored height).
 */
export function snapTargets(others: readonly Frame[], geo: SnapGeometry): SnapTargets {
  const { widthMm, heightMm } = geo.pageMm;
  const { leftMm, topMm, rightMm, bottomMm } = geo.printable;
  const vertical: SnapTarget[] = [];
  const horizontal: SnapTarget[] = [];

  for (const f of others) {
    const span = { minMm: f.yMm, maxMm: bottomOf(f) };
    vertical.push(
      { posMm: f.xMm, ...span },
      { posMm: f.xMm + f.wMm / 2, ...span },
      { posMm: f.xMm + f.wMm, ...span },
    );
    const hspan = { minMm: f.xMm, maxMm: f.xMm + f.wMm };
    horizontal.push(
      { posMm: f.yMm, ...hspan },
      { posMm: bottomOf(f), ...hspan },
      { posMm: f.yMm + (f.hMm ?? 0) / 2, ...hspan },
    );
  }

  // Page edges, centre line and printable margins span the whole sheet.
  const pageY = { minMm: 0, maxMm: heightMm };
  const pageX = { minMm: 0, maxMm: widthMm };
  for (const x of [0, widthMm, widthMm / 2, leftMm, widthMm - rightMm]) {
    vertical.push({ posMm: x, ...pageY });
  }
  for (const y of [0, heightMm, heightMm / 2, topMm, heightMm - bottomMm]) {
    horizontal.push({ posMm: y, ...pageX });
  }

  return { vertical, horizontal };
}

/** A visible alignment guide: the axis it runs along, its position and span (mm). */
export interface SnapLine {
  /** `'x'` for a vertical line (constant x); `'y'` for a horizontal line. */
  readonly axis: 'x' | 'y';
  readonly posMm: number;
  /** Perpendicular span — the extent the guide is drawn across. */
  readonly startMm: number;
  readonly endMm: number;
}

/** The snap adjustment for a drag-move: the extra offset to apply, and the guides. */
export interface SnapResult {
  readonly dxMm: number;
  readonly dyMm: number;
  readonly guides: readonly SnapLine[];
}

/** The three snap candidates along one axis of a moving box: start, centre, end. */
function axisCandidates(start: number, size: number): readonly number[] {
  return [start, start + size / 2, start + size];
}

/** The closest target within `thresholdMm` of any candidate, or `null`. */
function bestSnap(
  candidates: readonly number[],
  targets: readonly SnapTarget[],
  thresholdMm: number,
): { readonly offset: number; readonly target: SnapTarget } | null {
  let best: { offset: number; target: SnapTarget; abs: number } | null = null;
  for (const target of targets) {
    for (const candidate of candidates) {
      const diff = target.posMm - candidate;
      const abs = Math.abs(diff);
      if (abs <= thresholdMm && (best === null || abs < best.abs)) {
        best = { offset: diff, target, abs };
      }
    }
  }
  return best === null ? null : { offset: best.offset, target: best.target };
}

/**
 * Resolves the snap for a moving selection whose current bounding box is
 * `moving`. Each axis is handled independently: if any of the box's edges/centre
 * lands within `thresholdMm` of a {@link SnapTarget}, the box snaps to the closest
 * one and a guide line is emitted (spanning the target and the box); otherwise the
 * box origin falls back to the nearest grid line (no guide — grid snaps are
 * silent). When `snapEnabled` is false nothing snaps and no guides show.
 */
export function computeSnap(
  moving: RectMm,
  targets: SnapTargets,
  thresholdMm: number,
  gridMm: number,
  snapEnabled: boolean,
): SnapResult {
  if (!snapEnabled) return { dxMm: 0, dyMm: 0, guides: [] };

  const guides: SnapLine[] = [];
  const top = moving.yMm;
  const bottom = moving.yMm + moving.hMm;
  const left = moving.xMm;
  const right = moving.xMm + moving.wMm;

  const xSnap = bestSnap(axisCandidates(moving.xMm, moving.wMm), targets.vertical, thresholdMm);
  let dxMm: number;
  if (xSnap !== null) {
    dxMm = round1(xSnap.offset);
    guides.push({
      axis: 'x',
      posMm: round1(xSnap.target.posMm),
      startMm: Math.min(xSnap.target.minMm, top),
      endMm: Math.max(xSnap.target.maxMm, bottom),
    });
  } else {
    dxMm = round1(snapValueToGrid(moving.xMm, gridMm) - moving.xMm);
  }

  const ySnap = bestSnap(axisCandidates(moving.yMm, moving.hMm), targets.horizontal, thresholdMm);
  let dyMm: number;
  if (ySnap !== null) {
    dyMm = round1(ySnap.offset);
    guides.push({
      axis: 'y',
      posMm: round1(ySnap.target.posMm),
      startMm: Math.min(ySnap.target.minMm, left),
      endMm: Math.max(ySnap.target.maxMm, right),
    });
  } else {
    dyMm = round1(snapValueToGrid(moving.yMm, gridMm) - moving.yMm);
  }

  return { dxMm, dyMm, guides };
}

/** Whether a handle drags the given edge — mirrors the resize maths in `frame-ops`. */
function movesLeft(handle: ResizeHandle): boolean {
  return handle === 'nw' || handle === 'w' || handle === 'sw';
}
function movesRight(handle: ResizeHandle): boolean {
  return handle === 'ne' || handle === 'e' || handle === 'se';
}
function movesTop(handle: ResizeHandle): boolean {
  return handle === 'nw' || handle === 'n' || handle === 'ne';
}
function movesBottom(handle: ResizeHandle): boolean {
  return handle === 'sw' || handle === 's' || handle === 'se';
}

/**
 * Snaps the **moved edges** of an already-resized `frame` to the grid (E5-S8 grid
 * snap for resize). Only the edges the `handle` owns move; the opposite edges stay
 * pinned, and each axis keeps its {@link MIN_SIZE_MM} floor so the element never
 * collapses. A growing element (`hMm: null`) has no vertical edge to snap. A
 * non-positive grid leaves the frame untouched.
 */
export function snapResizedFrame(frame: Frame, handle: ResizeHandle, gridMm: number): Frame {
  if (gridMm <= 0) return frame;
  let { xMm, yMm, wMm, hMm } = frame;

  if (movesLeft(handle)) {
    const rightEdge = frame.xMm + frame.wMm;
    const snapped = Math.min(snapValueToGrid(frame.xMm, gridMm), rightEdge - MIN_SIZE_MM);
    xMm = snapped;
    wMm = round1(rightEdge - snapped);
  } else if (movesRight(handle)) {
    const snapped = Math.max(
      snapValueToGrid(frame.xMm + frame.wMm, gridMm),
      frame.xMm + MIN_SIZE_MM,
    );
    wMm = round1(snapped - frame.xMm);
  }

  if (hMm !== null) {
    if (movesTop(handle)) {
      const bottomEdge = frame.yMm + hMm;
      const snapped = Math.min(snapValueToGrid(frame.yMm, gridMm), bottomEdge - MIN_SIZE_MM);
      yMm = snapped;
      hMm = round1(bottomEdge - snapped);
    } else if (movesBottom(handle)) {
      const snapped = Math.max(snapValueToGrid(frame.yMm + hMm, gridMm), frame.yMm + MIN_SIZE_MM);
      hMm = round1(snapped - frame.yMm);
    }
  }

  return { ...frame, xMm, yMm, wMm, hMm };
}
