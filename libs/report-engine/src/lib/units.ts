/**
 * Units & coordinate system — unit conversion (E3-S1).
 *
 * The template authors in physical units (`mm`, with `pt`/`in` as options;
 * brief §12.3), but every renderer ultimately positions in **px**. This module
 * is the single, deterministic place those conversions live, so the pagination
 * engine (E3-S2+) and the shared renderer (E4) never reinvent — or disagree on —
 * the arithmetic.
 *
 * ## DPI is configurable; the physical constants are not
 * `mm`, `pt` and `in` are all *physical* lengths with fixed ratios
 * ({@link MM_PER_INCH}, {@link PT_PER_INCH}), so converting **between** them is
 * DPI-independent and exact-up-to-float. Only the bridge to/from `px` depends on
 * a resolution: a `px` is a device dot, and how many dots span an inch is the
 * **DPI**. We default to {@link DEFAULT_DPI} = 96, the CSS reference pixel, but
 * every `px` function takes an optional `dpi` so callers (print, export, a
 * high-DPI preview) can pick another. Zoom is **not** modelled here — it is a
 * renderer concern layered on top of this base conversion (E4).
 *
 * ## Round-tripping
 * `pxToX(xToPx(v)) === v` and `xToPx(pxToX(v)) === v` hold up to floating-point
 * representation (the conversions are pure multiply/divide by the same factor),
 * which the QA round-trip tests assert within a tight epsilon.
 */

import type { AuthoringUnit } from '@rendara/report-schema';

/** Millimetres per inch (exact, by definition of the inch). */
export const MM_PER_INCH = 25.4;

/** PostScript points per inch (exact: a `pt` is 1/72 inch). */
export const PT_PER_INCH = 72;

/**
 * Default dots-per-inch for `px` conversions: 96, the CSS reference pixel
 * (1 CSS px = 1/96 inch). Override per call for print/export resolutions.
 */
export const DEFAULT_DPI = 96;

function assertPositiveDpi(dpi: number): void {
  if (!Number.isFinite(dpi) || dpi <= 0) {
    throw new RangeError(`DPI must be a positive, finite number, got ${dpi}.`);
  }
}

/** Inches → px at the given DPI. */
export function inToPx(inches: number, dpi: number = DEFAULT_DPI): number {
  assertPositiveDpi(dpi);
  return inches * dpi;
}

/** Px → inches at the given DPI. */
export function pxToIn(px: number, dpi: number = DEFAULT_DPI): number {
  assertPositiveDpi(dpi);
  return px / dpi;
}

/** Millimetres → px at the given DPI. */
export function mmToPx(mm: number, dpi: number = DEFAULT_DPI): number {
  return inToPx(mm / MM_PER_INCH, dpi);
}

/** Px → millimetres at the given DPI. */
export function pxToMm(px: number, dpi: number = DEFAULT_DPI): number {
  return pxToIn(px, dpi) * MM_PER_INCH;
}

/** Points → px at the given DPI. */
export function ptToPx(pt: number, dpi: number = DEFAULT_DPI): number {
  return inToPx(pt / PT_PER_INCH, dpi);
}

/** Px → points at the given DPI. */
export function pxToPt(px: number, dpi: number = DEFAULT_DPI): number {
  return pxToIn(px, dpi) * PT_PER_INCH;
}

/** Millimetres → points (DPI-independent). */
export function mmToPt(mm: number): number {
  return (mm / MM_PER_INCH) * PT_PER_INCH;
}

/** Points → millimetres (DPI-independent). */
export function ptToMm(pt: number): number {
  return (pt / PT_PER_INCH) * MM_PER_INCH;
}

/**
 * Converts a value expressed in the template's {@link AuthoringUnit} to px at
 * the given DPI. This is the entry point the layout engine uses when it only
 * knows the value's unit at runtime (from `page.units`).
 */
export function unitToPx(
  value: number,
  unit: AuthoringUnit,
  dpi: number = DEFAULT_DPI
): number {
  switch (unit) {
    case 'mm':
      return mmToPx(value, dpi);
    case 'pt':
      return ptToPx(value, dpi);
    case 'in':
      return inToPx(value, dpi);
  }
}

/**
 * Converts a px value back to the template's {@link AuthoringUnit} at the given
 * DPI — the inverse of {@link unitToPx}.
 */
export function pxToUnit(
  px: number,
  unit: AuthoringUnit,
  dpi: number = DEFAULT_DPI
): number {
  switch (unit) {
    case 'mm':
      return pxToMm(px, dpi);
    case 'pt':
      return pxToPt(px, dpi);
    case 'in':
      return pxToIn(px, dpi);
  }
}
