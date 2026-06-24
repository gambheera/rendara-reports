import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { PageGeometry, PaginatedPage, Watermark } from '@rendara/report-engine';
import type { RendaraTemplate } from '@rendara/report-schema';

import {
  buildPageViewModel,
  designAnchorAttrs,
  elementStyle,
  printableStyle,
  sheetStyle,
  tableCellStyle,
  tableContainerStyle,
  tableLabelStyle,
  tableRowStyle,
  type AttrMap,
  type ElementBoxView,
  type PageViewModel,
  type RenderMode,
  type StyleMap,
  type TableCellView,
  type TableLabelView,
  type TableRowView,
  type TableView,
} from '../page-view-model';
import { RdrDesignAttrs } from '../rdr-design-attrs';
import { RENDERER_PAGE_CSS, RENDERER_THEME_CSS } from '../renderer-styles';

/**
 * Single-page DOM renderer (E4-S1) — the foundation of the shared renderer that
 * powers both the designer preview and the viewer (brief §7, true WYSIWYG).
 *
 * Given one engine {@link PaginatedPage} and its shared {@link PageGeometry}, it
 * paints the page **sheet** at its natural px size, the **printable area** guide,
 * a resolved **background**, and every fixed (non-table) element as an
 * absolutely-positioned host box in paint order — all **at a given zoom**
 * (`transform: scale`). The layout→style math lives in the pure
 * {@link buildPageViewModel} so it is unit-testable and reused by the headless
 * serializer.
 *
 * E4-S2 fills in element **content**: each fixed box now paints its text
 * (font/align/wrap/colour), its shape (line/rect/ellipse as inline SVG with
 * stroke/fill), or its image (object-fit + a URL-sanitised `src`). Content comes
 * from the source {@link template} joined by element id, with data-bound text/
 * image display strings supplied via {@link resolvedValues} (the engine resolves
 * bindings asynchronously upstream). All content math lives in the pure
 * {@link buildPageViewModel} so it is unit-testable and reused by the serializer.
 *
 * E4-S3 paints the page's **data-table slices** ({@link PaginatedPage.tables}):
 * each slice becomes an absolutely-positioned container whose rows (header /
 * detail / group header+footer / grand-total) and per-column cells + full-width
 * band labels carry the engine's already-resolved text, alignment and a default
 * professional table style. All table geometry/style lives in the pure
 * {@link buildPageViewModel} too.
 *
 * E4-S5 adds **style isolation & theming**: the shared {@link RENDERER_THEME_CSS}
 * resets inheritable host typography at the render root and declares the `--rdr-*`
 * theme tokens, and {@link RENDERER_PAGE_CSS} carries the (tokenised) page chrome.
 * This component stays on the default `ViewEncapsulation.Emulated` — its pervasive
 * inline styles already outrank a host's selector rules, and the reset blocks
 * inherited bleed; a host that needs to defend against `!important` rules wraps the
 * document in the opt-in Shadow-DOM {@link ReportSurface}.
 *
 * E4-S6 adds **design-mode hooks**: a {@link mode} flag (`'view'` default,
 * `'design'`) lets the designer reuse this same renderer as its canvas. The
 * geometry/content is identical in both modes; design mode only adds per-element
 * and per-table **selection anchors** ({@link designAnchorAttrs}: a `data-rdr-hit`
 * role + the natural-px frame) plus a `data-rdr-mode="design"` marker on the page
 * root. View mode emits none of these, so the viewer DOM is byte-stable.
 *
 * E4-S7 paints the optional **watermark** ({@link watermark}): a centred, rotated
 * text/image overlay (opacity + angle from the document-level config) stamped
 * behind the page content. It is painted only when a watermark is supplied, so a
 * page without one is unchanged.
 */
@Component({
  selector: 'rdr-report-renderer',
  imports: [RdrDesignAttrs],
  templateUrl: './report-renderer.html',
  styles: [RENDERER_THEME_CSS, RENDERER_PAGE_CSS],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportRenderer {
  /** The page to render (one slice of the engine's {@link PaginatedDocument}). */
  readonly page = input.required<PaginatedPage>();
  /** Shared page geometry (sheet + printable area in px). */
  readonly geometry = input.required<PageGeometry>();
  /** Zoom factor, applied as `transform: scale(zoom)` on the sheet. */
  readonly zoom = input<number>(1);
  /** CSS colour for the sheet fill; `null` → white paper. */
  readonly background = input<string | null>(null);
  /**
   * The source template (E4-S2): supplies each element's style and type-specific
   * content (literal text, shape kind, image src/fit). When `null` the boxes
   * render empty (the E4-S1 positioned-host-box behaviour).
   */
  readonly template = input<RendaraTemplate | null>(null);
  /**
   * Resolved binding **display strings** by element id (E4-S2): the `formatted`
   * value from the engine's `resolveElement`, used for data-bound text/image.
   * A page-token text still wins; a static literal is the final fallback.
   */
  readonly resolvedValues = input<ReadonlyMap<string, string>>(new Map());
  /**
   * Render mode (E4-S6): `'design'` exposes per-element/-table selection anchors
   * for the designer canvas; `'view'` (the default) renders static viewer output
   * with no anchors. Geometry/content is identical in both modes.
   */
  readonly mode = input<RenderMode>('view');
  /**
   * The document-level watermark (E4-S7) to stamp behind the page content. A
   * render-time concern (brief §8): the {@link ReportDocument} forwards the
   * engine's `PaginatedDocument.watermark` here. `null` (the default) → none.
   */
  readonly watermark = input<Watermark | null>(null);

  /** The pure view-model for the current inputs. */
  protected readonly vm = computed<PageViewModel>(() =>
    buildPageViewModel(this.page(), this.geometry(), {
      zoom: this.zoom(),
      background: this.background(),
      template: this.template() ?? undefined,
      resolvedValues: this.resolvedValues(),
      mode: this.mode(),
      watermark: this.watermark(),
    }),
  );

  /** Inline styles for the page sheet (size, background, zoom). */
  protected readonly sheetStyle = computed<StyleMap>(() => sheetStyle(this.vm()));

  /** Inline styles for the printable-area guide. */
  protected readonly printableStyle = computed<StyleMap>(() => printableStyle(this.vm()));

  /** Inline styles for one element host box (used by the template's `@for`). */
  protected elementStyle(box: ElementBoxView): StyleMap {
    return elementStyle(box);
  }

  /** Inline styles for one table slice container (E4-S3). */
  protected tableContainerStyle(table: TableView): StyleMap {
    return tableContainerStyle(table);
  }

  /** Inline styles for one table row track (E4-S3). */
  protected tableRowStyle(row: TableRowView): StyleMap {
    return tableRowStyle(row);
  }

  /** Inline styles for one table cell (E4-S3). */
  protected tableCellStyle(cell: TableCellView): StyleMap {
    return tableCellStyle(cell);
  }

  /** Inline styles for one full-width band label (E4-S3). */
  protected tableLabelStyle(label: TableLabelView): StyleMap {
    return tableLabelStyle(label);
  }

  /** Design-mode selection anchors for one element box (E4-S6); `null` in view mode. */
  protected elementAnchor(box: ElementBoxView): AttrMap | null {
    return designAnchorAttrs('element', box, this.vm().mode);
  }

  /** Design-mode selection anchors for one table slice (E4-S6); `null` in view mode. */
  protected tableAnchor(table: TableView): AttrMap | null {
    return designAnchorAttrs('table', table, this.vm().mode);
  }
}
