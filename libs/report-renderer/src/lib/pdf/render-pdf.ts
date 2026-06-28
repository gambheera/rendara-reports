/**
 * Report → PDF renderer (E8-S3) — the high-level half of the viewer's
 * **client-side** PDF export, and the default behind the viewer's `PdfExporter`.
 *
 * It produces a **selectable, vector-text** PDF by walking the shared
 * {@link PageViewModel} — the *same* resolved geometry, content and style the
 * on-screen {@link ReportRenderer} paints — and driving the dependency-free
 * {@link PdfDocument} writer. Reusing the view-model (rather than re-deriving
 * layout) keeps the export true to WYSIWYG and free of a heavy PDF dependency, per
 * brief §7 and the viewer's bundle constraints (the viewer stays CDK-only).
 *
 * ## Fidelity scope (ADR 0012)
 * The default client-side path renders **text** (positioned, coloured, L/C/R
 * aligned, multi-line wrapped), **vector shapes** (line / rect / ellipse with
 * stroke + fill), **table grids + cell/label text**, page **backgrounds/box
 * fills + borders**, and a **text watermark**. It deliberately **omits images**
 * and pixel-exact typography (font metrics are approximated with Helvetica). For
 * pixel-perfect output use the viewer's **Print** path or a host-supplied
 * server-side `PdfExporter` (the documented Puppeteer route).
 *
 * Pure and deterministic: no DOM, no Angular, no `Date` — identical input bytes
 * out, so the export is snapshot-stable.
 */

import { DEFAULT_DPI, pxToPt } from '@rendara/report-engine';
import type { PaginatedDocument } from '@rendara/report-engine';
import type { RendaraTemplate } from '@rendara/report-schema';

import {
  buildPageViewModel,
  type ElementBoxView,
  type PageViewModel,
  type StyleMap,
  type TableView,
  type WatermarkView,
} from '../page-view-model';
import {
  measureTextWidthPt,
  PdfDocument,
  type PdfColor,
  type PdfDocInfo,
  type PdfFont,
} from './pdf-bytes';

/** PDF document metadata a host can configure for the export (`/Info` dictionary). */
export interface PdfMetadata {
  readonly title?: string;
  readonly author?: string;
  readonly subject?: string;
  readonly keywords?: string;
  readonly creator?: string;
}

/** Input for {@link renderDocumentToPdf}: the paginated document plus its content sources. */
export interface RenderDocumentToPdfInput {
  /** The paginated document to export (from the engine / viewer pipeline). */
  readonly document: PaginatedDocument;
  /** The validated template supplying each element's style + type-specific content. */
  readonly template: RendaraTemplate;
  /** Resolved binding display strings by element id (from the engine's resolver). */
  readonly resolvedValues?: ReadonlyMap<string, string>;
  /**
   * 1-based page numbers to include, in order. Out-of-range numbers are dropped
   * and duplicates collapsed. Omit to export every page.
   */
  readonly pages?: readonly number[];
  /** Stamp the document watermark (when one is configured). Defaults to `true`. */
  readonly includeWatermark?: boolean;
  /** Document `/Info` metadata. */
  readonly metadata?: PdfMetadata;
}

/** Result of {@link renderDocumentToPdf}: the PDF bytes and the page count written. */
export interface RenderedPdf {
  readonly bytes: Uint8Array;
  /** Number of pages actually written (after applying any page selection). */
  readonly pageCount: number;
}

/** Default text colour, matching the renderer's `--rdr-text-color` (#111827). */
const DEFAULT_TEXT_COLOR: PdfColor = { r: 0x11 / 255, g: 0x18 / 255, b: 0x27 / 255 };

/** Line-height multiple for wrapped text blocks (a reasonable default). */
const LINE_HEIGHT = 1.2;
/** Baseline drop from a line's top, as a fraction of the font size (Helvetica ascent). */
const ASCENT = 0.8;

/**
 * Renders a paginated document to a selectable-text PDF. See the module overview
 * for the fidelity scope; pure and deterministic.
 */
export function renderDocumentToPdf(input: RenderDocumentToPdfInput): RenderedPdf {
  const { document, template } = input;
  const resolvedValues = input.resolvedValues ?? new Map<string, string>();
  const includeWatermark = input.includeWatermark ?? true;
  const watermark = includeWatermark ? document.watermark : null;
  const dpi = document.geometry.dpi ?? DEFAULT_DPI;

  const selected = resolvePageSelection(input.pages, document.pageCount);

  const info: PdfDocInfo = {
    title: input.metadata?.title ?? template.metadata.name,
    author: input.metadata?.author,
    subject: input.metadata?.subject,
    keywords: input.metadata?.keywords,
    creator: input.metadata?.creator,
  };
  const pdf = new PdfDocument(info);

  for (const pageNumber of selected) {
    const page = document.pages[pageNumber - 1];
    const vm = buildPageViewModel(page, document.geometry, {
      template,
      resolvedValues,
      watermark,
      zoom: 1,
    });
    writePage(pdf, vm, dpi);
  }

  return { bytes: pdf.toBytes(), pageCount: pdf.pageCount };
}

/** Normalises a 1-based page selection into a valid, de-duplicated, ordered list. */
function resolvePageSelection(
  pages: readonly number[] | undefined,
  total: number,
): readonly number[] {
  if (pages === undefined) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const seen = new Set<number>();
  const out: number[] = [];
  for (const n of pages) {
    if (Number.isInteger(n) && n >= 1 && n <= total && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

/** A painter scoped to one PDF page, holding the px→pt + y-flip conversions. */
interface PageContext {
  readonly page: ReturnType<PdfDocument['addPage']>;
  readonly dpi: number;
  /** Page height in points (for the y-flip). */
  readonly heightPt: number;
}

/** Writes one page view-model onto a fresh PDF page. */
function writePage(pdf: PdfDocument, vm: PageViewModel, dpi: number): void {
  const widthPt = pxToPt(vm.sheet.widthPx, dpi);
  const heightPt = pxToPt(vm.sheet.heightPx, dpi);
  const ctx: PageContext = { page: pdf.addPage(widthPt, heightPt), dpi, heightPt };

  // Page background (skip plain white, the default paper).
  const bg = parseColor(vm.background);
  if (bg && !isWhite(bg)) {
    ctx.page.rect(0, 0, widthPt, heightPt, { fill: bg });
  }

  // Watermark sits behind the content.
  if (vm.watermark) {
    writeWatermark(ctx, vm, vm.watermark);
  }

  for (const box of vm.elements) {
    writeElement(ctx, box);
  }
  for (const table of vm.tables) {
    writeTable(ctx, table);
  }
}

/** Paints one fixed element box: its decoration then its text/shape content. */
function writeElement(ctx: PageContext, box: ElementBoxView): void {
  const heightPx = box.heightPx ?? 0;
  writeBoxDecoration(ctx, box.boxStyle, box.leftPx, box.topPx, box.widthPx, heightPx);

  const content = box.content;
  if (content.kind === 'text') {
    writeTextBlock(ctx, content.text, content.textStyle, box.boxStyle, {
      leftPx: box.leftPx,
      topPx: box.topPx,
      widthPx: box.widthPx,
      heightPx,
    });
  } else if (content.kind === 'shape') {
    writeShape(ctx, content, box.leftPx, box.topPx);
  }
  // Images are intentionally not painted on the default client-side path (ADR 0012).
}

/** Paints a data-table slice: per-row decoration, then cell and band-label text. */
function writeTable(ctx: PageContext, table: TableView): void {
  for (const row of table.rows) {
    const rowTop = table.topPx + row.topPx;
    writeBoxDecoration(ctx, row.rowStyle, table.leftPx, rowTop, row.widthPx, row.heightPx);

    if (row.label) {
      writeTextBlock(ctx, row.label.text, row.label.labelStyle, row.label.labelStyle, {
        leftPx: table.leftPx,
        topPx: rowTop,
        widthPx: row.widthPx,
        heightPx: row.heightPx,
      });
    }
    for (const cell of row.cells) {
      writeTextBlock(ctx, cell.text, cell.cellStyle, cell.cellStyle, {
        leftPx: table.leftPx + cell.leftPx,
        topPx: rowTop,
        widthPx: cell.widthPx,
        heightPx: row.heightPx,
      });
    }
  }
}

/** The page-absolute box (px) a text/decoration call positions against. */
interface BoxPx {
  readonly leftPx: number;
  readonly topPx: number;
  readonly widthPx: number;
  readonly heightPx: number;
}

/** Paints a box's background fill and any per-side borders from its style map. */
function writeBoxDecoration(
  ctx: PageContext,
  style: StyleMap,
  leftPx: number,
  topPx: number,
  widthPx: number,
  heightPx: number,
): void {
  const { dpi, heightPt } = ctx;
  const fill = parseColor(style['background']);
  if (fill) {
    const x = pxToPt(leftPx, dpi);
    const y = heightPt - pxToPt(topPx + heightPx, dpi);
    ctx.page.rect(x, y, pxToPt(widthPx, dpi), pxToPt(heightPx, dpi), { fill });
  }

  const x0 = pxToPt(leftPx, dpi);
  const x1 = pxToPt(leftPx + widthPx, dpi);
  const yTop = heightPt - pxToPt(topPx, dpi);
  const yBottom = heightPt - pxToPt(topPx + heightPx, dpi);
  const top = parseBorder(style['border-top'], dpi);
  if (top) {
    ctx.page.line(x0, yTop, x1, yTop, { stroke: top.color, lineWidthPt: top.widthPt });
  }
  const bottom = parseBorder(style['border-bottom'], dpi);
  if (bottom) {
    ctx.page.line(x0, yBottom, x1, yBottom, { stroke: bottom.color, lineWidthPt: bottom.widthPt });
  }
  const left = parseBorder(style['border-left'], dpi);
  if (left) {
    ctx.page.line(x0, yTop, x0, yBottom, { stroke: left.color, lineWidthPt: left.widthPt });
  }
  const right = parseBorder(style['border-right'], dpi);
  if (right) {
    ctx.page.line(x1, yTop, x1, yBottom, { stroke: right.color, lineWidthPt: right.widthPt });
  }
}

/** Paints a vector shape (line / rect / ellipse) at its box's page-absolute origin. */
function writeShape(
  ctx: PageContext,
  content: Extract<ElementBoxView['content'], { kind: 'shape' }>,
  leftPx: number,
  topPx: number,
): void {
  const { dpi, heightPt } = ctx;
  const stroke = content.stroke
    ? { color: parseColor(content.stroke.color) ?? { r: 0, g: 0, b: 0 } }
    : null;
  const lineWidthPt = content.stroke ? pxToPt(content.stroke.widthPx, dpi) : undefined;
  const fill = parseColor(content.fill);
  const dash = content.stroke?.dashArray ? parseDash(content.stroke.dashArray, dpi) : undefined;

  if (content.line) {
    if (!stroke) {
      return;
    }
    const { x1, y1, x2, y2 } = content.line;
    ctx.page.line(
      pxToPt(leftPx + x1, dpi),
      heightPt - pxToPt(topPx + y1, dpi),
      pxToPt(leftPx + x2, dpi),
      heightPt - pxToPt(topPx + y2, dpi),
      { stroke: stroke.color, lineWidthPt, dash },
    );
  } else if (content.rect) {
    const { x, y, width, height } = content.rect;
    ctx.page.rect(
      pxToPt(leftPx + x, dpi),
      heightPt - pxToPt(topPx + y + height, dpi),
      pxToPt(width, dpi),
      pxToPt(height, dpi),
      { stroke: stroke?.color, fill: fill ?? undefined, lineWidthPt, dash },
    );
  } else if (content.ellipse) {
    const { cx, cy, rx, ry } = content.ellipse;
    ctx.page.ellipse(
      pxToPt(leftPx + cx - rx, dpi),
      heightPt - pxToPt(topPx + cy + ry, dpi),
      pxToPt(rx * 2, dpi),
      pxToPt(ry * 2, dpi),
      { stroke: stroke?.color, fill: fill ?? undefined, lineWidthPt, dash },
    );
  }
}

/**
 * Paints a (possibly multi-line, wrapped) block of text inside `box`, honouring
 * the run's font/colour/horizontal-alignment (from `runStyle`) and the box's
 * padding + vertical alignment (from `boxStyle`).
 */
function writeTextBlock(
  ctx: PageContext,
  text: string,
  runStyle: StyleMap,
  boxStyle: StyleMap,
  box: BoxPx,
): void {
  if (text.length === 0) {
    return;
  }
  const { dpi, heightPt } = ctx;
  const sizePt = pxToPt(parsePx(runStyle['font-size'], pxToPtInverse(10, dpi)), dpi);
  const color = parseColor(runStyle['color']) ?? DEFAULT_TEXT_COLOR;
  const font = resolveFont(runStyle);
  const align = runStyle['text-align'] ?? 'left';

  const padLeft = pxToPt(parsePx(boxStyle['padding-left'], 0), dpi);
  const padRight = pxToPt(parsePx(boxStyle['padding-right'], 0), dpi);
  const padTop = pxToPt(parsePx(boxStyle['padding-top'], 0), dpi);
  const padBottom = pxToPt(parsePx(boxStyle['padding-bottom'], 0), dpi);

  const boxLeftPt = pxToPt(box.leftPx, dpi);
  const boxTopPt = pxToPt(box.topPx, dpi);
  const boxWidthPt = pxToPt(box.widthPx, dpi);
  const boxHeightPt = pxToPt(box.heightPx, dpi);

  const innerLeft = boxLeftPt + padLeft;
  const innerWidth = Math.max(0, boxWidthPt - padLeft - padRight);
  const innerHeight = Math.max(0, boxHeightPt - padTop - padBottom);

  const lines = wrapText(text, innerWidth, sizePt);
  const lineHeight = sizePt * LINE_HEIGHT;
  const blockHeight = lines.length * lineHeight;

  // Vertical alignment from the box's flex `justify-content` (set by the renderer).
  const justify = boxStyle['justify-content'];
  let vOffset = 0;
  if (justify === 'center') {
    vOffset = Math.max(0, (innerHeight - blockHeight) / 2);
  } else if (justify === 'flex-end') {
    vOffset = Math.max(0, innerHeight - blockHeight);
  }

  lines.forEach((line, i) => {
    const lineWidth = measureTextWidthPt(line, sizePt);
    let x = innerLeft;
    if (align === 'right') {
      x = innerLeft + innerWidth - lineWidth;
    } else if (align === 'center') {
      x = innerLeft + (innerWidth - lineWidth) / 2;
    }
    const lineTop = padTop + vOffset + i * lineHeight;
    const baselineY = heightPt - boxTopPt - lineTop - sizePt * ASCENT;
    ctx.page.text(x, baselineY, line, { font, sizePt, color });
  });
}

/** Wraps `text` to `maxWidthPt`, honouring explicit newlines; greedy by word. */
function wrapText(text: string, maxWidthPt: number, sizePt: number): readonly string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (maxWidthPt <= 0) {
      out.push(paragraph);
      continue;
    }
    const words = paragraph.split(/(\s+)/).filter((w) => w.length > 0);
    let current = '';
    for (const word of words) {
      const candidate = current + word;
      if (current !== '' && measureTextWidthPt(candidate.trimEnd(), sizePt) > maxWidthPt) {
        out.push(current.trimEnd());
        current = word.trimStart();
      } else {
        current = candidate;
      }
    }
    out.push(current.trimEnd());
  }
  return out;
}

/** Maps a text run's weight/style to the matching Helvetica variant. */
function resolveFont(style: StyleMap): PdfFont {
  const weight = style['font-weight'];
  const bold = weight === 'bold' || (weight !== undefined && Number(weight) >= 600);
  const italic = style['font-style'] === 'italic';
  if (bold && italic) {
    return 'Helvetica-BoldOblique';
  }
  if (bold) {
    return 'Helvetica-Bold';
  }
  if (italic) {
    return 'Helvetica-Oblique';
  }
  return 'Helvetica';
}

/** Paints the page watermark: a single rotated, centred, semi-transparent caption. */
function writeWatermark(ctx: PageContext, vm: PageViewModel, wm: WatermarkView): void {
  if (wm.kind !== 'text' || !wm.text) {
    // Image watermarks are not painted on the default client-side path (ADR 0012).
    return;
  }
  const { dpi, heightPt } = ctx;
  const sizePt = pxToPt(parsePx(wm.innerStyle['font-size'], pxToPtInverse(72, dpi)), dpi);
  const color = parseColor(wm.innerStyle['color']) ?? { r: 0.6, g: 0.6, b: 0.6 };
  const alpha = clamp01(parseFloat(wm.layerStyle['opacity'] ?? '1'));
  const angle = parseRotateDeg(wm.innerStyle['transform']);

  const widthPt = measureTextWidthPt(wm.text, sizePt);
  const cx = pxToPt(vm.sheet.widthPx / 2, dpi);
  const cy = heightPt - pxToPt(vm.sheet.heightPx / 2, dpi);

  // Offset of the caption's visual centre from its baseline origin, then rotated,
  // so the centre lands on the page centre.
  const midX = widthPt / 2;
  const midY = sizePt * 0.3;
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rx = cos * midX - sin * midY;
  const ry = sin * midX + cos * midY;

  ctx.page.text(cx - rx, cy - ry, wm.text, {
    sizePt,
    color,
    alpha,
    rotateDeg: angle,
    font: 'Helvetica-Bold',
  });
}

// ---------------------------------------------------------------------------
// Small CSS-value parsers — the view-model emits a handful of CSS values
// (px lengths, colours, `border` shorthands, `rotate()` transforms) that the PDF
// space needs back as numbers/colours. These cover exactly what the renderer
// produces; anything unrecognised degrades gracefully (skip / default).
// ---------------------------------------------------------------------------

/** Parses a `<n>px` (or bare number) string to px; `fallback` when absent/NaN. */
function parsePx(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Inverts {@link pxToPt} so a pt fallback can be expressed in px for {@link parsePx}. */
function pxToPtInverse(pt: number, dpi: number): number {
  return (pt / 72) * dpi;
}

/** Parses a `border-<side>` shorthand (`"1px solid #334155"`) to width-pt + colour. */
function parseBorder(
  value: string | undefined,
  dpi: number,
): { readonly widthPt: number; readonly color: PdfColor } | null {
  if (!value) {
    return null;
  }
  const widthMatch = /(-?[\d.]+)px/.exec(value);
  const widthPx = widthMatch ? parseFloat(widthMatch[1]) : 1;
  if (!(widthPx > 0)) {
    return null;
  }
  const color = parseColor(value);
  if (!color) {
    return null;
  }
  return { widthPt: pxToPt(widthPx, dpi), color };
}

/** Parses a `[a, b]`-style SVG dash string (in px) to a pt dash array. */
function parseDash(value: string, dpi: number): readonly number[] | undefined {
  const parts = value
    .split(/[\s,]+/)
    .map((p) => parseFloat(p))
    .filter((n) => Number.isFinite(n));
  if (parts.length === 0) {
    return undefined;
  }
  return parts.map((px) => pxToPt(px, dpi));
}

/** Extracts the degrees from a `rotate(<deg>deg)` transform; `0` when absent. */
function parseRotateDeg(transform: string | undefined): number {
  if (!transform) {
    return 0;
  }
  const match = /rotate\(\s*(-?[\d.]+)deg\s*\)/.exec(transform);
  return match ? parseFloat(match[1]) : 0;
}

/** A handful of named colours the design tokens / templates use. */
const NAMED_COLORS: Readonly<Record<string, PdfColor>> = {
  black: { r: 0, g: 0, b: 0 },
  white: { r: 1, g: 1, b: 1 },
  transparent: { r: 1, g: 1, b: 1 },
};

/**
 * Parses a CSS colour to device-RGB, or `null` when there is none/unrecognised.
 * Handles `var(--token, <fallback>)` (uses the fallback), `#rgb`/`#rrggbb`,
 * `rgb()`/`rgba()`, and a few named colours.
 */
function parseColor(value: string | null | undefined): PdfColor | null {
  if (!value) {
    return null;
  }
  let css = value.trim();

  // Unwrap `var(--token, fallback)` → fallback (the renderer always supplies one).
  const varMatch = /^var\(\s*--[\w-]+\s*,\s*(.+)\)$/.exec(css);
  if (varMatch) {
    css = varMatch[1].trim();
  }

  if (css.startsWith('#')) {
    return parseHex(css);
  }
  const rgbMatch = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(css);
  if (rgbMatch) {
    return {
      r: clamp01(parseFloat(rgbMatch[1]) / 255),
      g: clamp01(parseFloat(rgbMatch[2]) / 255),
      b: clamp01(parseFloat(rgbMatch[3]) / 255),
    };
  }
  // A `border` shorthand may carry the colour as its last token.
  const tokens = css.split(/\s+/);
  const last = tokens[tokens.length - 1]?.toLowerCase();
  if (last && last.startsWith('#')) {
    return parseHex(last);
  }
  return NAMED_COLORS[css.toLowerCase()] ?? (last ? (NAMED_COLORS[last] ?? null) : null);
}

/** Parses `#rgb` / `#rrggbb` to device-RGB; `null` when malformed. */
function parseHex(hex: string): PdfColor | null {
  let h = hex.slice(1);
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) {
    return null;
  }
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

function isWhite(color: PdfColor): boolean {
  return color.r === 1 && color.g === 1 && color.b === 1;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) {
    return 1;
  }
  return Math.min(1, Math.max(0, n));
}
