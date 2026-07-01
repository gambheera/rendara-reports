# ADR 0017 — Viewer theming API surface & isolation guarantees; content-only shadow-DOM opt-in

- **Status:** Accepted
- **Date:** 2026-07-01
- **Story:** E9-S5 · Theming & encapsulation docs

## Context

`@rendara/report-viewer` runs inside _other people's_ Angular apps, with _their_
data and _their_ global CSS (brief §3/§8, hard rules): it must re-theme from CSS
custom properties, must not leak its styles into the host, and the host must not
be able to break the rendered report. Those capabilities already exist across the
stack — this story fixes the **consumer-facing contract** and proves it works, and
in doing so has to settle one open question: **what does "opt-in Shadow DOM mode"
mean for the viewer specifically?**

The relevant facts:

- The viewer is `ViewEncapsulation.Emulated`. It exposes a `[theme]` input that
  applies `--rdr-*` overrides as inline styles on its host element
  (`report-viewer.ts`).
- Theme tokens come in **two families**: the viewer's own **chrome** tokens
  (`--rdr-viewer-*`, defined on the viewer `:host`) and the shared renderer's
  **content** tokens (`--rdr-page-*`, `--rdr-table-*`, `--rdr-search-*`,
  `--rdr-watermark-*`, `--rdr-font-family`, `--rdr-text-color`; ADR 0009,
  `renderer-styles.ts`). Both are already documented as machine-readable mirrors
  (`RDR_THEME_TOKENS`).
- Style isolation for the _report content_ is real today: it is painted with
  inline styles plus the reset in `RENDERER_THEME_CSS`, and the renderer already
  offers a hard-boundary **Shadow-DOM** surface, `ReportSurface`, proven by an
  assertion-based isolation e2e (`apps/visual-e2e/e2e/style-isolation.visual.spec.ts`).
- brief §3 calls for "`ViewEncapsulation.Emulated` by default with an opt-in Shadow
  DOM mode". The naive reading — wrap the _whole_ `<rdr-report-viewer>` in a shadow
  root — collides with two Angular realities: (a) an emulated **child** component's
  styles live in `document.head` and do **not** cross a shadow boundary, so the
  toolbar/rail/renderer chrome would render unstyled inside a whole-viewer shadow
  root; and (b) the Export/Watermark dialogs use CDK overlays that attach to
  `document.body`, i.e. outside any shadow root the viewer could own.

## Decision

1. **Document the theming API as the two `--rdr-*` families, driven by `[theme]`
   (or plain CSS on/above the element).** The viewer README carries the full
   catalog of `--rdr-viewer-*` chrome tokens and renderer `--rdr-*` content tokens
   with their defaults and what each themes. `[theme]` is the per-instance path
   (inline styles on the host); setting the same tokens from host CSS on
   `rdr-report-viewer` (or an ancestor) is the site-wide path, since custom
   properties inherit.

2. **State the isolation guarantees precisely, and their one documented limit.**
   The viewer guarantees it will not leak **out** (emulated encapsulation
   class-scopes every `.rdr-viewer-*` rule to the viewer's own elements) and that a
   host's ordinary cascade cannot bleed **into** the report (inline styles + the
   reset outrank plain element/class rules). The residual gap — a host rule using
   `!important` on a matching selector — is called out honestly, with the shadow
   opt-in as its remedy.

3. **The shadow-DOM opt-in is content-only, via the renderer's `ReportSurface`;
   the viewer chrome stays emulated.** We do **not** add a whole-viewer Shadow-DOM
   mode. A host that needs the rendered report walled off from hostile host CSS
   uses `<rdr-report-surface>` (ADR 0009) for the report content and keeps the
   emulated `<rdr-report-viewer>` for the full toolbar experience. This is recorded
   as the sanctioned interpretation of brief §3's "opt-in Shadow DOM mode" for the
   viewer.

4. **Prove the doc examples in `viewer-demo` (story QA).** The demo gains a
   `[theme]` toggle (the README's theming example, live), and a new e2e
   (`viewer-theming.spec.ts`) asserts, against the **built** package: the theme
   override re-colours the chrome; a light-DOM element carrying the viewer's class
   names is **not** restyled by the viewer (no leak-out); and hostile (non-
   `!important`) host CSS injected into the page does **not** reach the rendered
   report (inline styles + reset hold). A vitest test covers the demo's theme
   wiring deterministically.

## Consequences

- **+** Host developers get one place (`libs/report-viewer/README.md`) that lists
  every themeable token, the exact isolation guarantees, and the shadow-DOM path —
  the "theme and isolate the viewer" story is answered end-to-end.
- **+** The guarantees are backed by executable proof in the demo (theming +
  leak-out + cascade-resistance), on top of the renderer's existing shadow
  isolation e2e — so a regression in either direction fails CI.
- **+** No source behaviour or default rendered output changes, so no visual
  baselines move; the change is docs + demo wiring + tests.
- **−** Full hostile-CSS isolation of the report requires dropping to the
  renderer's `<rdr-report-surface>` (which renders content only, no toolbar) — an
  accepted, documented limitation rather than a whole-viewer shadow mode.
- **−** Two token families (`--rdr-viewer-*` and renderer `--rdr-*`) are a little
  more to learn than one flat set; mitigated by grouping them as "chrome" vs
  "content" in the docs.

## Alternatives considered

- **Wrap the whole viewer in `ViewEncapsulation.ShadowDom`.** Rejected: emulated
  child-component styles live in `document.head` and do not pierce the shadow
  boundary, so the toolbar/rail/renderer chrome would render unstyled — and the
  CDK-overlay dialogs attach to `document.body`, outside the shadow root, so they
  would escape (unstyled) anyway. Making it work would mean re-declaring all chrome
  CSS in the shadow scope _and_ relocating overlay containers — a large, risky
  change well beyond a docs story, and unnecessary given the content-only surface.
- **Add a runtime `encapsulation`/`isolation` input on the viewer.** Rejected:
  Angular fixes `encapsulation` at compile time; a component cannot flip modes from
  an input (the same reason ADR 0009 chose a separate `ReportSurface` component).
- **Invent a new flat token set for the viewer.** Rejected: it would duplicate the
  renderer's already-documented `--rdr-*` content tokens and risk drift; exposing
  the two existing families is truthful and requires no new surface.
- **Document theming/isolation without proving it in the demo.** Rejected by the
  story QA ("doc examples actually work in `viewer-demo`, tested") — and untested
  isolation claims are exactly the kind that rot.
