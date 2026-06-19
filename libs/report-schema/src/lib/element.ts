import type { ElementBinding } from './binding';
import type { Frame } from './frame';
import type { ElementStyle } from './style';

/**
 * The discriminant of the element union. v1 element types per the reconciled
 * palette (brief §12.3): text, shape (line/rect/ellipse), image, and data table.
 * Shapes share one `'shape'` discriminant; their `line|rect|ellipse` sub-kind is
 * the {@link ShapeElement.shape} field.
 */
export type ElementType = 'text' | 'shape' | 'image' | 'dataTable';

/**
 * Fields common to every element (brief §5): a stable id, the `type`
 * discriminant, the absolute {@link Frame}, an optional {@link ElementStyle}
 * ref, a z-order, and an optional `visibleWhen` condition.
 *
 * `visibleWhen` is a JSONata boolean expression (or `null`) that controls
 * conditional visibility (brief §6). It is a bare expression string — it
 * produces a boolean, not a formatted display value, so it is *not* an
 * {@link ElementBinding}. Its truthy/falsy evaluation is **E2-S3**;
 * `validateElement` checks only that a present value is a non-empty string or
 * `null`.
 */
export interface ElementBase {
  readonly id: string;
  readonly type: ElementType;
  readonly frame: Frame;
  readonly style?: ElementStyle;
  readonly z: number;
  readonly visibleWhen?: string | null;
}

/**
 * A static or data-bound block of text (brief §5). Renders {@link binding} when
 * present, otherwise the literal {@link text}. At least one of the two is
 * expected — enforced by `validateElement`, not the type, so a partially-edited
 * element is still assignable in the designer.
 */
export interface TextElement extends ElementBase {
  readonly type: 'text';
  /** Static literal text, used when there is no dynamic binding. */
  readonly text?: string;
  /** Dynamic value binding ({@link ElementBinding}: expr/format/fallback). */
  readonly binding?: ElementBinding;
}

/** A shape's sub-kind. The v1 palette is line, rectangle, and ellipse (brief §12.3). */
export type ShapeKind = 'line' | 'rect' | 'ellipse';

/**
 * A vector shape (brief §5, §12.3). It carries no value binding — its appearance
 * (stroke, fill, …) comes entirely from {@link ElementStyle} (the stroke/fill
 * slots land in **E1-S4**).
 */
export interface ShapeElement extends ElementBase {
  readonly type: 'shape';
  readonly shape: ShapeKind;
}

/**
 * How an image is fitted into its {@link Frame}. Values map 1:1 to the CSS
 * `object-fit` property, since the renderer emits absolutely-positioned DOM/CSS
 * (brief §3, §7).
 */
export type ImageFit = 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';

/**
 * A raster/vector image (brief §5). The source is either a static {@link src}
 * (URL or data URI) or a dynamic {@link binding} resolving to one — at least one
 * is expected, enforced by `validateElement`.
 */
export interface ImageElement extends ElementBase {
  readonly type: 'image';
  /** Static image source: a URL or data URI. */
  readonly src?: string;
  /** Dynamic source binding (e.g. a logo URL from data); see {@link ElementBinding}. */
  readonly binding?: ElementBinding;
  /** How the image is fitted into its frame. */
  readonly fit: ImageFit;
}

/**
 * The source of a data table's repeating detail rows: a JSONata expression that
 * resolves to an array over the Data JSON (brief §5, §6). Each row becomes the
 * `$` scope for the column {@link DataTableColumn.cell} bindings.
 */
export interface DataTableSource {
  readonly arrayExpr: string;
}

/** Horizontal alignment of a table column's cells and header. */
export type ColumnAlign = 'left' | 'center' | 'right';

/**
 * One column of a {@link DataTableElement} (brief §5). A static {@link header}
 * label, a per-row {@link cell} binding (row scope `$`), an optional aggregate
 * {@link footer} binding (column total), a millimetre width, and optional
 * alignment.
 */
export interface DataTableColumn {
  /** Stable column key. */
  readonly key: string;
  /** Static header label. */
  readonly header: string;
  /** Per-row cell binding, evaluated with `$` bound to the current row. */
  readonly cell: ElementBinding;
  /** Optional column-footer aggregate binding (e.g. `$sum(...)`). */
  readonly footer?: ElementBinding;
  readonly widthMm: number;
  readonly align?: ColumnAlign;
}

/**
 * A single aggregate shown in a {@link GroupBand}, aligned under one table
 * column (brief §5, §6). Used for per-group subtotals such as a sum of the
 * `amount` column within each group.
 */
export interface GroupAggregate {
  /** Key of the {@link DataTableColumn} this aggregate aligns under. */
  readonly columnKey: string;
  /**
   * Aggregate {@link ElementBinding} evaluated over the group's rows (e.g.
   * `{ expr: '$sum($.amount)', format: 'currency:USD' }`). The aggregation
   * itself is computed by the engine (**E2-S5**).
   */
  readonly binding: ElementBinding;
}

/**
 * A group's header or footer band (brief §5): an optional {@link label} binding
 * (e.g. the group title) and optional per-column {@link aggregates} (subtotals).
 * Both slots are optional, so a header can be label-only and a footer
 * aggregates-only.
 */
export interface GroupBand {
  /** Optional label binding for the band (e.g. `"Category: " & $.category`). */
  readonly label?: ElementBinding;
  /** Per-column aggregate bindings aligned under the table's columns. */
  readonly aggregates?: readonly GroupAggregate[];
}

/**
 * An optional grouping band of a {@link DataTableElement} (brief §5): detail
 * rows are grouped by {@link groupBy}, with an optional {@link header} above and
 * {@link footer} (subtotals) below each group.
 *
 * Cross-page group continuation (repeating a group header after a break,
 * carry-over subtotals) is a *pagination* concern handled in **E3-S6**; this
 * model only defines the bands and their aggregate bindings.
 */
export interface DataTableGroup {
  /** JSONata expression the detail rows are grouped by. */
  readonly groupBy: string;
  /** Optional band rendered above each group's rows. */
  readonly header?: GroupBand;
  /** Optional band rendered below each group's rows (subtotals). */
  readonly footer?: GroupBand;
}

/**
 * A data table that expands with its bound array and paginates (brief §5, §7).
 * Its height grows, so {@link Frame.hMm} is typically `null`.
 */
export interface DataTableElement extends ElementBase {
  readonly type: 'dataTable';
  /** The bound array that supplies detail rows. */
  readonly source: DataTableSource;
  readonly columns: readonly DataTableColumn[];
  /** Optional grouping bands with header/footer aggregate bindings ({@link DataTableGroup}). */
  readonly groups?: readonly DataTableGroup[];
  /** Repeat the header row at the top of every page the table spans. */
  readonly repeatHeaderOnEachPage: boolean;
  /** Avoid breaking the table across a page boundary when it fits whole. */
  readonly keepTogether: boolean;
}

/**
 * The discriminated union of all v1 element types, keyed on `type` (brief
 * §12.3). Exhaustive handling is enforced via `assertNever` in
 * `./element-validation`.
 */
export type TemplateElement = TextElement | ShapeElement | ImageElement | DataTableElement;
