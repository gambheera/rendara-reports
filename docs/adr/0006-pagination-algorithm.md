# ADR 0006 — Pagination algorithm (page breaks, repeated headers, widow/orphan)

- **Status:** Accepted
- **Date:** 2026-06-23
- **Story:** E3-S4 · Pagination algorithm

> Lightweight ADR in the style of 0001–0005, recording the page-break model the
> backlog asks E3-S4 to define: break the body/table across pages, repeat the
> table header per page, honour `keepTogether`, do basic widow/orphan handling,
> and carry remaining rows forward.

## Context

E3-S4 turns a validated template plus its **resolved** data tables into a
deterministic **multi-page** layout. It is the last layout pass before the shared
renderer (E4) and the snapshot suite (E3-S7), so it must be **pure, synchronous,
and byte-reproducible**, and it must compose the earlier passes rather than
re-derive them:

- **E3-S1** units/geometry give the page box and printable area.
- **E3-S2 `layoutStaticPage`** places every element's authored frame as an
  absolute-px box (reused here for fixed elements and the table's authored top).
- **E3-S3 `layoutTable`** measures a table into `header → detail… → optional
  columnFooter` rows with heights from a headless text measurer (ADR 0005).

Several behaviours are **deliberately deferred** so this story stays small:
page header/footer **bands**, `{{pageNumber}}` tokens and watermark are E3-S5;
**grouping** bands and cross-page subtotals are E3-S6; the full multi-golden
snapshot set is E3-S7. E3-S4 paginates the **body** band only.

## Decision

Implement `paginate(template, resolvedTables, options)` in
`libs/report-engine/src/lib/paginate.ts`, producing a `PaginatedDocument` of
`PaginatedPage`s, each carrying its fixed body elements and `TableSlice`s.

1. **Resolved tables in, sync out.** Resolution (E2-S5) is async; the paginator
   takes an already-resolved `ReadonlyMap<elementId, ResolvedDataTable>` and is
   itself synchronous and deterministic. A table absent from the map is skipped
   (the caller owns resolution).

2. **Page content band.** Body content flows between `contentTopPx =
   printable.topPx` (top margin) and `contentBottomPx = pageHeightPx −
   printable.bottomPx` (bottom margin). The **first** slice of a table starts at
   its **authored** top (E3-S2 box); **continuation** slices start at
   `contentTopPx`.

3. **Greedy row packing + carry-forward.** Detail/footer rows are packed while
   `y + rowHeight ≤ contentBottomPx`; the remainder carries to the next page.

4. **Repeat header per page.** When `repeatHeaderOnEachPage`, every continuation
   slice re-emits the measured header row at its top (`headerRepeated: true`).

5. **Orphan control.** A page break is never placed between a (repeated) header
   and its first detail row: a slice that shows a header always shows ≥ 1 detail
   row. This also covers *a table that starts near a page end* — the whole table
   defers to the next page instead of orphaning its header on the current one.

6. **Widow control (basic).** The column-footer (grand-total) row never lands
   alone on the final page; the previous slice's last detail row is pulled down to
   join it, provided that keeps the previous slice non-empty and still fits
   (else it reverts — best-effort, never forces an overflow).

7. **`keepTogether`.** A table that does not fit in the space remaining on the
   current page but *does* fit on a fresh full page is moved there undivided. A
   table taller than a full page falls back to splitting — it cannot be kept whole
   without overflowing forever.

8. **Single huge row.** A row taller than a full content area is placed alone on
   its slice and allowed to overflow (`overflowsPage: true`), guaranteeing the
   loop always advances.

9. **Fixed (non-table) body elements.** Anchored relative to the (first) table's
   top: elements **above** it are *leading* (page 1); elements at/below it are
   *trailing* (last page); both keep their authored boxes. v1 paginates **one
   flowing data table per body** (the goldens' shape) and degrades without
   crashing for other shapes.

10. **Page-absolute rows.** Each sliced row is re-stacked with a fresh
    page-absolute `yPx`, so the renderer (E4) consumes a slice directly.

## Alternatives considered

- **Reflow all fixed elements through the table's flow** (push trailing content
  down as the table grows). Rejected for v1: the goldens use absolute positioning
  and exercise only leading/trailing anchoring; full flow reflow is a larger
  feature with no current fixture demanding it. The leading/trailing split is a
  documented, testable approximation that can be superseded later.
- **Paginate from the static absolute layout alone** (slice the page by y-bands).
  Rejected: a data table is the one element that *grows*; slicing must understand
  rows, header repetition and keep-together, which the row model gives directly.
- **Async paginator that resolves internally.** Rejected: it would make the
  hardest, most snapshot-sensitive pass async and couple it to JSONata I/O.
  Keeping resolution separate preserves a pure, deterministic core.
- **Multi-table flow in one body for v1.** Deferred: both relevant goldens have a
  single table; supporting arbitrary interleaving of fixed elements and multiple
  growing tables is out of scope here and can land as its own story.

## Consequences

- Page breaks are **deterministic** and DOM-free, ready for the E3-S7 snapshot
  suite; E3-S4 adds a focused snapshot of the tabular-report page model.
- The page model is **incrementally extended**: E3-S5 adds repeating header/footer
  bands + page numbers + watermark onto each `PaginatedPage`; E3-S6 adds group
  bands into the slice rows. Neither requires re-architecting the slicer.
- Row heights are only as accurate as the ADR-0005 estimate; if E4's real
  rendering misplaces a break, the fix is the existing `TextMetrics`/measurer seam
  (or default ratios), **not** the pagination algorithm.
- "One flowing table per body" and "leading/trailing fixed anchoring" are explicit
  limitations recorded here; revisit when a fixture needs richer flow.
