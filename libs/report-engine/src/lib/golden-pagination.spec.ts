import { describe, expect, it } from 'vitest';
import {
  GOLDEN_FIXTURES,
  isDataTableElement,
  type RendaraTemplate,
} from '@rendara/report-schema';

import { paginate, type PaginatedDocument } from './paginate';
import { resolveDataTable, type ResolvedDataTable } from './resolve';

/**
 * Pagination snapshot suite (E3-S7): regression protection for the layout brain.
 *
 * For every canonical golden ({@link GOLDEN_FIXTURES}: invoice, certificate,
 * tabular-report) this serializes the full {@link PaginatedDocument} page model
 * produced by the E3-S2…S6 pipeline and pins it as a committed snapshot under
 * `__snapshots__/golden-pagination.spec.ts.snap`.
 *
 * These snapshots are the deliverable: they make any change to the engine's
 * layout output visible as a reviewable diff. Updating them (`vitest -u`) is a
 * deliberate, explained step in a PR — never a blind refresh to make CI pass.
 */

/**
 * Resolves every data table in `template` over `data` and paginates the whole
 * document with the engine's default options — the true default page model the
 * renderer and viewer consume. Pure arithmetic downstream of resolution, so the
 * result is deterministic across runs and platforms.
 */
async function paginateGolden(
  template: RendaraTemplate,
  data: unknown,
): Promise<PaginatedDocument> {
  const resolved = new Map<string, ResolvedDataTable>();
  for (const element of template.body.elements) {
    if (isDataTableElement(element)) {
      resolved.set(element.id, await resolveDataTable(element, data));
    }
  }
  return paginate(template, resolved);
}

describe.each(GOLDEN_FIXTURES)('paginate — $name golden snapshot (E3-S7)', ({ template, data }) => {
  it('matches the committed page-model snapshot', async () => {
    const doc = await paginateGolden(template, data);
    expect(doc).toMatchSnapshot();
  });

  it('produces a well-formed page model (≥1 page, every page present)', async () => {
    const doc = await paginateGolden(template, data);

    expect(doc.pageCount).toBeGreaterThanOrEqual(1);
    expect(doc.pages).toHaveLength(doc.pageCount);
    for (const page of doc.pages) {
      expect(page).toBeDefined();
    }
  });

  it('is deterministic: re-paginating yields a deeply-equal document', async () => {
    const [first, second] = await Promise.all([
      paginateGolden(template, data),
      paginateGolden(template, data),
    ]);
    expect(first).toEqual(second);
  });
});
