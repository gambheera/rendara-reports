/**
 * The visual style attached to an element — the "style ref" slot of {@link
 * ElementBase} (brief §5).
 *
 * E1-S4 replaces the E1-S1 open-bag stub with the concrete, validated style
 * model: font (family/size/weight/style), foreground {@link color}, box
 * {@link ElementStyle.fill}, per-side {@link BorderStyle}, horizontal/vertical
 * {@link AlignmentStyle}, {@link PaddingMm}, line/shape {@link StrokeStyle}, and
 * a number/date {@link ElementStyle.format} token slot.
 *
 * This file stays type-only (like `page.ts`/`element.ts`); the *behavior* — the
 * runtime literal mirrors and the focused `validateStyle` — lives in
 * `./style-validation`. Every field is **optional**: an `ElementStyle` is a set
 * of overrides layered over renderer/document defaults, so a partially-styled
 * element stays assignable in the designer.
 */

/**
 * A CSS color string (e.g. `#4F46E5`, `rgb(79 70 229)`, `hsl(...)`, or a named
 * colour). Validated here only as a non-empty string; deeper colour-format
 * checks are deferred to the ajv schema (**E1-S6**) and the renderer.
 */
export type Color = string;

/**
 * Font weight: the CSS keywords `normal`/`bold` or a numeric 100–900 step,
 * mirroring CSS `font-weight`.
 */
export type FontWeight = 'normal' | 'bold' | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

/** Font slant, mirroring the CSS `font-style` property. */
export type FontStyle = 'normal' | 'italic';

/**
 * Element-level font overrides (brief §5). Distinct from the document-level
 * {@link FontSpec} (which has a required family + size): every field here is
 * optional, layered over the resolved document font by the renderer.
 */
export interface TextFont {
  readonly family?: string;
  /** Font size in points (matching {@link FontSpec.sizePt}). */
  readonly sizePt?: number;
  readonly weight?: FontWeight;
  /** Slant, mapping to CSS `font-style`. */
  readonly style?: FontStyle;
}

/**
 * A line appearance keyword, shared by box {@link BorderSide}s and shape
 * {@link StrokeStyle}. Mirrors the CSS `border-style`/`*-style` keywords used by
 * the renderer (brief §3, §7).
 */
export type LineStyle = 'solid' | 'dashed' | 'dotted' | 'double' | 'none';

/** One side of a box {@link BorderStyle}: width (mm), line style, and colour. */
export interface BorderSide {
  /** Border width in millimetres (authoring units; renderer converts to px). */
  readonly widthMm?: number;
  readonly style?: LineStyle;
  readonly color?: Color;
}

/**
 * Per-side box border (brief §5). Each side is independent so an element can
 * carry, e.g., only a bottom rule. Absent sides inherit no border.
 */
export interface BorderStyle {
  readonly top?: BorderSide;
  readonly right?: BorderSide;
  readonly bottom?: BorderSide;
  readonly left?: BorderSide;
}

/**
 * Horizontal text alignment. A superset of the table-column {@link ColumnAlign}
 * (which omits `justify`), since prose text blocks may be justified.
 */
export type HorizontalAlign = 'left' | 'center' | 'right' | 'justify';

/** Vertical alignment of content within an element's {@link Frame}. */
export type VerticalAlign = 'top' | 'middle' | 'bottom';

/** Content alignment within the element box (brief §5). */
export interface AlignmentStyle {
  readonly horizontal?: HorizontalAlign;
  readonly vertical?: VerticalAlign;
}

/**
 * Per-side inner padding in millimetres (brief §5). Like {@link MarginsMm} but
 * every side is optional, since padding is a style override.
 */
export interface PaddingMm {
  readonly top?: number;
  readonly right?: number;
  readonly bottom?: number;
  readonly left?: number;
}

/**
 * The line/shape stroke (brief §5): the visible line of a `line` shape and the
 * outline of `rect`/`ellipse` shapes. Distinct from {@link BorderStyle} (the
 * element box edge) and from {@link ElementStyle.fill} (a shape's interior).
 */
export interface StrokeStyle {
  readonly color?: Color;
  /** Stroke width in millimetres (authoring units; renderer converts to px). */
  readonly widthMm?: number;
  readonly style?: LineStyle;
}

/**
 * The concrete, validated visual style of an element (brief §5). All fields are
 * optional overrides; `validateStyle` (`./style-validation`) checks the value of
 * any field that *is* present.
 */
export interface ElementStyle {
  /** Font family/size/weight/slant overrides. */
  readonly font?: TextFont;
  /** Foreground (text) colour. */
  readonly color?: Color;
  /** Box background colour / shape interior fill. */
  readonly fill?: Color;
  /** Per-side box border. */
  readonly border?: BorderStyle;
  /** Horizontal/vertical content alignment. */
  readonly align?: AlignmentStyle;
  /** Per-side inner padding (mm). */
  readonly padding?: PaddingMm;
  /** Line/shape stroke. */
  readonly stroke?: StrokeStyle;
  /**
   * Number/date format token (e.g. `currency:USD`, `date:medium`, `number:0.00`,
   * `percent`), or `null` for no formatting. The token *grammar* is resolved by
   * the `Intl`-based formatting layer (**E2-S2**); this is just the slot.
   *
   * A binding may also carry its own `format` (**E1-S5**); when both are present
   * the binding-level token takes precedence, resolved by the engine.
   */
  readonly format?: string | null;
}
