import {
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
  type RenderedEvent,
  type ViewerConfig,
  type ViewerError,
  type ViewerPageMode,
  type ViewerTheme,
  type ViewerToolbarConfig,
  type ViewerZoom,
} from './viewer-api';

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
 * drops the whole bar. The action buttons are accessible, themed placeholders
 * here — their *behaviour* lands in E8-S2 (print), E8-S3 (export) and E8-S4
 * (watermark).
 */
@Component({
  selector: 'rdr-report-viewer',
  imports: [ReportDocument],
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

  /** The scrolling page area; present only once a document is rendered. */
  private readonly scrollArea = viewChild<ElementRef<HTMLElement>>('scrollArea');

  /** Increments per pipeline pass; a completion for an older token is discarded. */
  private token = 0;

  /** The last `{current}/{total}` emitted, so `(pageChange)` fires only on a real change. */
  private lastEmittedKey = '';

  /** The last host-configured initial zoom, so {@link zoomSpec} re-syncs only on a real change. */
  private lastInitialZoom: ViewerZoom | undefined;

  constructor() {
    effect(() => {
      const template = this.template();
      const data = this.data();
      const config = this.resolvedConfig();
      const pass = ++this.token;

      // Show the loading state while this pass is in flight. The token guard in
      // the resolution below means a stale `.then` can never flip a newer load.
      this.viewStatus.set('loading');

      void runPipeline(template, data, {
        locale: config.locale,
        watermark: config.watermark ?? null,
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
   * Toolbar action placeholders (E8-S1). The buttons exist, are configurable and
   * accessible now; their behaviour is wired by the dedicated stories — Print in
   * E8-S2, Export PDF in E8-S3, Watermark in E8-S4 — which replace these no-ops.
   */
  protected onPrint(): void {
    // E8-S2: print stylesheet + window.print().
  }

  protected onExport(): void {
    // E8-S3: PdfExporter dialog + download.
  }

  protected onWatermark(): void {
    // E8-S4: watermark toggle/config dialog.
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
