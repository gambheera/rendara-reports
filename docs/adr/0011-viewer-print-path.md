# ADR 0011 — Viewer print path: a hidden per-page print mirror + native `window.print()`

- **Status:** Accepted
- **Date:** 2026-06-26
- **Story:** E8-S2 · Print

## Context

The viewer's Print toolbar action must "render a paginated, print-optimised DOM
with a `@page`/print stylesheet and call `window.print()` (native, crisp, vector
text)" (brief §7). The renderer already provides the print **stylesheet**
(`RENDERER_PRINT_CSS`, ADR 0010) — white sheet, `@page { margin: 0 }`,
`print-color-adjust: exact`, collapsed gaps — and ADR 0010 explicitly deferred
*driving* `window.print()` from the viewer to this story. The remaining problem
is purely about **what is in the DOM when the browser prints**:

- In `'single'` page mode the on-screen `ReportDocument` paints **only the
  current page**; the other pages are not in the DOM at all.
- Zoom is applied as a **CSS transform**, so the on-screen pages are scaled to an
  arbitrary factor (or a `fit-*` mode), not their natural paper size.

So a naive `window.print()` against the live, interactive document would print a
single, scaled page — not the whole report at one sheet per paper page. The print
output must be **all pages, natural size (zoom 1), one sheet per paper page**,
independent of the current page mode and zoom.

## Decision

1. **Render a hidden, print-only mirror of every page.** Alongside the
   interactive shell, the component renders one `ReportDocument` per page —
   `layout: 'single'`, `currentPage: n`, `zoom: 1` — over the page numbers it
   already computes for the thumbnail rail. It reuses the **same shared renderer**
   the on-screen view and the designer preview use, so the printout is true
   WYSIWYG with vector (DOM) text.

2. **Toggle it with `@media print`, declaratively.** The mirror is `display:none`
   on screen. Under `@media print` the interactive `.rdr-viewer-shell` (rail,
   toolbar, scroll, status) is hidden and the mirror is shown; `:host` height is
   released to `auto` so the pages flow. No runtime state, no print-timing race —
   the browser already honours `@media print` for `window.print()`.

3. **Own the page break in the viewer.** Each mirror page is wrapped in a
   viewer-owned `.rdr-viewer-print-page` with `break-after: page`
   (`:last-child { break-after: auto }` to avoid a trailing blank page). Keeping
   the wrapper in the viewer's own template means the rule lives in the viewer's
   **encapsulated** stylesheet — no `::ng-deep` and no edit to the shared
   renderer's styles, baselines or fixture drift-guard. The child
   `ReportDocument` still contributes the renderer-level print rules
   (`@page`/white sheet/colour-adjust) from ADR 0010.

4. **Drive it with a guarded native call.** The Print button calls
   `window.print()` behind `typeof window !== 'undefined' && typeof window.print
   === 'function'`, so the component stays SSR-safe and is a no-op in a runtime
   without a print implementation.

## Consequences

- **+** Print is correct from any view state: single or continuous, any zoom — the
  mirror is always all pages at natural size, one sheet per paper page.
- **+** Vector, crisp, accessible text (DOM/SVG via the shared renderer), per
  brief §7 — never rasterised.
- **+** Zero blast radius outside the viewer: no schema, public-API, shared
  renderer, ADR-0010, or visual-baseline changes. The renderer's existing E4-S8
  print baseline already proves the per-page print fidelity this mirror reuses
  verbatim.
- **−** The mirror renders every page eagerly (kept in the DOM, `display:none`),
  the same per-page cost the thumbnail rail already pays. Acceptable for typical
  reports; viewer-scroll virtualization for very large data remains a future
  concern (brief §7) and does not affect the print mirror's correctness.
- **−** `window.print()` prints the whole browser document, so a host page's own
  content prints alongside the viewer unless the host scopes its own print
  styles. This matches brief §7's native-print intent; full print isolation
  (e.g. an off-screen print iframe) is out of scope for v1.

## Alternatives considered

- **Print the live interactive document.** Rejected: it omits the non-current
  pages in single mode and prints at the on-screen zoom, not natural size.
- **A runtime "print mode" that swaps the on-screen document to continuous +
  zoom 1 around the print call.** Rejected: signal-driven re-render is async, so
  the new DOM may not be laid out before the browser captures the print snapshot;
  `@media print` is the native, declarative mechanism with no timing race (the
  same reasoning ADR 0010 used to reject a manual print-mode toggle for styles).
- **Add `break-after: page` to the shared `RENDERER_PRINT_CSS`.** Workable and
  anticipated by ADR 0010, but it widens the change to the renderer lib and its
  regenerated print-css fixture/drift-guard for a rule only the viewer's print
  path needs; the viewer-owned wrapper keeps it scoped.
- **Rasterise to an image for print.** Rejected by brief §7 — wrecks vector text
  and page breaks; the whole renderer is DOM/SVG to keep print vector-sharp.
