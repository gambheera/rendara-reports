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
 * Toolbar configuration (brief §8). Every flag defaults to `true` (see
 * {@link DEFAULT_TOOLBAR_CONFIG}), so a host opts *out* of a control by setting
 * its flag to `false`; a hidden control is absent from the DOM entirely, not just
 * visually hidden. `visible: false` removes the whole toolbar.
 *
 * E7-S1 shipped only {@link visible}; E8-S1 adds the per-button map. The host can
 * additionally project its own controls into the toolbar through the
 * `[rdr-toolbar-actions]` content slot — that custom-action slot needs no config
 * here. The Print/Export/Watermark *behaviour* lands in E8-S2/S3/S4; these flags
 * govern only whether each button is present.
 */
export interface ViewerToolbarConfig {
  /** Show the toolbar (default) or hide it entirely. */
  readonly visible?: boolean;
  /** Show the document title (from `template.metadata.name`). Default `true`. */
  readonly title?: boolean;
  /** Show the page-navigation group (prev · goto / total · next). Default `true`. */
  readonly navigation?: boolean;
  /** Show the zoom group (− · % · + stepper and fit-mode dropdown). Default `true`. */
  readonly zoom?: boolean;
  /** Show the Print action button (behaviour: E8-S2). Default `true`. */
  readonly print?: boolean;
  /** Show the Export action button (behaviour: E8-S3). Default `true`. */
  readonly export?: boolean;
  /** Show the Watermark action button (behaviour: E8-S4). Default `true`. */
  readonly watermark?: boolean;
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

/**
 * Resolved defaults for {@link ViewerToolbarConfig} — every control on. The
 * component spreads the host's `config.toolbar` over these, so each per-button
 * flag is concrete (E8-S1) and the show/hide checks never read `undefined`.
 */
export const DEFAULT_TOOLBAR_CONFIG: Required<ViewerToolbarConfig> = {
  visible: true,
  title: true,
  navigation: true,
  zoom: true,
  print: true,
  export: true,
  watermark: true,
};
