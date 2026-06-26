// The embeddable viewer component (E0-S2 skeleton; public API in E7-S1).
export * from './lib/report-viewer/report-viewer';

// Public API contract types — config, theme, and event payloads — so TypeScript
// consumers get full typing for the component's inputs/outputs (E7-S1, brief §8).
export * from './lib/report-viewer/viewer-api';
