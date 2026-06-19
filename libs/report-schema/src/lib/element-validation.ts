/**
 * Element model behavior (E1-S3): type guards, exhaustiveness enforcement, and a
 * focused per-type structural validator.
 *
 * `element.ts` declares the element *types*; this file owns their *behavior*:
 * narrowing guards, an `assertNever` exhaustiveness guard, and a small,
 * self-contained validator so the per-type fixtures are unit-testable today.
 *
 * Scope note (same as `page-settings.ts`): this is **not** the general template
 * validator. The ajv-backed `validate()`/`RendaraValidationError` API is
 * **E1-S6** and will fold these checks in; the binding model these checks lean on
 * is **E1-S4** (style) / **E1-S5** (binding). Here we ship just enough to prove
 * each element type's structure (brief §5).
 */

import type { ElementBinding } from './binding';
import type {
  ColumnAlign,
  DataTableColumn,
  DataTableElement,
  DataTableGroup,
  ImageElement,
  ImageFit,
  ShapeElement,
  ShapeKind,
  TemplateElement,
  TextElement,
} from './element';

/** The shape sub-kinds recognised at runtime (mirrors {@link ShapeKind}). */
export const SHAPE_KINDS: readonly ShapeKind[] = ['line', 'rect', 'ellipse'];

/** The image fit modes recognised at runtime (mirrors {@link ImageFit}). */
export const IMAGE_FITS: readonly ImageFit[] = ['contain', 'cover', 'fill', 'none', 'scale-down'];

/** The column alignments recognised at runtime (mirrors {@link ColumnAlign}). */
export const COLUMN_ALIGNS: readonly ColumnAlign[] = ['left', 'center', 'right'];

/** Narrows a {@link TemplateElement} to a {@link TextElement}. */
export function isTextElement(element: TemplateElement): element is TextElement {
  return element.type === 'text';
}

/** Narrows a {@link TemplateElement} to a {@link ShapeElement}. */
export function isShapeElement(element: TemplateElement): element is ShapeElement {
  return element.type === 'shape';
}

/** Narrows a {@link TemplateElement} to an {@link ImageElement}. */
export function isImageElement(element: TemplateElement): element is ImageElement {
  return element.type === 'image';
}

/** Narrows a {@link TemplateElement} to a {@link DataTableElement}. */
export function isDataTableElement(element: TemplateElement): element is DataTableElement {
  return element.type === 'dataTable';
}

/**
 * Compile-time exhaustiveness guard. Reaching this at runtime means a
 * {@link TemplateElement} variant was added without updating the caller; the
 * `never` parameter makes that a *type error* at the call site (brief: the
 * element union is a versioned contract — handling must stay exhaustive).
 */
export function assertNever(value: never): never {
  throw new Error(`Unhandled element variant: ${JSON.stringify(value)}`);
}

/** A single element-structure problem, with a dotted path to the offending field. */
export interface ElementError {
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

/**
 * Validates a binding slot: it must carry a non-empty JSONata `expr`. The
 * richer binding rules (`format`, `fallback`, etc.) arrive with the binding
 * model in **E1-S5**.
 */
function validateBinding(binding: ElementBinding, path: string, errors: ElementError[]): void {
  if (!isNonEmptyString(binding.expr)) {
    errors.push({
      path: `${path}.expr`,
      message: `Binding '${path}' must have a non-empty expression string.`,
    });
  }
}

function validateFrame(
  element: TemplateElement,
  at: (rel: string) => string,
  errors: ElementError[],
): void {
  const { frame } = element;
  if (!Number.isFinite(frame.xMm)) {
    errors.push({
      path: at('frame.xMm'),
      message: `frame.xMm must be a finite number, got ${frame.xMm}.`,
    });
  }
  if (!Number.isFinite(frame.yMm)) {
    errors.push({
      path: at('frame.yMm'),
      message: `frame.yMm must be a finite number, got ${frame.yMm}.`,
    });
  }
  if (!isPositiveFinite(frame.wMm)) {
    errors.push({
      path: at('frame.wMm'),
      message: `frame.wMm must be a positive number of millimetres, got ${frame.wMm}.`,
    });
  }
  // hMm is nullable: `null` = grows (paginator computes it); otherwise it must be
  // a non-negative finite millimetre height.
  if (frame.hMm !== null && !isNonNegativeFinite(frame.hMm)) {
    errors.push({
      path: at('frame.hMm'),
      message: `frame.hMm must be null (auto-height) or a non-negative number of millimetres, got ${frame.hMm}.`,
    });
  }
}

function validateText(
  element: TextElement,
  at: (rel: string) => string,
  errors: ElementError[],
): void {
  const hasText = typeof element.text === 'string';
  if (!hasText && element.binding === undefined) {
    errors.push({
      path: at('(text|binding)'),
      message: 'Text element must have either static `text` or a `binding`.',
    });
  }
  if (element.binding !== undefined) {
    validateBinding(element.binding, at('binding'), errors);
  }
}

function validateShape(
  element: ShapeElement,
  at: (rel: string) => string,
  errors: ElementError[],
): void {
  if (!SHAPE_KINDS.includes(element.shape)) {
    errors.push({
      path: at('shape'),
      message: `Shape kind must be one of ${SHAPE_KINDS.join(', ')}, got ${JSON.stringify(element.shape)}.`,
    });
  }
}

function validateImage(
  element: ImageElement,
  at: (rel: string) => string,
  errors: ElementError[],
): void {
  if (!isNonEmptyString(element.src) && element.binding === undefined) {
    errors.push({
      path: at('(src|binding)'),
      message: 'Image element must have either a static `src` or a `binding`.',
    });
  }
  if (element.binding !== undefined) {
    validateBinding(element.binding, at('binding'), errors);
  }
  if (!IMAGE_FITS.includes(element.fit)) {
    errors.push({
      path: at('fit'),
      message: `Image fit must be one of ${IMAGE_FITS.join(', ')}, got ${JSON.stringify(element.fit)}.`,
    });
  }
}

function validateColumn(column: DataTableColumn, path: string, errors: ElementError[]): void {
  if (!isNonEmptyString(column.key)) {
    errors.push({ path: `${path}.key`, message: 'Column `key` must be a non-empty string.' });
  }
  if (typeof column.header !== 'string') {
    errors.push({ path: `${path}.header`, message: 'Column `header` must be a string.' });
  }
  validateBinding(column.cell, `${path}.cell`, errors);
  if (column.footer !== undefined) {
    validateBinding(column.footer, `${path}.footer`, errors);
  }
  if (!isPositiveFinite(column.widthMm)) {
    errors.push({
      path: `${path}.widthMm`,
      message: `Column \`widthMm\` must be a positive number of millimetres, got ${column.widthMm}.`,
    });
  }
  if (column.align !== undefined && !COLUMN_ALIGNS.includes(column.align)) {
    errors.push({
      path: `${path}.align`,
      message: `Column \`align\` must be one of ${COLUMN_ALIGNS.join(', ')}, got ${JSON.stringify(column.align)}.`,
    });
  }
}

function validateGroup(group: DataTableGroup, path: string, errors: ElementError[]): void {
  if (!isNonEmptyString(group.groupBy)) {
    errors.push({
      path: `${path}.groupBy`,
      message: 'Group `groupBy` must be a non-empty expression string.',
    });
  }
}

function validateDataTable(
  element: DataTableElement,
  at: (rel: string) => string,
  errors: ElementError[],
): void {
  if (!isNonEmptyString(element.source.arrayExpr)) {
    errors.push({
      path: at('source.arrayExpr'),
      message: 'Data table `source.arrayExpr` must be a non-empty expression string.',
    });
  }
  if (element.columns.length === 0) {
    errors.push({ path: at('columns'), message: 'Data table must have at least one column.' });
  }
  element.columns.forEach((column, index) => {
    validateColumn(column, at(`columns[${index}]`), errors);
  });
  element.groups?.forEach((group, index) => {
    validateGroup(group, at(`groups[${index}]`), errors);
  });
}

/**
 * Focused per-type element validation (E1-S3 QA). Checks the common
 * id/z/frame fields and each element type's own structural rules, returning one
 * {@link ElementError} per problem (an empty array means valid). Paths are
 * prefixed with the element id for locatability.
 *
 * Defensive `typeof`/finite checks are used throughout because this may run over
 * untrusted parsed JSON, not just well-typed objects.
 */
export function validateElement(element: TemplateElement): ElementError[] {
  const errors: ElementError[] = [];
  const idLabel = isNonEmptyString(element.id) ? element.id : '<element>';
  const at = (rel: string): string => `${idLabel}.${rel}`;

  if (!isNonEmptyString(element.id)) {
    errors.push({ path: at('id'), message: 'Element `id` must be a non-empty string.' });
  }
  if (!Number.isFinite(element.z)) {
    errors.push({
      path: at('z'),
      message: `Element \`z\` must be a finite number, got ${element.z}.`,
    });
  }
  validateFrame(element, at, errors);

  switch (element.type) {
    case 'text':
      validateText(element, at, errors);
      break;
    case 'shape':
      validateShape(element, at, errors);
      break;
    case 'image':
      validateImage(element, at, errors);
      break;
    case 'dataTable':
      validateDataTable(element, at, errors);
      break;
    default:
      return assertNever(element);
  }

  return errors;
}

/** Convenience boolean wrapper over {@link validateElement}. */
export function isValidElement(element: TemplateElement): boolean {
  return validateElement(element).length === 0;
}
