import { describe, expect, it } from 'vitest';
import {
  goldenCertificateTemplate,
  goldenInvoiceData,
  goldenInvoiceTemplate,
  isDataTableElement,
  type RendaraTemplate,
} from '@rendara/report-schema';
import {
  paginate,
  resolveDataTable,
  resolveElement,
  type PaginatedDocument,
  type ResolvedDataTable,
  type Watermark,
} from '@rendara/report-engine';

import { renderDocumentToPdf } from './render-pdf';

/**
 * Tests for the report → PDF renderer (E8-S3) — the default client-side export.
 * They cover the story QA: the generated **page count equals the report page
 * count** (and the selected subset), the text is **selectable vector** text (not
 * raster), the configurable **metadata** lands in the PDF, the **watermark** is
 * honoured (and omittable), and shapes/tables render. Pure-function tests; no DOM.
 */

/** Decodes the PDF bytes back to their Latin-1 source for content assertions. */
function decode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('latin1');
}

/** Resolves every bound text/image element to its display string, keyed by id. */
async function resolveValues(
  template: RendaraTemplate,
  data: unknown,
): Promise<Map<string, string>> {
  const all = [...template.header.elements, ...template.body.elements, ...template.footer.elements];
  const map = new Map<string, string>();
  for (const el of all) {
    if ((el.type === 'text' || el.type === 'image') && el.binding !== undefined) {
      const resolved = await resolveElement(el, data, { locale: template.metadata.locale });
      map.set(el.id, resolved?.formatted ?? '');
    }
  }
  return map;
}

/** Paginates a template over its resolved data tables. */
async function paginateTemplate(
  template: RendaraTemplate,
  data: unknown,
  watermark: Watermark | null = null,
): Promise<PaginatedDocument> {
  const tables = new Map<string, ResolvedDataTable>();
  for (const el of template.body.elements) {
    if (isDataTableElement(el)) {
      tables.set(el.id, await resolveDataTable(el, data, { locale: template.metadata.locale }));
    }
  }
  return paginate(template, tables, { watermark });
}

/** The invoice with enough line items to paginate across several pages. */
const multiPageData = {
  invoice: {
    ...goldenInvoiceData.invoice,
    lineItems: Array.from({ length: 80 }, (_, i) => ({
      description: `Line item ${i + 1}`,
      quantity: 1,
      unitPrice: 100,
      amount: 100,
    })),
  },
};

describe('renderDocumentToPdf (E8-S3)', () => {
  it('generates a PDF whose page count equals the report page count', async () => {
    const document = await paginateTemplate(goldenInvoiceTemplate, multiPageData);
    const resolvedValues = await resolveValues(goldenInvoiceTemplate, multiPageData);
    expect(document.pageCount).toBeGreaterThan(1);

    const { bytes, pageCount } = renderDocumentToPdf({
      document,
      template: goldenInvoiceTemplate,
      resolvedValues,
    });

    expect(pageCount).toBe(document.pageCount);
    expect(decode(bytes)).toContain(`/Count ${document.pageCount}`);
    expect(decode(bytes).startsWith('%PDF-')).toBe(true);
  });

  it('exports only the selected pages, in order, de-duplicated and bounds-checked', async () => {
    const document = await paginateTemplate(goldenInvoiceTemplate, multiPageData);
    const resolvedValues = await resolveValues(goldenInvoiceTemplate, multiPageData);

    const { pageCount } = renderDocumentToPdf({
      document,
      template: goldenInvoiceTemplate,
      resolvedValues,
      // 999 is out of range and the duplicate 1 collapses → just pages 1 and 2.
      pages: [1, 2, 2, 999],
    });
    expect(pageCount).toBe(2);
  });

  it('renders text as selectable vector content, not a raster image', async () => {
    const document = await paginateTemplate(goldenInvoiceTemplate, goldenInvoiceData);
    const resolvedValues = await resolveValues(goldenInvoiceTemplate, goldenInvoiceData);
    const out = decode(
      renderDocumentToPdf({ document, template: goldenInvoiceTemplate, resolvedValues }).bytes,
    );

    // Static literal, a table header label, and a resolved binding all appear as
    // real text-show operators — proving selectable text on the default path.
    expect(out).toContain('(INVOICE) Tj');
    expect(out).toContain('(Description) Tj');
    expect(out).toContain('(Northwind Trading Ltd) Tj');
    expect(out).not.toContain('/Subtype /Image');
  });

  it('makes the document title configurable, defaulting to the template name', async () => {
    const document = await paginateTemplate(goldenInvoiceTemplate, goldenInvoiceData);
    const resolvedValues = await resolveValues(goldenInvoiceTemplate, goldenInvoiceData);

    const def = decode(
      renderDocumentToPdf({ document, template: goldenInvoiceTemplate, resolvedValues }).bytes,
    );
    // The default title is the template name (the em dash is WinAnsi-encoded, so
    // assert the ASCII prefix rather than round-tripping the byte through latin1).
    expect(goldenInvoiceTemplate.metadata.name.startsWith('Invoice ')).toBe(true);
    expect(def).toContain('/Title (Invoice ');

    const custom = decode(
      renderDocumentToPdf({
        document,
        template: goldenInvoiceTemplate,
        resolvedValues,
        metadata: { title: 'My Export', author: 'QA' },
      }).bytes,
    );
    expect(custom).toContain('/Title (My Export)');
    expect(custom).toContain('/Author (QA)');
  });

  it('honours and can omit the watermark', async () => {
    const watermark: Watermark = {
      type: 'text',
      text: 'CONFIDENTIAL',
      opacity: 0.15,
      angleDeg: -45,
    };
    const document = await paginateTemplate(goldenInvoiceTemplate, goldenInvoiceData, watermark);
    const resolvedValues = await resolveValues(goldenInvoiceTemplate, goldenInvoiceData);

    const withWm = decode(
      renderDocumentToPdf({ document, template: goldenInvoiceTemplate, resolvedValues }).bytes,
    );
    expect(withWm).toContain('(CONFIDENTIAL) Tj');
    expect(withWm).toContain('/ca 0.15');

    const without = decode(
      renderDocumentToPdf({
        document,
        template: goldenInvoiceTemplate,
        resolvedValues,
        includeWatermark: false,
      }).bytes,
    );
    expect(without).not.toContain('(CONFIDENTIAL) Tj');
  });

  it('renders vector shapes (line / rect / ellipse) from the certificate', async () => {
    const document = await paginateTemplate(goldenCertificateTemplate, {});
    const out = decode(
      renderDocumentToPdf({ document, template: goldenCertificateTemplate }).bytes,
    );
    // The certificate's framing rect, rule line and seal ellipse → vector ops.
    expect(out).toContain(' re\n'); // border rectangle
    expect(out).toContain(' l\nS'); // rule line
    expect(out).toContain(' c\n'); // ellipse bezier
  });

  it('draws the table grid via per-row border rules', async () => {
    const document = await paginateTemplate(goldenInvoiceTemplate, goldenInvoiceData);
    const resolvedValues = await resolveValues(goldenInvoiceTemplate, goldenInvoiceData);
    const out = decode(
      renderDocumentToPdf({ document, template: goldenInvoiceTemplate, resolvedValues }).bytes,
    );
    // Row decoration emits stroked rules (header/detail/total borders).
    expect(out).toContain(' l\nS');
    // The column-footer grand total is shown.
    expect(out).toContain('(Total Due) Tj');
  });

  it('is deterministic for the same inputs', async () => {
    const document = await paginateTemplate(goldenInvoiceTemplate, goldenInvoiceData);
    const resolvedValues = await resolveValues(goldenInvoiceTemplate, goldenInvoiceData);
    const a = renderDocumentToPdf({ document, template: goldenInvoiceTemplate, resolvedValues });
    const b = renderDocumentToPdf({ document, template: goldenInvoiceTemplate, resolvedValues });
    expect(decode(a.bytes)).toBe(decode(b.bytes));
  });
});
