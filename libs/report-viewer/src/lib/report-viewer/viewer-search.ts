import type { PaginatedDocument } from '@rendara/report-engine';
import type { RendaraTemplate } from '@rendara/report-schema';
import { buildPageViewModel, collectPageText, findTextMatches } from '@rendara/report-renderer';

/**
 * In-report text search (E8-S6) — the pure, DOM-free core of the viewer's Find
 * feature (an "optional viewer extra" from the E8-S5 backlog bucket).
 *
 * The viewer's toolbar Find control drives a query over the report's **rendered**
 * text. The match-finding itself ({@link findTextMatches}) and the page-text
 * extraction ({@link collectPageText}) live in `report-renderer` so the search
 * index and the painted `<mark>` highlights fold text **identically** — a hit's
 * global ordinal lines up with the `<mark>` the renderer paints, which is what
 * lets the component locate and scroll to the active match.
 *
 * This module turns those primitives into the ordered, paginated {@link SearchHit}
 * list the component navigates, plus the small index/label arithmetic the toolbar
 * shows. Everything here is pure and unit-tested without a DOM; the component owns
 * only the thin live-DOM part (toggling the active `<mark>` and scrolling it into
 * view), consistent with its existing scroll-spy/scroll-to code.
 */

/** The model the viewer search runs over: a rendered template + its paginated document. */
export interface SearchableModel {
  readonly template: RendaraTemplate;
  readonly document: PaginatedDocument;
  readonly resolvedValues: ReadonlyMap<string, string>;
}

/** One search match, located for navigation + active-highlight painting. */
export interface SearchHit {
  /** 1-based page the match falls on. */
  readonly page: number;
  /**
   * 0-based ordinal of this match **among that page's matches**, in paint order.
   * The component selects the `indexOnPage`-th `<mark>` within the page to mark it
   * active — correct in both continuous and single-page layouts.
   */
  readonly indexOnPage: number;
}

/** A stable empty result so the no-query / no-match path allocates nothing. */
const EMPTY_HITS: readonly SearchHit[] = [];

/**
 * Builds the ordered list of {@link SearchHit}s for `query` across the whole
 * document — page by page, and within a page in the same order the renderer
 * paints text (text elements, then each table's cells and group labels). Returns
 * an empty list for an empty/whitespace query or when nothing matches.
 *
 * It folds each page through the shared {@link buildPageViewModel} (the same pure
 * model the renderer paints) and {@link collectPageText}, so the corpus is exactly
 * the displayed text — bound values, page tokens, table cells and group labels
 * included — regardless of the viewer's page mode.
 */
export function buildSearchHits(
  model: SearchableModel | null,
  query: string,
): readonly SearchHit[] {
  if (model === null || query.trim().length === 0) {
    return EMPTY_HITS;
  }
  const { document, template, resolvedValues } = model;
  const hits: SearchHit[] = [];
  for (const page of document.pages) {
    const vm = buildPageViewModel(page, document.geometry, { template, resolvedValues });
    let indexOnPage = 0;
    for (const text of collectPageText(vm)) {
      const count = findTextMatches(text, query).length;
      for (let i = 0; i < count; i++) {
        hits.push({ page: page.pageNumber, indexOnPage });
        indexOnPage += 1;
      }
    }
  }
  return hits.length > 0 ? hits : EMPTY_HITS;
}

/**
 * Steps the active match index by `direction` (+1 next, −1 previous) with
 * wrap-around over `total` matches. From "no active match" (`current < 0`) a
 * forward step lands on the first match and a backward step on the last. Returns
 * `-1` when there are no matches.
 */
export function cycleHitIndex(current: number, total: number, direction: 1 | -1): number {
  if (total <= 0) {
    return -1;
  }
  if (current < 0) {
    return direction === 1 ? 0 : total - 1;
  }
  return (current + direction + total) % total;
}

/**
 * The toolbar's match readout: `"3 / 12"` for the active match (1-based) out of
 * the total, `"0 / 0"` when a (non-empty) query has no matches, and `""` when
 * there is no active query at all (the count is hidden).
 */
export function formatMatchCount(activeIndex: number, total: number, hasQuery: boolean): string {
  if (!hasQuery) {
    return '';
  }
  if (total <= 0) {
    return '0 / 0';
  }
  const current = activeIndex < 0 ? 0 : activeIndex + 1;
  return `${current} / ${total}`;
}
