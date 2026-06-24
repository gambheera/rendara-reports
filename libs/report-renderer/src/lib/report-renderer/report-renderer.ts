import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { PageGeometry, PaginatedPage } from '@rendara/report-engine';
import type { RendaraTemplate } from '@rendara/report-schema';

import {
  buildPageViewModel,
  elementStyle,
  printableStyle,
  sheetStyle,
  tableCellStyle,
  tableContainerStyle,
  tableLabelStyle,
  tableRowStyle,
  type ElementBoxView,
  type PageViewModel,
  type StyleMap,
  type TableCellView,
  type TableLabelView,
  type TableRowView,
  type TableView,
} from '../page-view-model';

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
 * Still deferred: multi-page + zoom controls are E4-S4, style isolation is
 * E4-S5, design-mode hooks are E4-S6, the watermark is E4-S7.
 */
@Component({
  selector: 'rdr-report-renderer',
  imports: [],
  templateUrl: './report-renderer.html',
  styleUrl: './report-renderer.css',
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

  /** The pure view-model for the current inputs. */
  protected readonly vm = computed<PageViewModel>(() =>
    buildPageViewModel(this.page(), this.geometry(), {
      zoom: this.zoom(),
      background: this.background(),
      template: this.template() ?? undefined,
      resolvedValues: this.resolvedValues(),
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
}
