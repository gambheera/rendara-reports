import { MAX_ZOOM, MIN_ZOOM, type ZoomSpec } from '@rendara/report-renderer';

/**
 * Pure zoom helpers for the viewer (E7-S4).
 *
 * The {@link ReportViewer} owns the interactive zoom controls (a `−`/`%`/`+`
 * stepper and a fit-mode dropdown), but the *arithmetic* — stepping through the
 * discrete level ladder, formatting a factor as a percentage, and mapping the
 * dropdown's string values to/from a {@link ZoomSpec} — lives here as
 * framework-agnostic functions. That mirrors how `viewer-navigation.ts` keeps the
 * page-bounds logic out of the component, so the (boundary-heavy) zoom logic is
 * unit-tested exhaustively without mounting Angular.
 *
 * The fit-math itself (`'fit-width'`/`'fit-page'` → scale factor against the
 * viewport, plus `[MIN_ZOOM, MAX_ZOOM]` clamping) already lives in the shared
 * renderer's `resolveZoomFactor` (E4-S4) and is reused verbatim — this module only
 * drives *which* {@link ZoomSpec} the viewer hands the renderer. The clamp bounds
 * are re-used from the renderer so the ladder and the renderer agree on the range.
 */

/** Tolerance for comparing resolved (possibly irrational) zoom factors against the ladder. */
const EPSILON = 1e-6;

/**
 * The discrete zoom percentages the `−`/`+` stepper walks and the dropdown lists,
 * within the renderer's `[MIN_ZOOM, MAX_ZOOM]` range. A resolved fit-mode factor
 * (e.g. `0.62`) is *not* on this ladder, which is exactly why {@link zoomIn} /
 * {@link zoomOut} step from the current resolved factor to the nearest ladder rung.
 */
export const ZOOM_LEVELS: readonly number[] = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];

/** The two fit modes the dropdown exposes (a {@link ZoomSpec} that is not numeric). */
export type ZoomFitMode = 'fit-width' | 'fit-page';

/** Narrows a {@link ZoomSpec} to a fit mode (vs. an explicit numeric factor). */
export function isFitMode(spec: ZoomSpec): spec is ZoomFitMode {
  return spec === 'fit-width' || spec === 'fit-page';
}

/** Clamps a factor into the renderer's supported `[MIN_ZOOM, MAX_ZOOM]` range. */
function clamp(factor: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, factor));
}

/**
 * The next discrete zoom level strictly above the current resolved `factor`,
 * clamped to `MAX_ZOOM`. Stepping from a *resolved* factor (not the spec) is what
 * lets the stepper zoom out of a fit mode predictably — e.g. a `fit-width` that
 * resolved to `0.62` steps up to `0.75`.
 */
export function zoomIn(factor: number): number {
  const next = ZOOM_LEVELS.find((level) => level > factor + EPSILON);
  return clamp(next ?? MAX_ZOOM);
}

/** The next discrete zoom level strictly below `factor`, clamped to `MIN_ZOOM`. */
export function zoomOut(factor: number): number {
  let prev: number | undefined;
  for (const level of ZOOM_LEVELS) {
    if (level < factor - EPSILON) {
      prev = level;
    }
  }
  return clamp(prev ?? MIN_ZOOM);
}

/** Whether zooming in is still possible (the resolved factor is below `MAX_ZOOM`). */
export function canZoomIn(factor: number): boolean {
  return factor < MAX_ZOOM - EPSILON;
}

/** Whether zooming out is still possible (the resolved factor is above `MIN_ZOOM`). */
export function canZoomOut(factor: number): boolean {
  return factor > MIN_ZOOM + EPSILON;
}

/** Formats a resolved zoom factor as a whole-percent readout, e.g. `0.5` → `"50%"`. */
export function formatZoomPercent(factor: number): string {
  return `${Math.round(factor * 100)}%`;
}

/** Serialises a {@link ZoomSpec} to its `<select>`/`<option>` value string. */
export function zoomSpecToValue(spec: ZoomSpec): string {
  return isFitMode(spec) ? spec : String(spec);
}

/**
 * Parses a `<select>` value back to a {@link ZoomSpec}. An unrecognised or
 * non-positive value falls back to `'fit-width'` (the viewer's default fit), so a
 * malformed value never produces an invalid spec.
 */
export function zoomValueToSpec(value: string): ZoomSpec {
  if (value === 'fit-width' || value === 'fit-page') {
    return value;
  }
  const factor = Number(value);
  return Number.isFinite(factor) && factor > 0 ? clamp(factor) : 'fit-width';
}

/** One entry in the zoom dropdown: a `<select>` value and its visible label. */
export interface ZoomOption {
  /** The `<option>` value (a fit-mode keyword or a stringified factor). */
  readonly value: string;
  /** The visible label (`"Fit width"`, `"Fit page"`, or a percent like `"100%"`). */
  readonly label: string;
}

/**
 * The dropdown's options for the current `spec`: the two fit modes followed by the
 * {@link ZOOM_LEVELS} ladder. When `spec` is an explicit numeric factor that is
 * *not* on the ladder (e.g. a host-supplied `config.initialZoom` of `1.1`), it is
 * spliced into the ladder in order, so the `<select>` always has an option that
 * matches the active spec and never renders a mismatched selection.
 */
export function zoomOptions(spec: ZoomSpec): readonly ZoomOption[] {
  const levels = new Set<number>(ZOOM_LEVELS);
  if (!isFitMode(spec)) {
    levels.add(clamp(spec));
  }
  const levelOptions: ZoomOption[] = [...levels]
    .sort((a, b) => a - b)
    .map((level) => ({ value: String(level), label: formatZoomPercent(level) }));
  return [
    { value: 'fit-width', label: 'Fit width' },
    { value: 'fit-page', label: 'Fit page' },
    ...levelOptions,
  ];
}
