import {
  Component,
  ElementRef,
  ViewEncapsulation,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { isValidTemplate } from '@rendara/report-schema';
import { Button } from '@rendara/ui-kit';
import { DesignerStore } from '../state/designer-store';
import { DraftPersistenceService } from '../state/draft-persistence.service';
import {
  importTemplate,
  serializeTemplate,
  suggestExportFileName,
  type ImportTemplateResult,
} from '../state/template-io';

/** The two tabs the dialog offers, matching the export/import mockups (§12.1). */
export type ExportImportTab = 'export' | 'import';

/** How long the Copy button shows its "Copied" confirmation, in milliseconds. */
const COPY_FEEDBACK_MS = 2000;

/** A successfully-parsed import staged for the author to confirm. */
interface StagedImport {
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly result: Extract<ImportTemplateResult, { ok: true }>;
}

/**
 * Reads a `File` as UTF-8 text via {@link FileReader} — the broadly-supported path
 * (and the one the jsdom test environment implements). Rejects on read failure so
 * the caller can surface a clear error.
 */
function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('File read failed'));
    reader.readAsText(file);
  });
}

/** Formats a byte count as a compact `B` / `KB` / `MB` label for the file row. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Export / import Template JSON dialog (E6-S10). A single modal with **Export** and
 * **Import** tabs (brief §12.1), rendered as a native `<dialog>` (`showModal()`) so
 * focus trapping, the top layer and `Escape`-to-close come from the platform — no
 * heavy UI dependency (brief hard rules), matching the {@link PageSetupDialog}
 * pattern.
 *
 * - **Export** shows a live JSON preview of the current template (the store's
 *   document is the source of truth), a `validated` chip driven by the schema
 *   validator, Copy to clipboard, an editable filename and a pretty-print toggle,
 *   and downloads the file as a `Blob`.
 * - **Import** reads a `.json` (drag-or-browse) through the pure
 *   {@link importTemplate} pipeline — parse → migrate → validate — so older
 *   templates are migrated forward and invalid ones are rejected with clear
 *   messages (story QA). Confirming loads it via {@link DesignerStore.loadTemplate}.
 *
 * All serialization/validation/migration lives in the pure, unit-tested
 * `template-io`; this component owns only the browser I/O (clipboard, download,
 * file read) and the dialog chrome.
 */
@Component({
  selector: 'rdr-export-import-dialog',
  imports: [Button],
  templateUrl: './export-import-dialog.html',
  styleUrl: './export-import-dialog.css',
  encapsulation: ViewEncapsulation.Emulated,
})
export class ExportImportDialog {
  private readonly store = inject(DesignerStore);
  private readonly draftPersistence = inject(DraftPersistenceService);
  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  /** The active tab. */
  protected readonly tab = signal<ExportImportTab>('export');

  /** Whether the export preview/download is pretty-printed (on by default). */
  protected readonly prettyPrint = signal(true);

  /** The editable export filename, seeded from the template's metadata name. */
  protected readonly fileName = signal('template.json');

  /** Transient "Copied" confirmation state for the Copy button. */
  protected readonly copied = signal(false);

  /** Whether a file is being dragged over the import drop zone (for highlight). */
  protected readonly dragActive = signal(false);

  /** A parsed, valid import awaiting confirmation, or `null`. */
  protected readonly staged = signal<StagedImport | null>(null);

  /** Messages from the last failed import, or empty. */
  protected readonly importErrors = signal<readonly string[]>([]);

  /** The current document as a (pretty or compact) JSON string for the preview. */
  protected readonly serialized = computed(() =>
    serializeTemplate(this.store.template(), { prettyPrint: this.prettyPrint() }),
  );

  /** True when the current document passes schema validation (drives the chip). */
  protected readonly isValid = computed(() => isValidTemplate(this.store.template()));

  /** Human-readable file size for the staged import row, e.g. `24 KB`. */
  protected readonly stagedSize = computed(() => {
    const staged = this.staged();
    return staged === null ? '' : formatBytes(staged.sizeBytes);
  });

  /** Opens the dialog on the given tab, resetting per-session state. */
  open(tab: ExportImportTab = 'export'): void {
    this.tab.set(tab);
    this.fileName.set(suggestExportFileName(this.store.template()));
    this.prettyPrint.set(true);
    this.copied.set(false);
    this.dragActive.set(false);
    this.staged.set(null);
    this.importErrors.set([]);
    this.dialogRef().nativeElement.showModal();
  }

  /** Closes the dialog (Cancel / `Escape` / backdrop / close button). */
  protected close(): void {
    this.dialogRef().nativeElement.close();
  }

  protected setTab(tab: ExportImportTab): void {
    this.tab.set(tab);
  }

  protected togglePretty(): void {
    this.prettyPrint.update((value) => !value);
  }

  /** Copies the serialized template to the clipboard, showing brief feedback. */
  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard?.writeText(this.serialized());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), COPY_FEEDBACK_MS);
    } catch {
      // Clipboard access can be denied; the preview text is still selectable.
    }
  }

  /**
   * Downloads the current template as a JSON file (E6-S10). The document is
   * validated first so a broken template is never written out; on success a `Blob`
   * is offered through a transient anchor and the object URL is revoked.
   *
   * Saving to a file is the "Save" of the designer's file UX (E6-S11): the document
   * is now marked clean — the status returns to "Saved" and the local autosaved
   * draft is no longer needed, so the autosave effect clears it.
   */
  protected download(): void {
    if (!this.isValid()) return;
    const blob = new Blob([this.serialized()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = this.normalizedFileName();
    anchor.click();
    URL.revokeObjectURL(url);
    this.store.markClean();
  }

  /** Ensures the download name is non-empty and ends in `.json`. */
  private normalizedFileName(): string {
    const trimmed = this.fileName().trim();
    const base = trimmed.length > 0 ? trimmed : 'template.json';
    return base.toLowerCase().endsWith('.json') ? base : `${base}.json`;
  }

  /** Opens the OS file picker for import. */
  protected openPicker(): void {
    this.fileInput().nativeElement.click();
  }

  /** Handles a file chosen via the picker; resets the input so re-pick re-fires. */
  protected async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) await this.ingest(file);
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragActive.set(true);
  }

  protected onDragLeave(): void {
    this.dragActive.set(false);
  }

  /** Accepts a file dropped onto the zone. */
  protected async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.dragActive.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) await this.ingest(file);
  }

  /** Reads + parses a candidate file, staging it on success or showing errors. */
  private async ingest(file: File): Promise<void> {
    let text: string;
    try {
      text = await readFileText(file);
    } catch {
      this.staged.set(null);
      this.importErrors.set(["That file couldn't be read."]);
      return;
    }
    const result = importTemplate(text);
    if (!result.ok) {
      this.staged.set(null);
      this.importErrors.set(result.errors);
      return;
    }
    this.importErrors.set([]);
    this.staged.set({ fileName: file.name, sizeBytes: file.size, result });
  }

  /**
   * Loads the staged template into the designer and closes (E6-S10). Replacing the
   * current document is destructive, so it goes behind the unsaved-changes guard
   * (E6-S11): if the open document has unsaved edits the author must confirm first.
   */
  protected confirmImport(): void {
    const staged = this.staged();
    if (staged === null) return;
    if (!this.draftPersistence.confirmDiscard()) return;
    this.store.loadTemplate(staged.result.template);
    this.close();
  }
}
