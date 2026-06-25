import type {
  ElementStyle,
  FontSpec,
  FontWeight,
  Frame,
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
