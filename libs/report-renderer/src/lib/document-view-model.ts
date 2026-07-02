/**
 * Document view-model (E4-S4) — the pure, framework-agnostic bridge that turns a
 * whole engine {@link PaginatedDocument} into the N-page model the shared renderer
 * paints, plus the **zoom resolution** both the {@link ReportDocument} component
 * and the headless serializer share. It sits one level above the per-page
 * {@link buildPageViewModel} (E4-S1): a document is just every page built at one
 * resolved zoom factor, so single-page math stays untouched and reused.
 *
 * ## What this pass adds (E4-S4)
 *  - **Zoom modes.** A {@link ZoomSpec} is either an explicit scale factor (a `%`
 *    expressed as a multiplier, e.g. `0.75`) or a fit mode (`'fit-width'` /
 *    `'fit-page'`) resolved against the viewport the renderer is shown in.
 *    {@link resolveZoomFactor} turns any spec into the single scale factor applied
 *    as `transform: scale(zoom)` on every page sheet — all pages of a document
 *    share one geometry, so one factor fits them all.
 *  - **Page slot sizing.** Because the zoom is a CSS transform (visual only, it
 *    does not shrink the layout box), a renderer that stacks pages must reserve
 *    the *scaled* box around each sheet. {@link slotSize} returns that scaled
 *    width/height so single- and multi-page stacking line up at any zoom.
 *  - **Single vs continuous (the layout hook).** This module carries the
 *    {@link PageLayoutMode} and builds every page's view-model; *which* pages a
 *    renderer paints (all of them, or just the current one) is the renderer's
 *    choice — the model stays complete so the decision is a cheap array slice.
 *
 * Pure: no DOM, no Angular, deterministic for snapshot tests, importable from the
 * Node/Playwright serializer context.
 */

import type { PageGeometry, PaginatedDocument, TextDirection } from '@rendara/report-engine';
import type { RendaraTemplate } from '@rendara/report-schema';

import { buildPageViewModel, type PageViewModel, type RenderMode } from './page-view-model';

/** A natural-px sheet size (uniform across every page of a document). */
export interface SheetSize {
  readonly widthPx: number;
  readonly heightPx: number;
}

/** The size of the area a document is shown in, used to resolve the fit zoom modes. */
export interface ViewportSize {
  readonly widthPx: number;
  readonly heightPx: number;
}

/**
 * How to zoom the document: an explicit scale **factor** (a multiplier — `1` =
 * 100%, `0.75` = 75%), or a fit mode resolved against the viewport.
 *  - `'fit-width'` scales a page so its width fills the viewport width.
 *  - `'fit-page'` scales a page so the whole page (width **and** height) fits.
 */
export type ZoomSpec = number | 'fit-width' | 'fit-page';

/** Whether a renderer paints only the current page or stacks every page. */
export type PageLayoutMode = 'single' | 'continuous';

/** Lower clamp for a resolved zoom factor (10%). */
export const MIN_ZOOM = 0.1;
/** Upper clamp for a resolved zoom factor (500%). */
export const MAX_ZOOM = 5;

/** Clamps a zoom factor into the supported `[MIN_ZOOM, MAX_ZOOM]` range. */
function clampZoom(factor: number): number {
  if (!Number.isFinite(factor) || factor <= 0) {
    return MIN_ZOOM;
  }
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, factor));
}

/**
 * Resolves a {@link ZoomSpec} to the single scale factor applied as
 * `transform: scale(factor)` on every page sheet.
 *
 * A numeric spec is used directly (clamped). A fit mode needs the `viewport`: it
 * scales the (uniform) page `sheet` to fill the viewport width (`'fit-width'`) or
 * to fit the whole page (`'fit-page'`). When a fit mode is asked for but no
 * (positive) viewport is known yet — e.g. before the host has been measured —
 * it falls back to `1` (100%) so the document still renders at natural size.
 */
export function resolveZoomFactor(
  spec: ZoomSpec,
  sheet: SheetSize,
  viewport?: ViewportSize | null,
): number {
  if (typeof spec === 'number') {
    return clampZoom(spec);
  }
  if (
    !viewport ||
    viewport.widthPx <= 0 ||
    viewport.heightPx <= 0 ||
    sheet.widthPx <= 0 ||
    sheet.heightPx <= 0
  ) {
    return 1;
  }
  const widthFactor = viewport.widthPx / sheet.widthPx;
  if (spec === 'fit-width') {
    return clampZoom(widthFactor);
  }
  // fit-page: the page must fit both dimensions, so take the smaller factor.
  const heightFactor = viewport.heightPx / sheet.heightPx;
  return clampZoom(Math.min(widthFactor, heightFactor));
}

/**
 * The **scaled** layout box for one page sheet at a resolved `zoom`. A renderer
 * reserves this size around the sheet so pages stack without overlap or gaps at
 * any zoom (the sheet itself is scaled by a CSS transform, which does not shrink
 * the layout box).
 */
export function slotSize(sheet: SheetSize, zoom: number): SheetSize {
  return { widthPx: sheet.widthPx * zoom, heightPx: sheet.heightPx * zoom };
}

/** Options for {@link buildDocumentViewModel} (mirrors the per-page options plus zoom/viewport). */
export interface DocumentViewOptions {
  /** Zoom spec — a scale factor or a fit mode; defaults to `1`. */
  readonly zoom?: ZoomSpec;
  /** Viewport size for resolving the fit zoom modes; ignored for a numeric zoom. */
  readonly viewport?: ViewportSize | null;
  /** Source template, forwarded to every page for content/style (see {@link buildPageViewModel}). */
  readonly template?: RendaraTemplate;
  /** Resolved binding display strings by element id, forwarded to every page. */
  readonly resolvedValues?: ReadonlyMap<string, string>;
  /** CSS colour for every page's sheet fill; forwarded to {@link buildPageViewModel}. */
  readonly background?: string | null;
  /** Render mode (E4-S6), forwarded to every page; `'view'` (default) or `'design'`. */
  readonly mode?: RenderMode;
  /**
   * Base text direction (E10-S2), forwarded to every page so the whole document
   * renders RTL. `'ltr'` (the default) keeps every page byte-identical to before.
   */
  readonly direction?: TextDirection;
}

/** Everything a renderer needs to paint a whole document: the resolved zoom + every page. */
export interface DocumentViewModel {
  /** The single scale factor applied to every page sheet. */
  readonly zoom: number;
  /** Total number of pages (mirrors {@link PaginatedDocument.pageCount}). */
  readonly pageCount: number;
  /** The shared sheet size in natural px (uniform across pages). */
  readonly sheet: SheetSize;
  /** Render mode (E4-S6) every page was built in; `'view'` (default) or `'design'`. */
  readonly mode: RenderMode;
  /** Every page's view-model, in document order, each carrying the resolved `zoom`. */
  readonly pages: readonly PageViewModel[];
}

/**
 * Builds the {@link DocumentViewModel} for a paginated `doc`: resolves the zoom
 * spec against the document's (uniform) sheet + viewport, then builds one
 * {@link PageViewModel} per page at that zoom, forwarding the document-level
 * watermark (E4-S7) to every page. Pure and deterministic.
 */
export function buildDocumentViewModel(
  doc: PaginatedDocument,
  options?: DocumentViewOptions,
): DocumentViewModel {
  const geometry: PageGeometry = doc.geometry;
  const sheet: SheetSize = {
    widthPx: geometry.pagePx.widthPx,
    heightPx: geometry.pagePx.heightPx,
  };
  const zoom = resolveZoomFactor(options?.zoom ?? 1, sheet, options?.viewport);
  const mode: RenderMode = options?.mode ?? 'view';

  const pages = doc.pages.map((page) =>
    buildPageViewModel(page, geometry, {
      zoom,
      background: options?.background,
      template: options?.template,
      resolvedValues: options?.resolvedValues,
      mode,
      direction: options?.direction,
      // The watermark (E4-S7) is document-level: the engine echoes the render-time
      // config onto the document, and it is stamped on every page behind the content.
      watermark: doc.watermark,
    }),
  );

  return { zoom, pageCount: doc.pageCount, sheet, mode, pages };
}
