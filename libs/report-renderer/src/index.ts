// Single-page DOM renderer component (E4-S1): one engine page model -> an
// absolutely-positioned DOM page at a given zoom.
export * from './lib/report-renderer/report-renderer';

// Pure, framework-agnostic page view-model + shared inline-style helpers: the
// single layout->style source for the component and the headless serializer
// (E4-S1).
export * from './lib/page-view-model';

// Headless page->HTML serializer driving visual-regression snapshots without
// Angular (E4-S1).
export * from './lib/serialize-page-html';
