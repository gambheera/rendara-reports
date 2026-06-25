import type { Frame, StrokeStyle, TemplateElement } from '@rendara/report-schema';

/**
 * The drag-create contract shared by the palette (drag source / click-to-add)
 * and the canvas (drop target), plus the pure factory that turns a dropped
 * palette tile into a schema-valid {@link TemplateElement} (E5-S5).
 *
 * Everything here is **pure and framework-agnostic** so it is exhaustively
 * unit-testable: the only stateful concerns (id/z generation, store mutation,
 * selection) live in the thin `ElementCreator` orchestrator. Frames are produced
 * in **page-absolute millimetres** — the authoring coordinate space the engine
 * lays out against (every element's origin is the page's top-left corner).
 */

/**
 * The kind of control a palette tile creates. These are the v1 palette items
 * (brief §12.3.4); the three shape kinds double as {@link ShapeKind} values, so a
 * 'line'/'rect'/'ellipse' tile maps straight onto a shape element's sub-kind.
 */
export type PaletteKind = 'text' | 'image' | 'line' | 'rect' | 'ellipse' | 'dataTable';

/**
 * The `id` of the canvas drop list. The palette's `cdkDropList` connects to this
 * id so a tile dragged out of the palette is accepted by the canvas; the canvas
 * stamps it on its own `cdkDropList`. A shared constant keeps the two ends from
 * drifting.
 */
export const CANVAS_DROP_LIST_ID = 'rdr-canvas-drop-list';

/** A default element footprint in mm; `hMm: null` is a growing (auto-height) element. */
export interface ElementSize {
  readonly wMm: number;
  readonly hMm: number | null;
}

/** A point in page-absolute millimetres. */
export interface PointMm {
  readonly xMm: number;
  readonly yMm: number;
}

/** A page's sheet dimensions in millimetres (mirrors the engine's `SizeMm`). */
export interface PageSizeMm {
  readonly widthMm: number;
  readonly heightMm: number;
}

/**
 * The default footprint a freshly-dropped control gets, per kind. Sizes are
 * deliberately modest so a new element reads clearly on the sheet; a data table
 * grows with its (future) data, so its height is `null`.
 */
export const DEFAULT_ELEMENT_SIZES: Record<PaletteKind, ElementSize> = {
  text: { wMm: 40, hMm: 10 },
  image: { wMm: 40, hMm: 30 },
  line: { wMm: 40, hMm: 0 },
  rect: { wMm: 40, hMm: 25 },
  ellipse: { wMm: 40, hMm: 25 },
  dataTable: { wMm: 120, hMm: null },
};

/**
 * A neutral outline so a dropped shape is visible immediately — without it the
 * renderer paints no stroke and no fill, i.e. nothing ({@link resolveStroke} in
 * the renderer returns `null` when a shape declares no stroke). Stroke/fill
 * editing is E6-S2; this is just the starting value.
 */
const DEFAULT_SHAPE_STROKE: StrokeStyle = { color: '#1F2937', widthMm: 0.5, style: 'solid' };

/**
 * A tiny inline-SVG placeholder (a framed picture glyph) used as a dropped
 * image's source so the element is **valid and visible** before E6-S3 wires up
 * real upload/URL sourcing. It is a `data:image/svg+xml` URI, which the renderer's
 * image-URL sanitiser allows.
 */
export const PLACEHOLDER_IMAGE_SRC =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI2MCIgdmlld0JveD0iMCAwIDgwIDYwIj48cmVjdCB3aWR0aD0iODAiIGhlaWdodD0iNjAiIGZpbGw9IiNFMkU4RjAiLz48Y2lyY2xlIGN4PSIyMiIgY3k9IjIwIiByPSI4IiBmaWxsPSIjOTRBM0I4Ii8+PHBhdGggZD0iTTggNTIgTDMwIDMwIEw0NiA0NiBMNTggMzQgTDcyIDUyIFoiIGZpbGw9IiM5NEEzQjgiLz48L3N2Zz4=';

/**
 * Builds a schema-valid {@link TemplateElement} of `kind` at the given `frame`,
 * `id` and `z`, populated with sensible default props per type (brief §5):
 *
 *  - **text** — the literal `"Text"`, ready to edit (E6-S1);
 *  - **image** — the {@link PLACEHOLDER_IMAGE_SRC} placeholder, `fit: 'contain'`;
 *  - **line/rect/ellipse** — a shape with the {@link DEFAULT_SHAPE_STROKE} outline;
 *  - **dataTable** — a placeholder array binding and two starter columns, with the
 *    header repeating per page (data binding + column editing are E6).
 *
 * Each returned element passes `validateElement`; the factory is the single place
 * those defaults are defined, so the palette and canvas never diverge.
 */
export function createDefaultElement(
  kind: PaletteKind,
  id: string,
  frame: Frame,
  z: number,
): TemplateElement {
  const base = { id, frame, z } as const;
  switch (kind) {
    case 'text':
      return { ...base, type: 'text', text: 'Text' };
    case 'image':
      return { ...base, type: 'image', src: PLACEHOLDER_IMAGE_SRC, fit: 'contain' };
    case 'line':
    case 'rect':
    case 'ellipse':
      return { ...base, type: 'shape', shape: kind, style: { stroke: DEFAULT_SHAPE_STROKE } };
    case 'dataTable':
      return {
        ...base,
        type: 'dataTable',
        source: { arrayExpr: 'items' },
        columns: [
          { key: 'col1', header: 'Column 1', cell: { expr: '$.col1' }, widthMm: 60 },
          { key: 'col2', header: 'Column 2', cell: { expr: '$.col2' }, widthMm: 60 },
        ],
        repeatHeaderOnEachPage: true,
        keepTogether: false,
      };
  }
}

/**
 * The frame for an element dropped **at** `atMm`: the default footprint centred on
 * the drop point, then clamped so the whole element stays on the page sheet. A
 * growing element (`hMm: null`) is anchored by its top edge (there is no height to
 * centre) and only its top is clamped onto the page.
 */
export function frameForDrop(size: ElementSize, atMm: PointMm, pageMm: PageSizeMm): Frame {
  const { wMm, hMm } = size;
  const halfHMm = hMm === null ? 0 : hMm / 2;
  const xMm = clampRange(round1(atMm.xMm - wMm / 2), 0, Math.max(0, pageMm.widthMm - wMm));
  const maxYMm = hMm === null ? pageMm.heightMm : Math.max(0, pageMm.heightMm - hMm);
  const yMm = clampRange(round1(atMm.yMm - halfHMm), 0, maxYMm);
  return { xMm, yMm, wMm, hMm };
}

/** Cascade step (mm) between successive click-to-add elements, and how often it wraps. */
const CASCADE_STEP_MM = 6;
const CASCADE_WRAP = 6;

/**
 * The frame for an element added **without** a drop point (the keyboard / click
 * path): the default footprint centred on the page, nudged by a small diagonal
 * cascade keyed off `index` (the current element count) so repeated adds don't
 * stack exactly on top of each other. Clamped onto the page like {@link frameForDrop}.
 */
export function frameForDefault(size: ElementSize, pageMm: PageSizeMm, index: number): Frame {
  const { wMm, hMm } = size;
  const offsetMm = (index % CASCADE_WRAP) * CASCADE_STEP_MM;
  const baseXMm = (pageMm.widthMm - wMm) / 2 + offsetMm;
  const baseYMm = (pageMm.heightMm - (hMm ?? 0)) / 2 + offsetMm;
  const xMm = clampRange(round1(baseXMm), 0, Math.max(0, pageMm.widthMm - wMm));
  const maxYMm = hMm === null ? pageMm.heightMm : Math.max(0, pageMm.heightMm - hMm);
  const yMm = clampRange(round1(baseYMm), 0, maxYMm);
  return { xMm, yMm, wMm, hMm };
}

/** Rounds to 0.1 mm — enough precision for placement, tidy enough for the model. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Clamps `value` into the inclusive `[lo, hi]` range. */
function clampRange(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}
