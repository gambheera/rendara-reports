import type { Frame } from '@rendara/report-schema';

/**
 * The pure geometry behind the **align & distribute** tools (E5-S8). Both operate
 * on the current multi-selection's {@link Frame}s and return a new array (same
 * order) with adjusted positions — sizes are never touched. Everything here is
 * framework-agnostic so it is exhaustively unit-testable; the store wires it to
 * the selection and writes the result through `updateElementsById`.
 *
 * Positions are page-absolute millimetres, rounded to 0.1 mm (the placement
 * precision used throughout the designer). A growing/zero-height element
 * (`hMm: null`) is treated as zero height for the vertical operations, so its top
 * edge is what aligns/distributes.
 */

/** The six alignment edges — three horizontal, three vertical. */
export type AlignEdge = 'left' | 'hcenter' | 'right' | 'top' | 'vmiddle' | 'bottom';

/** The two distribute axes. */
export type DistributeAxis = 'horizontal' | 'vertical';

/** Rounds to 0.1 mm — matches the move/resize/snap maths. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** A frame's height, treating a growing/zero-height element as zero. */
function heightOf(frame: Frame): number {
  return frame.hMm ?? 0;
}

/**
 * Aligns every frame to the selection's bounding box along `edge`: e.g. `left`
 * pins each to the leftmost edge, `hcenter` centres them on the box's horizontal
 * mid-line, `bottom` lines their bottoms up with the lowest edge. Only the
 * relevant axis moves; the other coordinate and all sizes are preserved. Fewer
 * than two frames have nothing to align against, so the input is returned as-is.
 */
export function alignFrames(frames: readonly Frame[], edge: AlignEdge): Frame[] {
  if (frames.length < 2) return [...frames];

  const minX = Math.min(...frames.map((f) => f.xMm));
  const maxRight = Math.max(...frames.map((f) => f.xMm + f.wMm));
  const minY = Math.min(...frames.map((f) => f.yMm));
  const maxBottom = Math.max(...frames.map((f) => f.yMm + heightOf(f)));
  const centerX = (minX + maxRight) / 2;
  const middleY = (minY + maxBottom) / 2;

  return frames.map((f) => {
    switch (edge) {
      case 'left':
        return { ...f, xMm: round1(minX) };
      case 'right':
        return { ...f, xMm: round1(maxRight - f.wMm) };
      case 'hcenter':
        return { ...f, xMm: round1(centerX - f.wMm / 2) };
      case 'top':
        return { ...f, yMm: round1(minY) };
      case 'bottom':
        return { ...f, yMm: round1(maxBottom - heightOf(f)) };
      case 'vmiddle':
        return { ...f, yMm: round1(middleY - heightOf(f) / 2) };
    }
  });
}

/**
 * Distributes the frames so their centres are evenly spaced along `axis`. The two
 * extreme frames stay put and the rest are spread at equal intervals between them
 * — the standard "distribute centres" behaviour. Fewer than three frames have no
 * interior to space, so the input is returned unchanged.
 */
export function distributeFrames(frames: readonly Frame[], axis: DistributeAxis): Frame[] {
  if (frames.length < 3) return [...frames];

  const horizontal = axis === 'horizontal';
  const centerOf = (f: Frame): number => (horizontal ? f.xMm + f.wMm / 2 : f.yMm + heightOf(f) / 2);

  // Rank the frames by centre without disturbing the returned order.
  const order = frames.map((_, i) => i).sort((a, b) => centerOf(frames[a]) - centerOf(frames[b]));
  const firstCenter = centerOf(frames[order[0]]);
  const lastCenter = centerOf(frames[order[order.length - 1]]);
  const step = (lastCenter - firstCenter) / (order.length - 1);

  const result = [...frames];
  order.forEach((index, rank) => {
    const f = frames[index];
    const target = firstCenter + step * rank;
    result[index] = horizontal
      ? { ...f, xMm: round1(target - f.wMm / 2) }
      : { ...f, yMm: round1(target - heightOf(f) / 2) };
  });
  return result;
}
