# ADR 0008 — Grouping & group aggregates across pages

- **Status:** Accepted
- **Date:** 2026-06-23
- **Story:** E3-S6 · Grouping & group aggregates across pages

> Records how grouped data tables — group header/footer bands, per-group
> subtotals, group-continued labels across page breaks, and the grand total —
> are folded into the layout/pagination passes without re-architecting them.

## Context

ADRs 0006/0007 deferred **grouping** to E3-S6, noting the page model would be
"incrementally extended … E3-S6 adds group bands into the slice rows" with no
re-architecting of the slicer. The data work is already done by the resolver
(E2-S5): `resolveDataTable` partitions rows into `ResolvedDataTable.groups` (a
primary level, first-seen order) and resolves each group's `header`/`footer`
band — a full-width `label` and per-column `aggregates` (subtotals). What was
missing is the **geometry** (measured group rows) and the **pagination**
(slicing them, repeating a header when a group spans a page).

The E3-S4 constraints still hold: the engine is framework-agnostic and DOM-free,
and the paginator must stay **pure, synchronous, byte-reproducible** (for the
E3-S7 snapshot suite) and **compose** the earlier passes rather than re-derive
them. No `Template` schema change is needed — the `DataTableGroup` / `GroupBand`
/ `GroupAggregate` model already exists from Epic 1.

## Decision

1. **Group layout lives in `layoutTable` (E3-S3), not a new module.** When
   `resolved.groups` is present, `layoutTable` interleaves the bands into its one
   measured row list — `header → [ groupHeader? → detail… → groupFooter? ]× →
   columnFooter?` — instead of the flat detail list. This is the smallest surface:
   `paginate` already calls `layoutTable`, so the slicer receives group rows with
   no new wiring, and the ungrouped path stays byte-identical (guarded branch).

2. **New row kinds + a full-width label.** `MeasuredRowKind` gains `groupHeader`
   and `groupFooter`. A band's per-column **aggregates** are measured as ordinary
   column-bound `MeasuredCell`s (blank where a column has no subtotal); a band
   **label** spans the whole table content width, so it is a separate
   `MeasuredLabel` wrapped against that width (not a single column). Every group
   band and the detail rows within a group carry a `groupIndex` (first-seen
   ordinal) so the paginator can reason about group membership.

3. **Continuation labels are pre-measured, not re-wrapped later.** Each
   `groupHeader` carries a `continuedLabel` (`label + groupContinuedSuffix`,
   default `" (continued)"`, configurable/i18n-able) and its `continuedHeightPx`,
   measured in the DOM-free pass. The paginator therefore never formats or
   re-wraps text — it only re-stacks positions, preserving determinism.

4. **Slicing is the generic greedy packer plus two group-aware rules.** Group/
   detail/footer rows pack and carry forward exactly like E3-S4 rows. On top:
   - **Continued headers:** when a continuation slice resumes *inside* a group
     whose header already rendered (the next row is a non-`groupHeader` row of a
     known group), that group's header is re-emitted at the slice top — after any
     repeated table header — using its `continuedLabel`, tagged `continued: true`.
   - **Group-header orphan control:** a slice never ends on a group header whose
     first following row would not also fit; the header carries forward so it
     stays with ≥ 1 of its rows (mirrors the table-header orphan rule).
   The near-page-end deferral guard now also accounts for the continued header's
   height and is skipped at the top of a fresh page, which bounds the loop.

5. **Subtotals and grand total ride through unchanged.** Per-group subtotals are
   `groupFooter` rows; the grand total stays the single trailing `columnFooter`.
   Widow control (E3-S4) is unchanged except that it now includes any continued
   header height in its fit check.

## Alternatives considered

- **A separate `group-layout.ts` module** keeping `layoutTable` strictly flat.
  Rejected: it would duplicate the measurement machinery (column layout, padding,
  the row measurer) and add a branch in `paginate` to choose between two layout
  functions, for no behavioural gain.
- **Synthesizing the `(continued)` label in the paginator** (string-append +
  re-measure at slice time). Rejected: it would push text formatting and wrapping
  into the otherwise arithmetic-only paginator, risking the deterministic,
  DOM-free contract. Pre-measuring in E3-S3 keeps the paginator pure.
- **Nesting a full continued `MeasuredRow` inside the header row.** Rejected as
  noisy in snapshots and redundant (the cells are identical); a `continuedLabel`
  + `continuedHeightPx` pair carries exactly what differs.
- **Repeating the group header verbatim (no marker).** Rejected as the default:
  a reader can't tell a continued group from a new one. The suffix is the
  default but configurable to `''` for a plain repeat.

## Consequences

- Grouped tables now paginate deterministically with repeating, clearly-marked
  group headers and reconciling subtotals → grand total; ready for the E4-S3 table
  renderer (which reads `label`/`cells`/`continued` directly) and the E3-S7
  snapshot suite.
- The tabular-report golden's page-model snapshot now includes its group bands —
  a reviewed, expected update (it previously rendered as a flat table because
  grouping was deferred).
- **Single primary group level** only, matching the resolver (E2-S5) and the
  goldens. Nested grouping levels remain future work; the `groupIndex` model and
  the slicer's group-aware rules generalise to them when a fixture demands it.
- A group header stranded **alone** on a fresh slice (when even one page cannot
  hold the header plus its first row — a degenerate, near-impossible geometry) is
  accepted rather than special-cased; correctness (every row emitted once) is
  preserved.
