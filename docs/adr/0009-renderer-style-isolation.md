# ADR 0009 — Renderer style isolation: emulated default + opt-in Shadow DOM + reset + CSS-var theming

- **Status:** Accepted
- **Date:** 2026-06-24
- **Story:** E4-S5 · Style isolation & theming

## Context

The shared renderer is embedded inside *other people's* Angular apps (via the
future viewer) and must "not fight my CSS" (brief §3/§7, hard rules): the host's
styles must not bleed **into** the rendered report, and the renderer must not leak
**out** into the host. Three forces shape the choice:

- **Angular fixes `encapsulation` at compile time** — a single component can't flip
  between `Emulated` and `ShadowDom` from an input.
- **The renderer paints almost everything with inline styles** (sheet, element
  positions, table rows/cells, text runs). Inline styles already outrank a host's
  element/class selector rules — but **not** `!important` rules, and they don't stop
  **inherited** typography (color, font, line-height…) cascading in.
- **Inherited properties cross a shadow boundary** from the host element, and a
  hostile `* { … !important }` matches and wins on the shadow *host* element itself.
- The designer needs live, inspectable DOM (selection / design-mode hooks, E4-S6);
  the embedded viewer is view-only and wants maximum isolation. The viewer must also
  stay **UI-kit-light** (no heavy dependency for isolation).

## Decision

1. **Emulated stays the default; isolation is opt-in via a separate component.**
   `ReportRenderer`/`ReportDocument` keep `ViewEncapsulation.Emulated`. A new
   `ReportSurface` (`ViewEncapsulation.ShadowDom`) wraps `ReportDocument`, forwarding
   every input/output, and renders it into a real shadow root. Consumers choose:
   `<rdr-report-surface>` for a fully isolated embedded report, `<rdr-report-document>`
   for the designer's live mode. No runtime encapsulation toggle is invented.

2. **A CSS reset neutralises inherited host typography, applied to `:host` *and* the
   in-shadow content roots.** Because `* { color: red !important }` wins on the shadow
   host, a `:host`-only reset would let unstyled descendants inherit the host's value.
   The reset is therefore also applied to `.rdr-document`/`.rdr-page` — elements inside
   the shadow boundary that no outer selector can reach — so the typography baseline
   holds regardless of host `!important`. The baseline uses no `rem`/`em`/`%` (which
   would re-couple to the host root font size).

3. **A single style source of truth: `libs/report-renderer/src/lib/renderer-styles.ts`.**
   It exports the reset+tokens (`RENDERER_THEME_CSS`), the page chrome
   (`RENDERER_PAGE_CSS`), the document chrome (`RENDERER_DOCUMENT_CSS`), and a bundle
   (`RENDERER_SURFACE_CSS`). The emulated components and the shadow surface all consume
   these constants; the headless fixture embeds the bundle into an `attachShadow` root,
   so the e2e exercises the exact same rules. Authored as **literal strings** (Angular
   statically evaluates a component's `styles`); `RDR_THEME_TOKENS` mirrors the defaults
   for docs/tests, guarded against drift by a unit test.

4. **Theming via `--rdr-*` CSS custom properties.** Every non-data-driven colour/measure
   (page background, drop-shadow, printable-guide, inter-page gap, base font/colour, and
   the five table-palette colours) is a token with a safe default. The table palette is
   consumed as `var(--rdr-…, default)` inside the **pure view-model** inline styles, so
   an override reaches the rendered table while the default keeps pixels byte-stable. The
   renderer defines all its own defaults inline, so it never depends on `ui-kit`'s
   `tokens.css` (keeping the viewer self-contained); the names don't collide with
   `ui-kit`'s `--rdr-color-*`/`--rdr-font-size-*`.

5. **The shadow surface re-declares the chrome.** Angular emulated styles live in the
   document head and **do not** pierce a shadow boundary, so `ReportSurface` carries the
   page + document chrome in its own (shadow-scoped) `styles`, where plain class selectors
   match the nested `.rdr-page`/`.rdr-document` directly.

## Consequences

- **+** The embedded viewer gets bullet-proof isolation (shadow boundary blocks every
  host selector incl. `!important`; the reset blocks inherited bleed) with no extra
  dependency — just `<rdr-report-surface>`.
- **+** WYSIWYG holds: the surface forwards to the same `ReportDocument`, so output is
  byte-identical to the emulated path; the serializer fixture mirrors it.
- **+** Theming is a documented, override-anywhere CSS-var contract; defaults keep all
  existing visual baselines unchanged.
- **−** Emulated mode (the designer's) still can't defend against a host's `!important`
  selector rules — an accepted, documented limitation; that's what the opt-in shadow
  surface is for.
- **−** Two style entry points (`ReportSurface` re-declares chrome) — mitigated by the
  single `renderer-styles.ts` source both consume.
- **−** Shadow mode renders into a shadow root, so design-mode interaction (E4-S6) stays
  on the emulated components by design.

## Alternatives considered

- **A runtime `isolation`/`shadow` input on one component.** Rejected: Angular fixes
  `encapsulation` at compile time; faking it (manual `attachShadow` + moving nodes) is
  fragile and loses live bindings.
- **`:host`-only reset.** Rejected: a host `* { … !important }` wins on the shadow host
  element, so descendants would still inherit the host's typography — the reset must also
  land on in-shadow content roots.
- **Inject the serialized HTML into a manually-attached shadow root via `innerHTML`.**
  Rejected for the component path: bypasses the live renderer and leans on sanitizer
  allow-listing of inline styles/SVG. (It is used only by the *test fixture*, where the
  output is non-interactive and trusted.)
- **Tokenise via a separate theme stylesheet instead of `var()` in inline styles.**
  Rejected: inline styles win over stylesheet rules, so a stylesheet couldn't re-theme
  the data-driven table palette — the override must be a `var()` in the inline value.
- **Shadow DOM always (no emulated mode).** Rejected: the designer needs live,
  inspectable DOM for selection and the E4-S6 design-mode hooks.
