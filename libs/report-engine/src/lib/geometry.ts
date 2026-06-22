/**
 * Units & coordinate system — page & printable-area geometry (E3-S1).
 *
 * Given a resolved {@link Page} (named/custom size, orientation, margins), this
 * computes the two boxes the layout engine reasons about:
 *
 *  - the **page box** — the full sheet, and
 *  - the **printable area** — the page minus its margins, i.e. where body
 *    content may be placed.
 *
 * Both are produced in **mm** (authoring space) and **px** (render space, at a
 * configurable DPI via {@link computePageGeometry}). The printable area also
 * carries an **origin** (`left`/`top`) — the offset of the content box from the
 * page's top-left corner — so downstream placement (E3-S2) can translate
 * element frames into absolute page coordinates without re-deriving margins.
 *
 * Orientation is delegated to `resolvePageDimensionsMm` from `report-schema`,
 * which swaps named-size dimensions for landscape and takes custom sizes
 * literally.
 *
 * ## Validity is the caller's contract
 * This module assumes a page whose margins fit within its dimensions — exactly
 * what `validatePageSettings` (report-schema, E1-S2) enforces. It performs the
 * subtraction faithfully; it does **not** re-validate, so an unvalidated page
 * with oversized margins yields a non-positive printable dimension rather than
 * an error. Validate first.
 */

import type { Page } from '@rendara/report-schema';
import { resolvePageDimensionsMm } from '@rendara/report-schema';
import { DEFAULT_DPI, mmToPx } from './units';

/** A width/height box in millimetres (authoring space). */
export interface SizeMm {
  readonly widthMm: number;
  readonly heightMm: number;
}

/** A width/height box in pixels (render space, at a given DPI). */
export interface SizePx {
  readonly widthPx: number;
  readonly heightPx: number;
}

/**
 * The printable (content) area: its offset from the page's top-left corner and
 * its dimensions, in both mm and px. `leftMm`/`topMm` equal the left/top
 * margins; `rightMm`/`bottomMm` are kept for symmetry and downstream
 * convenience.
 */
export interface PrintableArea {
  readonly leftMm: number;
  readonly topMm: number;
  readonly rightMm: number;
  readonly bottomMm: number;
  readonly leftPx: number;
  readonly topPx: number;
  readonly rightPx: number;
  readonly bottomPx: number;
  readonly sizeMm: SizeMm;
  readonly sizePx: SizePx;
}

/** The full geometry of a page: its sheet box and its printable area. */
export interface PageGeometry {
  /** Dots-per-inch the px values were computed at. */
  readonly dpi: number;
  /** The full sheet. */
  readonly pageMm: SizeMm;
  readonly pagePx: SizePx;
  /** The page minus its margins. */
  readonly printable: PrintableArea;
}

/**
 * Computes the page and printable-area geometry for a resolved {@link Page} at
 * the given DPI (defaults to {@link DEFAULT_DPI} = 96).
 *
 * The page dimensions come from `resolvePageDimensionsMm` (orientation-aware);
 * the printable area is the page inset by each margin. All mm values are
 * converted to px once, here, so callers share one consistent coordinate space.
 */
export function computePageGeometry(
  page: Page,
  dpi: number = DEFAULT_DPI
): PageGeometry {
  const { widthMm, heightMm } = resolvePageDimensionsMm(
    page.size,
    page.orientation
  );
  const { top, right, bottom, left } = page.marginsMm;

  const contentWidthMm = widthMm - left - right;
  const contentHeightMm = heightMm - top - bottom;

  return {
    dpi,
    pageMm: { widthMm, heightMm },
    pagePx: { widthPx: mmToPx(widthMm, dpi), heightPx: mmToPx(heightMm, dpi) },
    printable: {
      leftMm: left,
      topMm: top,
      rightMm: right,
      bottomMm: bottom,
      leftPx: mmToPx(left, dpi),
      topPx: mmToPx(top, dpi),
      rightPx: mmToPx(right, dpi),
      bottomPx: mmToPx(bottom, dpi),
      sizeMm: { widthMm: contentWidthMm, heightMm: contentHeightMm },
      sizePx: {
        widthPx: mmToPx(contentWidthMm, dpi),
        heightPx: mmToPx(contentHeightMm, dpi),
      },
    },
  };
}
