import type { Frame } from './frame';
import type { ElementStyle } from './style';

/**
 * The discriminant of the element union. v1 element types per the reconciled
 * palette (brief §12.3): text, shape (line/rect/ellipse), image, and data table.
 * Shapes share one `'shape'` discriminant; their `line|rect|ellipse` sub-kind is
 * defined in **E1-S3**.
 */
export type ElementType = 'text' | 'shape' | 'image' | 'dataTable';

/**
 * Fields common to every element (brief §5): a stable id, the `type`
 * discriminant, the absolute {@link Frame}, an optional {@link ElementStyle}
 * ref, a z-order, and an optional `visibleWhen` condition.
 *
 * `visibleWhen` is a JSONata boolean expression (or `null`) that controls
 * conditional visibility. It is carried as a raw expression string here; the
 * structured binding model that surrounds it lands in **E1-S5**.
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
 * Element stubs (E1-S1): each narrows the `type` discriminant onto
 * {@link ElementBase}. The type-specific fields — text content, shape sub-kind,
 * image src/fit, data-table source/columns/groups — are added in **E1-S3**.
 */
export interface TextElement extends ElementBase {
  readonly type: 'text';
}

export interface ShapeElement extends ElementBase {
  readonly type: 'shape';
}

export interface ImageElement extends ElementBase {
  readonly type: 'image';
}

export interface DataTableElement extends ElementBase {
  readonly type: 'dataTable';
}

/**
 * The discriminated union of all v1 element types, keyed on `type`. Stubbed in
 * E1-S1 and fleshed out per-type in **E1-S3**.
 */
export type TemplateElement = TextElement | ShapeElement | ImageElement | DataTableElement;
