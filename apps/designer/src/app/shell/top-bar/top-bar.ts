import { Component, ViewEncapsulation, inject } from '@angular/core';
import { Button } from '@rendara/ui-kit';
import { DesignerStore } from '../../state/designer-store';

/**
 * Designer top bar (E5-S1) — the canonical chrome from brief §12.3.2: Rendara
 * wordmark · editable doc name + pencil · `Saved` status · `Import data` ·
 * `Preview` · `Export ▾` · overflow. `Preview` enters live preview mode (E6-S9);
 * the remaining actions are inert placeholders until their stories land.
 */
@Component({
  selector: 'rdr-top-bar',
  imports: [Button],
  templateUrl: './top-bar.html',
  styleUrl: './top-bar.css',
  encapsulation: ViewEncapsulation.Emulated,
  host: { role: 'banner', class: 'rdr-top-bar' },
})
export class TopBar {
  private readonly store = inject(DesignerStore);

  /** Placeholder document name until the store lands (E5-S2). */
  protected readonly documentName = 'Untitled invoice';

  /** Enters live preview mode (E6-S9) — a viewer-style render of the document. */
  protected enterPreview(): void {
    this.store.enterPreview();
  }
}
