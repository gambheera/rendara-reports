import { Component, ViewEncapsulation, computed, inject, output } from '@angular/core';
import { isNamedPageSize } from '@rendara/report-schema';
import { DesignerStore } from '../../state/designer-store';

/**
 * Bottom status bar (E5-S1): zoom controls, page geometry summary
 * (`A4 · Portrait · mm`), page counter and a keyboard-shortcuts hint. The
 * geometry summary is now bound live to the document's page model (E5-S3) and
 * doubles as the entry point to the Page setup dialog. Zoom wiring is E5-S4.
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

  protected readonly zoom = '100%';
  protected readonly pageCounter = 'Page 1 of 1';

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
