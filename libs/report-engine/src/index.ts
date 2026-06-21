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
