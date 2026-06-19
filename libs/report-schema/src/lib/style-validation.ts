/**
 * Style model behavior (E1-S4): runtime literal mirrors and a focused style
 * validator.
 *
 * `style.ts` declares the style *types*; this file owns their *behavior*: the
 * runtime mirrors of each literal union and a small, self-contained
 * `validateStyle` so the style model is unit-testable today.
 *
 * Scope note (same as `page-settings.ts` / `element-validation.ts`): this is
 * **not** the general template validator. The ajv-backed
 * `validate()`/`RendaraValidationError` API is **E1-S6** and will fold these
 * checks in; here we ship just enough to reject invalid style values with clear,
 * path-pointed messages (E1-S4 QA). Colours are checked only as non-empty
 * strings — deeper CSS-colour validation is deferred to E1-S6 / the renderer.
 */

import type {
  BorderSide,
  BorderStyle,
  ElementStyle,
  FontStyle,
  FontWeight,
  HorizontalAlign,
  LineStyle,
  PaddingMm,
  StrokeStyle,
  TextFont,
  VerticalAlign,
} from './style';

/** The font weights recognised at runtime (mirrors {@link FontWeight}). */
export const FONT_WEIGHTS: readonly FontWeight[] = [
  'normal',
  'bold',
  100,
  200,
  300,
  400,
  500,
  600,
  700,
  800,
  900,
];

/** The font slants recognised at runtime (mirrors {@link FontStyle}). */
export const FONT_STYLES: readonly FontStyle[] = ['normal', 'italic'];

/** The line styles recognised at runtime (mirrors {@link LineStyle}). */
export const LINE_STYLES: readonly LineStyle[] = ['solid', 'dashed', 'dotted', 'double', 'none'];

/** The horizontal alignments recognised at runtime (mirrors {@link HorizontalAlign}). */
export const HORIZONTAL_ALIGNS: readonly HorizontalAlign[] = ['left', 'center', 'right', 'justify'];

/** The vertical alignments recognised at runtime (mirrors {@link VerticalAlign}). */
export const VERTICAL_ALIGNS: readonly VerticalAlign[] = ['top', 'middle', 'bottom'];

/** The padding sides, in resolution order (mirrors {@link PaddingMm}). */
const PADDING_SIDES: readonly (keyof PaddingMm)[] = ['top', 'right', 'bottom', 'left'];

/** The border sides, in resolution order (mirrors {@link BorderStyle}). */
const BORDER_SIDES: readonly (keyof BorderStyle)[] = ['top', 'right', 'bottom', 'left'];

/** A single style problem, with a dotted path to the offending field. */
export interface StyleError {
  readonly path: string;
  readonly message: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Validates an optional colour slot: when present it must be a non-empty string. */
function validateColor(value: unknown, path: string, errors: StyleError[]): void {
  if (value !== undefined && !isNonEmptyString(value)) {
    errors.push({
      path,
      message: `'${path}' must be a non-empty colour string, got ${JSON.stringify(value)}.`,
    });
  }
}

function validateFont(font: TextFont, at: (rel: string) => string, errors: StyleError[]): void {
  if (font.family !== undefined && !isNonEmptyString(font.family)) {
    errors.push({
      path: at('font.family'),
      message: `Font family must be a non-empty string, got ${JSON.stringify(font.family)}.`,
    });
  }
  if (font.sizePt !== undefined && !isPositiveFinite(font.sizePt)) {
    errors.push({
      path: at('font.sizePt'),
      message: `Font size must be a positive number of points, got ${font.sizePt}.`,
    });
  }
  if (font.weight !== undefined && !FONT_WEIGHTS.includes(font.weight)) {
    errors.push({
      path: at('font.weight'),
      message: `Font weight must be one of ${FONT_WEIGHTS.join(', ')}, got ${JSON.stringify(font.weight)}.`,
    });
  }
  if (font.style !== undefined && !FONT_STYLES.includes(font.style)) {
    errors.push({
      path: at('font.style'),
      message: `Font style must be one of ${FONT_STYLES.join(', ')}, got ${JSON.stringify(font.style)}.`,
    });
  }
}

function validateBorderSide(side: BorderSide, path: string, errors: StyleError[]): void {
  if (side.widthMm !== undefined && !isNonNegativeFinite(side.widthMm)) {
    errors.push({
      path: `${path}.widthMm`,
      message: `Border width must be a non-negative number of millimetres, got ${side.widthMm}.`,
    });
  }
  if (side.style !== undefined && !LINE_STYLES.includes(side.style)) {
    errors.push({
      path: `${path}.style`,
      message: `Border style must be one of ${LINE_STYLES.join(', ')}, got ${JSON.stringify(side.style)}.`,
    });
  }
  validateColor(side.color, `${path}.color`, errors);
}

function validateBorder(
  border: BorderStyle,
  at: (rel: string) => string,
  errors: StyleError[],
): void {
  for (const side of BORDER_SIDES) {
    const value = border[side];
    if (value !== undefined) {
      validateBorderSide(value, at(`border.${side}`), errors);
    }
  }
}

function validatePadding(
  padding: PaddingMm,
  at: (rel: string) => string,
  errors: StyleError[],
): void {
  for (const side of PADDING_SIDES) {
    const value = padding[side];
    if (value !== undefined && !isNonNegativeFinite(value)) {
      errors.push({
        path: at(`padding.${side}`),
        message: `Padding '${side}' must be a non-negative number of millimetres, got ${value}.`,
      });
    }
  }
}

function validateStroke(
  stroke: StrokeStyle,
  at: (rel: string) => string,
  errors: StyleError[],
): void {
  validateColor(stroke.color, at('stroke.color'), errors);
  if (stroke.widthMm !== undefined && !isNonNegativeFinite(stroke.widthMm)) {
    errors.push({
      path: at('stroke.widthMm'),
      message: `Stroke width must be a non-negative number of millimetres, got ${stroke.widthMm}.`,
    });
  }
  if (stroke.style !== undefined && !LINE_STYLES.includes(stroke.style)) {
    errors.push({
      path: at('stroke.style'),
      message: `Stroke style must be one of ${LINE_STYLES.join(', ')}, got ${JSON.stringify(stroke.style)}.`,
    });
  }
}

/**
 * Focused style validation (E1-S4 QA). Checks the value of any present style
 * field — font, colours, per-side border, alignment, padding, stroke, and the
 * format token — returning one {@link StyleError} per problem (an empty array
 * means valid). All fields are optional, so an absent field is never an error.
 *
 * `basePath` prefixes every reported path (defaults to `style`); element
 * validation passes `<id>.style` so problems are locatable within a template.
 *
 * Defensive `typeof`/finite/membership checks are used throughout because this
 * may run over untrusted parsed JSON, not just well-typed objects.
 */
export function validateStyle(style: ElementStyle, basePath = 'style'): StyleError[] {
  const errors: StyleError[] = [];
  const at = (rel: string): string => `${basePath}.${rel}`;

  if (style.font !== undefined) {
    validateFont(style.font, at, errors);
  }
  validateColor(style.color, at('color'), errors);
  validateColor(style.fill, at('fill'), errors);
  if (style.border !== undefined) {
    validateBorder(style.border, at, errors);
  }
  if (style.align !== undefined) {
    const { horizontal, vertical } = style.align;
    if (horizontal !== undefined && !HORIZONTAL_ALIGNS.includes(horizontal)) {
      errors.push({
        path: at('align.horizontal'),
        message: `Horizontal alignment must be one of ${HORIZONTAL_ALIGNS.join(', ')}, got ${JSON.stringify(horizontal)}.`,
      });
    }
    if (vertical !== undefined && !VERTICAL_ALIGNS.includes(vertical)) {
      errors.push({
        path: at('align.vertical'),
        message: `Vertical alignment must be one of ${VERTICAL_ALIGNS.join(', ')}, got ${JSON.stringify(vertical)}.`,
      });
    }
  }
  if (style.padding !== undefined) {
    validatePadding(style.padding, at, errors);
  }
  if (style.stroke !== undefined) {
    validateStroke(style.stroke, at, errors);
  }
  // `null` is a legal "no formatting" value; only a present non-null token is checked.
  if (style.format !== undefined && style.format !== null && !isNonEmptyString(style.format)) {
    errors.push({
      path: at('format'),
      message: `Format token must be null or a non-empty string, got ${JSON.stringify(style.format)}.`,
    });
  }

  return errors;
}

/** Convenience boolean wrapper over {@link validateStyle}. */
export function isValidStyle(style: ElementStyle): boolean {
  return validateStyle(style).length === 0;
}
