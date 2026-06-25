# ADR 0010 — Renderer print stylesheet: a shared `@media print` block in the renderer styles

- **Status:** Accepted
- **Date:** 2026-06-24
- **Story:** E4-S8 · Render visual-regression baseline

## Context

E4-S8 must snapshot every golden "(screen + print stylesheet) as the protected
baseline" — which presupposes a print stylesheet exists. The brief is explicit
(§7): Print "render[s] a paginated, print-optimised DOM with a `@page`/print
stylesheet and call[s] `window.print()` (native, crisp, vector text)." Several
forces shape where that stylesheet lives:

- The on-screen renderer paints **screen-only chrome** that must not print: each
  page sheet's drop-shadow (`RENDERER_PAGE_CSS`), the dashed printable-area guide
  (`.rdr-printable`), the grey designer/viewer backdrop, and the inter-page gaps
  in continuous layout (`RENDERER_DOCUMENT_CSS`).
- The renderer already has a **single style source of truth**
  (`libs/report-renderer/src/lib/renderer-styles.ts`, ADR 0009) that every
  consumer — the emulated components, the Shadow-DOM `ReportSurface`, and the
  headless visual fixtures — shares. A print stylesheet that lived anywhere else
  would drift from the chrome it has to override.
- The **viewer's** Print toolbar action (`window.print()`) is E8, but it needs a
  print stylesheet to print against; defining one only in the viewer would leave
  the designer preview and the shared renderer with no print behaviour.
- Visual baselines are **OS-rasterizer-specific and Linux-only** (ADR 0001); the
  e2e harness may not import workspace libs (Nx boundaries), so it consumes
  pre-rendered artifacts.

## Decision

1. **Add `RENDERER_PRINT_CSS` to `renderer-styles.ts`** — an `@media print` block
   that suppresses the screen-only chrome (`box-shadow: none`, `.rdr-printable {
   outline: none }`, white sheet/backdrop, `.rdr-document { gap: 0 }`), gives the
   physical page to the browser with `@page { margin: 0 }` (each sheet's own mm
   dimensions are the printable area), and sets `print-color-adjust: exact` so
   tinted fills, table bands and the watermark survive the print engine's
   ink-saving default.

2. **Bundle it through the existing style plumbing.** It is appended to
   `RENDERER_SURFACE_CSS` and added to the `styles` of `ReportRenderer`,
   `ReportDocument` and `ReportSurface`, so every render path — emulated designer,
   emulated viewer, Shadow-DOM viewer — prints identically. As an authored string
   literal it stays statically evaluable for Angular's `styles`.

3. **Expose it to the visual harness as a committed artifact.**
   `tools/generate-render-fixtures.ts` emits `RENDERER_PRINT_CSS` to
   `apps/visual-e2e/e2e/__fixtures__/renderer-print.css`; a shared
   `fixture-page.ts` helper appends it after the (unchanged) on-screen chrome, so
   each golden's `*-print.png` snapshot — captured under `emulateMedia({ media:
   'print' })` — exercises the **genuine** stylesheet. `golden-page-html.spec.ts`
   guards the artifact against drift like the HTML fixtures.

4. **Scope: renderer-level only.** This ADR covers the print *stylesheet*. Driving
   `window.print()` from the viewer toolbar (and the pluggable `PdfExporter`)
   remains E8; this decision is what those build on.

## Consequences

- **+** "Screen + print stylesheet" baseline is real: the print snapshots diff a
  genuine print-optimised render (no shadow/guide, white sheet), not a screen
  approximation.
- **+** Designer preview, emulated viewer and Shadow-DOM viewer all print the
  same way, from one source — no per-consumer drift.
- **+** `@media print` changes no on-screen pixels and no DOM, so existing screen
  baselines and the E4-S6 view-mode byte-stability guarantee are untouched.
- **−** A second harness mirror exists (the e2e can't import the constant), so the
  literal screen chrome in `fixture-page.ts` and the generated print artifact must
  track the renderer — mitigated by the drift guard on the print artifact and the
  single `renderer-styles.ts` source.
- **−** `@page { margin: 0 }` is page-global; true per-document page sizing through
  `@page size` is deferred (the sheet's own dimensions stand in). Acceptable until
  the E8 print path needs more.

## Alternatives considered

- **Put the print stylesheet only in the viewer (E8).** Rejected: the designer
  preview and shared renderer would have no print behaviour, and the print
  baseline this story needs would have nothing genuine to snapshot.
- **Keep print rules only in the e2e harness fixtures.** Rejected: the real
  component would not print correctly, and the snapshot would validate a harness
  approximation rather than shipped behaviour.
- **Rasterise to an image for print (html2canvas-style).** Rejected by brief §7 —
  it wrecks vector text crispness and page breaks; the whole renderer is DOM/SVG
  precisely to keep print vector-sharp.
- **A runtime "print mode" input that swaps styles.** Rejected: `@media print` is
  the native, declarative mechanism the browser already honours for
  `window.print()`; a manual toggle adds state for no gain.
