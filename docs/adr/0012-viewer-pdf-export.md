# ADR 0012 — Viewer PDF export: a dependency-free, selectable-text writer behind a swappable `PdfExporter`

- **Status:** Accepted
- **Date:** 2026-06-26
- **Story:** E8-S3 · Export PDF

## Context

The viewer's Export PDF action must "define a `PdfExporter` interface with a
default client-side implementation, and document an optional server-side
Puppeteer/Playwright path" (brief §7/§8). The brief is decisive about the default:
keep text **vector and selectable**, and *avoid* the rasterising
`html2canvas`+`jsPDF` route as the primary path. Two hard constraints pull
against a heavyweight solution:

- The viewer is a **publishable package** that must stay **UI-kit-light** (CDK +
  scoped CSS only) with a **bundle budget** — it cannot pull in a large PDF
  library or a font-embedding toolchain.
- The export must be **WYSIWYG** with the on-screen render and the print path
  (brief §7's "one renderer"), and **testable** (story QA: generated page count =
  report page count; text selectable; exporter swappable).

Print (E8-S2) already gives crisp, native, vector output via `window.print()`, but
it cannot set a filename/metadata, select a page range, or produce a downloadable
file programmatically — which is exactly what Export PDF owes.

## Decision

1. **Ship a tiny, dependency-free PDF writer in `report-renderer`.**
   `lib/pdf/pdf-bytes.ts` emits a valid PDF 1.4 file (objects, xref, trailer)
   with **selectable text** using the base-14 **Helvetica** family (no
   embedding), plus vector line/rect/ellipse primitives, WinAnsi text encoding,
   `/Info` metadata, and constant-alpha graphics state for the watermark.

2. **Render by walking the shared `PageViewModel`, not by re-deriving layout.**
   `lib/pdf/render-pdf.ts` (`renderDocumentToPdf`) builds the *same*
   `buildPageViewModel` the on-screen renderer and the headless serializer use,
   then maps its resolved geometry/content/style into PDF operators. The export
   reuses the single layout→style→content source of truth (brief §7), so it stays
   true to WYSIWYG and inherits the engine's px→pt unit conversions. It lives in
   the **renderer** (not the engine) because that is where the view-model lives —
   the engine may not depend on the renderer (Nx boundaries).

3. **Expose a swappable `PdfExporter` in the viewer's public API.** The viewer
   ships `defaultPdfExporter` (renders client-side via `renderDocumentToPdf`, then
   downloads the `Blob`), and a host can replace it via `config.pdfExporter` —
   e.g. one that POSTs the `PdfExportRequest` to a **server-side
   Puppeteer/Playwright** route for pixel-perfect/batch output. Filename and
   `/Info` metadata are configurable on the request.

4. **Scope the default path's fidelity, and document the limits.** The default
   renders text (positioned, coloured, L/C/R aligned, multi-line wrapped),
   vector shapes, table grids + cell/label text, box fills/borders, and a **text**
   watermark. It deliberately **omits images** and approximates typography
   (Helvetica metrics for every family). For pixel-perfect output, use **Print**
   or a server-side exporter.

## Consequences

- **+** Selectable, vector text with **zero new runtime dependencies** and no
  bundle hit — the writer is a few hundred lines of pure TS.
- **+** Pure and deterministic (no DOM, no `Date`): unit-tested for page count,
  selectable-text operators, watermark, metadata and byte-stability.
- **+** Swappable by design: hosts get a working client-side default *and* a clean
  seam for a server-side pixel-perfect path, satisfying brief §7/§8.
- **+** WYSIWYG: reuses the shared view-model, so the PDF matches the on-screen
  geometry/content the renderer already snapshots.
- **−** Not pixel-perfect: no image painting, base-14 fonts only, approximate
  glyph metrics and a fixed line-height. Acceptable for a client-side default;
  the documented routes cover the gap. The dialog's **Quality/size** control is
  therefore informational on this path (kept for mockup fidelity and future
  raster/server exporters).
- **−** WinAnsi text only; characters outside CP1252 degrade to `?`. Common
  punctuation (em/en dashes, smart quotes, ellipsis, bullet, €/™) is mapped to its
  WinAnsi byte so typical Latin reports render correctly.

## Alternatives considered

- **`html2canvas` + `jsPDF` (rasterise each page).** Rejected by brief §7 — it
  rasterises text (no selection, blurry print, large files) and mishandles page
  breaks. The whole renderer is DOM/SVG precisely to stay vector-sharp.
- **A full PDF library (pdfmake / pdf-lib / pdfkit).** Rejected: too large for the
  publishable, bundle-budgeted viewer, and most still need a font-embedding step
  for non-base-14 text. The minimal writer covers the default path; hosts wanting
  full fidelity bring a server-side exporter.
- **Reuse the print mirror + `window.print()` as the "export".** Rejected as the
  *default exporter*: native print can't set a filename/metadata, pick a page
  range, or yield a downloadable `Blob` to assert against. Print remains the
  separate, crisp native path (E8-S2/ADR 0011); Export PDF is the programmatic one.
- **Put the PDF generator in `report-engine`.** Rejected: it would have to
  re-derive all element/table content + style resolution that `page-view-model`
  already does (drift risk), and the engine cannot import the renderer. Generating
  from the view-model keeps it DRY.
