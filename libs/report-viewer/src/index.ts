// The embeddable viewer component (E0-S2 skeleton; public API in E7-S1).
export * from './lib/report-viewer/report-viewer';

// Public API contract types — config, theme, event payloads, and the swappable
// PdfExporter contract — so TypeScript consumers get full typing for the
// component's inputs/outputs (E7-S1, brief §8; E8-S3 export).
export * from './lib/report-viewer/viewer-api';

// The default client-side PDF exporter (E8-S3): renders a selectable-text vector
// PDF in the browser and downloads it. Exported so hosts can wrap/reuse it.
export { defaultPdfExporter } from './lib/report-viewer/default-pdf-exporter';
