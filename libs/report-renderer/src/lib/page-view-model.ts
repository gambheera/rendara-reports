/**
 * Page view-model (E4-S1, content in E4-S2) — the pure, framework-agnostic
 * bridge between the engine's {@link PaginatedPage page model} and the DOM the
 * shared renderer paints. It is the single source of layout→style truth: both
 * the Angular {@link ReportRenderer} component and the headless
 * {@link serializePageToHtml} serializer consume it, so designer preview, viewer,
 * and visual-regression snapshots are byte-for-byte the same geometry and content
 * (brief §7's "one renderer").
 *
 * ## What this pass does
 * The engine has already done the hard part: {@link computePageGeometry}
 * converted the page + margins to px, and {@link layoutStaticPage}/
 * {@link paginate} placed every fixed element as an absolute **page-absolute px**
 * box. This module:
 *  - exposes the **sheet** (full page px) and the **printable area** (margins
 *    inset) as plain rectangles a renderer can position directly;
 *  - resolves the **background** fill (a CSS colour string; default white);
 *  - flattens a page's `header → body → footer` fixed elements into one paint
 *    list, preserving the engine's z-order (lower `z` behind), with each box's
 *    `z` carried through as a `zIndex`;
 *  - carries the **zoom** factor through untouched — zoom is applied by the
 *    renderer as a single `transform: scale(zoom)` on the sheet (E4-S4 builds
 *    fit-width/fit-page on top), so inner coordinates stay at natural engine px;
 *  - **(E4-S2)** attaches each box's **content** — the displayed text, the SVG
 *    shape primitive, or the (URL-sanitised) image — plus the resolved per-type
 *    **style**, sourced from the supplied {@link PageViewOptions.template}
 *    elements and the optional {@link PageViewOptions.resolvedValues} map of
 *    binding display strings;
 *  - **(E4-S3)** positions the page's **data-table slices** ({@link
 *    PaginatedPage.tables}) into {@link TableView}s — one container per slice, its
 *    rows (header / detail / group header+footer / column footer) re-stacked from
 *    the engine's page-absolute `yPx`, each row's per-column cells and full-width
 *    band labels carrying the engine's already-resolved text, alignment and a
 *    default professional table style (header emphasis, row separators, total
 *    rules, cell padding matching the engine's measurement).
 *  - **(E4-S7)** builds the optional **watermark** layer ({@link WatermarkView})
 *    from the document-level {@link Watermark} config (a render-time concern, brief
 *    §8 / ADR 0007 — *not* a template-schema field): a page-covering, centred,
 *    `pointer-events:none`, opacity-bearing layer holding a single **rotated**
 *    (`angleDeg`) text caption or (URL-sanitised) image, stamped on every page
 *    behind the content. `null` when no watermark is configured (or the text is
 *    empty / the image src blocked), so the default output is unchanged.
 *
 * ## Content sourcing (E4-S2)
 * The page model carries geometry + page-token text only, so content is joined
 * back from the source template by element id. A text element's display string
 * is, in priority order, its per-page {@link PlacedElement.resolvedText} (a
 * `{{pageNumber}}`/`{{pageCount}}` substitution), then a caller-supplied
 * **resolved binding** value (the `formatted` string from the engine's async
 * `resolveElement`), then its static literal, then `''`. Image sources resolve
 * the same way (binding value over static `src`) and pass through
 * {@link sanitizeImageUrl}. Shapes carry no value — their appearance comes
 * wholly from {@link ElementStyle}. When no `template` is supplied every box is
 * `kind: 'empty'` (the E4-S1 positioned-host-box behaviour), so callers that only
 * need geometry keep working.
 *
 * ## What this pass does NOT do
 * A `null`-height element (a growing box) is passed through with `heightPx: null`
 * so a renderer can let it size to content; the fixed elements on a paginated
 * page always carry a concrete height, so this only matters defensively.
 *
 * ## Design-mode hooks (E4-S6)
 * The view-model carries a {@link RenderMode} (`'view'` default, `'design'` for the
 * designer canvas). The geometry/content is **identical** in both modes — design
 * mode only adds, on top, per-element/-table **selection anchors**: the pure
 * {@link designAnchorAttrs} returns the additive `data-rdr-*` attribute map for a
 * hit target (its role + natural-px frame) in design mode, and `null` in view mode.
 * Both the Angular component and the headless serializer consume that one helper,
 * so design mode is strictly additive and view-mode output stays byte-for-byte
 * stable (the story's QA). The designer reads element/table identity from the
 * always-present `data-element-*`/`data-table-id` attributes and selectability +
 * handle geometry from the design anchors.
 */

import { DEFAULT_CELL_PADDING_MM, DEFAULT_DPI, mmToPx, ptToPx } from '@rendara/report-engine';
import type {
  CellPaddingMm,
  MeasuredRow,
  MeasuredRowKind,
  PageGeometry,
  PaginatedPage,
  PlacedElement,
  TableColumnLayout,
  TableSlice,
  Watermark,
} from '@rendara/report-engine';
import type {
  BorderSide,
  ColumnAlign,
  DataTableElement,
  ElementStyle,
  ElementType,
  FontSpec,
  ImageElement,
  RendaraTemplate,
  ShapeElement,
  ShapeKind,
  TemplateElement,
  TextElement,
} from '@rendara/report-schema';

/** The default page fill when a template declares no background (brief §5: `null` = none → white paper). */
export const DEFAULT_PAGE_BACKGROUND = '#ffffff';

/**
 * How the shared renderer is being used (E4-S6): `'view'` for static viewer/preview
 * output, `'design'` for the designer canvas (which additionally exposes per-element
 * selection anchors via {@link designAnchorAttrs}). Geometry/content is identical in
 * both modes.
 */
export type RenderMode = 'view' | 'design';

/** A plain DOM attribute map (name → value), renderer-agnostic. */
export type AttrMap = Readonly<Record<string, string>>;

/** Document-default font used when no template (and thus no {@link FontSpec}) is supplied. */
const FALLBACK_FONT: FontSpec = { family: 'Inter', sizePt: 10 };

// ---------------------------------------------------------------------------
// Content view types (E4-S2): what to paint inside a positioned host box.
// ---------------------------------------------------------------------------

/** A block of (already-resolved) text plus the inline style to paint it with. */
export interface TextContentView {
  readonly kind: 'text';
  /** The display string (page-token > binding > literal > `''`), pre-resolved. */
  readonly text: string;
  /** Inline styles for the text run (font, colour, alignment, wrapping). */
  readonly textStyle: StyleMap;
}

/** A vector shape, described as an SVG primitive in natural box px. */
export interface ShapeContentView {
  readonly kind: 'shape';
  readonly shape: ShapeKind;
  /** Width of the `<svg>` canvas in px (the host box width). */
  readonly svgWidthPx: number;
  /** Height of the `<svg>` canvas in px (the host box height; `0` for a rule line). */
  readonly svgHeightPx: number;
  /** Endpoints for a `line` shape (corner-to-corner of the frame). */
  readonly line?: {
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
  };
  /** Geometry for a `rect` shape, inset by half the stroke so it is not clipped. */
  readonly rect?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  /** Geometry for an `ellipse` shape, inset by half the stroke. */
  readonly ellipse?: {
    readonly cx: number;
    readonly cy: number;
    readonly rx: number;
    readonly ry: number;
  };
  /** Resolved stroke, or `null` when the shape has no visible outline. */
  readonly stroke: ShapeStrokeView | null;
  /** Resolved interior fill (CSS colour), or `null` for no fill. */
  readonly fill: string | null;
}

/** A resolved shape stroke ready to map onto SVG `stroke*` attributes. */
export interface ShapeStrokeView {
  readonly color: string;
  readonly widthPx: number;
  /** SVG `stroke-dasharray` value for dashed/dotted strokes, else `null` (solid). */
  readonly dashArray: string | null;
  /** `'round'` for dotted strokes so dots are circular, else `null`. */
  readonly lineCap: 'round' | null;
}

/** An image: the sanitised source (or `null` if blocked/absent) and its fit. */
export interface ImageContentView {
  readonly kind: 'image';
  /** The {@link sanitizeImageUrl sanitised} source URL, or `null` when blocked/absent. */
  readonly src: string | null;
  /** Inline styles for the `<img>` (object-fit, full-box sizing). */
  readonly imageStyle: StyleMap;
}

/** No content (no source element supplied, or a type with nothing to paint here). */
export interface EmptyContentView {
  readonly kind: 'empty';
}

/** The painted content of one element host box. */
export type ElementContentView =
  | TextContentView
  | ShapeContentView
  | ImageContentView
  | EmptyContentView;

/** A positioned element host box in natural (unscaled) page px, ready to absolutely position. */
export interface ElementBoxView {
  readonly id: string;
  readonly type: ElementType;
  readonly leftPx: number;
  readonly topPx: number;
  readonly widthPx: number;
  /** `null` for a growing element (height sizes to content); concrete for paginated fixed elements. */
  readonly heightPx: number | null;
  /** Paint depth, mapped straight to CSS `z-index` (lower paints behind). */
  readonly zIndex: number;
  /** What to paint inside the box (E4-S2); `kind: 'empty'` when no template is supplied. */
  readonly content: ElementContentView;
  /**
   * Pre-resolved box decoration (E4-S2): fill / per-side border / padding and —
   * for text — the flex `justify-content` realising vertical alignment. Merged
   * into the host style by {@link elementStyle} so the component and serializer
   * share one decision. Empty when the element declares no decoration.
   */
  readonly boxStyle: StyleMap;
}

/** A rectangle in natural page px. */
export interface RectPx {
  readonly leftPx: number;
  readonly topPx: number;
  readonly widthPx: number;
  readonly heightPx: number;
}

// ---------------------------------------------------------------------------
// Watermark view (E4-S7): the optional page-covering overlay layer.
// ---------------------------------------------------------------------------

/**
 * A page watermark resolved for painting (E4-S7). It models the centred, rotated
 * overlay the renderer stamps on every page **behind** the content: the {@link
 * layerStyle} covers the whole sheet, carries the layer {@link Watermark.opacity
 * opacity}, centres its content and is non-interactive (`pointer-events:none`);
 * the {@link innerStyle} carries the rotation plus the per-kind paint (text font/
 * colour/size, or image max-size). Built only when there is something to paint —
 * a non-empty caption for `text`, or a {@link sanitizeImageUrl sanitised} `src`
 * for `image` — so callers never emit an empty layer.
 */
export interface WatermarkView {
  /** `text` paints {@link text}; `image` paints {@link src}. */
  readonly kind: 'text' | 'image';
  /** The caption to paint, for `kind: 'text'` (non-empty); else `null`. */
  readonly text: string | null;
  /** The {@link sanitizeImageUrl sanitised} image source, for `kind: 'image'`; else `null`. */
  readonly src: string | null;
  /** Inline styles for the covering layer (full-sheet, opacity, centre, non-interactive). */
  readonly layerStyle: StyleMap;
  /** Inline styles for the inner caption/image (rotation + per-kind paint). */
  readonly innerStyle: StyleMap;
}

// ---------------------------------------------------------------------------
// Table view types (E4-S3): one on-page data-table slice, ready to position.
// ---------------------------------------------------------------------------

/** One cell of a rendered table row: its column-relative box and resolved text. */
export interface TableCellView {
  readonly columnKey: string;
  /** The engine's already-resolved & formatted display string. */
  readonly text: string;
  /** Left offset from the table's left edge, in px (the column's `xPx`). */
  readonly leftPx: number;
  readonly widthPx: number;
  /** Inline styles for the cell (padding, font, alignment, clipping). */
  readonly cellStyle: StyleMap;
}

/** A full-table-width band label (group header/footer), spanning every column. */
export interface TableLabelView {
  /** The engine's already-resolved label string (e.g. `"Region: North"`). */
  readonly text: string;
  /** Inline styles for the label (padding, emphasised font, alignment). */
  readonly labelStyle: StyleMap;
}

/**
 * One rendered table row, positioned relative to its slice container's top. Its
 * {@link kind} drives the default decoration (header fill + rule, detail
 * separator, group-band fill, total rules); {@link cells} are the per-column
 * boxes and {@link label} the optional full-width band label.
 */
export interface TableRowView {
  readonly kind: MeasuredRowKind;
  /** Top offset from the slice container's top, in px (`row.yPx − slice.yPx`). */
  readonly topPx: number;
  readonly heightPx: number;
  /** Full table width in px (every row track spans the table). */
  readonly widthPx: number;
  /** Per-column cells in declared order. */
  readonly cells: readonly TableCellView[];
  /** A full-width band label for a group header/footer, else `null`. */
  readonly label: TableLabelView | null;
  /** Inline styles for the row track (background + separators per kind). */
  readonly rowStyle: StyleMap;
  /** `true` on a continuation group header repeated after a page break (E3-S6). */
  readonly continued: boolean;
}

/**
 * One on-page slice of a data table (E4-S3), positioned for rendering. The
 * container sits at the table's page-absolute left and the slice's page-absolute
 * top; its {@link rows} carry slice-relative offsets so a renderer drops them in
 * directly.
 */
export interface TableView {
  /** Id of the source {@link DataTableElement}. */
  readonly elementId: string;
  /** Page-absolute left of the table (the element frame's x), in px. */
  readonly leftPx: number;
  /** Page-absolute top of the slice (its first row's `yPx`), in px. */
  readonly topPx: number;
  /** Table width in px (sum of column widths). */
  readonly widthPx: number;
  /** Slice height in px. */
  readonly heightPx: number;
  /** Paint depth, mapped to CSS `z-index`, from the source element's `z`. */
  readonly zIndex: number;
  /** Rows on this slice in paint order, slice-relative. */
  readonly rows: readonly TableRowView[];
}

/** Everything a renderer needs to paint one page: sheet, printable area, background, zoom, element boxes. */
export interface PageViewModel {
  /** 1-based page number (mirrors {@link PaginatedPage.pageNumber}). */
  readonly pageNumber: number;
  /** Zoom factor applied as a single `transform: scale(zoom)` on the sheet. */
  readonly zoom: number;
  /** The full page sheet in natural px. */
  readonly sheet: { readonly widthPx: number; readonly heightPx: number };
  /** The printable (content) area, margins inset, in natural px. */
  readonly printable: RectPx;
  /** Resolved CSS colour for the sheet fill. */
  readonly background: string;
  /** Fixed (non-table) element host boxes in paint order (z asc, then header→body→footer). */
  readonly elements: readonly ElementBoxView[];
  /** Data-table slices on this page (E4-S3), in document then slice order. */
  readonly tables: readonly TableView[];
  /** The page watermark (E4-S7), stamped behind the content, or `null` when none. */
  readonly watermark: WatermarkView | null;
  /** Render mode (E4-S6): `'view'` (static output) or `'design'` (selection anchors exposed). */
  readonly mode: RenderMode;
}

/** Options for {@link buildPageViewModel}. */
export interface PageViewOptions {
  /** Zoom factor; defaults to `1`. Must be > 0. */
  readonly zoom?: number;
  /**
   * CSS colour for the sheet fill. A non-empty string is used as-is; `null`,
   * `undefined` or an empty string fall back to {@link DEFAULT_PAGE_BACKGROUND}.
   */
  readonly background?: string | null;
  /**
   * The source template (E4-S2): supplies each element's style and type-specific
   * content (literal text, shape kind, image src/fit) plus the document default
   * font. When omitted, every box is `kind: 'empty'` (E4-S1 behaviour).
   */
  readonly template?: RendaraTemplate;
  /**
   * Resolved binding **display strings** by element id (E4-S2): the `formatted`
   * value from the engine's async `resolveElement`, used for data-bound text and
   * image elements. A page-token `resolvedText` still wins; a static literal is
   * the final fallback. Defaults to empty.
   */
  readonly resolvedValues?: ReadonlyMap<string, string>;
  /**
   * Render mode (E4-S6): `'design'` exposes per-element/-table selection anchors
   * (see {@link designAnchorAttrs}); `'view'` (the default) renders static output
   * with no anchors, keeping the viewer DOM byte-stable.
   */
  readonly mode?: RenderMode;
  /**
   * The document-level watermark (E4-S7) to stamp on this page, from the engine's
   * {@link Watermark PaginatedDocument.watermark}. A render-time concern (brief §8 /
   * ADR 0007), not a template-schema field. Omit (or `null`) for no watermark.
   */
  readonly watermark?: Watermark | null;
}

/**
 * Builds the {@link PageViewModel} for one paginated `page` against its shared
 * `geometry`. Pure: no DOM, no Angular, deterministic for snapshot tests. See
 * the module overview for content sourcing and the (deliberate) deferrals.
 */
export function buildPageViewModel(
  page: PaginatedPage,
  geometry: PageGeometry,
  options?: PageViewOptions,
): PageViewModel {
  const zoom = options?.zoom ?? 1;
  const background = resolveBackground(options?.background);
  const mode = options?.mode ?? 'view';
  const dpi = geometry.dpi ?? DEFAULT_DPI;

  const template = options?.template;
  const resolvedValues = options?.resolvedValues ?? EMPTY_VALUES;
  const elementsById = template ? indexElements(template) : null;
  const defaultFont = template?.page.defaultFont ?? FALLBACK_FONT;

  const { pagePx, printable } = geometry;

  // header → body → footer concatenation preserves the engine's band tiebreak
  // for equal z; the explicit `zIndex` makes paint order independent of DOM order.
  const elements: ElementBoxView[] = [...page.header, ...page.elements, ...page.footer].map(
    (placed) =>
      toElementBoxView(placed, elementsById?.get(placed.id), resolvedValues, defaultFont, dpi),
  );

  // Table slices (E4-S3): position each slice against its source element's frame
  // (for the page-absolute left + z). The slice cells already carry resolved text,
  // so this only needs geometry + the default table style. A slice whose source
  // element is absent (no template, or an unknown id) is dropped — it cannot be
  // placed without the frame's left edge.
  const tables: TableView[] = [];
  for (const slice of page.tables) {
    const source = elementsById?.get(slice.elementId);
    if (source?.type !== 'dataTable') {
      continue;
    }
    tables.push(toTableView(slice, source, defaultFont, dpi));
  }

  return {
    pageNumber: page.pageNumber,
    zoom,
    sheet: { widthPx: pagePx.widthPx, heightPx: pagePx.heightPx },
    printable: {
      leftPx: printable.leftPx,
      topPx: printable.topPx,
      widthPx: printable.sizePx.widthPx,
      heightPx: printable.sizePx.heightPx,
    },
    background,
    elements,
    tables,
    watermark: buildWatermarkView(options?.watermark, dpi),
    mode,
  };
}

/** A stable empty map so the default path allocates nothing. */
const EMPTY_VALUES: ReadonlyMap<string, string> = new Map();

/** Indexes every element across the three bands by id, for content lookup. */
function indexElements(template: RendaraTemplate): Map<string, TemplateElement> {
  const map = new Map<string, TemplateElement>();
  for (const band of ['header', 'body', 'footer'] as const) {
    for (const element of template[band].elements) {
      map.set(element.id, element);
    }
  }
  return map;
}

/** Maps one engine {@link PlacedElement} (+ its source element) to its positioned host box. */
function toElementBoxView(
  placed: PlacedElement,
  source: TemplateElement | undefined,
  resolvedValues: ReadonlyMap<string, string>,
  defaultFont: FontSpec,
  dpi: number,
): ElementBoxView {
  const widthPx = placed.boxPx.wPx;
  const heightPx = placed.boxPx.hPx;
  const content = buildContent(placed, source, resolvedValues, defaultFont, dpi, widthPx, heightPx);
  // Vertical alignment only realises for text (the only flex host box); other
  // types ignore it. Shapes paint their own fill/stroke via SVG, so box
  // decoration (fill/border/padding) is meaningful for text and images only.
  const verticalAlign = content.kind === 'text' ? source?.style?.align?.vertical : undefined;
  const decorate = source && source.type !== 'shape';
  return {
    id: placed.id,
    type: placed.type,
    leftPx: placed.boxPx.xPx,
    topPx: placed.boxPx.yPx,
    widthPx,
    heightPx,
    zIndex: placed.z,
    content,
    boxStyle: decorate ? boxDecorationStyle(source.style, dpi, verticalAlign) : EMPTY_STYLE,
  };
}

/** A stable empty style map for boxes with no decoration. */
const EMPTY_STYLE: StyleMap = {};

/** Builds the content view for one box from its source element (or `empty` when absent). */
function buildContent(
  placed: PlacedElement,
  source: TemplateElement | undefined,
  resolvedValues: ReadonlyMap<string, string>,
  defaultFont: FontSpec,
  dpi: number,
  widthPx: number,
  heightPx: number | null,
): ElementContentView {
  if (!source) {
    return EMPTY_CONTENT;
  }
  switch (source.type) {
    case 'text':
      return buildTextContent(placed, source, resolvedValues, defaultFont, dpi);
    case 'shape':
      return buildShapeContent(source, dpi, widthPx, heightPx ?? 0);
    case 'image':
      return buildImageContent(placed, source, resolvedValues);
    case 'dataTable':
      // Data tables are rendered from `page.tables` slices by E4-S3, not here.
      return EMPTY_CONTENT;
  }
}

const EMPTY_CONTENT: EmptyContentView = { kind: 'empty' };

// ---------------------------------------------------------------------------
// Text content + style.
// ---------------------------------------------------------------------------

/** Resolves a text element's display string and its inline run style. */
function buildTextContent(
  placed: PlacedElement,
  element: TextElement,
  resolvedValues: ReadonlyMap<string, string>,
  defaultFont: FontSpec,
  dpi: number,
): TextContentView {
  const text = resolveTextString(placed, element, resolvedValues);
  return { kind: 'text', text, textStyle: textRunStyle(element.style, defaultFont, dpi) };
}

/**
 * Display string priority (E4-S2): the per-page page-token substitution wins,
 * then the caller-supplied resolved binding value, then the static literal, then
 * the empty string. See the module overview.
 */
function resolveTextString(
  placed: PlacedElement,
  element: TextElement,
  resolvedValues: ReadonlyMap<string, string>,
): string {
  if (placed.resolvedText !== null) {
    return placed.resolvedText;
  }
  if (element.binding) {
    return resolvedValues.get(element.id) ?? '';
  }
  return element.text ?? '';
}

/** Maps font + colour + horizontal alignment + wrapping to the text-run inline style. */
function textRunStyle(
  style: ElementStyle | undefined,
  defaultFont: FontSpec,
  dpi: number,
): StyleMap {
  const font = style?.font;
  const family = font?.family ?? defaultFont.family;
  const sizePt = font?.sizePt ?? defaultFont.sizePt;
  const out: Record<string, string> = {
    'font-family': family,
    'font-size': `${ptToPx(sizePt, dpi)}px`,
    // Wrap within the frame and honour authored newlines (e.g. multi-line address).
    'white-space': 'pre-wrap',
    // The run fills the box width so text-align positions it horizontally.
    width: '100%',
  };
  if (font?.weight !== undefined) {
    out['font-weight'] = `${font.weight}`;
  }
  if (font?.style !== undefined) {
    out['font-style'] = font.style;
  }
  if (style?.color !== undefined) {
    out['color'] = style.color;
  }
  const horizontal = style?.align?.horizontal;
  if (horizontal !== undefined) {
    out['text-align'] = horizontal;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Shape content (SVG primitives).
// ---------------------------------------------------------------------------

/** Builds the SVG primitive for a shape, inset so the stroke is not clipped. */
function buildShapeContent(
  element: ShapeElement,
  dpi: number,
  widthPx: number,
  heightPx: number,
): ShapeContentView {
  const stroke = resolveStroke(element.style, dpi);
  const fill = element.style?.fill ?? null;
  const half = stroke ? stroke.widthPx / 2 : 0;

  const base = {
    kind: 'shape' as const,
    shape: element.shape,
    svgWidthPx: widthPx,
    svgHeightPx: heightPx,
    stroke,
    fill,
  };

  switch (element.shape) {
    case 'line':
      // Corner-to-corner of the frame; a zero-height frame degenerates to a
      // horizontal rule, a zero-width frame to a vertical one. `overflow: visible`
      // on the svg keeps the stroke of a zero-dimension rule painted.
      return { ...base, line: { x1: 0, y1: 0, x2: widthPx, y2: heightPx } };
    case 'rect':
      return {
        ...base,
        rect: {
          x: half,
          y: half,
          width: Math.max(0, widthPx - half * 2),
          height: Math.max(0, heightPx - half * 2),
        },
      };
    case 'ellipse':
      return {
        ...base,
        ellipse: {
          cx: widthPx / 2,
          cy: heightPx / 2,
          rx: Math.max(0, widthPx / 2 - half),
          ry: Math.max(0, heightPx / 2 - half),
        },
      };
  }
}

/** Maps a {@link StrokeStyle} to a resolved SVG stroke, or `null` when there is none. */
function resolveStroke(style: ElementStyle | undefined, dpi: number): ShapeStrokeView | null {
  const stroke = style?.stroke;
  if (!stroke) {
    return null;
  }
  const lineStyle = stroke.style ?? 'solid';
  if (lineStyle === 'none') {
    return null;
  }
  const widthMm = stroke.widthMm ?? DEFAULT_STROKE_WIDTH_MM;
  const widthPx = mmToPx(widthMm, dpi);
  if (widthPx <= 0) {
    return null;
  }
  const color = stroke.color ?? DEFAULT_STROKE_COLOR;
  return {
    color,
    widthPx,
    dashArray: dashArrayFor(lineStyle, widthPx),
    lineCap: lineStyle === 'dotted' ? 'round' : null,
  };
}

/** Default stroke width (mm) when a shape declares a stroke style/colour but no width. */
const DEFAULT_STROKE_WIDTH_MM = 0.2;
/** Default stroke colour when a shape declares a stroke but no colour. */
const DEFAULT_STROKE_COLOR = '#000000';

/** SVG `stroke-dasharray` for dashed/dotted lines, scaled to the stroke width; `null` for solid. */
function dashArrayFor(lineStyle: string, widthPx: number): string | null {
  switch (lineStyle) {
    case 'dashed':
      return `${widthPx * 3} ${widthPx * 2}`;
    case 'dotted':
      // A zero-length dash with a round cap renders as a dot; the gap spaces them.
      return `0 ${widthPx * 2}`;
    default:
      // solid / double both render as a solid stroke at this layer.
      return null;
  }
}

// ---------------------------------------------------------------------------
// Image content + safe URL handling.
// ---------------------------------------------------------------------------

/** Builds the image content view: resolved + sanitised src and the object-fit style. */
function buildImageContent(
  placed: PlacedElement,
  element: ImageElement,
  resolvedValues: ReadonlyMap<string, string>,
): ImageContentView {
  const raw = element.binding ? resolvedValues.get(placed.id) : element.src;
  return {
    kind: 'image',
    src: sanitizeImageUrl(raw),
    imageStyle: {
      width: '100%',
      height: '100%',
      'object-fit': element.fit,
    },
  };
}

/** URL schemes an image source may use (besides scheme-relative / relative paths). */
const SAFE_IMAGE_SCHEMES = new Set(['http', 'https']);

/**
 * Hardens an image source against XSS (E4-S2 security requirement, brief §6/§7):
 * blocks `javascript:`/`vbscript:`/`file:` and any non-`image` `data:` URI, and
 * is robust to obfuscation (leading/embedded control characters and whitespace,
 * mixed case). Returns the trimmed URL when safe, or `null` when blocked, absent,
 * or empty.
 *
 * - **Allowed:** `http:`/`https:` absolute URLs; `data:image/<type>` URIs;
 *   protocol-relative (`//host/…`) and relative (`/path`, `path`, `./`, `../`)
 *   URLs (no scheme → inherits the page's, which is safe).
 * - **Blocked:** everything with an explicit non-allowed scheme.
 *
 * This runs in the pure layer so the component, the headless serializer, and the
 * unit tests all share one decision — and never relies on `eval`/the DOM.
 */
export function sanitizeImageUrl(url: string | null | undefined): string | null {
  if (typeof url !== 'string') {
    return null;
  }
  // Strip ASCII control characters and whitespace (NUL, tab, CR/LF, space) that
  // are used to split a scheme keyword across characters. Image URLs never carry
  // raw whitespace, so dropping every char with code <= 0x20 is safe and defeats
  // the obfuscation before the scheme check.
  const cleaned = Array.from(url)
    .filter((ch) => ch.charCodeAt(0) > 0x20)
    .join('');
  if (cleaned.length === 0) {
    return null;
  }

  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(cleaned);
  if (!schemeMatch) {
    // No scheme → relative or protocol-relative URL; safe.
    return cleaned;
  }

  const scheme = schemeMatch[1].toLowerCase();
  if (SAFE_IMAGE_SCHEMES.has(scheme)) {
    return cleaned;
  }
  if (scheme === 'data') {
    // Only image data URIs; block `data:text/html`, `data:application/...`, etc.
    return /^data:image\//i.test(cleaned) ? cleaned : null;
  }
  // javascript:, vbscript:, file:, and anything else explicit → block.
  return null;
}

// ---------------------------------------------------------------------------
// Table content + default style (E4-S3).
//
// The v1 schema's `DataTableElement` carries no per-row/cell style fields (the
// contract is frozen; brief §5's `rowStyle` is illustrative only), so the
// renderer supplies a single, professional default table look: an emphasised
// header with a rule, faint detail-row separators, tinted group-header bands,
// and stronger rules under subtotal/grand-total rows — modelled on the invoice
// preview mockup. Cell padding mirrors the engine's measurement
// ({@link DEFAULT_CELL_PADDING_MM}) and the font the document default, so the
// painted rows fit the heights the paginator measured.
// ---------------------------------------------------------------------------

// Each colour is emitted as `var(--rdr-token, default)` so a host can re-theme the
// table palette via the renderer's CSS custom properties (E4-S5) while the default
// keeps the rendered pixels unchanged. The defaults mirror `RDR_THEME_TOKENS`.

/** Tinted fill behind the header row (slate-100). */
const TABLE_HEADER_FILL = 'var(--rdr-table-header-fill, #F1F5F9)';
/** Tinted fill behind a group-header band (indigo-50, the accent tint). */
const TABLE_GROUP_HEADER_FILL = 'var(--rdr-table-group-fill, #EEF2FF)';
/** Faint separator under each detail row (slate-200). */
const TABLE_DETAIL_RULE = 'var(--rdr-table-detail-rule, #E2E8F0)';
/** Stronger rule under the header and group footers (slate-300). */
const TABLE_BAND_RULE = 'var(--rdr-table-band-rule, #CBD5E1)';
/** Strongest rule above the grand-total / under the header bottom (slate-700). */
const TABLE_TOTAL_RULE = 'var(--rdr-table-total-rule, #334155)';

/**
 * Positions one engine {@link TableSlice} into a {@link TableView}: the container
 * sits at the table's page-absolute left ({@link DataTableElement.frame}'s `xMm`)
 * and the slice's page-absolute top, with rows re-stacked slice-relative.
 */
function toTableView(
  slice: TableSlice,
  element: DataTableElement,
  defaultFont: FontSpec,
  dpi: number,
): TableView {
  const leftPx = mmToPx(element.frame.xMm, dpi);
  const widthPx = slice.columns.reduce((sum, c) => sum + c.widthPx, 0);
  const fontSizePx = ptToPx(defaultFont.sizePt, dpi);
  const padding = DEFAULT_CELL_PADDING_MM;

  const rows = slice.rows.map((row) =>
    toTableRowView(
      row,
      slice.columns,
      widthPx,
      slice.yPx,
      defaultFont.family,
      fontSizePx,
      padding,
      dpi,
    ),
  );

  return {
    elementId: slice.elementId,
    leftPx,
    topPx: slice.yPx,
    widthPx,
    heightPx: slice.heightPx,
    zIndex: element.z,
    rows,
  };
}

/** Maps one measured table row to its slice-relative {@link TableRowView}. */
function toTableRowView(
  row: MeasuredRow,
  columns: readonly TableColumnLayout[],
  widthPx: number,
  sliceTopPx: number,
  fontFamily: string,
  fontSizePx: number,
  padding: CellPaddingMm,
  dpi: number,
): TableRowView {
  // Header / footer / subtotal / grand-total text is emphasised; detail is plain.
  const emphasised = row.kind !== 'detail';
  const cells: TableCellView[] = columns.map((column, i) => {
    const cell = row.cells[i];
    return {
      columnKey: column.key,
      text: cell?.text ?? '',
      leftPx: column.xPx,
      widthPx: column.widthPx,
      cellStyle: tableTextStyle(column.align, fontFamily, fontSizePx, padding, dpi, emphasised),
    };
  });

  const label: TableLabelView | null = row.label
    ? {
        text: row.label.text,
        // A band label spans the table content width; group bands are always bold.
        labelStyle: tableTextStyle(row.label.align, fontFamily, fontSizePx, padding, dpi, true),
      }
    : null;

  return {
    kind: row.kind,
    topPx: row.yPx - sliceTopPx,
    heightPx: row.heightPx,
    widthPx,
    cells,
    label,
    rowStyle: tableRowDecoration(row.kind),
    continued: row.continued ?? false,
  };
}

/** The text/box style shared by table cells and band labels (padding, font, align). */
function tableTextStyle(
  align: ColumnAlign,
  fontFamily: string,
  fontSizePx: number,
  padding: CellPaddingMm,
  dpi: number,
  emphasised: boolean,
): StyleMap {
  const out: Record<string, string> = {
    'box-sizing': 'border-box',
    'font-family': fontFamily,
    'font-size': `${fontSizePx}px`,
    // Wrap within the column, matching the engine's greedy word-wrap measurement.
    'white-space': 'pre-wrap',
    overflow: 'hidden',
    'text-align': align,
    'padding-top': `${mmToPx(padding.top, dpi)}px`,
    'padding-right': `${mmToPx(padding.right, dpi)}px`,
    'padding-bottom': `${mmToPx(padding.bottom, dpi)}px`,
    'padding-left': `${mmToPx(padding.left, dpi)}px`,
  };
  if (emphasised) {
    out['font-weight'] = '700';
  }
  return out;
}

/** The per-kind row-track decoration (fill + separators / rules); empty for none. */
function tableRowDecoration(kind: MeasuredRowKind): StyleMap {
  switch (kind) {
    case 'header':
      return {
        'box-sizing': 'border-box',
        background: TABLE_HEADER_FILL,
        'border-bottom': `1px solid ${TABLE_TOTAL_RULE}`,
      };
    case 'detail':
      return { 'box-sizing': 'border-box', 'border-bottom': `1px solid ${TABLE_DETAIL_RULE}` };
    case 'groupHeader':
      return {
        'box-sizing': 'border-box',
        background: TABLE_GROUP_HEADER_FILL,
        'border-bottom': `1px solid ${TABLE_BAND_RULE}`,
      };
    case 'groupFooter':
      return {
        'box-sizing': 'border-box',
        'border-top': `1px solid ${TABLE_BAND_RULE}`,
        'border-bottom': `1px solid ${TABLE_BAND_RULE}`,
      };
    case 'columnFooter':
      return { 'box-sizing': 'border-box', 'border-top': `2px solid ${TABLE_TOTAL_RULE}` };
  }
}

// ---------------------------------------------------------------------------
// Watermark (E4-S7) — the centred, rotated overlay stamped on every page behind
// the content. The config is document-level and render-time (brief §8 / ADR
// 0007), so it arrives via options, never the (frozen) template schema. Built in
// the pure layer so the component and the headless serializer paint it identically.
// ---------------------------------------------------------------------------

/** Default watermark text colour when the config declares none (slate-400); themeable. */
const WATERMARK_COLOR = 'var(--rdr-watermark-color, #9CA3AF)';
/** Default watermark caption size (pt) when the config declares none — large, document-spanning. */
const DEFAULT_WATERMARK_FONT_SIZE_PT = 72;

/**
 * Builds the {@link WatermarkView} for a page, or `null` when there is nothing to
 * paint: no config, a `text` watermark with an empty caption, or an `image`
 * watermark whose `src` is missing or blocked by {@link sanitizeImageUrl}. The
 * layer covers the whole sheet, carries the (clamped) opacity, centres its
 * content and is non-interactive; the inner caption/image carries the rotation
 * and per-kind paint.
 */
export function buildWatermarkView(
  watermark: Watermark | null | undefined,
  dpi: number,
): WatermarkView | null {
  if (!watermark) {
    return null;
  }
  const layerStyle = watermarkLayerStyle(watermark.opacity);

  if (watermark.type === 'image') {
    const src = sanitizeImageUrl(watermark.src);
    if (src === null) {
      return null;
    }
    return {
      kind: 'image',
      text: null,
      src,
      layerStyle,
      innerStyle: {
        'max-width': '60%',
        'max-height': '60%',
        transform: rotate(watermark.angleDeg),
      },
    };
  }

  const text = watermark.text?.trim() ?? '';
  if (text.length === 0) {
    return null;
  }
  const sizePt = watermark.fontSizePt ?? DEFAULT_WATERMARK_FONT_SIZE_PT;
  return {
    kind: 'text',
    text,
    src: null,
    layerStyle,
    innerStyle: {
      transform: rotate(watermark.angleDeg),
      'font-size': `${ptToPx(sizePt, dpi)}px`,
      'font-weight': '700',
      'letter-spacing': '0.2em',
      'white-space': 'nowrap',
      color: watermark.color ?? WATERMARK_COLOR,
    },
  };
}

/** The full-sheet, centred, non-interactive overlay layer carrying the clamped opacity. */
function watermarkLayerStyle(opacity: number): StyleMap {
  return {
    position: 'absolute',
    left: '0',
    top: '0',
    width: '100%',
    height: '100%',
    display: 'flex',
    'align-items': 'center',
    'justify-content': 'center',
    overflow: 'hidden',
    'pointer-events': 'none',
    // Behind the element/table content (z ≥ 0); emitted first so equal-z content wins.
    'z-index': '0',
    opacity: `${clampOpacity(opacity)}`,
  };
}

/** A CSS `rotate(<deg>deg)` transform; a non-finite angle degrades to no rotation. */
function rotate(angleDeg: number): string {
  return `rotate(${Number.isFinite(angleDeg) ? angleDeg : 0}deg)`;
}

/** Clamps a watermark opacity into `[0, 1]`; a non-finite value falls back to fully opaque. */
function clampOpacity(opacity: number): number {
  if (!Number.isFinite(opacity)) {
    return 1;
  }
  return Math.min(1, Math.max(0, opacity));
}

// ---------------------------------------------------------------------------
// Design-mode hooks (E4-S6) — the additive selection anchors the designer canvas
// reads. Shared by the Angular component and the headless serializer so the two
// stay in lock-step and view mode is guaranteed anchor-free (byte-stable).
// ---------------------------------------------------------------------------

/**
 * The additive `data-rdr-*` selection-anchor attributes for one hit target
 * (element box or data-table) — or `null` in view mode, so callers emit nothing.
 *
 * In design mode it returns the anchor's `role` marker (`data-rdr-hit`) plus the
 * target's natural (unscaled) px frame (`data-rdr-x/y/w/h`), so the designer can
 * place a selection rectangle + handles without reading the zoom-transformed DOM.
 * `data-rdr-h` is omitted for a growing (auto-height) element. Identity is *not*
 * duplicated here: it already lives on the always-present
 * `data-element-id`/`data-element-type` / `data-table-id` attributes.
 */
export function designAnchorAttrs(
  role: 'element' | 'table',
  frame: { readonly leftPx: number; readonly topPx: number; readonly widthPx: number; readonly heightPx: number | null },
  mode: RenderMode,
): AttrMap | null {
  if (mode !== 'design') {
    return null;
  }
  const out: Record<string, string> = {
    'data-rdr-hit': role,
    'data-rdr-x': `${frame.leftPx}`,
    'data-rdr-y': `${frame.topPx}`,
    'data-rdr-w': `${frame.widthPx}`,
  };
  if (frame.heightPx !== null) {
    out['data-rdr-h'] = `${frame.heightPx}`;
  }
  return out;
}

/** A non-empty background string wins; everything else falls back to white paper. */
function resolveBackground(background: string | null | undefined): string {
  return typeof background === 'string' && background.length > 0
    ? background
    : DEFAULT_PAGE_BACKGROUND;
}

// ---------------------------------------------------------------------------
// Shared inline-style helpers — the single style source for both the Angular
// component (via `[style]` bindings) and the headless HTML serializer, so the
// two renderings never diverge (brief §7).
// ---------------------------------------------------------------------------

/** A plain inline-style map (property → value), renderer-agnostic. */
export type StyleMap = Readonly<Record<string, string>>;

/** Inline styles for the page sheet: natural size, background, and the zoom transform. */
export function sheetStyle(vm: PageViewModel): StyleMap {
  return {
    position: 'relative',
    width: `${vm.sheet.widthPx}px`,
    height: `${vm.sheet.heightPx}px`,
    background: vm.background,
    transform: `scale(${vm.zoom})`,
    'transform-origin': 'top left',
  };
}

/** Inline styles for the printable-area guide rectangle. */
export function printableStyle(vm: PageViewModel): StyleMap {
  const { leftPx, topPx, widthPx, heightPx } = vm.printable;
  return {
    position: 'absolute',
    left: `${leftPx}px`,
    top: `${topPx}px`,
    width: `${widthPx}px`,
    height: `${heightPx}px`,
  };
}

/**
 * Inline styles for one table slice's container (E4-S3): absolutely positioned at
 * the table's page-absolute left and the slice's top, sized to the table width
 * and slice height, at the source element's paint depth.
 */
export function tableContainerStyle(table: TableView): StyleMap {
  return {
    position: 'absolute',
    left: `${table.leftPx}px`,
    top: `${table.topPx}px`,
    width: `${table.widthPx}px`,
    height: `${table.heightPx}px`,
    'z-index': `${table.zIndex}`,
  };
}

/** Inline styles for one table row track: slice-relative position + per-kind decoration. */
export function tableRowStyle(row: TableRowView): StyleMap {
  return {
    position: 'absolute',
    left: '0',
    top: `${row.topPx}px`,
    width: `${row.widthPx}px`,
    height: `${row.heightPx}px`,
    ...row.rowStyle,
  };
}

/** Inline styles for one table cell: column-relative position + its text/box style. */
export function tableCellStyle(cell: TableCellView): StyleMap {
  return {
    position: 'absolute',
    left: `${cell.leftPx}px`,
    top: '0',
    width: `${cell.widthPx}px`,
    height: '100%',
    ...cell.cellStyle,
  };
}

/** Inline styles for a full-table-width band label: spans the row over its cells. */
export function tableLabelStyle(label: TableLabelView): StyleMap {
  return {
    position: 'absolute',
    left: '0',
    top: '0',
    width: '100%',
    height: '100%',
    ...label.labelStyle,
  };
}

/**
 * Inline styles for one absolutely-positioned element host box. Carries the
 * position/size/z-index and, for text, the box decoration (fill, border,
 * padding) + a flex column whose `justify-content` realises vertical alignment.
 */
export function elementStyle(box: ElementBoxView): StyleMap {
  const out: Record<string, string> = {
    position: 'absolute',
    left: `${box.leftPx}px`,
    top: `${box.topPx}px`,
    width: `${box.widthPx}px`,
    // A growing element (null height) sizes to its content.
    height: box.heightPx === null ? 'auto' : `${box.heightPx}px`,
    'z-index': `${box.zIndex}`,
  };
  if (box.content.kind === 'text') {
    out['box-sizing'] = 'border-box';
    out['display'] = 'flex';
    out['flex-direction'] = 'column';
    out['overflow'] = 'hidden';
  }
  // Box decoration (fill/border/padding/justify-content) layers on top; none of
  // its keys collide with the position/size/z-index set above.
  return { ...out, ...box.boxStyle };
}

/**
 * Box decoration (fill / border / padding / vertical alignment) for an element,
 * derived from its source style. Returned separately from {@link elementStyle}
 * so callers that pre-built the box style can merge these in; both the component
 * and serializer compose them with the same precedence. Empty when there is no
 * decoration to apply.
 */
export function boxDecorationStyle(
  style: ElementStyle | undefined,
  dpi: number,
  verticalAlign: string | undefined,
): StyleMap {
  const out: Record<string, string> = {};
  if (style?.fill !== undefined) {
    out['background'] = style.fill;
  }
  applyBorder(out, 'top', style?.border?.top, dpi);
  applyBorder(out, 'right', style?.border?.right, dpi);
  applyBorder(out, 'bottom', style?.border?.bottom, dpi);
  applyBorder(out, 'left', style?.border?.left, dpi);
  const padding = style?.padding;
  if (padding) {
    out['padding-top'] = `${mmToPx(padding.top ?? 0, dpi)}px`;
    out['padding-right'] = `${mmToPx(padding.right ?? 0, dpi)}px`;
    out['padding-bottom'] = `${mmToPx(padding.bottom ?? 0, dpi)}px`;
    out['padding-left'] = `${mmToPx(padding.left ?? 0, dpi)}px`;
  }
  if (verticalAlign !== undefined) {
    out['justify-content'] = VERTICAL_JUSTIFY[verticalAlign] ?? 'flex-start';
  }
  return out;
}

/** Maps an authored vertical alignment to the flex `justify-content` value. */
const VERTICAL_JUSTIFY: Readonly<Record<string, string>> = {
  top: 'flex-start',
  middle: 'center',
  bottom: 'flex-end',
};

/** Writes one CSS `border-<side>` shorthand when the side declares a visible border. */
function applyBorder(
  out: Record<string, string>,
  side: 'top' | 'right' | 'bottom' | 'left',
  border: BorderSide | undefined,
  dpi: number,
): void {
  if (!border) {
    return;
  }
  const lineStyle = border.style ?? 'solid';
  if (lineStyle === 'none') {
    return;
  }
  const widthPx = mmToPx(border.widthMm ?? 0, dpi);
  if (widthPx <= 0) {
    return;
  }
  const color = border.color ?? DEFAULT_STROKE_COLOR;
  out[`border-${side}`] = `${widthPx}px ${lineStyle} ${color}`;
}
