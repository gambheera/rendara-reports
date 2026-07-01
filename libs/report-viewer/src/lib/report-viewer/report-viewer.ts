import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { type RendaraTemplate, type RendaraValidationError } from '@rendara/report-schema';
import { ReportDocument, type ViewportSize } from '@rendara/report-renderer';
import type { Watermark } from '@rendara/report-engine';

import { runPipeline, type PipelineResult } from './report-pipeline';
import {
  clampPage,
  keyToNavIntent,
  resolveNavIntent,
  type PageNavIntent,
} from './viewer-navigation';
import {
  canZoomIn,
  canZoomOut,
  formatZoomPercent,
  zoomIn,
  zoomOptions,
  zoomOut,
  zoomSpecToValue,
  zoomValueToSpec,
  type ZoomOption,
} from './viewer-zoom';
import {
  DEFAULT_TOOLBAR_CONFIG,
  DEFAULT_VIEWER_CONFIG,
  type PageChangeEvent,
  type PdfExporter,
  type PdfExportRequest,
  type RenderedEvent,
  type ViewerConfig,
  type ViewerError,
  type ViewerPageMode,
  type ViewerTheme,
  type ViewerToolbarConfig,
  type ViewerZoom,
} from './viewer-api';
import { defaultPdfExporter } from './default-pdf-exporter';
import { downloadBlob } from './file-download';
import { ensureExtension, slugifyFilename } from './filename';
import { serializeTemplateSource, sourceFilename } from './viewer-source';
import { buildSearchHits, cycleHitIndex, formatMatchCount, type SearchHit } from './viewer-search';
import { ExportDialog, type ExportDialogResult } from './export-dialog';
import { WatermarkDialog, type WatermarkDialogResult } from './watermark-dialog';

/** The successful arm of {@link PipelineResult}: the model the renderer paints. */
type RenderModel = Extract<PipelineResult, { status: 'rendered' }>;

/** Natural content width (px) of a page thumbnail in the navigation rail. */
const THUMBNAIL_WIDTH_PX = 104;

/**
 * The embeddable report viewer (`@rendara/report-viewer`).
 *
 * **E7-S1 established the public component API** (brief §8) — the typed,
 * documented input/output surface a host app integrates against. **E7-S2 wires
 * the render pipeline** behind it:
 *
 * - **Inputs** (all signal-based): {@link template} (a validated
 *   {@link RendaraTemplate} or a raw JSON string), {@link data} (arbitrary
 *   JSON), {@link config} ({@link ViewerConfig}) and {@link theme}
 *   ({@link ViewerTheme} `--rdr-*` overrides).
 * - **Outputs**: {@link rendered} (`{ pageCount }`), {@link pageChange}
 *   (`{ current, total }`) and {@link error} (a surfaced, never-thrown failure).
 *
 * On any change to {@link template}/{@link data}/{@link config} the component
 * runs the shared {@link runPipeline} (validate → bind → paginate via the engine)
 * and paints the resulting {@link PaginatedDocument} through the shared
 * {@link ReportDocument} renderer — the *same* engine path the designer preview
 * uses, so what was designed is exactly what renders (brief §7). A successful
 * pass emits {@link rendered}; a surfaced failure emits {@link error} instead of
 * crashing. Resolution is async, so the result is delivered through a signal
 * guarded by a monotonic token: a stale resolution never overwrites a newer one.
 *
 * It is **SSR-safe**: this component touches no browser-only API directly. The
 * {@link theme} is applied through an Angular host `[style]` binding, the
 * pipeline is pure TypeScript, and the shared renderer it composes already
 * guards `ResizeObserver` (used for the fit zoom modes). Standalone and
 * tree-shakeable per brief §8.
 *
 * **E7-S3 adds page navigation** on top of this pipeline: a 1-based
 * {@link currentPage} the user drives with the next/prev/goto controls, a
 * keyboard map (arrows / `PageUp`·`PageDown` / `Home`·`End`), and a left
 * **thumbnail rail**. In `'single'` {@link pageMode} the {@link ReportDocument}
 * paints only the current page; in `'continuous'` mode it paints the stack and
 * navigation scrolls the target sheet into view while scrolling the document
 * keeps the page indicator in sync (a live-DOM scroll spy). Every page change is
 * surfaced through the brief-§8 {@link pageChange} output. The navigation
 * arithmetic is the pure {@link clampPage}/{@link resolveNavIntent} helpers, so
 * the bounds logic is tested without the DOM.
 *
 * **E7-S4 adds interactive zoom** on top of this pipeline. The user drives a
 * {@link zoomSpec} — an explicit factor or a `fit-width`/`fit-page` mode — through
 * a `−`/`%`/`+` stepper and a fit-mode dropdown; the spec is forwarded to the main
 * {@link ReportDocument}, which already owns the fit-math and re-resolves the fit
 * modes on container resize via its own `ResizeObserver`. The viewer reflects the
 * document's resolved factor (its {@link ReportDocument.zoomChange} output) in the
 * percent readout and uses it as the base the stepper steps from, so zooming out
 * of a fit mode is predictable. The zoom arithmetic is the pure {@link zoomIn} /
 * {@link zoomOut} / {@link zoomOptions} helpers, tested without the DOM. The
 * thumbnail rail stays pinned to `fit-width` regardless of the main zoom.
 *
 * **E7-S5 adds the loading / empty / error states** so the viewer never shows a
 * blank crash. A {@link viewStatus} drives a `@switch`: while the (async)
 * pipeline is in flight it is `'loading'` (spinner + skeleton); a `null`/blank
 * template or a template with no `data` to bind settles to `'empty'`
 * ("No data to display"); a surfaced {@link ViewerError} settles to `'error'`
 * (a calm danger icon + the reason + a **View details** disclosure for the
 * structured validator problems) *and* still emits the brief-§8 `(error)`; a
 * successful pass is `'rendered'` and paints the navigation chrome. Loading is
 * seeded synchronously at pipeline kickoff and, like the result, is token-guarded
 * so a stale resolution can never flip a newer load. Because the pipeline effect
 * depends only on `template`/`data`/`config`, the loading state never flashes
 * during page navigation or zoom.
 *
 * **E8-S1 makes the toolbar configurable** (brief §8). The recessive top bar is
 * now a three-zone `role="toolbar"`: the document title (from
 * {@link RendaraTemplate} metadata) on the left, the page-navigation and zoom
 * groups in the centre, and the Print / Export / Watermark action buttons plus a
 * host **custom-action slot** (`[rdr-toolbar-actions]` content projection) on the
 * right. Each control is shown/hidden by a flag on {@link ViewerToolbarConfig}
 * (`config.toolbar`), resolved against {@link DEFAULT_TOOLBAR_CONFIG} so every
 * flag is concrete; a hidden control is absent from the DOM, and `visible: false`
 * drops the whole bar.
 *
 * **E8-S2 wires the Print action** (brief §7). The component carries a hidden
 * **print-only mirror** of every page, each rendered through the *same* shared
 * {@link ReportDocument} at natural size (zoom 1) — so what prints is exactly what
 * was designed, with vector (DOM) text. On screen the mirror is `display:none`;
 * under `@media print` the interactive shell is hidden and the mirror is shown,
 * with a viewer-owned `break-after: page` putting one sheet on each paper page,
 * over the renderer's shared print stylesheet (ADR 0010/0011). The Print button
 * calls the native {@link onPrint} (`window.print()`), guarded for SSR.
 *
 * **E8-S3 wires the Export PDF action** (brief §7). The button opens an accessible
 * {@link ExportDialog} (filename · pages · quality · include-watermark) whose
 * choices the component resolves into a {@link PdfExportRequest} and hands to a
 * **swappable** {@link PdfExporter} — `config.pdfExporter` if the host supplied
 * one, else the {@link defaultPdfExporter}, which renders a selectable-text,
 * vector PDF in the browser via the shared renderer (no heavy dependency, no
 * rasterisation; ADR 0012) and downloads it.
 *
 * **E8-S4 wires the Watermark action** (brief §8). The button opens an accessible
 * {@link WatermarkDialog} (enable · text/image · opacity · angle · color) whose
 * resolved {@link Watermark} the component holds in {@link activeWatermark} — a
 * signal seeded from `config.watermark` and re-synced when the host changes it,
 * but otherwise owned by the dialog so a user-set watermark persists across
 * re-renders. Because the pipeline reads {@link activeWatermark}, the watermark
 * flows through the *same* render path to the on-screen pages, the print mirror
 * (E8-S2) and the PDF export (E8-S3) alike — stamped on every page, honoured in
 * print and export (story acceptance).
 *
 * **E8-S5 adds the Download-source action** (optional viewer extra). A toolbar
 * button ({@link onDownloadSource}) downloads the report's *source* — its
 * validated {@link RendaraTemplate} (the schema contract, brief §5) — as a
 * canonical, pretty-printed JSON file, named from `config.sourceFilename` / the
 * document title. The serialisation re-imports to an equivalent template (schema
 * round-trip) and the download goes through the shared, SSR-guarded
 * {@link downloadBlob}. The button is gated by the `config.toolbar.source` flag
 * like every other action.
 *
 * **E8-S6 adds in-report text search** (optional viewer extra). A toolbar Find
 * toggle opens a compact search bar; the query is forwarded as the
 * {@link ReportDocument.highlight} of the on-screen document only, so the shared
 * renderer paints every matching run of a text element / table cell / group label
 * as a `<mark>` (print, thumbnails and PDF export stay highlight-free). The match
 * index is computed purely from the rendered model ({@link buildSearchHits}), so
 * the `N / total` count and next/prev navigation are correct in any page mode; the
 * active match is painted + scrolled into view by a live-DOM {@link afterRenderEffect}.
 * The whole control is gated by the `config.toolbar.search` flag.
 *
 * **E8-S7 makes the thumbnail rail optional** (optional viewer extra). The left
 * rail itself (mini single-page renders, active-page outline, click-to-jump) has
 * existed since E7-S3; this story makes it *optional* per the brief-§12.2 "optional
 * left thumbnail rail". A toolbar toggle button ({@link toggleThumbnails}) shows /
 * hides the rail at runtime via {@link thumbnailsOpen} — a hidden rail is absent
 * from the DOM, not just visually collapsed. The rail's initial visibility comes
 * from `config.thumbnails` (seeded like {@link initialZoom}: a user toggle persists
 * across re-renders, but a deliberate config change re-syncs), and the toggle
 * button is gated by the `config.toolbar.thumbnails` flag like every other action.
 */
@Component({
  selector: 'rdr-report-viewer',
  imports: [ReportDocument, ExportDialog, WatermarkDialog],
  templateUrl: './report-viewer.html',
  styleUrl: './report-viewer.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'rdr-report-viewer',
    '[style]': 'themeStyle()',
    '(keydown)': 'onKeydown($event)',
  },
})
export class ReportViewer {
  /**
   * The report template: a validated {@link RendaraTemplate} object or a raw
   * JSON string parsed/validated by the pipeline. `null` paints nothing.
   */
  readonly template = input<RendaraTemplate | string | null>(null);

  /** The data to bind into the template — arbitrary host JSON. */
  readonly data = input<unknown>(null);

  /** Runtime configuration (locale, zoom, toolbar, watermark, page mode). */
  readonly config = input<ViewerConfig>({});

  /** CSS custom-property (`--rdr-*`) overrides, applied to the viewer host. */
  readonly theme = input<ViewerTheme | null>(null);

  /** Emitted once a template+data render completes (E7-S2). */
  readonly rendered = output<RenderedEvent>();

  /** Emitted when the visible page changes (E7-S3). */
  readonly pageChange = output<PageChangeEvent>();

  /**
   * Emitted on a surfaced (never thrown) validation/binding/render failure. The
   * name `error` is the brief-§8 public API contract; the native DOM-event-name
   * lint rule is intentionally suppressed for it.
   */
  // eslint-disable-next-line @angular-eslint/no-output-native -- brief §8 public output name
  readonly error = output<ViewerError>();

  /** The host config with every optional field resolved to a concrete default. */
  protected readonly resolvedConfig = computed<ViewerConfig>(() => ({
    ...DEFAULT_VIEWER_CONFIG,
    ...this.config(),
  }));

  /** The `--rdr-*` overrides as a host style map; `{}` when no theme is set. */
  protected readonly themeStyle = computed<Record<string, string>>(() => this.theme() ?? {});

  /**
   * The resolved toolbar config (E8-S1): the host's `config.toolbar` spread over
   * {@link DEFAULT_TOOLBAR_CONFIG}, so each per-button flag is concrete and the
   * template's `@if` show/hide checks never read `undefined`.
   */
  protected readonly toolbar = computed<Required<ViewerToolbarConfig>>(() => ({
    ...DEFAULT_TOOLBAR_CONFIG,
    ...(this.resolvedConfig().toolbar ?? {}),
  }));

  /** The document title shown on the left of the toolbar (template metadata); `''` until rendered. */
  protected readonly documentTitle = computed<string>(
    () => this.renderModel()?.template.metadata.name ?? '',
  );

  /** The host-configured initial zoom; seeds {@link zoomSpec} and re-syncs it on change. */
  protected readonly initialZoom = computed<ViewerZoom>(
    () => this.resolvedConfig().initialZoom ?? 'fit-width',
  );

  /**
   * The active zoom the user drives (E7-S4): an explicit factor or a fit mode,
   * forwarded to the main {@link ReportDocument}. Seeded from {@link initialZoom}
   * and re-synced whenever the host changes `config.initialZoom`, but otherwise
   * owned by the controls so user zoom persists across re-renders.
   */
  protected readonly zoomSpec = signal<ViewerZoom>('fit-width');

  /**
   * The factor the renderer resolved the {@link zoomSpec} to (a fit mode resolves
   * against the live container). Drives the percent readout and is the base the
   * stepper steps from. Updated from the document's `(zoomChange)`.
   */
  protected readonly resolvedZoomFactor = signal(1);

  /** The resolved zoom as a whole-percent readout, e.g. `"100%"`. */
  protected readonly zoomPercentLabel = computed<string>(() =>
    formatZoomPercent(this.resolvedZoomFactor()),
  );

  /** The fit-mode dropdown's current `<select>` value (mirrors {@link zoomSpec}). */
  protected readonly zoomSelectValue = computed<string>(() => zoomSpecToValue(this.zoomSpec()));

  /** The dropdown options: fit modes + the level ladder, always including the active spec. */
  protected readonly zoomOptionList = computed<readonly ZoomOption[]>(() =>
    zoomOptions(this.zoomSpec()),
  );

  /** Whether the `+` / `−` stepper buttons can act, for disabling at the zoom bounds. */
  protected readonly canZoomIn = computed<boolean>(() => canZoomIn(this.resolvedZoomFactor()));
  protected readonly canZoomOut = computed<boolean>(() => canZoomOut(this.resolvedZoomFactor()));

  /** Single-page vs. continuous layout forwarded to the renderer. */
  protected readonly pageMode = computed<ViewerPageMode>(
    () => this.resolvedConfig().pageMode ?? 'continuous',
  );

  /** The rendered model painted by the shared renderer, or `null` (empty/error/pending). */
  protected readonly renderModel = signal<RenderModel | null>(null);

  /**
   * Which feedback state the viewer presents (E7-S5). Seeded `'loading'` because
   * the pipeline effect runs immediately on mount; settles to `'empty'`,
   * `'error'` or `'rendered'` when the pipeline resolves.
   */
  protected readonly viewStatus = signal<'loading' | 'empty' | 'error' | 'rendered'>('loading');

  /** The surfaced failure for the `'error'` state; `null` in every other state. */
  protected readonly viewError = signal<ViewerError | null>(null);

  /** The structured validator problems for the error disclosure; `[]` when none. */
  protected readonly errorDetails = computed<readonly RendaraValidationError[]>(
    () => this.viewError()?.details ?? [],
  );

  /** Whether the error **View details** disclosure is expanded. */
  protected readonly detailsOpen = signal(false);

  /** Whether the Export PDF dialog is open (E8-S3). */
  protected readonly exportOpen = signal(false);

  /** Whether the Watermark dialog is open (E8-S4). */
  protected readonly watermarkOpen = signal(false);

  /**
   * The watermark stamped on every page (E8-S4): seeded from `config.watermark`,
   * re-synced when the host changes it, but otherwise owned by the
   * {@link WatermarkDialog} so a user-set watermark persists across re-renders.
   * The pipeline reads this, so it flows to screen, print and export alike.
   */
  protected readonly activeWatermark = signal<Watermark | null>(null);

  /** Whether a watermark is configured, gating the export dialog's include-watermark toggle. */
  protected readonly hasWatermark = computed<boolean>(() => this.activeWatermark() !== null);

  /**
   * The default export filename: the host's `config.exportFilename` if set, else a
   * slug of the document title, else `report.pdf`. The `.pdf` suffix is ensured.
   */
  protected readonly exportFilename = computed<string>(() => {
    const configured = this.resolvedConfig().exportFilename;
    const base = configured ?? slugifyFilename(this.documentTitle()) ?? 'report';
    return ensureExtension(base, '.pdf');
  });

  /** 1-based page currently in view; `0` when nothing is rendered. Drives the controls. */
  protected readonly currentPage = signal(0);

  /** Total pages produced by pagination; `0` when nothing is rendered. */
  protected readonly totalPages = computed<number>(
    () => this.renderModel()?.document.pageCount ?? 0,
  );

  /** Whether prev/next are available, for disabling the controls at the document bounds. */
  protected readonly canPrev = computed<boolean>(() => this.currentPage() > 1);
  protected readonly canNext = computed<boolean>(
    () => this.currentPage() > 0 && this.currentPage() < this.totalPages(),
  );

  /** Every page number, `[1..total]`, to drive the thumbnail rail's `@for`. */
  protected readonly pageNumbers = computed<readonly number[]>(() =>
    Array.from({ length: this.totalPages() }, (_, i) => i + 1),
  );

  /**
   * Fixed viewport that fits each thumbnail's `fit-width` zoom to the rail width.
   * `fit-width` resolves on width alone, so the height is just a large positive
   * value that lets any sheet (portrait or landscape) fit by width.
   */
  protected readonly thumbnailSize = computed<ViewportSize>(() => ({
    widthPx: THUMBNAIL_WIDTH_PX,
    heightPx: THUMBNAIL_WIDTH_PX * 100,
  }));

  /**
   * Whether the left thumbnail rail is shown (E8-S7). Seeded from
   * `config.thumbnails` and re-synced when the host changes it, but otherwise owned
   * by the toolbar toggle so a user's choice persists across re-renders. When
   * `false` the rail is absent from the DOM entirely.
   */
  protected readonly thumbnailsOpen = signal(true);

  /** The scrolling page area; present only once a document is rendered. */
  private readonly scrollArea = viewChild<ElementRef<HTMLElement>>('scrollArea');

  /** The Find input, present only while the search bar is open (for autofocus). */
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  /** Whether the in-report Find bar is open (E8-S6). */
  protected readonly searchOpen = signal(false);

  /** The current Find query; drives the highlight and the match index. */
  protected readonly searchQuery = signal('');

  /** The active match's index into {@link searchHits}; `-1` when none is active. */
  private readonly activeHitIndexRaw = signal(-1);

  /**
   * Every match for the current query across the whole document, in paint order
   * (E8-S6). Recomputed purely from the rendered model via {@link buildSearchHits},
   * so the count and navigation are correct in any page mode.
   */
  protected readonly searchHits = computed<readonly SearchHit[]>(() =>
    buildSearchHits(this.renderModel(), this.searchQuery()),
  );

  /** Total matches for the current query. */
  protected readonly matchCount = computed<number>(() => this.searchHits().length);

  /**
   * The active match index, clamped to the current {@link searchHits} so a stale
   * index (e.g. after the data changed under an open search) never points past the
   * end. `-1` means no active match.
   */
  protected readonly activeHitIndex = computed<number>(() => {
    const index = this.activeHitIndexRaw();
    return index >= 0 && index < this.matchCount() ? index : -1;
  });

  /** The toolbar's `"3 / 12"` match readout; `''` when there is no active query. */
  protected readonly matchLabel = computed<string>(() =>
    formatMatchCount(
      this.activeHitIndex(),
      this.matchCount(),
      this.searchQuery().trim().length > 0,
    ),
  );

  /** Whether prev/next match navigation is available (there is at least one hit). */
  protected readonly canStepMatch = computed<boolean>(() => this.matchCount() > 0);

  /**
   * The highlight query forwarded to the on-screen {@link ReportDocument}: the
   * trimmed query while the Find bar is open, else `null` (no marks). Only the main
   * scroll-area document binds this — the print mirror, thumbnails and PDF export
   * stay highlight-free, so Find is a screen-only aid.
   */
  protected readonly searchHighlight = computed<string | null>(() => {
    if (!this.searchOpen()) {
      return null;
    }
    const query = this.searchQuery().trim();
    return query.length > 0 ? query : null;
  });

  /** Increments per pipeline pass; a completion for an older token is discarded. */
  private token = 0;

  /** The last `{current}/{total}` emitted, so `(pageChange)` fires only on a real change. */
  private lastEmittedKey = '';

  /** The last host-configured initial zoom, so {@link zoomSpec} re-syncs only on a real change. */
  private lastInitialZoom: ViewerZoom | undefined;

  /** The last host-configured watermark, so {@link activeWatermark} re-syncs only on a real change. */
  private lastConfiguredWatermark: Watermark | null | undefined;

  /** The last host-configured rail visibility, so {@link thumbnailsOpen} re-syncs only on a real change. */
  private lastConfiguredThumbnails: boolean | undefined;

  constructor() {
    effect(() => {
      const template = this.template();
      const data = this.data();
      const config = this.resolvedConfig();
      const watermark = this.activeWatermark();
      const pass = ++this.token;

      // Show the loading state while this pass is in flight. The token guard in
      // the resolution below means a stale `.then` can never flip a newer load.
      this.viewStatus.set('loading');

      void runPipeline(template, data, {
        locale: config.locale,
        watermark,
      }).then((result) => {
        // Discard if a newer pass started while this one was resolving.
        if (pass !== this.token) {
          return;
        }
        this.applyResult(result);
      });
    });

    // Seed the active zoom from the host's `config.initialZoom`, and re-sync only
    // when the host changes it — so the user's own zoom persists across re-renders
    // but a deliberate config change still takes effect.
    effect(() => {
      const initial = this.initialZoom();
      if (initial !== this.lastInitialZoom) {
        this.lastInitialZoom = initial;
        this.zoomSpec.set(initial);
      }
    });

    // Seed the active watermark from the host's `config.watermark`, and re-sync
    // only when the host changes it — so a watermark the user sets through the
    // dialog persists across re-renders, but a deliberate config change applies.
    effect(() => {
      const configured = this.resolvedConfig().watermark ?? null;
      if (configured !== this.lastConfiguredWatermark) {
        this.lastConfiguredWatermark = configured;
        this.activeWatermark.set(configured);
      }
    });

    // Seed the rail visibility from the host's `config.thumbnails`, and re-sync
    // only when the host changes it — so a user's toggle persists across
    // re-renders, but a deliberate config change still applies (E8-S7).
    effect(() => {
      const configured = this.resolvedConfig().thumbnails ?? true;
      if (configured !== this.lastConfiguredThumbnails) {
        this.lastConfiguredThumbnails = configured;
        this.thumbnailsOpen.set(configured);
      }
    });

    // Surface every page change (initial render and navigation) through the
    // brief-§8 `(pageChange)` output, de-duplicated so the same page+total never
    // emits twice.
    effect(() => {
      const current = this.currentPage();
      const total = this.totalPages();
      if (total <= 0 || current <= 0) {
        return;
      }
      const key = `${current}/${total}`;
      if (key !== this.lastEmittedKey) {
        this.lastEmittedKey = key;
        this.pageChange.emit({ current, total });
      }
    });

    // Focus the Find input when the search bar opens, so a user can type at once.
    effect(() => {
      if (this.searchOpen()) {
        this.searchInput()?.nativeElement.focus();
      }
    });

    // Paint the active match (E8-S6): after each render, toggle the
    // `rdr-mark--active` class on the active hit's `<mark>` and scroll it into
    // view. Runs after render so the marks the renderer just painted exist; reacts
    // to the active index / hits / current page changing.
    afterRenderEffect(() => {
      this.paintActiveMatch();
    });
  }

  /** Navigates to a (clamped) 1-based page, scrolling it into view in continuous mode. */
  protected goToPage(page: number): void {
    const target = clampPage(page, this.totalPages());
    if (target === 0) {
      return;
    }
    this.currentPage.set(target);
    this.scrollToCurrent();
  }

  /** Reads the goto input and navigates to the typed page (clamped). */
  protected onGotoInput(event: Event): void {
    this.goToPage(Number((event.target as HTMLInputElement).value));
  }

  /** Steps the zoom up one ladder level from the current resolved factor (E7-S4). */
  protected zoomInClick(): void {
    this.zoomSpec.set(zoomIn(this.resolvedZoomFactor()));
  }

  /** Steps the zoom down one ladder level from the current resolved factor (E7-S4). */
  protected zoomOutClick(): void {
    this.zoomSpec.set(zoomOut(this.resolvedZoomFactor()));
  }

  /** Applies the fit-mode/level selected in the zoom dropdown. */
  protected onZoomSelect(event: Event): void {
    this.zoomSpec.set(zoomValueToSpec((event.target as HTMLSelectElement).value));
  }

  /** Tracks the factor the renderer resolved the {@link zoomSpec} to (drives the readout). */
  protected onZoomChange(factor: number): void {
    this.resolvedZoomFactor.set(factor);
  }

  /**
   * Prints the report (E8-S2). The template carries a hidden print-only mirror of
   * every page at natural size (zoom 1), shown only under `@media print` while the
   * interactive chrome is hidden, so the browser's native `window.print()` emits
   * crisp, vector, correctly-paginated output — one sheet per paper page — against
   * the renderer's shared print stylesheet (ADR 0010). Guarded so it is a no-op
   * during SSR or in a runtime without `window.print` (the component stays
   * SSR-safe; the call only runs on a user click in the browser).
   */
  protected onPrint(): void {
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
  }

  /** Opens the Export PDF dialog (E8-S3); a no-op until a document is rendered. */
  protected onExport(): void {
    if (this.renderModel()) {
      this.exportOpen.set(true);
    }
  }

  /** Closes the Export PDF dialog without exporting. */
  protected onExportCancel(): void {
    this.exportOpen.set(false);
  }

  /**
   * Resolves the dialog's choices into a {@link PdfExportRequest} and runs the
   * active exporter (the host's `config.pdfExporter`, else {@link defaultPdfExporter}).
   * The exporter owns the download; here we only build the request and close. A
   * surfaced failure is mapped to the `(error)` output rather than thrown.
   */
  protected async onExportConfirm(result: ExportDialogResult): Promise<void> {
    this.exportOpen.set(false);
    const model = this.renderModel();
    if (!model) {
      return;
    }
    const exporter: PdfExporter = this.resolvedConfig().pdfExporter ?? defaultPdfExporter;
    const request: PdfExportRequest = {
      document: model.document,
      template: model.template,
      resolvedValues: model.resolvedValues,
      filename: ensureExtension(result.filename, '.pdf'),
      pages: this.resolveExportPages(result),
      includeWatermark: result.includeWatermark,
      metadata: this.resolvedConfig().pdfMetadata,
    };
    try {
      await exporter.export(request);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      this.error.emit({ kind: 'render', message: `Failed to export PDF: ${detail}` });
    }
  }

  /**
   * Maps the dialog's page scope to the 1-based page list the exporter expects:
   * `all` → every page (undefined), `current` → just the visible page, `range` →
   * the (clamped, ordered) inclusive span.
   */
  private resolveExportPages(result: ExportDialogResult): readonly number[] | undefined {
    const total = this.totalPages();
    if (result.scope === 'current') {
      return [clampPage(this.currentPage(), total)];
    }
    if (result.scope === 'range') {
      const from = clampPage(Math.min(result.rangeFrom, result.rangeTo), total);
      const to = clampPage(Math.max(result.rangeFrom, result.rangeTo), total);
      if (from === 0 || to === 0) {
        return undefined;
      }
      return Array.from({ length: to - from + 1 }, (_, i) => from + i);
    }
    return undefined;
  }

  /** Opens the Watermark dialog (E8-S4). */
  protected onWatermark(): void {
    this.watermarkOpen.set(true);
  }

  /** Closes the Watermark dialog without changing the watermark. */
  protected onWatermarkCancel(): void {
    this.watermarkOpen.set(false);
  }

  /**
   * Applies the dialog's resolved watermark (or `null` to clear it) and closes.
   * Setting {@link activeWatermark} re-runs the pipeline, so the new watermark is
   * stamped on the on-screen pages, the print mirror and the PDF export alike.
   */
  protected onWatermarkApply(result: WatermarkDialogResult): void {
    this.watermarkOpen.set(false);
    this.activeWatermark.set(result.watermark);
  }

  /**
   * Downloads the report's **source** — its validated {@link RendaraTemplate} (the
   * schema contract, brief §5) — as a canonical, pretty-printed JSON file (E8-S5).
   * The filename comes from `config.sourceFilename`, else a slug of the document
   * title, else `report`, always ending in `.json`. A no-op until a document is
   * rendered, and SSR-safe: the download goes through the shared, guarded
   * {@link downloadBlob}, so a runtime without the DOM/`URL` APIs never throws.
   */
  protected onDownloadSource(): void {
    const model = this.renderModel();
    if (!model) {
      return;
    }
    const json = serializeTemplateSource(model.template);
    const filename = sourceFilename(this.documentTitle(), this.resolvedConfig().sourceFilename);
    const blob = new Blob([json], { type: 'application/json' });
    downloadBlob(blob, filename);
  }

  /**
   * Opens or closes the in-report Find bar (E8-S6). Closing clears the query (and
   * thus the highlight) and the active match, so no marks linger; an open effect
   * focuses the input.
   */
  protected toggleSearch(): void {
    if (this.searchOpen()) {
      this.closeSearch();
    } else {
      this.searchOpen.set(true);
    }
  }

  /** Closes the Find bar and clears the query + active match (removes all marks). */
  protected closeSearch(): void {
    this.searchOpen.set(false);
    this.searchQuery.set('');
    this.activeHitIndexRaw.set(-1);
  }

  /**
   * Reacts to typing in the Find input: updates the query and activates the first
   * match (jumping to its page) so the user sees a highlight and a `1 / N` count
   * immediately, or clears the active match when nothing matches.
   */
  protected onSearchInput(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
    this.activateHit(this.matchCount() > 0 ? 0 : -1);
  }

  /**
   * Find-input keyboard map: `Enter` steps to the next match, `Shift+Enter` to the
   * previous, `Escape` closes the bar. Other keys fall through so typing works.
   */
  protected onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) {
        this.prevMatch();
      } else {
        this.nextMatch();
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.closeSearch();
    }
  }

  /** Steps to the next match (wraps to the first), updating the active highlight. */
  protected nextMatch(): void {
    this.activateHit(cycleHitIndex(this.activeHitIndex(), this.matchCount(), 1));
  }

  /** Steps to the previous match (wraps to the last), updating the active highlight. */
  protected prevMatch(): void {
    this.activateHit(cycleHitIndex(this.activeHitIndex(), this.matchCount(), -1));
  }

  /**
   * Makes `index` the active match: records it and jumps the viewer to its page
   * (the after-render effect then paints + scrolls the exact `<mark>`). A negative
   * or out-of-range index clears the active match.
   */
  private activateHit(index: number): void {
    const hits = this.searchHits();
    if (index < 0 || index >= hits.length) {
      this.activeHitIndexRaw.set(-1);
      return;
    }
    this.activeHitIndexRaw.set(index);
    const page = hits[index].page;
    if (page !== this.currentPage()) {
      this.currentPage.set(page);
    }
  }

  /**
   * Live-DOM paint of the active match (E8-S6): clears any prior active mark, then
   * (when there is an active hit) marks the `indexOnPage`-th `<mark>` on the hit's
   * page as active and scrolls it into view. Locating the mark within the page's
   * slot keeps it correct in both continuous and single-page layouts. SSR/jsdom
   * safe — a missing `scrollIntoView` is simply skipped.
   */
  private paintActiveMatch(): void {
    // No active highlight → the renderer paints no marks, so there is nothing to
    // place or clear. Reading the (cheap) highlight signal keeps this effect a true
    // no-op on every render while a search is closed (the common case).
    if (this.searchHighlight() === null) {
      return;
    }
    const container = this.scrollArea()?.nativeElement;
    if (!container) {
      return;
    }
    container
      .querySelectorAll('.rdr-mark--active')
      .forEach((el) => el.classList.remove('rdr-mark--active'));

    const index = this.activeHitIndex();
    const hits = this.searchHits();
    if (index < 0 || index >= hits.length) {
      return;
    }
    const hit = hits[index];
    const slot = container.querySelector(`[data-page-number="${hit.page}"]`);
    const marks = slot?.querySelectorAll<HTMLElement>('.rdr-mark');
    const mark = marks?.[hit.indexOnPage];
    if (!mark) {
      return;
    }
    mark.classList.add('rdr-mark--active');
    if (typeof mark.scrollIntoView === 'function') {
      mark.scrollIntoView({ block: 'center', inline: 'nearest' });
    }
  }

  /** Shows or hides the left thumbnail rail (E8-S7); a hidden rail leaves the DOM. */
  protected toggleThumbnails(): void {
    this.thumbnailsOpen.update((open) => !open);
  }

  /** Toggles the error **View details** disclosure (E7-S5). */
  protected toggleDetails(): void {
    this.detailsOpen.update((open) => !open);
  }

  /**
   * Keyboard navigation (host listener): arrows / `PageUp`·`PageDown` page,
   * `Home`·`End` jump to the ends. Keystrokes inside the goto input are left
   * alone so the user can type a page number.
   */
  protected onKeydown(event: KeyboardEvent): void {
    const intent: PageNavIntent | null = keyToNavIntent(event.key);
    if (intent === null) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.isContentEditable)) {
      return;
    }
    event.preventDefault();
    this.goToPage(resolveNavIntent(intent, this.currentPage(), this.totalPages()));
  }

  /**
   * Live-DOM scroll spy for continuous mode: as the page area scrolls, the page
   * whose centre is nearest the viewport centre becomes {@link currentPage}.
   * Querying the slots on each scroll avoids any observer lifecycle and keeps the
   * indicator correct as the document changes.
   */
  protected onScroll(): void {
    if (this.pageMode() !== 'continuous') {
      return;
    }
    const container = this.scrollArea()?.nativeElement;
    if (!container) {
      return;
    }
    const slots = container.querySelectorAll<HTMLElement>('[data-page-number]');
    const mid = container.scrollTop + container.clientHeight / 2;
    let nearest = this.currentPage();
    let nearestDist = Number.POSITIVE_INFINITY;
    slots.forEach((slot) => {
      const centre = slot.offsetTop + slot.offsetHeight / 2;
      const dist = Math.abs(centre - mid);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = Number(slot.dataset['pageNumber']) || nearest;
      }
    });
    if (nearest !== this.currentPage()) {
      this.currentPage.set(nearest);
    }
  }

  /** Scrolls the current page's sheet to the top of the page area (continuous mode only). */
  private scrollToCurrent(): void {
    if (this.pageMode() !== 'continuous') {
      return;
    }
    const container = this.scrollArea()?.nativeElement;
    if (!container || typeof container.scrollTo !== 'function') {
      return;
    }
    const slot = container.querySelector<HTMLElement>(`[data-page-number="${this.currentPage()}"]`);
    if (slot) {
      container.scrollTo({ top: slot.offsetTop, behavior: 'auto' });
    }
  }

  /**
   * Routes a pipeline result to the render model, page state, view status and the
   * public outputs. Setting {@link viewStatus} here (off the loading state seeded
   * at kickoff) is what swaps the placeholder for the chrome — or the friendly
   * empty/error state — once the pass resolves.
   */
  private applyResult(result: PipelineResult): void {
    switch (result.status) {
      case 'rendered':
        this.renderModel.set(result);
        this.viewError.set(null);
        // Clamp the current page into the new document (starts at page 1).
        this.currentPage.set(clampPage(this.currentPage() || 1, result.document.pageCount));
        this.viewStatus.set('rendered');
        this.rendered.emit({ pageCount: result.document.pageCount });
        break;
      case 'error':
        this.renderModel.set(null);
        this.currentPage.set(0);
        this.detailsOpen.set(false);
        this.viewError.set(result.error);
        this.viewStatus.set('error');
        this.error.emit(result.error);
        break;
      case 'empty':
        this.renderModel.set(null);
        this.currentPage.set(0);
        this.viewError.set(null);
        this.viewStatus.set('empty');
        break;
    }
  }
}
