import type { Frame } from '@rendara/report-schema';
import { mmToPx } from '@rendara/report-engine';
import type { PageSizeMm } from './drag-create';

/**
 * The pure geometry behind direct manipulation (E5-S6): moving, resizing and
 * keyboard-nudging an element's {@link Frame}, plus mapping a frame to the
 * scaled-px box the selection overlay paints. Everything here is framework- and
 * DOM-agnostic so it is exhaustively unit-testable; the stateful seam (pointer
 * wiring, store mutation, focus) lives in the `SelectionOverlay` component.
 *
 * Frames are in **page-absolute millimetres** (the authoring space the engine
 * lays out against). Positions are rounded to 0.1 mm — the same precision the
 * drag-create placement uses — and clamped so the element stays on the sheet.
 */

/** The eight resize grips, named by the compass edge/corner they drag. */
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/** All eight handles in paint order (corners + edges), for the overlay `@for`. */
export const RESIZE_HANDLES: readonly ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Smallest width/height (mm) a resize may leave, so an element never collapses. */
export const MIN_SIZE_MM = 5;

/** Keyboard nudge distances (mm): a fine 1 mm step, or 10 mm with Shift held. */
export const NUDGE_STEP_MM = 1;
export const NUDGE_STEP_COARSE_MM = 10;

/** The nudge distance for an arrow press — coarse (10 mm) when Shift is held. */
export function nudgeStepMm(shift: boolean): number {
  return shift ? NUDGE_STEP_COARSE_MM : NUDGE_STEP_MM;
}

/** Rounds to 0.1 mm — enough precision for placement, tidy enough for the model. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Clamps `value` into the inclusive `[lo, hi]` range. */
function clampRange(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/**
 * Translates `frame` by `(dxMm, dyMm)` and clamps the whole element onto the
 * sheet. A growing element (`hMm: null`) has no height to clamp against its
 * bottom edge, so only its top is held on the page (matching `frameForDrop`).
 * Used by both drag-move and keyboard nudge.
 */
export function moveFrame(frame: Frame, dxMm: number, dyMm: number, pageMm: PageSizeMm): Frame {
  const maxXMm = Math.max(0, pageMm.widthMm - frame.wMm);
  const maxYMm = frame.hMm === null ? pageMm.heightMm : Math.max(0, pageMm.heightMm - frame.hMm);
  return {
    ...frame,
    xMm: clampRange(round1(frame.xMm + dxMm), 0, maxXMm),
    yMm: clampRange(round1(frame.yMm + dyMm), 0, maxYMm),
  };
}

/** Keyboard nudge: a clamped, rounded translation by whole-/coarse-step mm. */
export function nudgeFrame(frame: Frame, dxMm: number, dyMm: number, pageMm: PageSizeMm): Frame {
  return moveFrame(frame, dxMm, dyMm, pageMm);
}

/** Whether a handle drags the given edge — drives which sides a resize moves. */
function handleMovesLeft(handle: ResizeHandle): boolean {
  return handle === 'nw' || handle === 'w' || handle === 'sw';
}
function handleMovesRight(handle: ResizeHandle): boolean {
  return handle === 'ne' || handle === 'e' || handle === 'se';
}
function handleMovesTop(handle: ResizeHandle): boolean {
  return handle === 'nw' || handle === 'n' || handle === 'ne';
}
function handleMovesBottom(handle: ResizeHandle): boolean {
  return handle === 'sw' || handle === 's' || handle === 'se';
}

/**
 * Resizes `frame` by dragging `handle` by `(dxMm, dyMm)`. Only the edges the
 * handle owns move; the opposite edges stay pinned. Each axis honours a
 * {@link MIN_SIZE_MM} floor (the dragged edge stops rather than crossing its
 * anchor) and is clamped so the element stays on the sheet. A growing element
 * (`hMm: null`) keeps its auto height — the vertical handles only reposition or
 * are inert; its width still resizes from the side handles.
 */
export function resizeFrame(
  frame: Frame,
  handle: ResizeHandle,
  dxMm: number,
  dyMm: number,
  pageMm: PageSizeMm,
): Frame {
  let { xMm, yMm, wMm, hMm } = frame;

  if (handleMovesLeft(handle)) {
    // Left edge moves; right edge (xMm + wMm) is pinned.
    const right = frame.xMm + frame.wMm;
    const nextLeft = clampRange(round1(frame.xMm + dxMm), 0, right - MIN_SIZE_MM);
    xMm = nextLeft;
    wMm = round1(right - nextLeft);
  } else if (handleMovesRight(handle)) {
    // Right edge moves; left edge (xMm) is pinned.
    const maxWidth = pageMm.widthMm - frame.xMm;
    wMm = clampRange(round1(frame.wMm + dxMm), MIN_SIZE_MM, maxWidth);
  }

  if (hMm !== null) {
    if (handleMovesTop(handle)) {
      // Top edge moves; bottom edge (yMm + hMm) is pinned.
      const bottom = frame.yMm + hMm;
      const nextTop = clampRange(round1(frame.yMm + dyMm), 0, bottom - MIN_SIZE_MM);
      yMm = nextTop;
      hMm = round1(bottom - nextTop);
    } else if (handleMovesBottom(handle)) {
      // Bottom edge moves; top edge (yMm) is pinned.
      const maxHeight = pageMm.heightMm - frame.yMm;
      hMm = clampRange(round1(hMm + dyMm), MIN_SIZE_MM, maxHeight);
    }
  }

  return { ...frame, xMm, yMm, wMm, hMm };
}

/** A scaled-px box on the canvas: the rectangle the selection overlay paints. */
export interface SelectionBoxPx {
  readonly leftPx: number;
  readonly topPx: number;
  readonly widthPx: number;
  readonly heightPx: number;
}

/**
 * Maps a frame to its on-screen box on the rendered sheet: natural px (mm → px
 * at 96 dpi) scaled by `zoom`, page-1 relative (matching how a body element is
 * laid onto the page). A growing/zero-height element (`hMm: null` or `0`) has no
 * authored height, so the caller supplies the element's measured pixel height
 * (already scaled) via `fallbackHeightPx`.
 */
export function selectionBoxPx(frame: Frame, zoom: number, fallbackHeightPx = 0): SelectionBoxPx {
  const heightPx =
    frame.hMm === null || frame.hMm === 0 ? fallbackHeightPx : mmToPx(frame.hMm) * zoom;
  return {
    leftPx: mmToPx(frame.xMm) * zoom,
    topPx: mmToPx(frame.yMm) * zoom,
    widthPx: mmToPx(frame.wMm) * zoom,
    heightPx,
  };
}
