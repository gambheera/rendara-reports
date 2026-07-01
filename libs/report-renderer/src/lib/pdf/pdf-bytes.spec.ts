import { describe, expect, it } from 'vitest';

import { measureTextWidthPt, PdfDocument } from './pdf-bytes';

/**
 * Unit tests for the dependency-free PDF byte writer (E8-S3). They assert the
 * writer emits a structurally valid PDF (header, objects, xref, trailer, EOF),
 * that text is **selectable vector** text (real `BT/Tj` content operators + a
 * standard font, never a raster image), and that the primitives, metadata,
 * alpha graphics state and escaping all serialise correctly and deterministically.
 */

/** Decodes the PDF bytes back to the Latin-1 string they were assembled from. */
function decode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('latin1');
}

describe('measureTextWidthPt', () => {
  it('is zero for the empty string and grows with length', () => {
    expect(measureTextWidthPt('', 10)).toBe(0);
    expect(measureTextWidthPt('WWWW', 10)).toBeGreaterThan(measureTextWidthPt('ii', 10));
  });

  it('scales linearly with the font size', () => {
    const at10 = measureTextWidthPt('Rendara', 10);
    const at20 = measureTextWidthPt('Rendara', 20);
    expect(at20).toBeCloseTo(at10 * 2, 6);
  });
});

describe('PdfDocument', () => {
  it('emits a valid PDF skeleton: header, xref, trailer, EOF', () => {
    const pdf = new PdfDocument();
    pdf.addPage(595, 842);
    const out = decode(pdf.toBytes());

    expect(out.startsWith('%PDF-1.4')).toBe(true);
    expect(out).toContain('/Type /Catalog');
    expect(out).toContain('/Type /Pages');
    expect(out).toContain('/Type /Page ');
    expect(out).toContain('/MediaBox [0 0 595 842]');
    expect(out).toContain('\nxref\n');
    expect(out).toContain('/Root 1 0 R');
    expect(out.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('reports the page count it has accumulated', () => {
    const pdf = new PdfDocument();
    expect(pdf.pageCount).toBe(0);
    pdf.addPage(100, 100);
    pdf.addPage(100, 100);
    expect(pdf.pageCount).toBe(2);
    // The Pages tree records the same count.
    expect(decode(pdf.toBytes())).toContain('/Count 2');
  });

  it('registers the four base-14 Helvetica fonts with WinAnsi encoding', () => {
    const pdf = new PdfDocument();
    pdf.addPage(100, 100);
    const out = decode(pdf.toBytes());
    for (const name of [
      'Helvetica',
      'Helvetica-Bold',
      'Helvetica-Oblique',
      'Helvetica-BoldOblique',
    ]) {
      expect(out).toContain(`/BaseFont /${name}`);
    }
    expect(out).toContain('/Encoding /WinAnsiEncoding');
  });

  it('writes text as selectable vector content (BT/Tj), not a raster image', () => {
    const pdf = new PdfDocument();
    const page = pdf.addPage(200, 200);
    page.text(10, 100, 'Hello Rendara');
    const out = decode(pdf.toBytes());

    expect(out).toContain('BT');
    expect(out).toContain('(Hello Rendara) Tj');
    // No image XObject — text stays vector/selectable.
    expect(out).not.toContain('/Subtype /Image');
  });

  it('escapes parentheses and backslashes in text literals', () => {
    const pdf = new PdfDocument();
    const page = pdf.addPage(200, 200);
    page.text(0, 0, 'a (b) \\ c');
    expect(decode(pdf.toBytes())).toContain('(a \\(b\\) \\\\ c) Tj');
  });

  it('selects the requested font by resource name', () => {
    const pdf = new PdfDocument();
    const page = pdf.addPage(200, 200);
    page.text(0, 10, 'plain', { font: 'Helvetica' });
    page.text(0, 30, 'bold', { font: 'Helvetica-Bold' });
    const out = decode(pdf.toBytes());
    expect(out).toContain('/F1');
    expect(out).toContain('/F2');
  });

  it('draws line, rect and ellipse primitives with stroke/fill operators', () => {
    const pdf = new PdfDocument();
    const page = pdf.addPage(200, 200);
    page.line(0, 0, 100, 0, { stroke: { r: 0, g: 0, b: 0 }, lineWidthPt: 2 });
    page.rect(10, 10, 50, 20, { fill: { r: 1, g: 0, b: 0 } });
    page.rect(10, 40, 50, 20, { stroke: { r: 0, g: 0, b: 1 }, fill: { r: 0, g: 1, b: 0 } });
    page.ellipse(100, 100, 40, 30, { stroke: { r: 0, g: 0, b: 0 } });
    const out = decode(pdf.toBytes());

    expect(out).toContain(' m\n');
    expect(out).toContain(' l\nS');
    expect(out).toContain(' re\nf'); // fill-only rect
    expect(out).toContain(' re\nB'); // stroke+fill rect
    expect(out).toContain(' c\n'); // ellipse bezier curves
  });

  it('honours a dash pattern for strokes', () => {
    const pdf = new PdfDocument();
    const page = pdf.addPage(100, 100);
    page.line(0, 0, 50, 0, { stroke: { r: 0, g: 0, b: 0 }, dash: [3, 2] });
    expect(decode(pdf.toBytes())).toContain('[3 2] 0 d');
  });

  it('skips primitives with no paint (no stroke and no fill)', () => {
    const pdf = new PdfDocument();
    const page = pdf.addPage(100, 100);
    page.rect(0, 0, 10, 10, {});
    page.line(0, 0, 10, 10, {});
    const out = decode(pdf.toBytes());
    expect(out).not.toContain(' re\n');
  });

  it('emits an ExtGState for constant alpha (watermark transparency)', () => {
    const pdf = new PdfDocument();
    const page = pdf.addPage(100, 100);
    page.text(10, 10, 'WATERMARK', { alpha: 0.15 });
    const out = decode(pdf.toBytes());
    expect(out).toContain('/Type /ExtGState');
    expect(out).toContain('/ca 0.15');
    expect(out).toContain(' gs\n');
  });

  it('writes the Info dictionary with the supplied metadata and a default producer', () => {
    const pdf = new PdfDocument({ title: 'Invoice INV-2042', author: 'Acme Corp' });
    pdf.addPage(100, 100);
    const out = decode(pdf.toBytes());
    expect(out).toContain('/Title (Invoice INV-2042)');
    expect(out).toContain('/Author (Acme Corp)');
    expect(out).toContain('/Producer (Rendara Reports)');
    expect(out).toContain('/Info ');
  });

  it('is deterministic: identical drawing yields identical bytes', () => {
    const build = (): Uint8Array => {
      const pdf = new PdfDocument({ title: 'X' });
      const page = pdf.addPage(200, 200);
      page.text(10, 10, 'Same');
      page.rect(0, 0, 5, 5, { fill: { r: 0.5, g: 0.5, b: 0.5 } });
      return pdf.toBytes();
    };
    expect(decode(build())).toBe(decode(build()));
  });
});
