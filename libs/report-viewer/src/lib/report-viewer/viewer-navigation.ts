/**
 * Pure page-navigation helpers for the viewer (E7-S3).
 *
 * The {@link ReportViewer} drives next/prev/goto and keyboard navigation, but the
 * *arithmetic* — clamping a target page into `[1, total]` and mapping a keyboard
 * event to a navigation intent — lives here as framework-agnostic functions. That
 * keeps the component thin and lets the (boundary) logic be unit-tested
 * exhaustively without mounting Angular.
 *
 * Pages are **1-based** throughout the viewer's public surface (the `(pageChange)`
 * payload, the goto input, the thumbnail rail), matching the toolbar's `‹ 1 / 12 ›`
 * display. A `total` of `0` (nothing rendered) clamps every page to `0`.
 */

/**
 * Clamps a (possibly out-of-range or non-integer) `page` into `[1, total]`.
 * Returns `0` when `total <= 0` (no document). `NaN`/fractional inputs are floored
 * to an integer first, so a partially-typed goto value resolves predictably.
 */
export function clampPage(page: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  if (!Number.isFinite(page)) {
    return 1;
  }
  const whole = Math.floor(page);
  if (whole < 1) {
    return 1;
  }
  if (whole > total) {
    return total;
  }
  return whole;
}

/** The next page after `current`, clamped to the document end. */
export function nextPage(current: number, total: number): number {
  return clampPage(current + 1, total);
}

/** The previous page before `current`, clamped to the document start. */
export function prevPage(current: number, total: number): number {
  return clampPage(current - 1, total);
}

/** A keyboard-driven navigation intent, resolved from a key to a target page. */
export type PageNavIntent = 'next' | 'prev' | 'first' | 'last';

/**
 * Maps a keyboard event key to a {@link PageNavIntent}, or `null` when the key is
 * not a navigation key (so the component leaves the event alone). Mirrors the
 * familiar document-viewer bindings: `PageDown`/`ArrowRight`/`ArrowDown` advance,
 * `PageUp`/`ArrowLeft`/`ArrowUp` go back, `Home`/`End` jump to the ends.
 */
export function keyToNavIntent(key: string): PageNavIntent | null {
  switch (key) {
    case 'PageDown':
    case 'ArrowRight':
    case 'ArrowDown':
      return 'next';
    case 'PageUp':
    case 'ArrowLeft':
    case 'ArrowUp':
      return 'prev';
    case 'Home':
      return 'first';
    case 'End':
      return 'last';
    default:
      return null;
  }
}

/** Resolves a {@link PageNavIntent} to a concrete 1-based target page. */
export function resolveNavIntent(intent: PageNavIntent, current: number, total: number): number {
  switch (intent) {
    case 'next':
      return nextPage(current, total);
    case 'prev':
      return prevPage(current, total);
    case 'first':
      return clampPage(1, total);
    case 'last':
      return clampPage(total, total);
  }
}
