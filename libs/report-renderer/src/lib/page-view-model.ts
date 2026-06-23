/**
 * Page view-model (E4-S1) — the pure, framework-agnostic bridge between the
 * engine's {@link PaginatedPage page model} and the DOM the shared renderer
 * paints. It is the single source of layout→style truth: both the Angular
 * {@link ReportRenderer} component and the headless {@link serializePageToHtml}
 * serializer consume it, so designer preview, viewer, and visual-regression
 * snapshots are byte-for-byte the same geometry (brief §7's "one renderer").
 *
 * ## What this pass does
 * The engine has already done the hard part: {@link computePageGeometry}
 * converted the page + margins to px, and {@link layoutStaticPage}/
 * {@link paginate} placed every fixed element as an absolute **page-absolute px**
 * box. This module only:
 *  - exposes the **sheet** (full page px) and the **printable area** (margins
 *    inset) as plain rectangles a renderer can position directly;
 *  - resolves the **background** fill (a CSS colour string; default white);
 *  - flattens a page's `header → body → footer` fixed elements into one paint
 *    list, preserving the engine's z-order (lower `z` behind), with each box's
 *    `z` carried through as a `zIndex`;
 *  - carries the **zoom** factor through untouched — zoom is applied by the
 *    renderer as a single `transform: scale(zoom)` on the sheet (E4-S4 builds
 *    fit-width/fit-page on top), so inner coordinates stay at natural engine px.
 *
 * ## What this pass does NOT do (deferred, later E4 stories)
 *  - **Element content** — text/shape/image visuals are E4-S2; here an element is
 *    only its positioned host box.
 *  - **Data-table slices** (`page.tables`) — E4-S3.
 *  - **Watermark** (`page.watermark`) — E4-S7.
 * A `null`-height element (a growing box) is passed through with `heightPx: null`
 * so a renderer can let it size to content; the fixed elements on a paginated
 * page always carry a concrete height, so this only matters defensively.
 */

import type { PageGeometry, PaginatedPage, PlacedElement } from '@rendara/report-engine';
import type { ElementType } from '@rendara/report-schema';

/** The default page fill when a template declares no background (brief §5: `null` = none → white paper). */
export const DEFAULT_PAGE_BACKGROUND = '#ffffff';

/** A positioned element host box in natural (unscaled) page px, ready to absolutely position. */
export interface ElementBoxView {
  readonly id: string;
  readonly type: ElementType;
  readonly leftPx: number;
  readonly topPx: number;
  readonly widthPx: number;
  /** `null` for a growing element (height sizes to content); concrete for paginated fixed elements. */
  readonly heightPx: number | null;
  /** Paint depth, mapped straight to CSS `z-index` (lower paints behind). */
  readonly zIndex: number;
}

/** A rectangle in natural page px. */
export interface RectPx {
  readonly leftPx: number;
  readonly topPx: number;
  readonly widthPx: number;
  readonly heightPx: number;
}

/** Everything a renderer needs to paint one page: sheet, printable area, background, zoom, element boxes. */
export interface PageViewModel {
  /** 1-based page number (mirrors {@link PaginatedPage.pageNumber}). */
  readonly pageNumber: number;
  /** Zoom factor applied as a single `transform: scale(zoom)` on the sheet. */
  readonly zoom: number;
  /** The full page sheet in natural px. */
  readonly sheet: { readonly widthPx: number; readonly heightPx: number };
  /** The printable (content) area, margins inset, in natural px. */
  readonly printable: RectPx;
  /** Resolved CSS colour for the sheet fill. */
  readonly background: string;
  /** Fixed (non-table) element host boxes in paint order (z asc, then header→body→footer). */
  readonly elements: readonly ElementBoxView[];
}

/** Options for {@link buildPageViewModel}. */
export interface PageViewOptions {
  /** Zoom factor; defaults to `1`. Must be > 0. */
  readonly zoom?: number;
  /**
   * CSS colour for the sheet fill. A non-empty string is used as-is; `null`,
   * `undefined` or an empty string fall back to {@link DEFAULT_PAGE_BACKGROUND}.
   */
  readonly background?: string | null;
}

/**
 * Builds the {@link PageViewModel} for one paginated `page` against its shared
 * `geometry`. Pure: no DOM, no Angular, deterministic for snapshot tests. See
 * the module overview for what it does and (deliberately) does not cover.
 */
export function buildPageViewModel(
  page: PaginatedPage,
  geometry: PageGeometry,
  options?: PageViewOptions,
): PageViewModel {
  const zoom = options?.zoom ?? 1;
  const background = resolveBackground(options?.background);

  const { pagePx, printable } = geometry;

  // header → body → footer concatenation preserves the engine's band tiebreak
  // for equal z; the explicit `zIndex` makes paint order independent of DOM order.
  const elements: ElementBoxView[] = [...page.header, ...page.elements, ...page.footer].map(
    toElementBoxView,
  );

  return {
    pageNumber: page.pageNumber,
    zoom,
    sheet: { widthPx: pagePx.widthPx, heightPx: pagePx.heightPx },
    printable: {
      leftPx: printable.leftPx,
      topPx: printable.topPx,
      widthPx: printable.sizePx.widthPx,
      heightPx: printable.sizePx.heightPx,
    },
    background,
    elements,
  };
}

/** Maps one engine {@link PlacedElement} to its positioned host box. */
function toElementBoxView(element: PlacedElement): ElementBoxView {
  return {
    id: element.id,
    type: element.type,
    leftPx: element.boxPx.xPx,
    topPx: element.boxPx.yPx,
    widthPx: element.boxPx.wPx,
    heightPx: element.boxPx.hPx,
    zIndex: element.z,
  };
}

/** A non-empty background string wins; everything else falls back to white paper. */
function resolveBackground(background: string | null | undefined): string {
  return typeof background === 'string' && background.length > 0
    ? background
    : DEFAULT_PAGE_BACKGROUND;
}

// ---------------------------------------------------------------------------
// Shared inline-style helpers — the single style source for both the Angular
// component (via `[style]` bindings) and the headless HTML serializer, so the
// two renderings never diverge (brief §7).
// ---------------------------------------------------------------------------

/** A plain inline-style map (property → value), renderer-agnostic. */
export type StyleMap = Readonly<Record<string, string>>;

/** Inline styles for the page sheet: natural size, background, and the zoom transform. */
export function sheetStyle(vm: PageViewModel): StyleMap {
  return {
    position: 'relative',
    width: `${vm.sheet.widthPx}px`,
    height: `${vm.sheet.heightPx}px`,
    background: vm.background,
    transform: `scale(${vm.zoom})`,
    'transform-origin': 'top left',
  };
}

/** Inline styles for the printable-area guide rectangle. */
export function printableStyle(vm: PageViewModel): StyleMap {
  const { leftPx, topPx, widthPx, heightPx } = vm.printable;
  return {
    position: 'absolute',
    left: `${leftPx}px`,
    top: `${topPx}px`,
    width: `${widthPx}px`,
    height: `${heightPx}px`,
  };
}

/** Inline styles for one absolutely-positioned element host box. */
export function elementStyle(box: ElementBoxView): StyleMap {
  return {
    position: 'absolute',
    left: `${box.leftPx}px`,
    top: `${box.topPx}px`,
    width: `${box.widthPx}px`,
    // A growing element (null height) sizes to its content.
    height: box.heightPx === null ? 'auto' : `${box.heightPx}px`,
    'z-index': `${box.zIndex}`,
  };
}
