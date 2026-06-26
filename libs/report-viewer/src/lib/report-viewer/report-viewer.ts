import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DEFAULT_PAGE, type RendaraTemplate } from '@rendara/report-schema';
import { computePageGeometry, type PaginatedPage } from '@rendara/report-engine';
import { ReportRenderer } from '@rendara/report-renderer';

import {
  DEFAULT_VIEWER_CONFIG,
  type PageChangeEvent,
  type RenderedEvent,
  type ViewerConfig,
  type ViewerError,
  type ViewerTheme,
} from './viewer-api';

/**
 * The embeddable report viewer (`@rendara/report-viewer`).
 *
 * **E7-S1 establishes the public component API** (brief §8) — the typed,
 * documented input/output surface a host app integrates against:
 *
 * - **Inputs** (all signal-based): {@link template} (a validated
 *   {@link RendaraTemplate} or a raw JSON string), {@link data} (arbitrary
 *   JSON), {@link config} ({@link ViewerConfig}) and {@link theme}
 *   ({@link ViewerTheme} `--rdr-*` overrides).
 * - **Outputs**: {@link rendered} (`{ pageCount }`), {@link pageChange}
 *   (`{ current, total }`) and {@link error} (a surfaced, never-thrown failure).
 *
 * It is **SSR-safe**: this component touches no browser-only API directly. The
 * {@link theme} is applied through an Angular host `[style]` binding (the
 * framework writes the `--rdr-*` custom properties; no `document`/`window`
 * access here), and the shared renderer it composes already guards
 * `ResizeObserver`. Standalone and tree-shakeable per brief §8.
 *
 * The validate → bind → paginate → render **pipeline** that actually consumes
 * {@link template}/{@link data} and emits {@link rendered}/{@link pageChange}/
 * {@link error} lands in **E7-S2** (pipeline) and **E7-S5** (loading/empty/error
 * states); the toolbar in **Epic 8**. Until then the body paints a neutral
 * empty default-A4 page via the shared {@link ReportRenderer}, proving the legal
 * viewer → {renderer, engine, schema} composition (brief §4) renders real
 * output without shipping fixture data in the bundle.
 */
const placeholderGeometry = computePageGeometry(DEFAULT_PAGE);
const placeholderPage: PaginatedPage = {
  index: 0,
  pageNumber: 1,
  header: [],
  elements: [],
  footer: [],
  tables: [],
};

@Component({
  selector: 'rdr-report-viewer',
  imports: [ReportRenderer],
  templateUrl: './report-viewer.html',
  styleUrl: './report-viewer.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'rdr-report-viewer', '[style]': 'themeStyle()' },
})
export class ReportViewer {
  /**
   * The report template: a validated {@link RendaraTemplate} object or a raw
   * JSON string to be parsed/validated by the pipeline (E7-S2). `null` shows the
   * empty state.
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
   * Emitted on a surfaced (never thrown) validation/binding/render failure
   * (E7-S5). The name `error` is the brief-§8 public API contract; the native
   * DOM-event-name lint rule is intentionally suppressed for it.
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

  // Placeholder render model (replaced by the real pipeline in E7-S2).
  protected readonly page = placeholderPage;
  protected readonly geometry = placeholderGeometry;
}
