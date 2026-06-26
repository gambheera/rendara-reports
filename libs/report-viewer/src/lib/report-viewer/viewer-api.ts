import type { Watermark } from '@rendara/report-engine';
import type { PageLayoutMode, ZoomSpec } from '@rendara/report-renderer';
import type { RendaraValidationError } from '@rendara/report-schema';

/**
 * Public API surface for `@rendara/report-viewer` (E7-S1).
 *
 * These are the framework-light contract types a host-app developer programs
 * against — the inputs/outputs of {@link ReportViewer} per brief §8. Defining
 * them here (and re-exporting from the package entry point) is what gives
 * TypeScript consumers full typing for `[config]`, `[theme]` and the
 * `(rendered)` / `(pageChange)` / `(error)` events. The render *behaviour* that
 * populates these events lands in E7-S2 (pipeline) and E7-S5 (states); this
 * story fixes the typed shape.
 */

/**
 * Zoom specification for the viewer: an explicit scale factor (`1` = 100%) or a
 * fit mode. Re-exported from the shared renderer so the viewer's public API and
 * the renderer it drives stay one type.
 */
export type ViewerZoom = ZoomSpec;

/**
 * Which page-layout the viewer presents: one sheet at a time (`'single'`) or a
 * scrolling stack of every page (`'continuous'`). Mirrors the renderer's
 * {@link PageLayoutMode}.
 */
export type ViewerPageMode = PageLayoutMode;

/**
 * Toolbar configuration. v1 (E7-S1) exposes only whole-toolbar visibility; the
 * per-button show/hide map and custom-action slot (brief §8) extend this
 * interface in E8-S1 without breaking existing callers.
 */
export interface ViewerToolbarConfig {
  /** Show the toolbar (default) or hide it entirely. */
  readonly visible?: boolean;
}

/**
 * Runtime configuration for the viewer (brief §8 `config`). Every field is
 * optional; omitted fields fall back to {@link DEFAULT_VIEWER_CONFIG}.
 */
export interface ViewerConfig {
  /** BCP-47 locale for `Intl`-based formatting; falls back to the template's. */
  readonly locale?: string;
  /** Initial zoom: a scale factor or a fit mode. */
  readonly initialZoom?: ViewerZoom;
  /** Toolbar visibility/options. */
  readonly toolbar?: ViewerToolbarConfig;
  /** Render-time watermark stamped behind every page; `null` for none. */
  readonly watermark?: Watermark | null;
  /** Single-page vs. continuous scroll. */
  readonly pageMode?: ViewerPageMode;
}

/**
 * CSS custom-property overrides applied to the viewer host — the theming API
 * (brief §8 `theme`). Keys are `--rdr-*` token names (e.g. `--rdr-accent`),
 * values are CSS values. Applied as host inline styles so host CSS can re-theme
 * the chrome without reaching into the (style-isolated) report.
 */
export type ViewerTheme = Readonly<Record<string, string>>;

/** Payload of the `(rendered)` output: emitted once a template+data render completes. */
export interface RenderedEvent {
  /** Total pages produced by pagination. */
  readonly pageCount: number;
}

/** Payload of the `(pageChange)` output: emitted when the visible page changes. */
export interface PageChangeEvent {
  /** 1-based current page. */
  readonly current: number;
  /** Total pages in the document. */
  readonly total: number;
}

/** Stage at which a {@link ViewerError} arose. */
export type ViewerErrorKind = 'validation' | 'binding' | 'render';

/**
 * Payload of the `(error)` output: a friendly, surfaced (never thrown) failure.
 * `details` carries the schema validator's structured problems when the failure
 * is a template-validation error (`kind: 'validation'`). The viewer emits this
 * instead of crashing; the matching error UI lands in E7-S5.
 */
export interface ViewerError {
  /** Which pipeline stage failed. */
  readonly kind: ViewerErrorKind;
  /** Human-readable summary (e.g. `"Template failed validation: missing 'page.size'"`). */
  readonly message: string;
  /** Structured per-field problems, for `kind: 'validation'`. */
  readonly details?: readonly RendaraValidationError[];
}

/**
 * Resolved defaults for {@link ViewerConfig}. The component spreads the host's
 * `config` over these so every field is concrete at render time, and consumers
 * can reference the same baseline.
 */
export const DEFAULT_VIEWER_CONFIG: Required<Omit<ViewerConfig, 'locale'>> &
  Pick<ViewerConfig, 'locale'> = {
  locale: undefined,
  initialZoom: 'fit-width',
  toolbar: { visible: true },
  watermark: null,
  pageMode: 'continuous',
};
