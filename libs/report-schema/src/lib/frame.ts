/**
 * The absolute-positioned rectangle of an element on the page, expressed in the
 * template's authoring units (millimetres). The renderer converts these to px at
 * the current zoom (brief §7).
 *
 * `hMm` is nullable: a fixed element has a concrete height, while a growing
 * element (e.g. a data table that expands with its rows) sets `hMm: null` so the
 * pagination engine computes the height (brief §5).
 */
export interface Frame {
  readonly xMm: number;
  readonly yMm: number;
  readonly wMm: number;
  readonly hMm: number | null;
}
