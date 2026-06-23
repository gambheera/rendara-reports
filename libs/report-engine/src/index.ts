export * from './lib/report-engine';

// Sandboxed expression evaluation: JSONata behind compile-once `evaluate()`
// with structured errors (E2-S1).
export * from './lib/expression';

// Locale-aware, `Intl`-based formatting layer: format tokens
// (currency/number/percent/date + raw fallback) → display strings (E2-S2).
export * from './lib/format';

// Conditional visibility (`visibleWhen`) + conditional style rules resolved to a
// concrete style, with a documented fail-safe-on-error default (E2-S3).
export * from './lib/conditional';

// Sample-data introspection: walk arbitrary JSON into a typed field tree with
// array element shapes for table sources, bounded by depth/size limits (E2-S4).
export * from './lib/introspect';

// Binding resolver & aggregates: resolve element values, table rows (row scope
// `$`), column/group/grand-total aggregates, with deterministic ordering (E2-S5).
export * from './lib/resolve';

// Missing/invalid-data diagnostics: the host-facing errors/warnings report
// (missing values, type/format mismatches) surfaced by the resolver (E2-S6).
export * from './lib/diagnostics';

// Units & coordinate system: mm/pt/in <-> px conversion at a configurable DPI,
// the deterministic base the layout engine and renderer share (E3-S1).
export * from './lib/units';

// Page & printable-area geometry: a resolved Page + margins -> page box and
// printable (content) area in both mm and px (E3-S1).
export * from './lib/geometry';

// Static single-page layout: fixed element frames -> absolute px boxes with
// z-order and page-sheet clipping, over the E3-S1 geometry (E3-S2).
export * from './lib/layout';

// Data-table expansion & row measurement: a resolved data table -> measured
// rows (header/detail/column-footer) and honoured column widths, via a
// deterministic headless text-wrap strategy (E3-S3).
export * from './lib/table-layout';
