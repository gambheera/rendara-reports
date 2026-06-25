import { Component, ViewEncapsulation, computed, inject, output } from '@angular/core';
import { isNamedPageSize } from '@rendara/report-schema';
import { DesignerStore } from '../../state/designer-store';

/** Zoom step applied by the −/+ buttons, in percentage points. */
const ZOOM_STEP_PERCENT = 10;

/**
 * Bottom status bar (E5-S1): zoom controls, page geometry summary
 * (`A4 · Portrait · mm`), page counter and a keyboard-shortcuts hint. The
 * geometry summary is bound live to the document's page model (E5-S3) and
 * doubles as the entry point to the Page setup dialog. Zoom (−/+ and the live
 * percentage), the page counter and the Fit button are wired to the store and
 * canvas (E5-S4).
 */
@Component({
  selector: 'rdr-status-bar',
  templateUrl: './status-bar.html',
  styleUrl: './status-bar.css',
  encapsulation: ViewEncapsulation.Emulated,
  host: { role: 'contentinfo', class: 'rdr-status-bar' },
})
export class StatusBar {
  private readonly store = inject(DesignerStore);

  /** Fired when the author activates the page-summary button (E5-S3). */
  readonly openPageSetup = output<void>();

  /** Fired when the author activates Fit; the shell asks the canvas to fit (E5-S4). */
  readonly fitToView = output<void>();

  /** Live zoom percentage (e.g. `100%`) from the store. */
  protected readonly zoom = computed(() => `${this.store.zoomPercent()}%`);

  /** Live `Page x of y` counter from the rendered document's page count. */
  protected readonly pageCounter = computed(() => `Page 1 of ${this.store.pageCount()}`);

  /** Steps the zoom out/in by {@link ZOOM_STEP_PERCENT} percentage points. */
  protected zoomOut(): void {
    this.store.setZoom((this.store.zoomPercent() - ZOOM_STEP_PERCENT) / 100);
  }

  protected zoomIn(): void {
    this.store.setZoom((this.store.zoomPercent() + ZOOM_STEP_PERCENT) / 100);
  }

  /** Live `A4 · Portrait · mm`-style summary derived from the page model. */
  protected readonly pageSummary = computed(() => {
    const page = this.store.page();
    const size = isNamedPageSize(page.size)
      ? page.size
      : `${page.size.widthMm}×${page.size.heightMm}mm`;
    const orientation = page.orientation === 'portrait' ? 'Portrait' : 'Landscape';
    return `${size} · ${orientation} · ${page.units}`;
  });
}
