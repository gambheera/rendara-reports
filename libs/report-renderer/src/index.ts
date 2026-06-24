// Single-page DOM renderer component (E4-S1, content in E4-S2): one engine page
// model -> an absolutely-positioned DOM page at a given zoom, with each element's
// text/shape/image content painted from the source template + resolved bindings.
export * from './lib/report-renderer/report-renderer';

// Multi-page document renderer component (E4-S4): paints a whole PaginatedDocument
// (N pages) at one resolved zoom (fit-width/fit-page/%), single or continuous.
export * from './lib/report-document/report-document';

// Pure, framework-agnostic page view-model + shared inline-style helpers + the
// per-type content views and `sanitizeImageUrl`: the single layout->style->content
// source for the component and the headless serializer (E4-S1/E4-S2).
export * from './lib/page-view-model';

// Pure document view-model + zoom resolution (E4-S4): the N-page model and the
// fit-width/fit-page/% -> scale-factor math shared by the component and serializer.
export * from './lib/document-view-model';

// Headless page->HTML serializer driving visual-regression snapshots without
// Angular (E4-S1/E4-S2/E4-S4).
export * from './lib/serialize-page-html';
