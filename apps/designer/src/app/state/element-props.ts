import type {
  ElementStyle,
  FontSpec,
  FontWeight,
  Frame,
  LineStyle,
  StrokeStyle,
  TemplateElement,
  TextFont,
} from '@rendara/report-schema';

/**
 * Pure, framework-agnostic helpers backing the Properties panel's per-element
 * editors (E6-S1). They turn a raw input value into an immutable patch the
 * designer store can apply via `updateElement`, applying the same guards the
 * schema validator enforces (`frame.wMm > 0`, `frame.hMm >= 0`) so an out-of-range
 * keystroke is a no-op rather than an invalid document. Everything here is pure so
 * the component stays thin and the logic carries the high coverage bar.
 *
 * Frames and font sizes are authored in the template's units (millimetres /
 * points); the renderer converts to px (brief §5, §7).
 */

/** The editable fields of a {@link Frame} the Layout section exposes. */
export type FrameField = 'xMm' | 'yMm' | 'wMm' | 'hMm';

/** Rounds a millimetre value to 0.1 mm — enough precision for placement, tidy in the model. */
export function roundMm(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Returns a copy of `frame` with `field` set to `value` (rounded to 0.1 mm), or
 * `null` when the edit is invalid so the caller can no-op:
 *  - any field rejects a non-finite value (a blank/`NaN` input);
 *  - `wMm` must stay `> 0` and `hMm` `>= 0` (mirrors `validateElement`); a growing
 *    element (`hMm: null`) is not editable through this path and is left untouched.
 *
 * `xMm`/`yMm` may be negative (an element can sit partly off the page), matching
 * the schema, which only requires them finite.
 */
export function patchFrameField(frame: Frame, field: FrameField, value: number): Frame | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  const next = roundMm(value);
  switch (field) {
    case 'wMm':
      return next > 0 ? { ...frame, wMm: next } : null;
    case 'hMm':
      // A growing element has no concrete height to edit here.
      if (frame.hMm === null || next < 0) {
        return null;
      }
      return { ...frame, hMm: next };
    case 'xMm':
      return { ...frame, xMm: next };
    case 'yMm':
      return { ...frame, yMm: next };
  }
}

/**
 * Immutably merges `patch` into `style.font`, returning a new {@link ElementStyle}.
 * `updateElement` shallow-merges, so editing one font field must carry the rest of
 * the style (and the rest of the font) forward — this is the single place that
 * deep-merge happens, so a size edit never drops an existing weight, and vice versa.
 */
export function setTextFont(
  style: ElementStyle | undefined,
  patch: Partial<TextFont>,
): ElementStyle {
  return { ...style, font: { ...style?.font, ...patch } };
}

/** The resolved font shown in the Text section's inputs (override layered over the document default). */
export interface EffectiveFont {
  /** Family name, the element's override or the document default. */
  readonly family: string;
  /** Size in points, the element's override or the document default. */
  readonly sizePt: number;
  /** Whether the resolved weight reads as bold (drives the Reg/Bold toggle). */
  readonly bold: boolean;
}

/**
 * The font the renderer will actually paint for `element`: each field is the
 * element-level override ({@link ElementStyle.font}) when present, else the
 * document {@link FontSpec default} — exactly the precedence the renderer applies
 * (page-view-model `textRunStyle`), so the panel shows what the canvas shows.
 * `bold` reports whether the resolved weight is `'bold'` or a numeric step `>= 600`.
 */
export function effectiveFont(element: TemplateElement, defaultFont: FontSpec): EffectiveFont {
  const font = element.style?.font;
  return {
    family: font?.family ?? defaultFont.family,
    sizePt: font?.sizePt ?? defaultFont.sizePt,
    bold: isBoldWeight(font?.weight),
  };
}

/** True when a {@link FontWeight} reads as bold: the `'bold'` keyword or a numeric step `>= 600`. */
export function isBoldWeight(weight: FontWeight | undefined): boolean {
  if (weight === undefined) {
    return false;
  }
  return weight === 'bold' || (typeof weight === 'number' && weight >= 600);
}

/**
 * Immutably merges `patch` into `style.stroke`, returning a new {@link ElementStyle}.
 * Like {@link setTextFont}: `updateElement` shallow-merges `style`, so editing one
 * stroke field (e.g. the colour) must carry the rest of the style (and the rest of
 * the stroke) forward — this is the single place that deep-merge happens, so a
 * colour edit never drops an existing width, and vice versa.
 */
export function setShapeStroke(
  style: ElementStyle | undefined,
  patch: Partial<StrokeStyle>,
): ElementStyle {
  return { ...style, stroke: { ...style?.stroke, ...patch } };
}

/**
 * Sets (or clears) a shape's interior {@link ElementStyle.fill}. Passing a colour
 * sets it; passing `undefined` **omits** the key entirely (rather than leaving a
 * `fill: undefined`), so a cleared fill round-trips through the schema as an absent
 * field — exactly the "no fill" state the renderer reads (`style?.fill ?? null`).
 */
export function setShapeFill(
  style: ElementStyle | undefined,
  fill: string | undefined,
): ElementStyle {
  // A locally-mutable view so the `fill` key can be set or removed without a
  // throwaway destructure or a `delete` on the readonly {@link ElementStyle.fill}.
  const next: { fill?: string } & Omit<ElementStyle, 'fill'> = { ...style };
  if (fill === undefined) {
    delete next.fill;
  } else {
    next.fill = fill;
  }
  return next;
}

/**
 * Validates a stroke-width edit (mm): rejects a non-finite value (a blank/`NaN`
 * input) and a negative one — mirroring `validateStroke` (`widthMm >= 0`) — so an
 * out-of-range keystroke is a no-op. Returns the value rounded to 0.1 mm, or `null`.
 */
export function patchStrokeWidth(value: number): number | null {
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
  return roundMm(value);
}

/** The resolved stroke shown in the Shape section's inputs. */
export interface EffectiveStroke {
  /** Stroke colour, the element's override or the renderer default (`#000000`). */
  readonly color: string;
  /** Stroke width in millimetres, the override or the renderer default (0.2 mm). */
  readonly widthMm: number;
  /** Line style, the override or the default (`solid`). */
  readonly style: LineStyle;
  /** Whether the shape paints a visible outline (false when the style is `none`). */
  readonly enabled: boolean;
}

/**
 * The stroke the renderer will actually paint for a shape: each field is the
 * element-level override ({@link StrokeStyle}) when present, else the renderer's
 * default — matching `resolveStroke` (page-view-model), so the panel shows what the
 * canvas shows. A `'none'` style reports `enabled: false` (no outline painted).
 */
export function effectiveStroke(style: ElementStyle | undefined): EffectiveStroke {
  const stroke = style?.stroke;
  const lineStyle = stroke?.style ?? DEFAULT_STROKE_STYLE;
  return {
    color: stroke?.color ?? DEFAULT_STROKE_COLOR,
    widthMm: stroke?.widthMm ?? DEFAULT_STROKE_WIDTH_MM,
    style: lineStyle,
    enabled: lineStyle !== 'none',
  };
}

/** The shape's interior fill colour, or `null` for no fill (matches the renderer). */
export function effectiveFill(style: ElementStyle | undefined): string | null {
  return style?.fill ?? null;
}

/** Renderer-mirrored stroke defaults (page-view-model `resolveStroke`), for the panel inputs. */
const DEFAULT_STROKE_COLOR = '#000000';
const DEFAULT_STROKE_WIDTH_MM = 0.2;
const DEFAULT_STROKE_STYLE: LineStyle = 'solid';
/** The fill colour offered when a shape's fill is first enabled (white interior). */
export const DEFAULT_FILL_COLOR = '#FFFFFF';
