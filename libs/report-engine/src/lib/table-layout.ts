/**
 * Data-table expansion & row measurement (E3-S3) — the engine pass that turns a
 * **resolved** data table (E2-S5's {@link ResolvedDataTable}) into concrete
 * table geometry: one measured detail row per bound data row, a measured header
 * row, an optional column-footer (grand-total) row, and a column layout whose
 * **widths are honoured** from the authored `widthMm`. Heights come from the
 * cells' wrapped content via a deterministic, DOM-free measurement strategy.
 *
 * It composes directly on the earlier engine passes and reinvents none of them:
 * the resolver ({@link resolveDataTable}) has already evaluated every cell to its
 * display string, and {@link ptToPx} (E3-S1) does the unit conversion. This pass
 * adds only the **geometry** — wrapping, row heights, and column offsets — that
 * the pagination algorithm (E3-S4) and the table renderer (E4-S3) consume.
 *
 * ## What this pass does NOT do
 * - **Pagination / page breaks / repeat-header-per-page** — E3-S4. This produces
 *   one continuous table block; how it is sliced across pages is not decided here.
 * - **Grouping band layout** — E3-S6. The resolver may have partitioned the rows
 *   into {@link ResolvedDataTable.groups}, but this pass lays out the *flat* row
 *   list (header → detail rows → optional column footer). Placing per-group
 *   header/footer rows is E3-S6's concern.
 * - **DOM rendering** — E4. The measurer here is a deterministic *estimate*; the
 *   renderer paints the real glyphs.
 *
 * ## Coordinate system: table-relative
 * Every `xPx`/`yPx`/`*Px` value is **relative to the table frame's top-left**,
 * not the page. The static-layout pass (E3-S2) places the table's frame on the
 * page and leaves its height `null` (a growing element); this pass computes that
 * height. Translating these table-relative boxes onto a page (and breaking them
 * across pages) is E3-S4.
 *
 * ## Text-measurement strategy (decided & documented — see ADR 0005)
 * The engine is framework-agnostic with **no DOM**, so it cannot use real browser
 * text metrics. Row heights use a deterministic **average-advance-width heuristic
 * with greedy word-wrap**:
 *
 *  1. `fontSizePx = ptToPx(fontSizePt, dpi)` (E3-S1 units).
 *  2. `avgCharWidthPx = fontSizePx × avgCharWidthEm` and
 *     `lineHeightPx = fontSizePx × lineHeightEm` — both from {@link TextMetrics}
 *     (default {@link DEFAULT_TEXT_METRICS}), so the renderer can later inject a
 *     more accurate measurer without changing this contract.
 *  3. A column's *content width* is its box width minus left/right cell padding;
 *     `maxCharsPerLine = max(1, floor(contentWidthPx / avgCharWidthPx))`.
 *  4. {@link wrapLineCount} greedily packs whitespace-separated words into lines
 *     (honouring explicit `\n`, splitting any word longer than a line), yielding a
 *     line count per cell.
 *  5. `rowHeightPx = max(cell line counts) × lineHeightPx + padTopPx + padBottomPx`.
 *
 * This trades pixel-exactness for **determinism and a zero DOM dependency**, which
 * is exactly what the pagination snapshot suite (E3-S7) needs: the same inputs
 * always yield byte-identical geometry. The constants live in one place and are
 * configurable per call.
 *
 * ## Determinism
 * Pure arithmetic and string operations only — no `Date`, randomness, locale, or
 * I/O. Re-running {@link layoutTable} on the same resolved table and options
 * yields a deeply-equal result.
 */

import type {
  ColumnAlign,
  DataTableColumn,
  DataTableElement,
} from '@rendara/report-schema';

import type { ResolvedAggregate, ResolvedDataTable, ResolvedRow } from './resolve';
import { DEFAULT_DPI, mmToPx, ptToPx } from './units';

/**
 * The two ratios that drive the headless text measurer, expressed as fractions
 * of the font size (`em`). Both are estimates of a proportional UI font; override
 * per call when a more accurate (or stricter) model is wanted.
 */
export interface TextMetrics {
  /** Average glyph advance width as a fraction of font size. */
  readonly avgCharWidthEm: number;
  /** Line-box height as a fraction of font size. */
  readonly lineHeightEm: number;
}

/**
 * Default text metrics: a `0.5 em` average advance (a common rule-of-thumb for
 * proportional fonts) and a `1.2` line-height. See ADR 0005 for rationale.
 */
export const DEFAULT_TEXT_METRICS: TextMetrics = {
  avgCharWidthEm: 0.5,
  lineHeightEm: 1.2,
};

/** Per-side inner cell padding in millimetres. */
export interface CellPaddingMm {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/**
 * Default cell padding (mm): a touch more horizontally than vertically, matching
 * typical table cell insets. Configurable via {@link TableLayoutOptions}.
 */
export const DEFAULT_CELL_PADDING_MM: CellPaddingMm = {
  top: 1,
  right: 1.5,
  bottom: 1,
  left: 1.5,
};

/**
 * Fallback font size (pt) used when the caller does not pass one. Mirrors the
 * `report-schema` document default font; pass the template's resolved
 * `page.defaultFont.sizePt` to honour the document.
 */
export const DEFAULT_FONT_SIZE_PT = 10;

/** Inputs that tune the measurement; all optional with documented defaults. */
export interface TableLayoutOptions {
  /** Dots-per-inch for pt/mm → px (defaults to {@link DEFAULT_DPI} = 96). */
  readonly dpi?: number;
  /** Body/header font size in points (defaults to {@link DEFAULT_FONT_SIZE_PT}). */
  readonly fontSizePt?: number;
  /** Glyph-advance / line-height ratios (defaults to {@link DEFAULT_TEXT_METRICS}). */
  readonly metrics?: TextMetrics;
  /** Inner cell padding in mm (defaults to {@link DEFAULT_CELL_PADDING_MM}). */
  readonly cellPaddingMm?: CellPaddingMm;
}

/** One column placed within the table: its left offset, width, and alignment. */
export interface TableColumnLayout {
  readonly key: string;
  /** Left offset from the table's left edge, in px. */
  readonly xPx: number;
  /** Column width in px (from the authored `widthMm`). */
  readonly widthPx: number;
  /** Horizontal alignment (defaults to `left` when the column omits it). */
  readonly align: ColumnAlign;
}

/** One measured cell: its column, display text, wrapped line count, and align. */
export interface MeasuredCell {
  readonly columnKey: string;
  /** The display string (header label, resolved cell value, or footer aggregate). */
  readonly text: string;
  /** Number of wrapped lines the text occupies in its column (≥ 1). */
  readonly lineCount: number;
  readonly align: ColumnAlign;
}

/** The kind of row a {@link MeasuredRow} represents. */
export type MeasuredRowKind = 'header' | 'detail' | 'columnFooter';

/**
 * One measured row of the table: its kind, top offset and height (table-relative
 * px), and its per-column cells. Detail rows also carry their source array
 * {@link MeasuredRow.index} for deterministic identification downstream.
 */
export interface MeasuredRow {
  readonly kind: MeasuredRowKind;
  /** Source-array index for a `detail` row; absent for `header`/`columnFooter`. */
  readonly index?: number;
  /** Top offset from the table's top edge, in px. */
  readonly yPx: number;
  /** Measured row height in px. */
  readonly heightPx: number;
  /** Cells in declared column order. */
  readonly cells: readonly MeasuredCell[];
}

/**
 * The fully measured table block: column layout, every row (header → detail →
 * optional column footer) in paint order, and the total block size. All geometry
 * is relative to the table frame's top-left.
 */
export interface TableLayout {
  readonly columns: readonly TableColumnLayout[];
  readonly rows: readonly MeasuredRow[];
  /** Total table width in px (sum of column widths). */
  readonly widthPx: number;
  /** Total measured height in px (sum of row heights). */
  readonly heightPx: number;
}

/**
 * Counts the wrapped lines `text` occupies given a maximum characters-per-line
 * budget, using greedy word-wrap. Explicit `\n` newlines force a break; a single
 * word longer than `maxCharsPerLine` is split across as many lines as it needs.
 * Always returns at least 1 (an empty cell still occupies one line). Pure and
 * deterministic — the core of the measurement strategy (see the module doc).
 */
export function wrapLineCount(text: string, maxCharsPerLine: number): number {
  // Guard a degenerate budget so a zero/negative width can't loop or divide by
  // zero; one char per line is the strictest sensible floor.
  const maxChars = Math.max(1, Math.floor(maxCharsPerLine));

  let lines = 0;
  for (const segment of text.split('\n')) {
    lines += segmentLineCount(segment, maxChars);
  }
  // An all-empty string ('' or only newlines) still occupies a single line.
  return Math.max(1, lines);
}

/** Greedy-packs one newline-free segment's words; returns its line count (≥ 1). */
function segmentLineCount(segment: string, maxChars: number): number {
  const words = segment.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) {
    return 1;
  }

  let lines = 1;
  let lineLen = 0;
  for (const word of words) {
    if (lineLen === 0) {
      // First word on a fresh line: a long word overflows onto extra lines.
      const extra = Math.ceil(word.length / maxChars) - 1;
      lines += extra;
      lineLen = word.length - extra * maxChars;
    } else if (lineLen + 1 + word.length <= maxChars) {
      // Fits after a single separating space.
      lineLen += 1 + word.length;
    } else {
      // Wrap to a new line, then place the (possibly long) word there.
      lines += 1;
      const extra = Math.ceil(word.length / maxChars) - 1;
      lines += extra;
      lineLen = word.length - extra * maxChars;
    }
  }
  return lines;
}

/**
 * Expands and measures a resolved data table into concrete, table-relative
 * geometry. Produces a header row, one detail row per resolved data row (in
 * source order), and — when any column declares a footer — a column-footer
 * (grand-total) row. Column widths are honoured from the authored `widthMm`;
 * each cell's height comes from wrapping its text within its column's content
 * width (see the module doc for the strategy). Grouping bands (E3-S6) and page
 * breaks (E3-S4) are intentionally not handled here.
 */
export function layoutTable(
  element: DataTableElement,
  resolved: ResolvedDataTable,
  options?: TableLayoutOptions,
): TableLayout {
  const dpi = options?.dpi ?? DEFAULT_DPI;
  const fontSizePt = options?.fontSizePt ?? DEFAULT_FONT_SIZE_PT;
  const metrics = options?.metrics ?? DEFAULT_TEXT_METRICS;
  const padding = options?.cellPaddingMm ?? DEFAULT_CELL_PADDING_MM;

  const fontSizePx = ptToPx(fontSizePt, dpi);
  const avgCharWidthPx = fontSizePx * metrics.avgCharWidthEm;
  const lineHeightPx = fontSizePx * metrics.lineHeightEm;
  const padTopPx = mmToPx(padding.top, dpi);
  const padBottomPx = mmToPx(padding.bottom, dpi);
  const padLeftPx = mmToPx(padding.left, dpi);
  const padRightPx = mmToPx(padding.right, dpi);
  const verticalPadPx = padTopPx + padBottomPx;

  // Column layout: cumulative x offsets, widths honoured, plus each column's
  // usable content width and per-line character budget for measurement.
  const columns: TableColumnLayout[] = [];
  const maxCharsByKey = new Map<string, number>();
  let xPx = 0;
  for (const column of element.columns) {
    const widthPx = mmToPx(column.widthMm, dpi);
    const align: ColumnAlign = column.align ?? 'left';
    columns.push({ key: column.key, xPx, widthPx, align });

    const contentWidthPx = widthPx - padLeftPx - padRightPx;
    maxCharsByKey.set(column.key, contentWidthPx / avgCharWidthPx);
    xPx += widthPx;
  }
  const widthPx = xPx;

  /** Measures one row of cell texts into a {@link MeasuredRow}. */
  const measureRow = (
    kind: MeasuredRowKind,
    yPx: number,
    cellText: (column: DataTableColumn) => string,
    index?: number,
  ): MeasuredRow => {
    let maxLines = 1;
    const cells: MeasuredCell[] = element.columns.map((column) => {
      const text = cellText(column);
      const lineCount = wrapLineCount(text, maxCharsByKey.get(column.key) ?? 0);
      if (lineCount > maxLines) {
        maxLines = lineCount;
      }
      return { columnKey: column.key, text, lineCount, align: column.align ?? 'left' };
    });
    const heightPx = maxLines * lineHeightPx + verticalPadPx;
    return { kind, ...(index === undefined ? {} : { index }), yPx, heightPx, cells };
  };

  const rows: MeasuredRow[] = [];
  let cursorY = 0;
  const push = (row: MeasuredRow): void => {
    rows.push(row);
    cursorY += row.heightPx;
  };

  // Header row: the static column header labels.
  push(measureRow('header', cursorY, (column) => column.header));

  // Detail rows: one per resolved data row, in source order, using the cell's
  // already-formatted display string.
  for (const dataRow of resolved.rows) {
    push(
      measureRow('detail', cursorY, (column) => cellTextFor(dataRow, column.key), dataRow.index),
    );
  }

  // Column-footer (grand-total) row: only when at least one column has a footer.
  if (resolved.columnFooters.length > 0) {
    push(measureRow('columnFooter', cursorY, (column) => footerTextFor(resolved.columnFooters, column.key)));
  }

  return { columns, rows, widthPx, heightPx: cursorY };
}

/** The formatted display string of a resolved row's cell for `columnKey` (`''` if absent). */
function cellTextFor(row: ResolvedRow, columnKey: string): string {
  const cell = row.cells.find((c) => c.columnKey === columnKey);
  return cell ? cell.value.formatted : '';
}

/** The formatted display string of the column-footer aggregate for `columnKey` (`''` if none). */
function footerTextFor(footers: readonly ResolvedAggregate[], columnKey: string): string {
  const footer = footers.find((f) => f.columnKey === columnKey);
  return footer ? footer.value.formatted : '';
}
