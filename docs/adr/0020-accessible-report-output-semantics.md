# ADR 0020 — Accessible report output via ARIA roles on the positioned DOM

- **Status:** Accepted
- **Date:** 2026-07-01
- **Story:** E10-S1 · Accessibility audit & fixes

## Context

The shared renderer paints a report as **absolutely-positioned `<div>`s** at
authoring-unit-derived px coordinates (E4): each page is a `.rdr-page` sheet, and a
data table is a `.rdr-table` container of `.rdr-table-row` tracks holding
`.rdr-table-cell` boxes, every one positioned with an inline `left/top/width`. This
model is deliberate (brief §3/§7): DOM/SVG (not canvas) keeps text vector-sharp and
paginates naturally, and one view-model drives **both** the Angular component and
the headless `serializePageToHtml` serializer so designer preview, the viewer, and
the visual-regression snapshots are byte-for-byte the same.

E10-S1 requires the **viewer output to be semantically structured** for WCAG 2.2 AA
(brief §9). As rendered, the report body is semantically inert: to a screen reader a
data table is a pile of anonymous groups of text, with no notion of a table, rows,
columns, or which header a cell belongs to, and no page boundaries.

The obvious fix — emit real `<table>`/`<tr>`/`<td>` — collides with the renderer's
core constraints:

- Table rows/cells are **absolutely positioned** at engine-computed px (a slice can
  start mid-table after a page break; columns have fixed widths). Native table
  layout (`display: table`) computes its own geometry and would fight, then diverge
  from, the paginator's measured positions.
- Every existing **visual-regression baseline** (screen + print + zoom, plus the
  golden HTML fixtures) is pinned to the current DOM. Swapping the element model
  would force a full baseline re-shoot and risk real pagination/print regressions —
  a large, high-risk change for a hardening story.

## Decision

Keep the positioned-`<div>` DOM and add **ARIA roles + `aria-*`** to convey the
semantics, applied **identically** in the Angular template and the serializer (so
the two stay byte-parallel and the golden-fixture drift guard covers both):

1. **Tables** — the `.rdr-table` container gets `role="table"` + `aria-label="Data
   table"`; each `.rdr-table-row` gets `role="row"`; a header-row cell gets
   `role="columnheader"` and every other cell `role="cell"` (the one dynamic piece,
   the pure `tableCellRole(rowKind)` helper in `page-view-model.ts`, shared by both
   paths and unit-tested); a full-width group band label gets `role="cell"` so its
   row is never a childless (invalid) `role="row"`.
2. **Pages** — each `.rdr-page-slot` in the multi-page document gets
   `role="group"` + `aria-roledescription="page"` + `aria-label="Page N"`, so a
   screen reader announces page boundaries.
3. Decorative duplicates are hidden from assistive tech, not re-announced: the
   viewer's thumbnail-rail mini-renders are `aria-hidden` (the button's "Go to page
   N" is the accessible name), matching the already-`aria-hidden` print mirror.

## Consequences

- **+** The rendered report is a real, navigable table with column headers and
  labelled pages to assistive tech — the story's "semantically structured output".
- **+** Roles/`aria-*` **paint nothing**, so every visual-regression PNG baseline is
  unchanged; only the additive attributes appear in the regenerated golden HTML
  fixtures (drift-guarded), and the `certificate`/`element-types` (table-less)
  fixtures don't change at all.
- **+** One shared helper + literals keep the component and serializer in lock-step;
  the parity is enforced by existing tests.
- **−** ARIA roles must be kept correct by hand (e.g. a `role="table"` must always
  own `role="row"`s that own cells); covered by unit + component tests and the axe
  e2e gate, but it is a manual contract, not enforced by the layout engine.
- **−** A paginated table that breaks across pages is exposed as **one table per
  page slice** (with its header repeated), not a single logical table spanning
  pages. This matches the paged-document model and how the pages are visually
  separated, and is acceptable for v1.

## Alternatives considered

- **Native `<table>`/`<tr>`/`<td>` markup** — the most semantically pure option, but
  it breaks the absolute-positioned WYSIWYG layout, forces a full visual-baseline
  re-shoot, and risks pagination/print regressions. Rejected as disproportionate and
  risky for a hardening story; ARIA roles achieve the same accessibility outcome with
  zero pixel change.
- **A separate off-screen accessible table** (visually-hidden real `<table>`
  alongside the positioned DOM) — duplicates the data, doubles the DOM, and can drift
  from what is painted. Rejected.
- **`alt` text for data-bound images** — the schema's image element has no `alt`
  field, so bound images render `alt=""` (treated decorative). Adding an `alt`
  binding is a **versioned schema change** (needs a bump + migration + sign-off,
  brief hard rules), so it is tracked as future work, not done here.
