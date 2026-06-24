/**
 * Renderer style isolation & theming (E4-S5) — the single source of truth for the
 * shared renderer's **chrome CSS**, **CSS reset**, and **theme tokens**, so the
 * Angular components, the opt-in Shadow-DOM surface, and the headless visual
 * fixtures all carry the exact same isolation/theming rules (brief §3/§7: "never
 * leak styles into (or inherit styles from) the host app").
 *
 * ## Encapsulation strategy
 * The leaf renderers ({@link ReportRenderer}, {@link ReportDocument}) use
 * Angular's default **`ViewEncapsulation.Emulated`**. They paint almost everything
 * with **inline** styles (sheet size/background/zoom, element positions, table
 * cell/row styles, text runs), which already outrank a host's element/class
 * selector rules. What inline styles can't stop is **inherited** text properties
 * bleeding in from the host page — so {@link RENDERER_THEME_CSS} resets every
 * inheritable text property at the render root (`:host`). That covers the common
 * case (a host whose `body`/`*` styling would otherwise cascade in).
 *
 * The residual gap in emulated mode is a host rule that uses `!important` on a
 * matching selector — emulated encapsulation does not shield *incoming* selectors.
 * The opt-in {@link ReportSurface} renders the document into a real **Shadow DOM**
 * root, where the boundary blocks every host selector (including `!important`);
 * the same `:host` reset then neutralises the inheritable properties that *do*
 * cross a shadow boundary. Shadow + reset = full isolation, for the embedded
 * viewer; emulated stays the default for the designer (which needs live DOM).
 *
 * ## Theming
 * Every non-data-driven colour/measure is a `--rdr-*` **CSS custom property** with
 * a safe default ({@link RDR_THEME_TOKENS}). A host overrides any of them on the
 * renderer/surface element (or an ancestor) to re-theme the chrome and the table
 * palette without forking the renderer. The table-palette tokens are consumed as
 * `var(--rdr-…, default)` in the pure {@link page-view-model} inline styles, so a
 * theme override reaches the rendered table while the default keeps pixels stable.
 *
 * ## Why literal strings (not built at runtime)
 * The Angular compiler statically evaluates a component's `styles`, so each CSS
 * constant here is an authored string literal (not assembled with `.map()/.join()`
 * etc.). {@link RDR_THEME_TOKENS} is the machine-readable mirror used by docs and
 * the unit test that guards the two against drift.
 */

/**
 * The renderer's theme tokens and their default values. The defaults are mirrored
 * literally inside {@link RENDERER_THEME_CSS}; `renderer-styles.spec.ts` asserts
 * the two stay in sync. Override any token on the renderer element (or an
 * ancestor) to re-theme.
 */
export const RDR_THEME_TOKENS: Readonly<Record<string, string>> = {
  /** Page sheet fill fallback (the `background` input still wins when supplied). */
  '--rdr-page-background': '#ffffff',
  /** Drop shadow under each page sheet. */
  '--rdr-page-shadow':
    '0 1px 3px rgba(15, 23, 42, 0.18), 0 4px 12px rgba(15, 23, 42, 0.12)',
  /** Colour of the (non-printing) printable-area guide outline. */
  '--rdr-printable-guide': 'rgba(79, 70, 229, 0.25)',
  /** Gap between stacked page sheets in continuous layout. */
  '--rdr-page-gap': '24px',
  /** Base font family for the rendered report (text runs set their own inline). */
  '--rdr-font-family': "'Inter', system-ui, sans-serif",
  /** Base text colour for the rendered report (text runs set their own inline). */
  '--rdr-text-color': '#111827',
  /** Tinted fill behind a table header row. */
  '--rdr-table-header-fill': '#F1F5F9',
  /** Tinted fill behind a table group-header band. */
  '--rdr-table-group-fill': '#EEF2FF',
  /** Faint separator under each table detail row. */
  '--rdr-table-detail-rule': '#E2E8F0',
  /** Rule under the header / around group footers. */
  '--rdr-table-band-rule': '#CBD5E1',
  /** Strongest rule (header bottom / grand-total top). */
  '--rdr-table-total-rule': '#334155',
  /** Default watermark text colour when the watermark config declares none (slate-400). */
  '--rdr-watermark-color': '#9CA3AF',
} as const;

/**
 * The theme-token defaults **and** the CSS reset.
 *
 * The tokens sit on `:host` (the renderer/surface element in emulated mode, the
 * shadow host in Shadow-DOM mode). The reset is applied to **`:host` and the
 * in-shadow content roots (`.rdr-document`/`.rdr-page`)** on purpose: a hostile
 * host rule like `* { color: red !important }` matches — and wins on — the shadow
 * *host* element, so a reset on `:host` alone would still let unstyled shadow
 * descendants inherit the host's red. The content roots live inside the shadow
 * boundary where no outer selector can reach them, so resetting there pins the
 * typography regardless of host `!important` rules; descendants inherit the
 * baseline from the page, not from the host.
 *
 * The reset pins every inheritable text property to a host-independent baseline
 * (no `rem`/`em`/`%`, which would re-couple to the host root font size). Elements
 * that care about a property set it inline (text runs/table cells set font +
 * colour + alignment), which overrides this baseline for their own content.
 */
export const RENDERER_THEME_CSS = `:host {
  --rdr-page-background: #ffffff;
  --rdr-page-shadow: 0 1px 3px rgba(15, 23, 42, 0.18), 0 4px 12px rgba(15, 23, 42, 0.12);
  --rdr-printable-guide: rgba(79, 70, 229, 0.25);
  --rdr-page-gap: 24px;
  --rdr-font-family: 'Inter', system-ui, sans-serif;
  --rdr-text-color: #111827;
  --rdr-table-header-fill: #F1F5F9;
  --rdr-table-group-fill: #EEF2FF;
  --rdr-table-detail-rule: #E2E8F0;
  --rdr-table-band-rule: #CBD5E1;
  --rdr-table-total-rule: #334155;
  --rdr-watermark-color: #9CA3AF;

  display: block;
}

:host,
.rdr-document,
.rdr-page {
  /* CSS reset: neutralise inheritable host typography so the host page's styles
     cannot cascade into the rendered report. */
  color: var(--rdr-text-color);
  font-family: var(--rdr-font-family);
  font-size: medium;
  font-weight: 400;
  font-style: normal;
  font-variant: normal;
  font-stretch: normal;
  line-height: normal;
  letter-spacing: normal;
  word-spacing: normal;
  text-align: left;
  text-transform: none;
  text-indent: 0;
  text-decoration: none;
  text-shadow: none;
  white-space: normal;
  word-break: normal;
  direction: ltr;
  font-feature-settings: normal;
  -webkit-font-smoothing: auto;
}`;

/**
 * Page-level chrome: the page sheet drop-shadow, the printable-area guide, and the
 * tiny content resets for text/image. These are *static* (the size/background/zoom
 * and every element's content stay inline on the elements). Owned by the
 * {@link ReportRenderer} in emulated mode; re-declared inside the
 * {@link ReportSurface} shadow root (where the child's emulated styles do not
 * reach) via {@link RENDERER_SURFACE_CSS}.
 */
export const RENDERER_PAGE_CSS = `.rdr-page {
  box-shadow: var(--rdr-page-shadow);
  overflow: hidden;
}

.rdr-printable {
  outline: 1px dashed var(--rdr-printable-guide);
  pointer-events: none;
}

.rdr-text {
  margin: 0;
}

.rdr-image {
  display: block;
}

/* Watermark overlay (E4-S7): the page-covering layer + its centred caption/image.
   The size/opacity/rotation/colour stay inline on the elements (data-driven); these
   are the static resets so the caption/image paint predictably. */
.rdr-watermark {
  margin: 0;
}

.rdr-watermark-text {
  margin: 0;
}

.rdr-watermark-image {
  display: block;
}

/* Design-mode hooks (E4-S6): only matches when the page carries the design marker,
   so view-mode DOM/painting is unaffected. Hit targets become pointer-selectable
   for the designer canvas. */
.rdr-page[data-rdr-mode='design'] [data-rdr-hit] {
  cursor: pointer;
}`;

/**
 * Multi-page document chrome: the centred, gapped column of page slots and the
 * positioning of each slot's child renderer. Owned by the {@link ReportDocument}
 * in emulated mode; re-declared inside the {@link ReportSurface} shadow root via
 * {@link RENDERER_SURFACE_CSS}.
 */
export const RENDERER_DOCUMENT_CSS = `.rdr-document {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--rdr-page-gap);
}

.rdr-document--single {
  gap: 0;
}

.rdr-page-slot {
  position: relative;
  overflow: hidden;
  flex: 0 0 auto;
}

.rdr-page-slot rdr-report-renderer,
.rdr-page-slot .rdr-page {
  position: absolute;
  top: 0;
  left: 0;
}`;

/**
 * Print stylesheet (E4-S8) — the `@media print` rules that turn the on-screen
 * paginated DOM into print-optimised output (brief §7: "a dedicated `@page`/print
 * stylesheet" so `window.print()` is crisp, vector and correctly paginated). This
 * is the **renderer-level** print stylesheet; the viewer's Print toolbar action
 * (E8) drives `window.print()` against it — see ADR 0008.
 *
 * Everything here is screen-suppressing chrome: the screen-only page drop-shadow
 * and the non-printing printable-area guide are removed, the grey designer/viewer
 * backdrop is forced white and the inter-page gaps collapse, so each sheet prints
 * edge-to-edge with the browser owning the physical page via `@page { margin: 0 }`
 * (the sheet's own mm dimensions are the printable area). `print-color-adjust:
 * exact` keeps tinted fills, table bands and the watermark from being dropped by
 * the print engine's ink-saving default.
 *
 * Being `@media print`, these rules never affect on-screen rendering and never
 * touch the DOM (so the E4-S6 view-mode byte-stability guarantee is unaffected and
 * existing screen baselines do not move).
 */
export const RENDERER_PRINT_CSS = `@media print {
  :host,
  .rdr-document,
  .rdr-page,
  .rdr-page-slot {
    background: #ffffff;
  }

  .rdr-document {
    gap: 0;
  }

  .rdr-page {
    box-shadow: none;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .rdr-printable {
    outline: none;
  }

  @page {
    margin: 0;
  }
}`;

/**
 * The full stylesheet for an isolated render root: theme + reset, page chrome,
 * document chrome and the print stylesheet. Used by the {@link ReportSurface}
 * shadow root and by the headless style-isolation fixture (so an `attachShadow`
 * host renders identically to the component). Built at runtime — this constant is
 * never passed to a component's `styles`, so it does not need to be statically
 * evaluable.
 */
export const RENDERER_SURFACE_CSS = [
  RENDERER_THEME_CSS,
  RENDERER_PAGE_CSS,
  RENDERER_DOCUMENT_CSS,
  RENDERER_PRINT_CSS,
].join('\n\n');
