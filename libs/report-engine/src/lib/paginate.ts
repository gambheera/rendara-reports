/**
 * Pagination algorithm (E3-S4) + page chrome (E3-S5) — the engine pass that turns
 * a validated template plus its **resolved** data tables into a deterministic
 * **multi-page** layout: the body's fixed elements distributed onto pages, and
 * each data table sliced across pages with its header repeated, `keepTogether`
 * honoured, and basic widow/orphan control. This is the "hardest core" of Epic 3
 * (brief §7) and the thing the renderer (E4) walks page-by-page.
 *
 * ## Page chrome (E3-S5)
 * On top of the body pagination, every page carries the template's **`header`**
 * and **`footer`** band elements (laid out in the page margins by E3-S2 and
 * **repeated on every page**), the **`{{pageNumber}}`/`{{pageCount}}` tokens**
 * resolved per page into each text element's {@link PlacedElement.resolvedText},
 * and the document-level **watermark** config echoed into the page model. The
 * watermark is a render-time concern (brief §8: the *viewer* config, not the
 * template, carries it), so it arrives via {@link PaginateOptions.watermark} and
 * is **not** sourced from the (frozen) template schema; absent → `null`.
 *
 * It composes the earlier passes and reinvents none of them:
 *  - **E3-S2 {@link layoutStaticPage}** gives the page geometry and every
 *    element's absolute-px box; this pass reuses it both to place the fixed body
 *    elements and to read each table's authored top edge.
 *  - **E3-S3 {@link layoutTable}** measures the table into `header → detail… →
 *    optional columnFooter` rows; this pass only *slices* that row list across
 *    pages — it never re-measures text.
 *  - Resolution (E2-S5 {@link resolveDataTable}) is async, so the paginator takes
 *    **already-resolved** tables (a {@link ReadonlyMap} keyed by element id) and
 *    stays **synchronous and deterministic** — re-running on the same inputs
 *    yields a deeply-equal document, exactly what the snapshot suite (E3-S7)
 *    needs.
 *
 * ## What this pass does NOT do (deferred, see ADR 0006 / 0007)
 *  - **Grouping bands across pages** — E3-S6. The flat measured row list (header /
 *    detail / columnFooter) is sliced here; group header/footer rows and
 *    carry-over subtotals are E3-S6's concern.
 *  - **DOM rendering** — E4.
 *
 * ## The page content band
 * Body content flows between two horizontal limits in page-absolute px:
 *  - `contentTopPx = printable.topPx` (the top margin) — where a *continuation*
 *    slice starts on pages 2…N, and
 *  - `contentBottomPx = pageHeightPx − printable.bottomPx` (the bottom margin) —
 *    the limit a row may not cross.
 * The **first** slice of a table starts at the table's *authored* top (its E3-S2
 * box), not at `contentTopPx`, so fixed content above it is respected.
 *
 * ## Fixed (non-table) body elements
 * Fixed elements are anchored relative to the (first) table's top edge: those
 * **above** it are "leading" and placed on **page 1**; those at/below it are
 * "trailing" and placed on the **last page**, both at their authored boxes.
 * Reflowing fixed elements through the table's flow is out of scope (a future
 * concern); v1 paginates **one flowing data table per body** — the shape of the
 * goldens — and degrades gracefully (no crash) for other shapes.
 *
 * ## Table slicing
 *  - Rows are greedily packed while `y + rowHeight ≤ contentBottomPx`; the
 *    remainder is **carried forward** to the next page.
 *  - **Repeat header:** when `repeatHeaderOnEachPage`, every continuation slice
 *    re-emits the measured header row at its top.
 *  - **Orphan control:** a page break is never placed between a (repeated) header
 *    and its first detail row — a slice that shows a header always shows ≥ 1
 *    detail row. This also handles a table that *starts near a page end*: the
 *    whole table defers to the next page rather than orphaning its header.
 *  - **Widow control (basic):** the column-footer (grand-total) row never lands
 *    alone on the final page; the last detail row is pulled down to join it when
 *    that keeps it on the page.
 *  - **`keepTogether: true`:** a table that does not fit in the space remaining
 *    on the current page but *does* fit on a fresh full page is moved there
 *    undivided; a table taller than a full page falls back to splitting (it
 *    cannot be kept whole without overflowing).
 *  - **Single huge row** (taller than a full content area): placed alone on its
 *    slice and allowed to overflow, so the loop always advances.
 *
 * Every sliced row is re-stacked with a fresh **page-absolute** `yPx`, so a
 * renderer consumes a slice's rows directly without re-deriving positions.
 *
 * ## Determinism
 * Pure arithmetic and array operations only — no `Date`, randomness, locale, or
 * I/O. The output ordering (pages ascending, tables in document order, rows in
 * paint order) is fully stable.
 */

import type { DataTableElement, RendaraTemplate } from '@rendara/report-schema';

import type { PageGeometry } from './geometry';
import { type LaidOutElement, layoutStaticPage } from './layout';
import type { ResolvedDataTable } from './resolve';
import {
  layoutTable,
  type MeasuredRow,
  type TableColumnLayout,
  type TableLayout,
  type TableLayoutOptions,
} from './table-layout';
import { DEFAULT_DPI } from './units';

/**
 * Watermark config (E3-S5) echoed into the page model. The engine only *produces*
 * this config; painting it (a centred, rotated text/image layer behind the page
 * content) is the renderer's job (E4) and configuring it interactively is the
 * viewer's (E8-S4). Fields mirror the viewer's watermark dialog (brief §8). It is
 * a **render-time** concern supplied via {@link PaginateOptions.watermark}, not a
 * field of the (versioned) template schema.
 */
export interface Watermark {
  /** `text` paints {@link text}; `image` paints {@link src}. */
  readonly type: 'text' | 'image';
  /** The watermark caption (e.g. `"CONFIDENTIAL"`), for `type: 'text'`. */
  readonly text?: string;
  /** Image URL/data-URI, for `type: 'image'`. */
  readonly src?: string;
  /** Layer opacity in `[0, 1]` (e.g. `0.15`). */
  readonly opacity: number;
  /** Rotation in degrees (e.g. `-45` for the classic diagonal). */
  readonly angleDeg: number;
  /** Text colour (hex), for `type: 'text'`. */
  readonly color?: string;
  /** Text size in points, for `type: 'text'`. */
  readonly fontSizePt?: number;
}

/** Tuning for pagination; extends the E3-S3 table-measurement options. */
export interface PaginateOptions extends TableLayoutOptions {
  /**
   * Optional watermark to stamp on every page, echoed into
   * {@link PaginatedDocument.watermark}. Omit (or `null`) for no watermark.
   */
  readonly watermark?: Watermark | null;
}

/**
 * A fixed (non-table) element placed on a page (E3-S5): its E3-S2 geometry plus
 * the per-page-resolved text for {@link resolvePageTokens page tokens}.
 */
export interface PlacedElement extends LaidOutElement {
  /**
   * For a text element whose literal `text` contains `{{pageNumber}}`/
   * `{{pageCount}}`, the substituted string for **this** page; otherwise `null`,
   * meaning the renderer uses the element's own (token-free) content.
   */
  readonly resolvedText: string | null;
}

/**
 * One on-page fragment of a data table. Its {@link rows} carry **page-absolute**
 * `yPx` values (re-stacked from the table-relative E3-S3 measurement) so a
 * renderer can place them directly. The header row is included on the first
 * slice and, when `repeatHeaderOnEachPage`, on every continuation slice.
 */
export interface TableSlice {
  /** Id of the source {@link DataTableElement}. */
  readonly elementId: string;
  /** The column layout (identical across every slice of the table). */
  readonly columns: readonly TableColumnLayout[];
  /** Rows on this page in paint order (header first when shown), page-absolute `yPx`. */
  readonly rows: readonly MeasuredRow[];
  /** `true` when this slice's header is a per-page *repeat* (not the table's first occurrence). */
  readonly headerRepeated: boolean;
  /** `true` for the table's first slice. */
  readonly isFirstSlice: boolean;
  /** `true` for the table's last slice. */
  readonly isLastSlice: boolean;
  /** Page-absolute top of the slice in px. */
  readonly yPx: number;
  /** Slice height in px (header + placed rows). */
  readonly heightPx: number;
  /** `true` when the slice exceeds `contentBottomPx` (only via a single huge row). */
  readonly overflowsPage: boolean;
}

/** One paginated page: its repeating chrome, fixed body elements and table slices. */
export interface PaginatedPage {
  /** 0-based page index. */
  readonly index: number;
  /** 1-based page number (`index + 1`), for convenience. */
  readonly pageNumber: number;
  /** Header band elements, repeated on every page, with page tokens resolved (E3-S5). */
  readonly header: readonly PlacedElement[];
  /** Fixed (non-table) body elements placed on this page, in paint order. */
  readonly elements: readonly PlacedElement[];
  /** Footer band elements, repeated on every page, with page tokens resolved (E3-S5). */
  readonly footer: readonly PlacedElement[];
  /** Table slices on this page, in document then slice order. */
  readonly tables: readonly TableSlice[];
}

/** A fully paginated document: the shared geometry, the page count, and the pages. */
export interface PaginatedDocument {
  readonly geometry: PageGeometry;
  /** Total number of pages (always ≥ 1). */
  readonly pageCount: number;
  readonly pages: readonly PaginatedPage[];
  /** Watermark stamped on every page (E3-S5), or `null` when none was configured. */
  readonly watermark: Watermark | null;
}

/** A page-assigned table slice (the internal product of {@link sliceTable}). */
interface PlacedSlice extends TableSlice {
  readonly pageIndex: number;
}

/** A planned slice before its rows are stacked into page-absolute positions. */
interface SlicePlan {
  page: number;
  startY: number;
  showHeader: boolean;
  /** The content (detail / columnFooter) rows assigned to this slice, in order. */
  rows: MeasuredRow[];
  /** `true` when a single row overflowed the content band on this slice. */
  overflow: boolean;
}

/**
 * Paginates a validated `template` over its `resolvedTables` (keyed by data-table
 * element id) into a multi-page {@link PaginatedDocument}. Pure and synchronous;
 * see the module overview for the content band, fixed-element anchoring, and the
 * slicing rules. Tables absent from `resolvedTables` are skipped (the caller owns
 * resolution, which is async).
 */
export function paginate(
  template: RendaraTemplate,
  resolvedTables: ReadonlyMap<string, ResolvedDataTable>,
  options?: PaginateOptions,
): PaginatedDocument {
  const dpi = options?.dpi ?? DEFAULT_DPI;
  // Honour the document's default font size unless the caller overrides it, so
  // row heights match the template (E3-S3 otherwise defaults to 10 pt).
  const tableOptions: TableLayoutOptions = {
    ...options,
    dpi,
    fontSizePt: options?.fontSizePt ?? template.page.defaultFont.sizePt,
  };

  const staticLayout = layoutStaticPage(template, dpi);
  const { geometry } = staticLayout;
  const contentTopPx = geometry.printable.topPx;
  const contentBottomPx = geometry.pagePx.heightPx - geometry.printable.bottomPx;

  const bodyElements = staticLayout.elements.filter((e) => e.band === 'body');
  const fixedElements = bodyElements.filter((e) => e.type !== 'dataTable');
  const tableBoxById = new Map(bodyElements.map((e) => [e.id, e]));

  // Repeating page chrome (E3-S5): the header/footer band elements, already laid
  // out in the margins by E3-S2, are re-emitted (with page tokens resolved) on
  // every page. A lookup of each text element's *literal* text feeds token
  // substitution; binding-driven text has no literal and is left untouched.
  const headerElements = staticLayout.elements.filter((e) => e.band === 'header');
  const footerElements = staticLayout.elements.filter((e) => e.band === 'footer');
  const literalTextById = buildLiteralTextMap(template);

  const tableElements = template.body.elements.filter(
    (e): e is DataTableElement => e.type === 'dataTable',
  );

  // Slice every body table in document order, flowing each from where the
  // previous one ended (or from its own authored top, for the first table).
  const slices: PlacedSlice[] = [];
  let pageCursor = 0;
  let yCursor = contentTopPx;
  let firstTableTopPx: number | null = null;

  for (let t = 0; t < tableElements.length; t += 1) {
    const element = tableElements[t];
    const resolved = resolvedTables.get(element.id);
    if (!resolved) {
      continue;
    }
    const measured = layoutTable(element, resolved, tableOptions);

    // The first table starts at its authored top; later tables continue from the
    // running cursor (same page if there is room, else this was already advanced).
    const authoredTopPx = tableBoxById.get(element.id)?.boxPx.yPx ?? contentTopPx;
    if (firstTableTopPx === null) {
      firstTableTopPx = authoredTopPx;
      yCursor = authoredTopPx;
    }

    const result = sliceTable(
      element,
      measured,
      pageCursor,
      yCursor,
      contentTopPx,
      contentBottomPx,
    );
    slices.push(...result.slices);
    pageCursor = result.endPage;
    yCursor = result.endY;
  }

  const lastSlicePage = slices.reduce((max, s) => Math.max(max, s.pageIndex), 0);
  const pageCount = Math.max(1, lastSlicePage + 1);
  const lastPageIndex = pageCount - 1;

  // Leading fixed elements (above the first table) sit on page 1; trailing ones
  // (at/below it, e.g. an invoice total block) trail to the last page. With no
  // table, every fixed element is on the single page.
  const splitY = firstTableTopPx ?? Number.POSITIVE_INFINITY;
  const leading = fixedElements.filter((e) => e.boxPx.yPx < splitY);
  const trailing = fixedElements.filter((e) => e.boxPx.yPx >= splitY);

  const pages: PaginatedPage[] = [];
  for (let index = 0; index < pageCount; index += 1) {
    const pageNumber = index + 1;
    // Resolve `{{pageNumber}}`/`{{pageCount}}` against THIS page for every placed
    // element, so a renderer paints "Page 2 of 12" etc. directly.
    const place = (e: LaidOutElement): PlacedElement =>
      toPlacedElement(e, literalTextById, pageNumber, pageCount);

    const bodyFixed =
      index === 0 && index === lastPageIndex
        ? [...leading, ...trailing]
        : index === 0
          ? leading
          : index === lastPageIndex
            ? trailing
            : [];
    const tables = slices
      .filter((s) => s.pageIndex === index)
      .map(stripPageIndex);
    pages.push({
      index,
      pageNumber,
      header: headerElements.map(place),
      elements: bodyFixed.map(place),
      footer: footerElements.map(place),
      tables,
    });
  }

  return { geometry, pageCount, pages, watermark: options?.watermark ?? null };
}

/**
 * Slices one measured table across pages starting at (`startPage`, `startY`),
 * returning the placed slices and the page/Y the table ended at (so a following
 * table can continue from there). Implements the orphan, widow, `keepTogether`
 * and huge-row rules documented on the module.
 */
function sliceTable(
  element: DataTableElement,
  measured: TableLayout,
  startPage: number,
  startY: number,
  contentTopPx: number,
  contentBottomPx: number,
): { slices: PlacedSlice[]; endPage: number; endY: number } {
  const headerRow = measured.rows[0];
  const contentRows = measured.rows.slice(1);
  const repeat = element.repeatHeaderOnEachPage;
  const headerHeightPx = headerRow.heightPx;
  // Usable height on a fresh continuation page after a (shown) header — the floor
  // below which a row is "huge" and can never share a page with the header.
  const freshContentAvail = contentBottomPx - contentTopPx - headerHeightPx;

  let page = startPage;
  let sliceStartY = startY;

  // keepTogether: keep the whole table on one page when it does not fit in the
  // space left here but does fit on a fresh full page.
  if (element.keepTogether) {
    const fitsHere = measured.heightPx <= contentBottomPx - sliceStartY;
    const fitsFresh = measured.heightPx <= contentBottomPx - contentTopPx;
    if (!fitsHere && fitsFresh) {
      page += 1;
      sliceStartY = contentTopPx;
    }
  }

  const plans: SlicePlan[] = [];
  let i = 0;
  let firstSlice = true;

  while (true) {
    const showHeader = firstSlice || repeat;
    const headerH = showHeader ? headerHeightPx : 0;

    // Orphan / near-page-end guard: if a header would sit here with no room for
    // its first detail row, and that row would fit on a fresh page, defer the
    // whole start to the next page instead of emitting a header-only slice.
    if (i < contentRows.length) {
      const next = contentRows[i];
      const fitsHere = sliceStartY + headerH + next.heightPx <= contentBottomPx;
      const huge = next.heightPx > freshContentAvail;
      if (!fitsHere && !huge) {
        page += 1;
        sliceStartY = contentTopPx;
        continue;
      }
    }

    const planRows: MeasuredRow[] = [];
    let y = sliceStartY + headerH;
    let placed = 0;
    let overflow = false;
    while (i < contentRows.length) {
      const row = contentRows[i];
      if (y + row.heightPx <= contentBottomPx) {
        planRows.push(row);
        y += row.heightPx;
        i += 1;
        placed += 1;
      } else if (placed === 0) {
        // A single row taller than the page: place it alone and let it overflow.
        planRows.push(row);
        i += 1;
        placed += 1;
        overflow = true;
        break;
      } else {
        break;
      }
    }

    plans.push({ page, startY: sliceStartY, showHeader, rows: planRows, overflow });
    firstSlice = false;
    if (i >= contentRows.length) {
      break;
    }
    page += 1;
    sliceStartY = contentTopPx;
  }

  applyWidowControl(plans, contentBottomPx, headerHeightPx);

  const slices = plans.map((plan, index) =>
    finalizeSlice(plan, headerRow, measured.columns, element.id, index, plans.length),
  );
  const lastSlice = slices[slices.length - 1];
  return { slices, endPage: lastSlice.pageIndex, endY: lastSlice.yPx + lastSlice.heightPx };
}

/**
 * Basic widow control: when the final slice carries the column-footer
 * (grand-total) row with no detail row of its own, pull the previous slice's last
 * detail row down to join it — provided the pulled row keeps the previous slice
 * non-empty and still fits on the final page. Best-effort: it reverts rather than
 * forcing an overflow.
 */
function applyWidowControl(
  plans: SlicePlan[],
  contentBottomPx: number,
  headerHeightPx: number,
): void {
  if (plans.length < 2) {
    return;
  }
  const last = plans[plans.length - 1];
  const prev = plans[plans.length - 2];

  const lastHasFooter = last.rows.some((r) => r.kind === 'columnFooter');
  const lastDetail = last.rows.some((r) => r.kind === 'detail');
  if (!lastHasFooter || lastDetail) {
    return;
  }

  const movedIdx = lastDetailIndex(prev.rows);
  if (movedIdx < 0 || prev.rows.length <= 1) {
    return;
  }

  const moved = prev.rows[movedIdx];
  const headerH = last.showHeader ? headerHeightPx : 0;
  const movedAndFooterHeight =
    moved.heightPx + last.rows.reduce((sum, r) => sum + r.heightPx, 0);
  if (last.startY + headerH + movedAndFooterHeight > contentBottomPx) {
    return; // pulling the row down would overflow the final page — leave as is.
  }

  prev.rows.splice(movedIdx, 1);
  last.rows.unshift(moved);
}

/** Index of the last `detail` row in a slice's content rows, or -1. */
function lastDetailIndex(rows: readonly MeasuredRow[]): number {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i].kind === 'detail') {
      return i;
    }
  }
  return -1;
}

/** Stacks a slice plan's rows into page-absolute positions and tags its flags. */
function finalizeSlice(
  plan: SlicePlan,
  headerRow: MeasuredRow,
  columns: readonly TableColumnLayout[],
  elementId: string,
  index: number,
  total: number,
): PlacedSlice {
  const rows: MeasuredRow[] = [];
  let y = plan.startY;
  if (plan.showHeader) {
    rows.push({ ...headerRow, yPx: y });
    y += headerRow.heightPx;
  }
  for (const row of plan.rows) {
    rows.push({ ...row, yPx: y });
    y += row.heightPx;
  }

  return {
    pageIndex: plan.page,
    elementId,
    columns,
    rows,
    headerRepeated: plan.showHeader && index > 0,
    isFirstSlice: index === 0,
    isLastSlice: index === total - 1,
    yPx: plan.startY,
    heightPx: y - plan.startY,
    overflowsPage: plan.overflow,
  };
}

/** Matches `{{pageNumber}}` / `{{pageCount}}`, tolerant of inner whitespace. */
const PAGE_TOKEN_RE = /\{\{\s*(pageNumber|pageCount)\s*\}\}/g;

/**
 * Builds a map of element id → its **literal** `text` for every text element
 * across all three bands. Binding-driven text elements have no literal and are
 * omitted, so they never receive a `resolvedText` (the renderer resolves their
 * binding instead).
 */
function buildLiteralTextMap(template: RendaraTemplate): Map<string, string> {
  const map = new Map<string, string>();
  for (const band of ['header', 'body', 'footer'] as const) {
    for (const element of template[band].elements) {
      if (element.type === 'text' && typeof element.text === 'string') {
        map.set(element.id, element.text);
      }
    }
  }
  return map;
}

/**
 * Substitutes `{{pageNumber}}`/`{{pageCount}}` in a literal string with this
 * page's 1-based number and the document's total page count (E3-S5). Returns
 * `null` when the element has no literal text **or carries no page token** — in
 * both cases the renderer falls back to the element's own content, so static text
 * is not duplicated into the page model on every page.
 */
function resolvePageTokens(
  literal: string | undefined,
  pageNumber: number,
  pageCount: number,
): string | null {
  if (literal === undefined) {
    return null;
  }
  const resolved = literal.replace(PAGE_TOKEN_RE, (_match, token: string) =>
    String(token === 'pageNumber' ? pageNumber : pageCount),
  );
  // Only an override when a token was actually substituted; otherwise the
  // renderer uses the element's own (token-free) literal text.
  return resolved === literal ? null : resolved;
}

/** Pairs a laid-out element with its page-resolved text into a {@link PlacedElement}. */
function toPlacedElement(
  element: LaidOutElement,
  literalTextById: ReadonlyMap<string, string>,
  pageNumber: number,
  pageCount: number,
): PlacedElement {
  return {
    ...element,
    resolvedText: resolvePageTokens(literalTextById.get(element.id), pageNumber, pageCount),
  };
}

/** Drops the internal `pageIndex` from a placed slice to expose a {@link TableSlice}. */
function stripPageIndex(slice: PlacedSlice): TableSlice {
  return {
    elementId: slice.elementId,
    columns: slice.columns,
    rows: slice.rows,
    headerRepeated: slice.headerRepeated,
    isFirstSlice: slice.isFirstSlice,
    isLastSlice: slice.isLastSlice,
    yPx: slice.yPx,
    heightPx: slice.heightPx,
    overflowsPage: slice.overflowsPage,
  };
}
