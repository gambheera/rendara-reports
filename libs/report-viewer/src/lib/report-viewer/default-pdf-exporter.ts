import { renderDocumentToPdf } from '@rendara/report-renderer';

import type { PdfExporter, PdfExportRequest, PdfExportResult } from './viewer-api';

/**
 * The viewer's **default, client-side** {@link PdfExporter} (E8-S3) — the behaviour
 * behind the toolbar's Export PDF action unless a host swaps in its own exporter
 * via `config.pdfExporter`.
 *
 * It renders the current report to a **selectable-text, vector** PDF entirely in
 * the browser via the shared {@link renderDocumentToPdf} (no server round-trip, no
 * heavy PDF dependency, no rasterisation — brief §7, ADR 0012), then triggers a
 * download of the resulting `Blob`. "Generated in your browser — no data leaves
 * the page", exactly as the export dialog promises.
 *
 * It is **SSR-safe**: PDF generation is pure and runs anywhere, but the download
 * (which needs `document`/`URL.createObjectURL`) is guarded, so a non-browser
 * runtime still gets the bytes back in {@link PdfExportResult.blob} without
 * throwing.
 */
export const defaultPdfExporter: PdfExporter = {
  export(request: PdfExportRequest): Promise<PdfExportResult> {
    const { bytes, pageCount } = renderDocumentToPdf({
      document: request.document,
      template: request.template,
      resolvedValues: request.resolvedValues,
      pages: request.pages,
      includeWatermark: request.includeWatermark,
      metadata: request.metadata,
    });

    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    triggerDownload(blob, request.filename);

    return Promise.resolve({ pageCount, filename: request.filename, blob });
  },
};

/**
 * Downloads a blob under `filename` via a transient object-URL anchor. A no-op in
 * a runtime without the DOM/`URL` APIs (SSR), so the exporter never throws there.
 */
function triggerDownload(blob: Blob, filename: string): void {
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return;
  }
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
