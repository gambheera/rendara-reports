import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ReportDocument } from '@rendara/report-renderer';
import { textDirection, type TextDirection } from '@rendara/report-engine';
import { I18nService } from '@rendara/ui-kit';
import { DesignerStore, MAX_ZOOM, MIN_ZOOM } from '../state/designer-store';
import { BindingPreviewService } from '../state/binding-preview';
import { TablePreviewService } from '../state/table-preview';

/** Zoom step applied by the preview −/+ buttons, in percentage points. */
const ZOOM_STEP_PERCENT = 10;

/** The preview's placeholder document name, mirroring the editor top bar (E5-S1). */
const DOCUMENT_NAME = 'Untitled invoice';

/**
 * Live preview mode (E6-S9) — a viewer-style render of the current document with
 * the imported sample data, replacing the editing chrome (no palette, properties,
 * rulers, grid or selection overlay). It hosts the **shared renderer**
 * ({@link ReportDocument}) in **view** mode, fed by the very same derived model the
 * canvas paints in design mode: the store's {@link DesignerStore.paginatedDocument}
 * (shared engine pagination + the E6-S8 resolved tables) and
 * {@link BindingPreviewService.resolvedValues} (the shared sandboxed JSONata +
 * `Intl` binding resolution). Because both views derive from one model, the preview
 * is byte-for-byte what the viewer will produce for the same template + data — true
 * WYSIWYG, one renderer, no separate code path (brief §7, story QA).
 *
 * The page is shown one sheet at a time with prev/next navigation (matching the
 * preview mockup's `‹ n / total ›`), so a multi-page document is fully reachable.
 * Zoom and the current page are **preview-local** signals: entering preview never
 * disturbs the editor's canvas zoom, and `Back to editor` (or `Escape`) returns to
 * the exact editing state.
 *
 * {@link BindingPreviewService} and {@link TablePreviewService} are root services
 * whose resolvers run via effects; they are injected here so the resolved sample
 * values stay live in preview independently of the (now-unmounted) canvas.
 */
@Component({
  selector: 'rdr-preview-mode',
  imports: [ReportDocument],
  templateUrl: './preview-mode.html',
  styleUrl: './preview-mode.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.Emulated,
  host: { class: 'rdr-preview', '(keydown.escape)': 'exit()' },
})
export class PreviewMode {
  protected readonly store = inject(DesignerStore);
  protected readonly preview = inject(BindingPreviewService);

  /** Designer i18n (E10-S2): the template calls `i18n.t(...)` for its chrome strings. */
  protected readonly i18n = inject(I18nService);

  /** Placeholder document name shown beside the PREVIEW badge. */
  protected readonly documentName = DOCUMENT_NAME;

  /** Preview-local zoom factor (1 = 100%), independent of the editor canvas zoom. */
  private readonly zoomFactor = signal(1);

  /** Preview-local 1-based current page, clamped to the rendered document. */
  private readonly currentPage = signal(1);

  /** The page to render, clamped into `[1, pageCount]` as the document changes. */
  protected readonly page = computed(() =>
    Math.min(Math.max(1, this.currentPage()), this.store.pageCount()),
  );

  /** Resolved zoom factor for the renderer. */
  protected readonly zoom = computed(() => this.zoomFactor());

  /**
   * Base text direction of the preview (E10-S2), derived from the template's
   * `metadata.locale` via {@link textDirection}. An Arabic/Hebrew/… template
   * previews right-to-left — exactly what the viewer will render for the same
   * template (brief §7, "one renderer, two modes").
   */
  protected readonly direction = computed<TextDirection>(() =>
    textDirection(this.store.template().metadata.locale),
  );

  /** Zoom as an integer percentage for the toolbar readout (e.g. 100). */
  protected readonly zoomPercent = computed(() => Math.round(this.zoomFactor() * 100));

  /** `n / total` page counter for the toolbar. */
  protected readonly pageLabel = computed(() => `${this.page()} / ${this.store.pageCount()}`);

  /** The data-source hint: the imported file name, or a no-data note (localised, E10-S2). */
  protected readonly sourceHint = computed(() => {
    const sample = this.store.sampleData();
    return sample === null
      ? this.i18n.t('preview.noSampleData')
      : this.i18n.t('preview.renderedWith', { fileName: sample.fileName });
  });

  /** True when there is a previous/next page to navigate to. */
  protected readonly canPrev = computed(() => this.page() > 1);
  protected readonly canNext = computed(() => this.page() < this.store.pageCount());

  constructor() {
    // Keep the table-preview resolver alive in preview (it is otherwise only
    // instantiated by the canvas, which is unmounted here) so bound tables show
    // their rows + totals against the imported sample data.
    inject(TablePreviewService);
  }

  /** Returns to the editor (E6-S9), preserving the editing state. */
  protected exit(): void {
    this.store.exitPreview();
  }

  /** Steps to the previous/next page, clamped to the document. */
  protected prevPage(): void {
    this.currentPage.set(Math.max(1, this.page() - 1));
  }

  protected nextPage(): void {
    this.currentPage.set(Math.min(this.store.pageCount(), this.page() + 1));
  }

  /** Steps the zoom out/in by {@link ZOOM_STEP_PERCENT}, clamped to the canvas bounds. */
  protected zoomOut(): void {
    this.setZoomPercent(this.zoomPercent() - ZOOM_STEP_PERCENT);
  }

  protected zoomIn(): void {
    this.setZoomPercent(this.zoomPercent() + ZOOM_STEP_PERCENT);
  }

  private setZoomPercent(percent: number): void {
    this.zoomFactor.set(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, percent / 100)));
  }
}
