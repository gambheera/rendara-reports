import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { PageGeometry, PaginatedPage } from '@rendara/report-engine';

import {
  buildPageViewModel,
  elementStyle,
  printableStyle,
  sheetStyle,
  type ElementBoxView,
  type PageViewModel,
  type StyleMap,
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
 * Scope is deliberately narrow: element **content** (text/shape/image) is E4-S2,
 * data-table slices are E4-S3, multi-page + zoom controls are E4-S4, style
 * isolation is E4-S5, design-mode hooks are E4-S6, and the watermark is E4-S7.
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

  /** The pure view-model for the current inputs. */
  protected readonly vm = computed<PageViewModel>(() =>
    buildPageViewModel(this.page(), this.geometry(), {
      zoom: this.zoom(),
      background: this.background(),
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
}
