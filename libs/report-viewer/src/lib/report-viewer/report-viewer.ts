import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { type RendaraTemplate } from '@rendara/report-schema';
import { ReportDocument } from '@rendara/report-renderer';

import { runPipeline, type PipelineResult } from './report-pipeline';
import {
  DEFAULT_VIEWER_CONFIG,
  type PageChangeEvent,
  type RenderedEvent,
  type ViewerConfig,
  type ViewerError,
  type ViewerPageMode,
  type ViewerTheme,
  type ViewerZoom,
} from './viewer-api';

/** The successful arm of {@link PipelineResult}: the model the renderer paints. */
type RenderModel = Extract<PipelineResult, { status: 'rendered' }>;

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
 * Page navigation (E7-S3), interactive zoom (E7-S4) and the loading/empty/error
 * *UI* (E7-S5) build on this pipeline; the toolbar lands in Epic 8. Until E7-S5,
 * an empty or errored pipeline simply paints nothing.
 */
@Component({
  selector: 'rdr-report-viewer',
  imports: [ReportDocument],
  templateUrl: './report-viewer.html',
  styleUrl: './report-viewer.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'rdr-report-viewer', '[style]': 'themeStyle()' },
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

  /** Initial zoom forwarded to the renderer (interactive zoom is E7-S4). */
  protected readonly initialZoom = computed<ViewerZoom>(
    () => this.resolvedConfig().initialZoom ?? 'fit-width',
  );

  /** Single-page vs. continuous layout forwarded to the renderer. */
  protected readonly pageMode = computed<ViewerPageMode>(
    () => this.resolvedConfig().pageMode ?? 'continuous',
  );

  /** The rendered model painted by the shared renderer, or `null` (empty/error/pending). */
  protected readonly renderModel = signal<RenderModel | null>(null);

  /** Increments per pipeline pass; a completion for an older token is discarded. */
  private token = 0;

  constructor() {
    effect(() => {
      const template = this.template();
      const data = this.data();
      const config = this.resolvedConfig();
      const pass = ++this.token;

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
  }

  /** Routes a pipeline result to the render model and the public outputs. */
  private applyResult(result: PipelineResult): void {
    switch (result.status) {
      case 'rendered':
        this.renderModel.set(result);
        this.rendered.emit({ pageCount: result.document.pageCount });
        break;
      case 'error':
        this.renderModel.set(null);
        this.error.emit(result.error);
        break;
      case 'empty':
        this.renderModel.set(null);
        break;
    }
  }
}
