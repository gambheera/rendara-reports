import { beforeAll, describe, expect, it } from 'vitest';
import { GOLDEN_FIXTURES } from '@rendara/report-schema';

import { runPipeline } from './report-pipeline';
import {
  buildSearchHits,
  cycleHitIndex,
  formatMatchCount,
  type SearchableModel,
} from './viewer-search';

/**
 * Pure search tests (E8-S6). The match-finding + segment split themselves live in
 * `report-renderer` (covered there); these assert the viewer's paginated hit list,
 * the next/prev wrap arithmetic and the toolbar count label.
 */

const golden = GOLDEN_FIXTURES[0];

/** Builds enough line items to paginate the invoice across several pages. */
const multiPageData = {
  invoice: {
    ...(golden.data as { invoice: Record<string, unknown> }).invoice,
    lineItems: Array.from({ length: 120 }, (_, i) => ({
      description: `Line item ${i + 1}`,
      quantity: 1,
      unitPrice: 100,
      amount: 100,
    })),
  },
};

let model: SearchableModel;
let multiPageModel: SearchableModel;

beforeAll(async () => {
  const single = await runPipeline(golden.template, golden.data);
  if (single.status !== 'rendered') {
    throw new Error(`expected a rendered pipeline result, got ${single.status}`);
  }
  model = single;

  const multi = await runPipeline(golden.template, multiPageData);
  if (multi.status !== 'rendered') {
    throw new Error(`expected a rendered multi-page result, got ${multi.status}`);
  }
  multiPageModel = multi;
});

describe('buildSearchHits (E8-S6)', () => {
  it('returns no hits for a null model or an empty/whitespace query', () => {
    expect(buildSearchHits(null, 'invoice')).toEqual([]);
    expect(buildSearchHits(model, '')).toEqual([]);
    expect(buildSearchHits(model, '   ')).toEqual([]);
  });

  it('finds the invoice title literal as at least one hit on page 1', () => {
    const hits = buildSearchHits(model, 'invoice');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].page).toBe(1);
    // Each hit carries a 0-based per-page ordinal.
    expect(hits[0].indexOnPage).toBe(0);
  });

  it('returns nothing for a query that matches no rendered text', () => {
    expect(buildSearchHits(model, 'zzzznomatch')).toEqual([]);
  });

  it('orders hits by page, with a per-page ordinal that resets each page', () => {
    // "Line item" appears in every detail row, so a multi-page invoice yields
    // matches spread across pages.
    const hits = buildSearchHits(multiPageModel, 'Line item');
    expect(hits.length).toBeGreaterThan(0);

    // Pages are non-decreasing across the ordered hit list.
    const pages = hits.map((h) => h.page);
    expect([...pages]).toEqual([...pages].sort((a, b) => a - b));

    // The matches span more than one page for the 120-row invoice.
    expect(new Set(pages).size).toBeGreaterThan(1);

    // Within each page the ordinal is a 0-based contiguous sequence.
    const byPage = new Map<number, number[]>();
    for (const hit of hits) {
      const list = byPage.get(hit.page) ?? [];
      list.push(hit.indexOnPage);
      byPage.set(hit.page, list);
    }
    for (const ordinals of byPage.values()) {
      expect(ordinals).toEqual(ordinals.map((_, i) => i));
    }
  });

  it('matches case-insensitively', () => {
    expect(buildSearchHits(model, 'INVOICE').length).toBe(buildSearchHits(model, 'invoice').length);
  });
});

describe('cycleHitIndex (E8-S6)', () => {
  it('returns -1 when there are no matches', () => {
    expect(cycleHitIndex(-1, 0, 1)).toBe(-1);
    expect(cycleHitIndex(2, 0, -1)).toBe(-1);
  });

  it('lands on the first match stepping forward from nothing, last stepping back', () => {
    expect(cycleHitIndex(-1, 5, 1)).toBe(0);
    expect(cycleHitIndex(-1, 5, -1)).toBe(4);
  });

  it('wraps forward past the end and backward past the start', () => {
    expect(cycleHitIndex(4, 5, 1)).toBe(0);
    expect(cycleHitIndex(0, 5, -1)).toBe(4);
    expect(cycleHitIndex(2, 5, 1)).toBe(3);
    expect(cycleHitIndex(2, 5, -1)).toBe(1);
  });
});

describe('formatMatchCount (E8-S6)', () => {
  it('is empty when there is no active query', () => {
    expect(formatMatchCount(-1, 0, false)).toBe('');
    expect(formatMatchCount(3, 12, false)).toBe('');
  });

  it('shows "0 / 0" for a non-empty query with no matches', () => {
    expect(formatMatchCount(-1, 0, true)).toBe('0 / 0');
  });

  it('shows the 1-based active index over the total', () => {
    expect(formatMatchCount(0, 12, true)).toBe('1 / 12');
    expect(formatMatchCount(11, 12, true)).toBe('12 / 12');
  });

  it('shows "0 / N" when there are matches but none is active yet', () => {
    expect(formatMatchCount(-1, 12, true)).toBe('0 / 12');
  });
});
