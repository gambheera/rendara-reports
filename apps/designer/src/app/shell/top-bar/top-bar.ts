import { Component, ViewEncapsulation, inject, viewChild } from '@angular/core';
import { Button } from '@rendara/ui-kit';
import { DesignerStore } from '../../state/designer-store';
import { ExportImportDialog } from '../../export-import/export-import-dialog';

/**
 * Designer top bar (E5-S1) — the canonical chrome from brief §12.3.2: Rendara
 * wordmark · editable doc name + pencil · `Saved` status · `Import data` ·
 * `Preview` · `Export ▾` · overflow. `Preview` enters live preview mode (E6-S9);
 * `Export` opens the export / import Template JSON dialog (E6-S10), whose Import
 * tab is the entry point for bringing a template back in. The remaining actions
 * are inert placeholders until their stories land.
 */
@Component({
  selector: 'rdr-top-bar',
  imports: [Button, ExportImportDialog],
  templateUrl: './top-bar.html',
  styleUrl: './top-bar.css',
  encapsulation: ViewEncapsulation.Emulated,
  host: { role: 'banner', class: 'rdr-top-bar' },
})
export class TopBar {
  private readonly store = inject(DesignerStore);
  private readonly exportImport = viewChild.required(ExportImportDialog);

  /** Placeholder document name until the store lands (E5-S2). */
  protected readonly documentName = 'Untitled invoice';

  /** Enters live preview mode (E6-S9) — a viewer-style render of the document. */
  protected enterPreview(): void {
    this.store.enterPreview();
  }

  /** Opens the export / import Template JSON dialog on the Export tab (E6-S10). */
  protected openExport(): void {
    this.exportImport().open('export');
  }
}
