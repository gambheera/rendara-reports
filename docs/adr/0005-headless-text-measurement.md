# ADR 0005 — Headless, deterministic text measurement for table row heights

- **Status:** Accepted
- **Date:** 2026-06-23
- **Story:** E3-S3 · Data-table expansion & row measurement

> Lightweight ADR in the style of 0001–0004, recording the measurement strategy
> the backlog asks E3-S3 to **decide and document**.

## Context

E3-S3 must expand a data table's detail rows from its bound array and compute
**each row's height from its content**, honouring column widths. Height depends
on how text **wraps** inside a column, which normally needs real font metrics
from a layout engine (a browser DOM, a canvas `measureText`, or a font library).

Two constraints rule that out here:

- `report-engine` is **framework-agnostic pure TS** with **no Angular and no DOM**
  (brief §4, module boundaries). It runs in Node for tests and could run on a
  backend. It cannot call `measureText` or read a real font.
- The pagination engine (E3-S4) and its **snapshot suite** (E3-S7) need layout
  output to be **byte-deterministic** across machines and runs. Real font metrics
  vary by platform/font availability and would make snapshots flaky.

So the engine needs a measurement that is *good enough* to drive pagination math
and *perfectly reproducible*, while the **pixel-exact** rendering stays the
renderer's job (E4), where a real DOM is available.

## Decision

Measure text with a **deterministic average-advance-width heuristic and greedy
word-wrap**, implemented in `libs/report-engine/src/lib/table-layout.ts`:

1. **Font → px via E3-S1 units.** `fontSizePx = ptToPx(fontSizePt, dpi)`. From
   two ratios in `TextMetrics` (defaults in `DEFAULT_TEXT_METRICS`):
   - `avgCharWidthPx = fontSizePx × avgCharWidthEm` (default **0.5 em** — a common
     rule-of-thumb average glyph advance for proportional UI fonts), and
   - `lineHeightPx = fontSizePx × lineHeightEm` (default **1.2**).

2. **Characters-per-line budget.** A column's content width is its `widthMm`
   (honoured, converted to px) minus left/right cell padding; the per-line budget
   is `maxCharsPerLine = max(1, floor(contentWidthPx / avgCharWidthPx))`.

3. **Greedy word-wrap (`wrapLineCount`).** Explicit `\n` force breaks; words are
   packed greedily with single-space separators; a word longer than a line is
   split across `ceil(len / maxCharsPerLine)` lines. Always ≥ 1 line.

4. **Row height.** `rowHeightPx = max(cell line counts) × lineHeightPx +
   padTopPx + padBottomPx`. A row is as tall as its tallest cell.

5. **Pluggable, not hard-coded.** `TextMetrics`, cell padding, font size and DPI
   are all `TableLayoutOptions` with documented defaults. This lets the **E4
   renderer inject a more accurate measurer** (e.g. a real-DOM or font-table
   measurer) without changing the `layoutTable` contract, and lets tests force
   exact wrap points.

The measurement is intentionally an **estimate**. WYSIWYG fidelity is delivered by
the shared renderer (E4) drawing the real glyphs; the engine's numbers exist to
make pagination decisions deterministically.

## Alternatives considered

- **Real DOM / canvas `measureText`.** Rejected: forbidden in the framework-
  agnostic engine, and non-deterministic across platforms/fonts — poison for the
  E3-S7 snapshot suite.
- **Bundle a font + a metrics library (e.g. opentype/fontkit).** Rejected for v1:
  heavy dependency, only correct for the bundled font (templates pick arbitrary
  families), and still needs a fallback for missing fonts. Revisit only if
  estimate-driven pagination proves visibly off against the renderer.
- **Fixed per-row height (ignore wrapping).** Rejected: the acceptance criterion
  is explicitly *per-row height from content*; long descriptions must grow rows.
- **Per-glyph width table instead of a single average.** Rejected as premature: a
  flat average is reproducible and simple; the `TextMetrics`/measurer seam leaves
  room to refine later without a contract change.

## Consequences

- Row heights are **reproducible** and DOM-free, so pagination (E3-S4) and its
  snapshots (E3-S7) are stable across machines.
- Heights are **approximate**. If E4's real rendering diverges enough to misplace
  breaks, the fix is to inject a renderer-provided measurer through the existing
  `TextMetrics`/options seam (or tune the default ratios) — **not** to re-architect
  `layoutTable`.
- `layoutTable` is **synchronous** and consumes an already-**resolved** table
  (E2-S5's `ResolvedDataTable`): resolution (async JSONata) stays separate from
  geometry (sync arithmetic).
- Geometry is **table-relative** (origin = the table frame's top-left). Placing
  the table on a page and breaking it across pages is E3-S4; laying out per-group
  bands is E3-S6. This pass deliberately covers header + flat detail rows + the
  column-footer (grand-total) row only.
