import { Component, ViewEncapsulation, computed, inject, viewChild } from '@angular/core';
import { Button, I18nService } from '@rendara/ui-kit';
import { DesignerStore } from '../../state/designer-store';
import { DraftPersistenceService } from '../../state/draft-persistence.service';
import { ExportImportDialog } from '../../export-import/export-import-dialog';

/**
 * Designer top bar (E5-S1) — the canonical chrome from brief §12.3.2: Rendara
 * wordmark · editable doc name + pencil · save status · file actions · `Preview` ·
 * `Export`. `Preview` enters live preview mode (E6-S9); `Export` opens the export /
 * import Template JSON dialog (E6-S10) — the way work is **saved to a file**.
 *
 * The file UX (E6-S11) lives here: **New** starts a fresh document (behind the
 * unsaved-changes guard) and **Open…** brings a template back in via the dialog's
 * Import tab. The save **status** reflects the store's `dirty` flag — "Saved" once
 * the work matches the last file save, "Unsaved changes" while it differs (a local
 * autosaved draft still protects it across reloads).
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
  private readonly draftPersistence = inject(DraftPersistenceService);
  private readonly exportImport = viewChild.required(ExportImportDialog);

  /** Designer i18n (E10-S2): the template calls `i18n.t(...)` for its chrome strings. */
  protected readonly i18n = inject(I18nService);

  /** The document's name, shown in the title area (from the template metadata). */
  protected readonly documentName = computed(() => this.store.template().metadata.name);

  /** True while the document has unsaved changes since the last file save. */
  protected readonly dirty = this.store.dirty;

  /** Save-status label for the title area, driven by {@link dirty} (localised, E10-S2). */
  protected readonly statusLabel = computed(() =>
    this.dirty() ? this.i18n.t('topBar.status.unsaved') : this.i18n.t('topBar.status.saved'),
  );

  /** Enters live preview mode (E6-S9) — a viewer-style render of the document. */
  protected enterPreview(): void {
    this.store.enterPreview();
  }

  /** Starts a fresh document, behind the unsaved-changes guard (E6-S11). */
  protected newDocument(): void {
    this.draftPersistence.newDocument();
  }

  /** Opens the export / import dialog on the Import tab — "Open…" (E6-S11). */
  protected openImport(): void {
    this.exportImport().open('import');
  }

  /** Opens the export / import Template JSON dialog on the Export tab (E6-S10). */
  protected openExport(): void {
    this.exportImport().open('export');
  }
}
