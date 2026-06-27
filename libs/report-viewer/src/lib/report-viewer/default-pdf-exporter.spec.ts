import { afterEach, describe, expect, it, vi } from 'vitest';
import { GOLDEN_FIXTURES, isDataTableElement, type RendaraTemplate } from '@rendara/report-schema';
import {
  paginate,
  resolveDataTable,
  type PaginatedDocument,
  type ResolvedDataTable,
} from '@rendara/report-engine';

import { defaultPdfExporter } from './default-pdf-exporter';
import type { PdfExportRequest } from './viewer-api';

/**
 * Tests for the default client-side PDF exporter (E8-S3): it renders a PDF from
 * the current report, returns the page count + bytes, and downloads them via a
 * transient object-URL anchor — guarded so a runtime without the DOM/`URL` APIs
 * (SSR) still gets the bytes back without throwing.
 */

const golden = GOLDEN_FIXTURES[0];

async function paginateInvoice(): Promise<PaginatedDocument> {
  const tables = new Map<string, ResolvedDataTable>();
  for (const el of (golden.template as RendaraTemplate).body.elements) {
    if (isDataTableElement(el)) {
      tables.set(el.id, await resolveDataTable(el, golden.data));
    }
  }
  return paginate(golden.template as RendaraTemplate, tables);
}

async function buildRequest(overrides?: Partial<PdfExportRequest>): Promise<PdfExportRequest> {
  return {
    document: await paginateInvoice(),
    template: golden.template as RendaraTemplate,
    resolvedValues: new Map<string, string>(),
    filename: 'invoice.pdf',
    includeWatermark: true,
    ...overrides,
  };
}

describe('defaultPdfExporter', () => {
  // jsdom has no object-URL APIs by default; install spies and restore originals.
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  afterEach(() => {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    vi.restoreAllMocks();
  });

  it('produces a PDF blob and reports the page count', async () => {
    URL.createObjectURL = vi.fn().mockReturnValue('blob:mock');
    URL.revokeObjectURL = vi.fn();

    const request = await buildRequest();
    const result = await defaultPdfExporter.export(request);

    expect(result.pageCount).toBe(request.document.pageCount);
    expect(result.filename).toBe('invoice.pdf');
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.blob?.type).toBe('application/pdf');
  });

  it('triggers a download via a transient object-URL anchor', async () => {
    const createUrl = vi.fn().mockReturnValue('blob:mock');
    const revokeUrl = vi.fn();
    URL.createObjectURL = createUrl;
    URL.revokeObjectURL = revokeUrl;
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    await defaultPdfExporter.export(await buildRequest({ filename: 'my-report.pdf' }));

    expect(createUrl).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeUrl).toHaveBeenCalledTimes(1);
    // The anchor is cleaned up after the click (no leftover in the DOM).
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('still returns the bytes without throwing when URL.createObjectURL is unavailable (SSR guard)', async () => {
    (URL as { createObjectURL?: unknown }).createObjectURL = undefined;
    const result = await defaultPdfExporter.export(await buildRequest());
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.pageCount).toBeGreaterThanOrEqual(1);
  });
});
