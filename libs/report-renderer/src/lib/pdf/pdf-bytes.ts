/**
 * A tiny, **dependency-free** PDF byte writer (E8-S3) — the low-level half of the
 * viewer's client-side PDF export. It writes a minimal but valid PDF 1.4 document
 * with **selectable, vector text** using the standard base-14 Helvetica family
 * (no font embedding, no rasterisation), plus vector line/rectangle/ellipse
 * primitives and page-level constant alpha for the watermark.
 *
 * It is intentionally generic: it knows nothing about reports. The
 * {@link renderDocumentToPdf} layer walks the shared {@link PageViewModel} (the
 * *same* resolved geometry/content/style the on-screen renderer paints) and drives
 * this writer, so the export reuses the renderer's single source of truth rather
 * than re-deriving layout (brief §7).
 *
 * ## Coordinate system
 * PDF user space has its **origin at the bottom-left** with **y pointing up**, in
 * **points** (1/72 inch). The caller converts the engine's top-left px space into
 * this space; this writer takes coordinates already in PDF points.
 *
 * ## Determinism
 * No `Date`, randomness, or locale: identical input bytes out, so the export is
 * snapshot-stable (the renderer's testing discipline, ADR 0001). Bytes are
 * assembled as a Latin-1 string (one char = one byte) so offsets equal string
 * lengths, then emitted as a `Uint8Array`.
 */

/** A colour in PDF device-RGB, each channel in `[0, 1]`. */
export interface PdfColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** The base-14 Helvetica variants this writer registers (no embedding needed). */
export type PdfFont =
  | 'Helvetica'
  | 'Helvetica-Bold'
  | 'Helvetica-Oblique'
  | 'Helvetica-BoldOblique';

/** Document information dictionary (PDF `/Info`) — all fields optional. */
export interface PdfDocInfo {
  readonly title?: string;
  readonly author?: string;
  readonly subject?: string;
  readonly keywords?: string;
  readonly creator?: string;
  readonly producer?: string;
}

/** Options for a run of text drawn at a baseline point. */
export interface PdfTextRun {
  readonly font?: PdfFont;
  readonly sizePt?: number;
  readonly color?: PdfColor;
  /** Constant fill alpha in `[0, 1]` (used by the watermark); defaults to 1. */
  readonly alpha?: number;
  /** Clockwise rotation in degrees about the baseline point (watermark); default 0. */
  readonly rotateDeg?: number;
}

/** Options for a stroked/filled vector primitive. */
export interface PdfShapeStyle {
  /** Stroke colour; omit for no stroke. */
  readonly stroke?: PdfColor;
  /** Stroke width in points (default 1). */
  readonly lineWidthPt?: number;
  /** Fill colour; omit for no fill. */
  readonly fill?: PdfColor;
  /** Dash pattern in points (e.g. `[3, 2]`); omit/empty for a solid line. */
  readonly dash?: readonly number[];
}

const FONT_NAMES: readonly PdfFont[] = [
  'Helvetica',
  'Helvetica-Bold',
  'Helvetica-Oblique',
  'Helvetica-BoldOblique',
];

/**
 * Helvetica glyph advance widths (per 1000 units of em) for printable ASCII
 * `0x20`–`0x7E`, indexed by `code − 32`. Used to estimate text width for
 * right/centre alignment and watermark centring. The bold/oblique variants reuse
 * these (close enough for alignment; the default client-side path is documented
 * as approximate — ADR 0012). Codes outside this range default to `500`.
 */
const HELVETICA_WIDTHS: readonly number[] = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

/** Estimated width, in points, of `text` at `sizePt` in Helvetica. */
export function measureTextWidthPt(text: string, sizePt: number): number {
  let units = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    units += code >= 32 && code <= 126 ? HELVETICA_WIDTHS[code - 32] : 500;
  }
  return (units / 1000) * sizePt;
}

/** Formats a number for a PDF content stream: up to 3 dp, no trailing zeros, no `-0`. */
function num(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }
  const rounded = Math.round(value * 1000) / 1000;
  const normalised = Object.is(rounded, -0) ? 0 : rounded;
  return String(normalised);
}

/**
 * Common Unicode punctuation → its WinAnsi (CP1252) byte, so smart quotes, em/en
 * dashes, the ellipsis, bullet and a few symbols render correctly rather than
 * degrading to `?`. Chars in U+00A0–U+00FF already match their Latin-1 byte and
 * need no mapping.
 */
const WINANSI_PUNCT: Readonly<Record<number, number>> = {
  0x20ac: 0x80, // €
  0x201a: 0x82, // ‚
  0x0192: 0x83, // ƒ
  0x201e: 0x84, // „
  0x2026: 0x85, // …
  0x2020: 0x86, // †
  0x2021: 0x87, // ‡
  0x2030: 0x89, // ‰
  0x2039: 0x8b, // ‹
  0x0152: 0x8c, // Œ
  0x2018: 0x91, // ‘
  0x2019: 0x92, // ’
  0x201c: 0x93, // “
  0x201d: 0x94, // ”
  0x2022: 0x95, // •
  0x2013: 0x96, // –
  0x2014: 0x97, // —
  0x2122: 0x99, // ™
  0x203a: 0x9b, // ›
  0x0153: 0x9c, // œ
};

/** Escapes a string for a PDF literal `(...)`, encoding to WinAnsi (`?` for out-of-range). */
function escapeText(text: string): string {
  let out = '';
  for (const ch of text) {
    if (ch === '\\' || ch === '(' || ch === ')') {
      out += '\\' + ch;
      continue;
    }
    let code = ch.charCodeAt(0);
    code = WINANSI_PUNCT[code] ?? code;
    if (code === 0x09) {
      out += '\\t';
    } else if (code < 0x20 || code > 0xff) {
      out += '?';
    } else {
      out += String.fromCharCode(code);
    }
  }
  return out;
}

function colorOp(color: PdfColor, kind: 'fill' | 'stroke'): string {
  const op = kind === 'fill' ? 'rg' : 'RG';
  return `${num(color.r)} ${num(color.g)} ${num(color.b)} ${op}\n`;
}

/** One page being assembled: its size and accumulated content-stream operators. */
class PdfPageBuilder {
  private ops = '';

  constructor(
    readonly widthPt: number,
    readonly heightPt: number,
    private readonly registerAlpha: (alpha: number) => string,
  ) {}

  /** Draws a run of (selectable) text with its baseline at `(xPt, yPt)`. */
  text(xPt: number, yPt: number, text: string, run: PdfTextRun = {}): void {
    if (text.length === 0) {
      return;
    }
    const font = run.font ?? 'Helvetica';
    const size = run.sizePt ?? 10;
    const fontIndex = Math.max(0, FONT_NAMES.indexOf(font));
    this.ops += 'q\n';
    if (run.alpha !== undefined && run.alpha < 1) {
      this.ops += `${this.registerAlpha(run.alpha)} gs\n`;
    }
    this.ops += colorOp(run.color ?? { r: 0, g: 0, b: 0 }, 'fill');
    this.ops += 'BT\n';
    this.ops += `/F${fontIndex + 1} ${num(size)} Tf\n`;
    const angle = run.rotateDeg ?? 0;
    if (angle !== 0) {
      const rad = (angle * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      // Rotated text matrix about the baseline point.
      this.ops += `${num(cos)} ${num(sin)} ${num(-sin)} ${num(cos)} ${num(xPt)} ${num(yPt)} Tm\n`;
    } else {
      this.ops += `1 0 0 1 ${num(xPt)} ${num(yPt)} Tm\n`;
    }
    this.ops += `(${escapeText(text)}) Tj\n`;
    this.ops += 'ET\n';
    this.ops += 'Q\n';
  }

  /** Draws a straight line between two points. */
  line(x1: number, y1: number, x2: number, y2: number, style: PdfShapeStyle): void {
    if (!style.stroke) {
      return;
    }
    this.ops += 'q\n';
    this.ops += colorOp(style.stroke, 'stroke');
    this.ops += `${num(style.lineWidthPt ?? 1)} w\n`;
    this.ops += this.dashOp(style.dash);
    this.ops += `${num(x1)} ${num(y1)} m\n${num(x2)} ${num(y2)} l\nS\n`;
    this.ops += 'Q\n';
  }

  /** Draws an axis-aligned rectangle with its bottom-left at `(xPt, yPt)`. */
  rect(xPt: number, yPt: number, wPt: number, hPt: number, style: PdfShapeStyle): void {
    const paint = this.paintOp(style);
    if (paint === null) {
      return;
    }
    this.ops += 'q\n';
    this.applyPaintStyle(style);
    this.ops += `${num(xPt)} ${num(yPt)} ${num(wPt)} ${num(hPt)} re\n${paint}\n`;
    this.ops += 'Q\n';
  }

  /** Draws an ellipse inscribed in the box `(xPt, yPt, wPt, hPt)` (bottom-left origin). */
  ellipse(xPt: number, yPt: number, wPt: number, hPt: number, style: PdfShapeStyle): void {
    const paint = this.paintOp(style);
    if (paint === null) {
      return;
    }
    const cx = xPt + wPt / 2;
    const cy = yPt + hPt / 2;
    const rx = wPt / 2;
    const ry = hPt / 2;
    const k = 0.5522847498; // 4/3 * (sqrt(2) - 1): cubic-bezier circle constant.
    const ox = rx * k;
    const oy = ry * k;
    this.ops += 'q\n';
    this.applyPaintStyle(style);
    this.ops += `${num(cx + rx)} ${num(cy)} m\n`;
    this.ops += `${num(cx + rx)} ${num(cy + oy)} ${num(cx + ox)} ${num(cy + ry)} ${num(cx)} ${num(cy + ry)} c\n`;
    this.ops += `${num(cx - ox)} ${num(cy + ry)} ${num(cx - rx)} ${num(cy + oy)} ${num(cx - rx)} ${num(cy)} c\n`;
    this.ops += `${num(cx - rx)} ${num(cy - oy)} ${num(cx - ox)} ${num(cy - ry)} ${num(cx)} ${num(cy - ry)} c\n`;
    this.ops += `${num(cx + ox)} ${num(cy - ry)} ${num(cx + rx)} ${num(cy - oy)} ${num(cx + rx)} ${num(cy)} c\n`;
    this.ops += `${paint}\n`;
    this.ops += 'Q\n';
  }

  /** The accumulated content stream. */
  get content(): string {
    return this.ops;
  }

  private applyPaintStyle(style: PdfShapeStyle): void {
    if (style.fill) {
      this.ops += colorOp(style.fill, 'fill');
    }
    if (style.stroke) {
      this.ops += colorOp(style.stroke, 'stroke');
      this.ops += `${num(style.lineWidthPt ?? 1)} w\n`;
      this.ops += this.dashOp(style.dash);
    }
  }

  /** The path-painting operator for a style: fill (`f`), stroke (`S`), both (`B`), or `null`. */
  private paintOp(style: PdfShapeStyle): string | null {
    if (style.fill && style.stroke) {
      return 'B';
    }
    if (style.fill) {
      return 'f';
    }
    if (style.stroke) {
      return 'S';
    }
    return null;
  }

  private dashOp(dash: readonly number[] | undefined): string {
    if (dash && dash.length > 0) {
      return `[${dash.map(num).join(' ')}] 0 d\n`;
    }
    return '[] 0 d\n';
  }
}

/**
 * Accumulates pages and serialises a complete, valid PDF document. Register pages
 * with {@link addPage}, paint via the returned {@link PdfPageBuilder}, then call
 * {@link toBytes}.
 */
export class PdfDocument {
  private readonly pages: PdfPageBuilder[] = [];
  private readonly alphas = new Map<number, string>();

  constructor(private readonly info: PdfDocInfo = {}) {}

  /** Adds a page of the given size (points) and returns its painter. */
  addPage(widthPt: number, heightPt: number): PdfPageBuilder {
    const page = new PdfPageBuilder(widthPt, heightPt, (alpha) => this.alphaName(alpha));
    this.pages.push(page);
    return page;
  }

  /** Number of pages added so far. */
  get pageCount(): number {
    return this.pages.length;
  }

  /** Serialises the document to PDF bytes. */
  toBytes(): Uint8Array {
    // Object layout: 1 Catalog, 2 Pages, 3..6 Fonts, then per page [Page, Content],
    // then ExtGState objects, then Info.
    const fontStart = 3;
    const pageObjStart = fontStart + FONT_NAMES.length;
    const objects: string[] = [];

    // Reserve catalog/pages/fonts.
    objects.push(`<< /Type /Catalog /Pages 2 0 R >>`);
    const pageRefs = this.pages.map((_, i) => `${pageObjStart + i * 2} 0 R`).join(' ');
    objects.push(`<< /Type /Pages /Kids [${pageRefs}] /Count ${this.pages.length} >>`);
    for (const name of FONT_NAMES) {
      objects.push(
        `<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding >>`,
      );
    }

    const extGStateObjNo = pageObjStart + this.pages.length * 2;
    const alphaEntries = [...this.alphas.entries()];
    const extGStateDict =
      alphaEntries.length > 0
        ? ` /ExtGState << ${alphaEntries
            .map(([, name], i) => `/${name} ${extGStateObjNo + i} 0 R`)
            .join(' ')} >>`
        : '';
    const fontDict = FONT_NAMES.map((_, i) => `/F${i + 1} ${fontStart + i} 0 R`).join(' ');
    const resources = `<< /Font << ${fontDict} >>${extGStateDict} >>`;

    // Page + content objects.
    this.pages.forEach((page, i) => {
      const contentObjNo = pageObjStart + i * 2 + 1;
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(page.widthPt)} ${num(
          page.heightPt,
        )}] /Resources ${resources} /Contents ${contentObjNo} 0 R >>`,
      );
      const stream = page.content;
      objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    });

    // ExtGState objects for each distinct alpha.
    for (const [alpha] of alphaEntries) {
      objects.push(`<< /Type /ExtGState /ca ${num(alpha)} /CA ${num(alpha)} >>`);
    }

    // Info dictionary.
    const infoObjNo = extGStateObjNo + alphaEntries.length;
    objects.push(this.infoDict());

    return this.assemble(objects, infoObjNo);
  }

  /** Registers (once) a constant-alpha graphics state and returns its resource name. */
  private alphaName(alpha: number): string {
    const existing = this.alphas.get(alpha);
    if (existing) {
      return existing;
    }
    const name = `GSa${this.alphas.size}`;
    this.alphas.set(alpha, name);
    return name;
  }

  private infoDict(): string {
    const fields: string[] = [];
    const add = (key: string, value: string | undefined): void => {
      if (value) {
        fields.push(`/${key} (${escapeText(value)})`);
      }
    };
    add('Title', this.info.title);
    add('Author', this.info.author);
    add('Subject', this.info.subject);
    add('Keywords', this.info.keywords);
    add('Creator', this.info.creator);
    add('Producer', this.info.producer ?? 'Rendara Reports');
    return `<< ${fields.join(' ')} >>`;
  }

  /** Stitches the object bodies into a cross-referenced PDF file. */
  private assemble(objects: string[], infoObjNo: number): Uint8Array {
    const header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    let body = header;
    const offsets: number[] = [];
    objects.forEach((obj, i) => {
      offsets.push(body.length);
      body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
    });

    const xrefOffset = body.length;
    const count = objects.length + 1; // +1 for the free object 0.
    let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
    for (const offset of offsets) {
      xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
    }
    const trailer = `trailer\n<< /Size ${count} /Root 1 0 R /Info ${infoObjNo} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

    const full = body + xref + trailer;
    return Uint8Array.from(full, (ch) => ch.charCodeAt(0) & 0xff);
  }
}
