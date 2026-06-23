import { describe, expect, it } from 'vitest';
import {
  type DataTableColumn,
  type DataTableElement,
  type Page,
  type RendaraTemplate,
  type TemplateElement,
  goldenInvoiceData,
  goldenInvoiceTemplate,
  goldenTabularReportData,
  goldenTabularReportTemplate,
} from '@rendara/report-schema';

import { paginate, type PaginatedDocument, type Watermark } from './paginate';
import { resolveDataTable, type ResolvedDataTable } from './resolve';
import { mmToPx, ptToPx } from './units';

// --- fixtures & helpers ------------------------------------------------------

/** The single data-table element in a template's body. */
function tableOf(template: RendaraTemplate): DataTableElement {
  const el = template.body.elements.find(
    (e): e is DataTableElement => e.type === 'dataTable',
  );
  if (!el) {
    throw new Error('template is expected to contain a data table');
  }
  return el;
}

/** Resolves a template's table and paginates it (the common end-to-end path). */
async function paginateTemplate(
  template: RendaraTemplate,
): Promise<{ doc: PaginatedDocument; resolved: ResolvedDataTable }> {
  const table = tableOf(template);
  const resolved = await resolveDataTable(table, dataFor(template));
  const doc = paginate(template, new Map([[table.id, resolved]]));
  return { doc, resolved };
}

/** Picks the matching sample data for a known golden template. */
function dataFor(template: RendaraTemplate): unknown {
  if (template === goldenInvoiceTemplate) return goldenInvoiceData;
  if (template === goldenTabularReportTemplate) return goldenTabularReportData;
  return undefined;
}

/** A small custom page so a few rows force page breaks (mm). */
function smallPage(widthMm: number, heightMm: number, marginMm: number): Page {
  return {
    size: { widthMm, heightMm },
    orientation: 'portrait',
    marginsMm: { top: marginMm, right: marginMm, bottom: marginMm, left: marginMm },
    units: 'mm',
    defaultFont: { family: 'Inter', sizePt: 10 },
    background: null,
  };
}

/** Wraps a set of body elements + page into a minimal valid template. */
function makeTemplate(page: Page, body: TemplateElement[]): RendaraTemplate {
  return {
    schemaVersion: '1.0.0',
    metadata: {
      name: 'Synthetic',
      id: 'fixture-paginate-synthetic',
      createdAt: '2026-06-23T00:00:00.000Z',
      locale: 'en-US',
    },
    page,
    header: { elements: [] },
    body: { elements: body },
    footer: { elements: [] },
  };
}

/** Like {@link makeTemplate} but with explicit header/footer band elements (E3-S5). */
function makeTemplateWithBands(
  page: Page,
  body: TemplateElement[],
  header: TemplateElement[],
  footer: TemplateElement[],
): RendaraTemplate {
  return { ...makeTemplate(page, body), header: { elements: header }, footer: { elements: footer } };
}

/** A footer text element carrying the page-number tokens. */
function pageNumberFooter(yMm = 52): TemplateElement {
  return {
    id: 'el_footer_page',
    type: 'text',
    frame: { xMm: 10, yMm, wMm: 100, hMm: 6 },
    text: 'Page {{pageNumber}} of {{pageCount}}',
    z: 1,
  };
}

/** A static header title (no page tokens). */
function headerTitle(): TemplateElement {
  return {
    id: 'el_header_title',
    type: 'text',
    frame: { xMm: 10, yMm: 2, wMm: 100, hMm: 6 },
    text: 'Quarterly Report',
    z: 1,
  };
}

/** A one-column data table at `topMm`, optionally with a column footer. */
function oneColumnTable(opts: {
  id?: string;
  topMm: number;
  widthMm: number;
  withFooter?: boolean;
  keepTogether?: boolean;
}): DataTableElement {
  const column: DataTableColumn = {
    key: 'c',
    header: 'Item',
    cell: { expr: '$.v' },
    widthMm: opts.widthMm,
    ...(opts.withFooter ? { footer: { expr: '$count(items)', format: 'number:0' } } : {}),
  };
  return {
    id: opts.id ?? 'el_tbl',
    type: 'dataTable',
    frame: { xMm: 10, yMm: opts.topMm, wMm: opts.widthMm, hMm: null },
    source: { arrayExpr: 'items' },
    columns: [column],
    repeatHeaderOnEachPage: true,
    keepTogether: opts.keepTogether ?? false,
    z: 1,
  };
}

/** Sample data of `n` short rows for {@link oneColumnTable}. */
function rows(n: number): { items: { v: string }[] } {
  return { items: Array.from({ length: n }, (_, i) => ({ v: `Row ${i}` })) };
}

/** The detail-row source indices carried by a paginated document, page by page. */
function detailIndicesByPage(doc: PaginatedDocument): number[][] {
  return doc.pages.map((page) =>
    page.tables.flatMap((t) =>
      t.rows.filter((r) => r.kind === 'detail').map((r) => r.index as number),
    ),
  );
}

// A 120×60 mm page with 10 mm margins fits exactly 5 single-line detail rows per
// page (header repeats), the basis for the carry-forward / widow expectations.
const SMALL = smallPage(120, 60, 10);

// --- tabular-report golden ---------------------------------------------------

describe('paginate — tabular-report golden', () => {
  it('matches the page-model snapshot', async () => {
    const { doc } = await paginateTemplate(goldenTabularReportTemplate);
    expect(doc).toMatchSnapshot();
  });

  it('places a header at the top of every page that carries the table', async () => {
    const { doc } = await paginateTemplate(goldenTabularReportTemplate);
    for (const page of doc.pages) {
      for (const slice of page.tables) {
        expect(slice.rows[0].kind).toBe('header');
      }
    }
  });

  it('expands every source row exactly once, in order', async () => {
    const { doc, resolved } = await paginateTemplate(goldenTabularReportTemplate);
    const indices = detailIndicesByPage(doc).flat();
    expect(indices).toEqual(resolved.rows.map((r) => r.index));
  });
});

// --- breaking the table across pages ----------------------------------------

describe('paginate — breaks the table across pages', () => {
  it('carries remaining rows forward onto additional pages', async () => {
    const table = oneColumnTable({ topMm: 10, widthMm: 100 });
    const template = makeTemplate(SMALL, [table]);
    const resolved = await resolveDataTable(table, rows(12));
    const doc = paginate(template, new Map([[table.id, resolved]]));

    expect(doc.pageCount).toBeGreaterThan(1);
    // Every detail row appears once, in source order, with none lost or duplicated.
    expect(detailIndicesByPage(doc).flat()).toEqual([...Array(12).keys()]);
  });

  it('repeats the header on every continuation page', async () => {
    const table = oneColumnTable({ topMm: 10, widthMm: 100 });
    const template = makeTemplate(SMALL, [table]);
    const resolved = await resolveDataTable(table, rows(12));
    const doc = paginate(template, new Map([[table.id, resolved]]));

    doc.pages.forEach((page, index) => {
      const slice = page.tables[0];
      expect(slice.rows[0].kind).toBe('header');
      // The first slice owns the original header; later pages show a repeat.
      expect(slice.headerRepeated).toBe(index > 0);
    });
  });

  it('keeps every detail row within the page content band', async () => {
    const table = oneColumnTable({ topMm: 10, widthMm: 100 });
    const template = makeTemplate(SMALL, [table]);
    const resolved = await resolveDataTable(table, rows(12));
    const doc = paginate(template, new Map([[table.id, resolved]]));

    const contentBottomPx =
      doc.geometry.pagePx.heightPx - doc.geometry.printable.bottomPx;
    for (const page of doc.pages) {
      for (const slice of page.tables) {
        for (const row of slice.rows) {
          expect(row.yPx + row.heightPx).toBeLessThanOrEqual(contentBottomPx + 1e-6);
        }
      }
    }
  });

  it('does not drop the header when repeatHeaderOnEachPage is false', async () => {
    const table: DataTableElement = {
      ...oneColumnTable({ topMm: 10, widthMm: 100 }),
      repeatHeaderOnEachPage: false,
    };
    const template = makeTemplate(SMALL, [table]);
    const resolved = await resolveDataTable(table, rows(12));
    const doc = paginate(template, new Map([[table.id, resolved]]));

    // Only the first slice shows a header; continuation slices are detail-only.
    doc.pages.forEach((page, index) => {
      const hasHeader = page.tables[0].rows.some((r) => r.kind === 'header');
      expect(hasHeader).toBe(index === 0);
    });
  });
});

// --- edge cases --------------------------------------------------------------

describe('paginate — edge cases', () => {
  it('defers the whole table to the next page when it starts near a page end', async () => {
    // Table top at 45 mm leaves no room for a header + first row before the
    // 50 mm content bottom, so the table (and its header) move to page 2.
    const table = oneColumnTable({ topMm: 45, widthMm: 100 });
    const template = makeTemplate(SMALL, [table]);
    const resolved = await resolveDataTable(table, rows(3));
    const doc = paginate(template, new Map([[table.id, resolved]]));

    expect(doc.pageCount).toBe(2);
    expect(doc.pages[0].tables).toHaveLength(0); // no orphaned header on page 1
    const slice = doc.pages[1].tables[0];
    expect(slice.isFirstSlice).toBe(true);
    expect(slice.rows[0].kind).toBe('header');
    expect(slice.rows.filter((r) => r.kind === 'detail')).toHaveLength(3);
  });

  it('places a single row taller than the page alone, flagged as overflowing', async () => {
    // A very long unbroken token in a narrow column on a short page wraps to more
    // lines than a page can hold.
    const table = oneColumnTable({ topMm: 10, widthMm: 20 });
    const template = makeTemplate(smallPage(40, 40, 10), [table]);
    const huge = { items: [{ v: 'x'.repeat(400) }] };
    const resolved = await resolveDataTable(table, huge);
    const doc = paginate(template, new Map([[table.id, resolved]]));

    const sliceWithDetail = doc.pages
      .flatMap((p) => p.tables)
      .find((s) => s.rows.some((r) => r.kind === 'detail'));
    expect(sliceWithDetail?.overflowsPage).toBe(true);
    // The huge row is the only detail row and it is still emitted exactly once.
    expect(detailIndicesByPage(doc).flat()).toEqual([0]);
  });

  it('lays out a single page with only a header when the bound array is empty', async () => {
    const table = oneColumnTable({ topMm: 10, widthMm: 100 });
    const template = makeTemplate(SMALL, [table]);
    const resolved = await resolveDataTable(table, { items: [] });
    const doc = paginate(template, new Map([[table.id, resolved]]));

    expect(doc.pageCount).toBe(1);
    expect(doc.pages[0].tables[0].rows).toHaveLength(1);
    expect(doc.pages[0].tables[0].rows[0].kind).toBe('header');
  });

  it('produces a single static page when the body has no data table', () => {
    const text: TemplateElement = {
      id: 'el_text',
      type: 'text',
      frame: { xMm: 10, yMm: 10, wMm: 50, hMm: 8 },
      text: 'Hello',
      z: 1,
    };
    const doc = paginate(makeTemplate(SMALL, [text]), new Map());

    expect(doc.pageCount).toBe(1);
    expect(doc.pages[0].elements.map((e) => e.id)).toEqual(['el_text']);
  });
});

// --- keepTogether ------------------------------------------------------------

describe('paginate — keepTogether', () => {
  it('moves a table whole to the next page rather than splitting it', async () => {
    // 4 rows fit on a fresh page but not in the space left from a 28 mm top, so
    // keepTogether pushes the entire table to page 2.
    const table = oneColumnTable({ topMm: 28, widthMm: 100, keepTogether: true });
    const template = makeTemplate(SMALL, [table]);
    const resolved = await resolveDataTable(table, rows(4));
    const doc = paginate(template, new Map([[table.id, resolved]]));

    expect(doc.pageCount).toBe(2);
    expect(doc.pages[0].tables).toHaveLength(0);
    const slice = doc.pages[1].tables[0];
    expect(slice.isFirstSlice && slice.isLastSlice).toBe(true);
    expect(slice.rows.filter((r) => r.kind === 'detail')).toHaveLength(4);
  });

  it('falls back to splitting a table taller than a full page', async () => {
    const table = oneColumnTable({ topMm: 10, widthMm: 100, keepTogether: true });
    const template = makeTemplate(SMALL, [table]);
    const resolved = await resolveDataTable(table, rows(20));
    const doc = paginate(template, new Map([[table.id, resolved]]));

    expect(doc.pageCount).toBeGreaterThan(1);
    expect(detailIndicesByPage(doc).flat()).toEqual([...Array(20).keys()]);
  });
});

// --- widow control -----------------------------------------------------------

describe('paginate — widow control', () => {
  it('never leaves the column-footer row alone on the final page', async () => {
    // 5 rows exactly fill page 1; the footer would otherwise spill alone onto
    // page 2, so the last detail row is pulled down to keep it company.
    const table = oneColumnTable({ topMm: 10, widthMm: 100, withFooter: true });
    const template = makeTemplate(SMALL, [table]);
    const resolved = await resolveDataTable(table, rows(5));
    const doc = paginate(template, new Map([[table.id, resolved]]));

    expect(doc.pageCount).toBe(2);
    const lastSlice = doc.pages[1].tables[0];
    expect(lastSlice.rows.some((r) => r.kind === 'columnFooter')).toBe(true);
    expect(lastSlice.rows.some((r) => r.kind === 'detail')).toBe(true);
    // All five rows still present exactly once, in order.
    expect(detailIndicesByPage(doc).flat()).toEqual([0, 1, 2, 3, 4]);
  });
});

// --- fixed-element anchoring -------------------------------------------------

describe('paginate — fixed body elements', () => {
  it('anchors leading elements to page 1 and trailing elements to the last page', async () => {
    const lead: TemplateElement = {
      id: 'el_lead',
      type: 'text',
      frame: { xMm: 10, yMm: 5, wMm: 50, hMm: 6 },
      text: 'Lead',
      z: 1,
    };
    const trail: TemplateElement = {
      id: 'el_trail',
      type: 'text',
      frame: { xMm: 10, yMm: 15, wMm: 50, hMm: 6 },
      text: 'Trail',
      z: 1,
    };
    const table = oneColumnTable({ topMm: 10, widthMm: 100 });
    const template = makeTemplate(SMALL, [lead, table, trail]);
    const resolved = await resolveDataTable(table, rows(12));
    const doc = paginate(template, new Map([[table.id, resolved]]));

    expect(doc.pageCount).toBeGreaterThan(1);
    expect(doc.pages[0].elements.map((e) => e.id)).toEqual(['el_lead']);
    const last = doc.pages[doc.pageCount - 1];
    expect(last.elements.map((e) => e.id)).toEqual(['el_trail']);
    // Middle pages carry no fixed elements.
    for (let i = 1; i < doc.pageCount - 1; i += 1) {
      expect(doc.pages[i].elements).toHaveLength(0);
    }
  });

  it('keeps both leading and trailing elements on a single-page document', async () => {
    const { doc } = await paginateTemplate(goldenInvoiceTemplate);
    expect(doc.pageCount).toBe(1);
    const ids = doc.pages[0].elements.map((e) => e.id);
    expect(ids).toContain('el_inv_title'); // leading (above the table)
    expect(ids).toContain('el_inv_total'); // trailing (below the table)
  });
});

// --- page chrome: header/footer, page numbers, watermark (E3-S5) -------------

describe('paginate — page chrome (E3-S5)', () => {
  it('repeats the header and footer bands on every page', async () => {
    const table = oneColumnTable({ topMm: 10, widthMm: 100 });
    const template = makeTemplateWithBands(
      SMALL,
      [table],
      [headerTitle()],
      [pageNumberFooter()],
    );
    const resolved = await resolveDataTable(table, rows(12));
    const doc = paginate(template, new Map([[table.id, resolved]]));

    expect(doc.pageCount).toBeGreaterThan(1);
    for (const page of doc.pages) {
      expect(page.header.map((e) => e.id)).toEqual(['el_header_title']);
      expect(page.footer.map((e) => e.id)).toEqual(['el_footer_page']);
    }
  });

  it('resolves incrementing page numbers in the footer', async () => {
    const table = oneColumnTable({ topMm: 10, widthMm: 100 });
    const template = makeTemplateWithBands(SMALL, [table], [], [pageNumberFooter()]);
    const resolved = await resolveDataTable(table, rows(12));
    const doc = paginate(template, new Map([[table.id, resolved]]));

    const total = doc.pageCount;
    expect(total).toBeGreaterThan(1);
    doc.pages.forEach((page, index) => {
      expect(page.footer[0].resolvedText).toBe(`Page ${index + 1} of ${total}`);
    });
  });

  it('resolves "Page 1 of 1" on a single-page document', () => {
    const template = makeTemplateWithBands(
      SMALL,
      [],
      [headerTitle()],
      [pageNumberFooter()],
    );
    const doc = paginate(template, new Map());

    expect(doc.pageCount).toBe(1);
    expect(doc.pages[0].footer[0].resolvedText).toBe('Page 1 of 1');
  });

  it('leaves token-free text untouched (resolvedText is null)', () => {
    const template = makeTemplateWithBands(
      SMALL,
      [],
      [headerTitle()],
      [pageNumberFooter()],
    );
    const doc = paginate(template, new Map());

    // The static header carries no page token, so it gets no override.
    expect(doc.pages[0].header[0].resolvedText).toBeNull();
  });

  it('places the golden invoice header logo and a "Page 1 of 1" footer', async () => {
    const { doc } = await paginateTemplate(goldenInvoiceTemplate);

    expect(doc.pageCount).toBe(1);
    expect(doc.pages[0].header.map((e) => e.id)).toContain('el_inv_logo');
    const footer = doc.pages[0].footer.find((e) => e.id === 'el_inv_page');
    expect(footer?.resolvedText).toBe('Page 1 of 1');
  });

  it('resolves the page-number footer on every page of the tabular-report golden', async () => {
    const { doc } = await paginateTemplate(goldenTabularReportTemplate);

    doc.pages.forEach((page, index) => {
      const footer = page.footer.find((e) => e.id === 'el_rpt_page');
      expect(footer?.resolvedText).toBe(`Page ${index + 1} of ${doc.pageCount}`);
    });
  });

  it('echoes a watermark config into the page model when provided', () => {
    const watermark: Watermark = {
      type: 'text',
      text: 'CONFIDENTIAL',
      opacity: 0.15,
      angleDeg: -45,
      color: '#9CA3AF',
    };
    const doc = paginate(goldenInvoiceTemplate, new Map(), { watermark });
    expect(doc.watermark).toEqual(watermark);
  });

  it('reports a null watermark when none is configured', () => {
    const doc = paginate(goldenInvoiceTemplate, new Map());
    expect(doc.watermark).toBeNull();
  });
});

// --- determinism -------------------------------------------------------------

describe('paginate — determinism', () => {
  it('re-running yields a deeply-equal document', async () => {
    const table = tableOf(goldenTabularReportTemplate);
    const resolved = await resolveDataTable(table, goldenTabularReportData);
    const tables = new Map([[table.id, resolved]]);
    expect(paginate(goldenTabularReportTemplate, tables)).toEqual(
      paginate(goldenTabularReportTemplate, tables),
    );
  });

  it('honours a custom DPI consistently with the geometry', () => {
    // No resolved entry needed to assert geometry scaling.
    const doc = paginate(goldenInvoiceTemplate, new Map(), { dpi: 300 });
    expect(doc.geometry.dpi).toBe(300);
    expect(doc.geometry.printable.topPx).toBeCloseTo(mmToPx(20, 300), 9);
  });
});

// Sanity anchor for the row-height arithmetic the page-capacity expectations rely
// on (single-line row at 10 pt with default 1 mm top/bottom padding).
describe('paginate — row-height baseline', () => {
  it('matches a single-line row of lineHeight + vertical padding', async () => {
    const table = oneColumnTable({ topMm: 10, widthMm: 100 });
    const template = makeTemplate(SMALL, [table]);
    const resolved = await resolveDataTable(table, rows(1));
    const doc = paginate(template, new Map([[table.id, resolved]]));

    const expected = ptToPx(10) * 1.2 + mmToPx(1) + mmToPx(1);
    const detail = doc.pages[0].tables[0].rows.find((r) => r.kind === 'detail');
    expect(detail?.heightPx).toBeCloseTo(expected, 9);
  });
});
