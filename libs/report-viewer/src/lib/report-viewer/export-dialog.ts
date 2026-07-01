import { A11yModule } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';

/** Which pages the export should include. */
export type ExportPageScope = 'all' | 'current' | 'range';

/** The user's choices when they confirm the export dialog (E8-S3). */
export interface ExportDialogResult {
  /** The download filename (a `.pdf` suffix is ensured by the parent). */
  readonly filename: string;
  /** Page scope: every page, just the current one, or an explicit range. */
  readonly scope: ExportPageScope;
  /** 1-based inclusive range bounds, meaningful only when `scope === 'range'`. */
  readonly rangeFrom: number;
  readonly rangeTo: number;
  /** Whether to stamp the document watermark into the export. */
  readonly includeWatermark: boolean;
}

/**
 * The viewer's **Export PDF** dialog (E8-S3), matching the
 * `report_viewer_export_watermark_dialogs` mockup (reconciled per brief §12.3):
 * Filename · Pages (All / Current / Range) · Quality · Include-watermark toggle ·
 * the "Generated in your browser — no data leaves the page." reassurance ·
 * Cancel / Export PDF.
 *
 * It is a **controlled, presentational** dialog: it owns only its form state and
 * emits the user's choices through {@link confirmExport} (or {@link cancel}); the
 * {@link ReportViewer} resolves them into a {@link PdfExportRequest} and drives the
 * swappable exporter. It is accessible — `role="dialog"`, `aria-modal`, a CDK
 * focus trap with initial focus, Escape to cancel, and a backdrop click to
 * dismiss — and styled with the viewer's own scoped `--rdr-viewer-*` tokens so it
 * never leaks into or inherits from the host.
 *
 * The **Quality/size** control is shown for fidelity with the mockup but is
 * *informational* on the default client-side path: that path emits vector text, so
 * there is no raster quality to trade off (ADR 0012). It is retained as a
 * forward-looking hook for raster/server exporters.
 */
@Component({
  selector: 'rdr-export-dialog',
  imports: [A11yModule],
  templateUrl: './export-dialog.html',
  styleUrl: './export-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportDialog {
  /** The initial filename to pre-fill (the parent ensures a `.pdf` suffix on confirm). */
  readonly defaultFilename = input('report.pdf');

  /** Total pages in the report (bounds the range inputs). */
  readonly totalPages = input(1);

  /** The page currently in view (the target of the "Current" scope). */
  readonly currentPage = input(1);

  /** Whether the report has a watermark configured (gates the toggle's effect). */
  readonly hasWatermark = input(false);

  /** Emitted with the user's choices when they confirm the export. */
  readonly confirmExport = output<ExportDialogResult>();

  /** Emitted when the user dismisses the dialog (button, backdrop, or Escape). */
  readonly dismiss = output<void>();

  protected readonly filename = signal('report.pdf');
  protected readonly scope = signal<ExportPageScope>('all');
  protected readonly rangeFrom = signal(1);
  protected readonly rangeTo = signal(1);
  protected readonly includeWatermark = signal(true);

  /** A stable id for the `aria-labelledby` association. */
  protected readonly titleId = 'rdr-export-dialog-title';

  /** The "Current" scope chip shows which page it targets. */
  protected readonly currentLabel = computed(() => `Current (${this.currentPage()})`);

  constructor() {
    // Seed the form from the inputs whenever they change (the dialog is created
    // fresh per open, so this primarily applies the initial values).
    effect(() => {
      this.filename.set(this.defaultFilename());
    });
    effect(() => {
      this.includeWatermark.set(this.hasWatermark());
    });
    effect(() => {
      this.rangeTo.set(this.totalPages());
    });
  }

  protected setScope(scope: ExportPageScope): void {
    this.scope.set(scope);
  }

  protected onFilenameInput(event: Event): void {
    this.filename.set((event.target as HTMLInputElement).value);
  }

  protected onRangeFromInput(event: Event): void {
    this.rangeFrom.set(Number((event.target as HTMLInputElement).value));
  }

  protected onRangeToInput(event: Event): void {
    this.rangeTo.set(Number((event.target as HTMLInputElement).value));
  }

  protected toggleWatermark(): void {
    this.includeWatermark.update((on) => !on);
  }

  /** Confirms the export, emitting the (lightly normalised) form state. */
  protected onExport(): void {
    this.confirmExport.emit({
      filename: this.filename().trim() || this.defaultFilename(),
      scope: this.scope(),
      rangeFrom: this.rangeFrom(),
      rangeTo: this.rangeTo(),
      includeWatermark: this.includeWatermark(),
    });
  }

  protected onCancel(): void {
    this.dismiss.emit();
  }

  /** Escape anywhere in the dialog cancels it. */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.onCancel();
    }
  }
}
