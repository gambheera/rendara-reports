/**
 * Static single-page layout (E3-S2) — the engine pass that places an element's
 * authored {@link Frame} onto a concrete page as an **absolute px box**.
 *
 * It sits directly on top of the E3-S1 coordinate system: {@link
 * computePageGeometry} gives the page/printable geometry, and {@link mmToPx}
 * does the conversion, so this module never reinvents either. Its job is the
 * three things the static layout owes a downstream renderer (brief §7):
 * frames → absolute px boxes, a deterministic **z-order**, and **clipping**.
 *
 * ## What this pass does NOT do
 * This is the *static* layout: it places fixed elements only. It does **not**
 * resolve data bindings (that is E2, already done by the resolver), expand data
 * tables from their bound array (E3-S3), or break content across pages (E3-S4).
 * An element whose frame has a `null` height — a growing data table — is laid
 * out faithfully with `hPx: null` carried through; computing that height is
 * E3-S3's concern, not this one.
 *
 * ## Coordinate system: frames are page-absolute
 * A {@link Frame} is authored in **page-absolute millimetres** — its origin is
 * the page's top-left corner, not the printable area. The golden fixtures rely
 * on this: the certificate's border sits at `xMm: 10` (inside the 10 mm page
 * margin, *outside* the 15 mm printable area) and header/footer chrome lives in
 * the top/bottom margins by design. So this pass converts each frame straight to
 * px against the page box; it does **not** offset by the printable origin.
 *
 * ## Paint order (z-order)
 * All elements across the `header`, `body` and `footer` bands are flattened into
 * one paint list sorted by `z` **ascending** (lower z paints first / sits
 * behind). Ties are broken deterministically by band order (`header` → `body` →
 * `footer`) and then by document order within the band, so the output is stable
 * for snapshot tests and identical across runs.
 *
 * ## Clipping rules
 * 1. The **page sheet** is the clip boundary. Each element's px box is
 *    intersected with the page box to give {@link LaidOutElement.clippedPx} — the
 *    visible region. An element wholly off the sheet yields `null`;
 *    {@link LaidOutElement.overflowsPage} flags any box that is not fully
 *    contained by the page.
 * 2. Content is **not** clipped to the printable area. Margins legitimately hold
 *    header/footer bands and full-page decorative elements (the certificate
 *    border), so clipping to printable would wrongly chop them.
 * 3. Per-element *content* overflow (text longer than its frame, an oversized
 *    image) is a renderer concern (E4), not layout. This pass reports only the
 *    geometric box and whether it exceeds the sheet.
 *
 * A `null`-height (growing) element cannot be clipped vertically yet, so its
 * `clippedPx.hPx` stays `null` and `overflowsPage` considers only its known
 * dimensions (x / width / top edge).
 */

import type { ElementType, RendaraTemplate, TemplateElement } from '@rendara/report-schema';

import { computePageGeometry, type PageGeometry } from './geometry';
import { DEFAULT_DPI, mmToPx } from './units';

/** The three bands an element can belong to, painted on the same page surface. */
export type BandName = 'header' | 'body' | 'footer';

/** A rectangle in page-absolute pixels. `hPx` is `null` for a growing element. */
export interface BoxPx {
  readonly xPx: number;
  readonly yPx: number;
  readonly wPx: number;
  readonly hPx: number | null;
}

/** A rectangle in page-absolute millimetres (as authored). `hMm` mirrors {@link BoxPx}. */
export interface BoxMm {
  readonly xMm: number;
  readonly yMm: number;
  readonly wMm: number;
  readonly hMm: number | null;
}

/**
 * One element placed on the page: its source band and document order, its
 * z-order, the authored mm frame, the computed absolute-px box, and the clipping
 * result against the page sheet.
 */
export interface LaidOutElement {
  readonly id: string;
  readonly type: ElementType;
  /** Which band the element came from (header repeats, body flows, footer trails). */
  readonly band: BandName;
  /** Paint depth: lower paints first / behind. */
  readonly z: number;
  /** Index of the element within its source band, the stable tiebreak for paint order. */
  readonly order: number;
  /** The frame exactly as authored (page-absolute mm). */
  readonly frameMm: BoxMm;
  /** The frame converted to page-absolute px at {@link PageLayout.geometry}'s DPI. */
  readonly boxPx: BoxPx;
  /** `true` when {@link boxPx} is not fully contained by the page sheet. */
  readonly overflowsPage: boolean;
  /** {@link boxPx} intersected with the page box (the visible region), or `null` if wholly off-page. */
  readonly clippedPx: BoxPx | null;
}

/** A laid-out page: the page geometry plus every element in paint order. */
export interface PageLayout {
  readonly geometry: PageGeometry;
  /** Elements across all bands, sorted into paint order (z asc, then band, then document order). */
  readonly elements: readonly LaidOutElement[];
}

/** Band paint precedence, used only as a deterministic tiebreak within equal `z`. */
const BAND_ORDER: Readonly<Record<BandName, number>> = {
  header: 0,
  body: 1,
  footer: 2,
};

/**
 * Lays out a template's fixed elements onto a single page at the given DPI
 * (defaults to {@link DEFAULT_DPI} = 96), returning the page geometry and every
 * element as an absolute-px box in paint order. See the module overview for the
 * coordinate system, z-order and clipping rules.
 */
export function layoutStaticPage(
  template: RendaraTemplate,
  dpi: number = DEFAULT_DPI
): PageLayout {
  const geometry = computePageGeometry(template.page, dpi);

  const elements: LaidOutElement[] = [];
  for (const band of ['header', 'body', 'footer'] as const) {
    template[band].elements.forEach((element, order) => {
      elements.push(layoutElement(element, band, order, geometry));
    });
  }

  elements.sort(comparePaintOrder);

  return { geometry, elements };
}

/** Converts one element's frame to an absolute-px box and computes its clipping. */
function layoutElement(
  element: TemplateElement,
  band: BandName,
  order: number,
  geometry: PageGeometry
): LaidOutElement {
  const { dpi, pagePx } = geometry;
  const { xMm, yMm, wMm, hMm } = element.frame;

  const boxPx: BoxPx = {
    xPx: mmToPx(xMm, dpi),
    yPx: mmToPx(yMm, dpi),
    wPx: mmToPx(wMm, dpi),
    hPx: hMm === null ? null : mmToPx(hMm, dpi),
  };

  const clippedPx = clipToPage(boxPx, pagePx.widthPx, pagePx.heightPx);
  const overflowsPage = isOverflowing(boxPx, pagePx.widthPx, pagePx.heightPx);

  return {
    id: element.id,
    type: element.type,
    band,
    z: element.z,
    order,
    frameMm: { xMm, yMm, wMm, hMm },
    boxPx,
    overflowsPage,
    clippedPx,
  };
}

/**
 * Intersects a box with the page sheet `[0, pageW] × [0, pageH]`. Returns the
 * visible sub-rectangle, or `null` when the box lies wholly off the sheet. A
 * `null` height (growing element) is preserved: the height cannot be clipped
 * until it is known (E3-S3).
 */
function clipToPage(box: BoxPx, pageW: number, pageH: number): BoxPx | null {
  // Clamp each edge independently, and only recompute a dimension when its edge
  // was actually clipped — so an unclipped axis preserves the box's exact px
  // value rather than drifting through a `(x + w) - x` round-trip.
  // A strict `<` is deliberate: it rejects only boxes that lie *wholly* off the
  // sheet, while keeping a zero-extent box that sits inside (a `line` shape has
  // zero height or width). A renderer strokes such lines, so they must survive
  // clipping rather than be mistaken for off-page content.
  const overLeft = box.xPx < 0;
  const overRight = box.xPx + box.wPx > pageW;
  const left = overLeft ? 0 : box.xPx;
  const right = overRight ? pageW : box.xPx + box.wPx;
  if (right < left) return null;
  const wPx = overLeft || overRight ? right - left : box.wPx;

  // Unknown height (growing element): clip horizontally and at the top only.
  if (box.hPx === null) {
    if (box.yPx >= pageH) return null;
    return { xPx: left, yPx: box.yPx < 0 ? 0 : box.yPx, wPx, hPx: null };
  }

  const overTop = box.yPx < 0;
  const overBottom = box.yPx + box.hPx > pageH;
  const top = overTop ? 0 : box.yPx;
  const bottom = overBottom ? pageH : box.yPx + box.hPx;
  if (bottom < top) return null;
  const hPx = overTop || overBottom ? bottom - top : box.hPx;

  return { xPx: left, yPx: top, wPx, hPx };
}

/**
 * Reports whether a box exceeds the page sheet in any direction. For a
 * `null`-height box only the known edges (left/right/top) are considered, since
 * its bottom is not yet determined.
 */
function isOverflowing(box: BoxPx, pageW: number, pageH: number): boolean {
  if (box.xPx < 0 || box.yPx < 0 || box.xPx + box.wPx > pageW) return true;
  if (box.hPx === null) return false;
  return box.yPx + box.hPx > pageH;
}

/** z ascending, then band precedence, then document order — a total, stable order. */
function comparePaintOrder(a: LaidOutElement, b: LaidOutElement): number {
  if (a.z !== b.z) return a.z - b.z;
  const bandDelta = BAND_ORDER[a.band] - BAND_ORDER[b.band];
  if (bandDelta !== 0) return bandDelta;
  return a.order - b.order;
}
