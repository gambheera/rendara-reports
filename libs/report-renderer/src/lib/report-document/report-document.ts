import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { PaginatedDocument, PaginatedPage, Watermark } from '@rendara/report-engine';
import type { RendaraTemplate } from '@rendara/report-schema';

import {
  resolveZoomFactor,
  slotSize,
  type PageLayoutMode,
  type SheetSize,
  type ViewportSize,
  type ZoomSpec,
} from '../document-view-model';
import { ReportRenderer } from '../report-renderer/report-renderer';
import type { RenderMode, StyleMap } from '../page-view-model';
import { RENDERER_DOCUMENT_CSS, RENDERER_PRINT_CSS, RENDERER_THEME_CSS } from '../renderer-styles';

/**
 * Multi-page document renderer (E4-S4) — wraps the single-page
 * {@link ReportRenderer} to paint a whole engine {@link PaginatedDocument}: **N
 * pages** at one resolved **zoom** (fit-width / fit-page / explicit %), in a
 * **single** or **continuous** layout (the layout hook the viewer drives later).
 *
 * The hard parts live in the pure {@link buildDocumentViewModel document
 * view-model}: {@link resolveZoomFactor} turns the {@link ZoomSpec} into one
 * scale factor (all pages share geometry), and {@link slotSize} reserves the
 * *scaled* layout box around each sheet so pages stack with no overlap or gap at
 * any zoom (the zoom is a CSS transform, which does not shrink the layout box).
 * Each page is delegated to a child {@link ReportRenderer} at that factor, so the
 * per-page geometry/content/table painting (E4-S1…S3) is reused verbatim — true
 * WYSIWYG, one renderer.
 *
 * Fit modes need the area the document is shown in. The component measures its own
 * host with a `ResizeObserver` (SSR-guarded), or a host can supply
 * {@link availableSize} directly (also used by tests for determinism). The
 * resolved factor is emitted via {@link zoomChange} so a toolbar can show "100%".
 *
 * E4-S5 adds **style isolation & theming**: the shared {@link RENDERER_THEME_CSS}
 * resets inheritable host typography and declares the `--rdr-*` theme tokens, and
 * {@link RENDERER_DOCUMENT_CSS} carries the (tokenised) multi-page chrome (each
 * page's own chrome stays with the child {@link ReportRenderer}). It stays on the
 * default `ViewEncapsulation.Emulated`; the opt-in Shadow-DOM {@link ReportSurface}
 * wraps this component for a fully isolated embedded viewer.
 *
 * E4-S6 adds the **design-mode** flag: a {@link mode} input forwarded verbatim to
 * every child {@link ReportRenderer}, so the designer can drive the whole
 * multi-page document as its canvas with per-element selection anchors. View mode
 * (the default) forwards nothing extra, keeping the viewer DOM byte-stable.
 *
 * E4-S7 forwards the document-level **watermark** ({@link PaginatedDocument.watermark})
 * to every child {@link ReportRenderer}, so the centred, rotated text/image overlay
 * is stamped behind the content of every page. `null` (no watermark) is unchanged.
 *
 * E4-S8 carries the shared {@link RENDERER_PRINT_CSS} print stylesheet so the
 * stacked pages collapse their inter-page gaps and the grey backdrop turns white
 * under `@media print`; it never affects on-screen rendering or the DOM.
 */
@Component({
  selector: 'rdr-report-document',
  imports: [ReportRenderer],
  templateUrl: './report-document.html',
  styles: [RENDERER_THEME_CSS, RENDERER_DOCUMENT_CSS, RENDERER_PRINT_CSS],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportDocument {
  private readonly host = inject(ElementRef<HTMLElement>);

  /** The paginated document to render (every page + shared geometry). */
  readonly document = input.required<PaginatedDocument>();
  /** Source template, forwarded to every page for content/style. */
  readonly template = input<RendaraTemplate | null>(null);
  /** Resolved binding display strings by element id, forwarded to every page. */
  readonly resolvedValues = input<ReadonlyMap<string, string>>(new Map());
  /** CSS colour for every page's sheet fill; `null` → white paper. */
  readonly background = input<string | null>(null);
  /** Zoom spec: an explicit scale factor or a fit mode. Defaults to `1` (100%). */
  readonly zoom = input<ZoomSpec>(1);
  /** Paint every page (`'continuous'`, default) or only the {@link currentPage}. */
  readonly layout = input<PageLayoutMode>('continuous');
  /** 1-based page to show in `'single'` layout; clamped to the document. Defaults to `1`. */
  readonly currentPage = input<number>(1);
  /** Render mode (E4-S6), forwarded to every page; `'view'` (default) or `'design'`. */
  readonly mode = input<RenderMode>('view');
  /**
   * Explicit viewport size for resolving the fit zoom modes. When `null` (the
   * default) the component measures its own host with a `ResizeObserver`. A host
   * that already knows its viewport (or a test) can pin it here.
   */
  readonly availableSize = input<ViewportSize | null>(null);

  /** Emits the resolved scale factor whenever it changes (e.g. for a "100%" readout). */
  readonly zoomChange = output<number>();

  /** Host size measured by the `ResizeObserver`; `null` until first measured. */
  private readonly measuredSize = signal<ViewportSize | null>(null);

  /** The shared sheet size (uniform across pages), in natural px. */
  protected readonly sheet = computed<SheetSize>(() => {
    const { pagePx } = this.document().geometry;
    return { widthPx: pagePx.widthPx, heightPx: pagePx.heightPx };
  });

  /** The resolved scale factor for the current spec + viewport. */
  protected readonly effectiveZoom = computed<number>(() =>
    resolveZoomFactor(this.zoom(), this.sheet(), this.availableSize() ?? this.measuredSize()),
  );

  /** The pages to paint: every page in `'continuous'`, just the current one in `'single'`. */
  protected readonly visiblePages = computed<readonly PaginatedPage[]>(() => {
    const doc = this.document();
    if (this.layout() === 'single') {
      const index = Math.min(Math.max(1, this.currentPage()), doc.pageCount) - 1;
      const page = doc.pages[index];
      return page ? [page] : [];
    }
    return doc.pages;
  });

  /** The shared page geometry, forwarded to each child renderer. */
  protected readonly geometry = computed(() => this.document().geometry);

  /** The document-level watermark (E4-S7), forwarded to each child renderer; `null` → none. */
  protected readonly watermark = computed<Watermark | null>(() => this.document().watermark);

  /** The scaled layout box reserved around each page sheet at the current zoom. */
  protected readonly slot = computed<SheetSize>(() => slotSize(this.sheet(), this.effectiveZoom()));

  constructor() {
    const destroyRef = inject(DestroyRef);
    // Track the host size for the fit zoom modes once the host element exists.
    afterNextRender(() => {
      this.observeHostSize(destroyRef);
    });
    // Emit the resolved factor on change so a host toolbar can display it.
    let lastEmitted = Number.NaN;
    effect(() => {
      const factor = this.effectiveZoom();
      if (factor !== lastEmitted) {
        lastEmitted = factor;
        this.zoomChange.emit(factor);
      }
    });
  }

  /** Inline styles for one page slot: the scaled layout box that reserves space. */
  protected slotStyle(): StyleMap {
    const { widthPx, heightPx } = this.slot();
    return { width: `${widthPx}px`, height: `${heightPx}px` };
  }

  /**
   * Wires a `ResizeObserver` on the host so the fit zoom modes track the area the
   * document is shown in. No-op when {@link availableSize} is supplied (the host
   * owns sizing) or when `ResizeObserver` is unavailable (SSR / older runtimes).
   */
  private observeHostSize(destroyRef: DestroyRef): void {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const element = this.host.nativeElement;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const { width, height } = entry.contentRect;
      this.measuredSize.set({ widthPx: width, heightPx: height });
    });
    observer.observe(element);
    destroyRef.onDestroy(() => observer.disconnect());
  }
}
