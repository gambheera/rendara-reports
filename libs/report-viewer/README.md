# @rendara/report-viewer

The embeddable Angular **Report Viewer**: hand it a validated **Template JSON** and a
**Data JSON** and it renders the final, paginated report inside any Angular host app.
It bundles the shared engine + renderer, so what was designed is exactly what renders.

## Usage

```ts
import { ReportViewer } from '@rendara/report-viewer';

@Component({
  selector: 'host-app',
  imports: [ReportViewer],
  template: `
    <rdr-report-viewer
      [template]="template"
      [data]="data"
      [config]="{ locale: 'en-US', initialZoom: 'fit-width', pageMode: 'continuous' }"
      [theme]="{ '--rdr-accent': '#4F46E5' }"
      (rendered)="onRendered($event)"
      (error)="onError($event)"
    />
  `,
})
export class HostApp {
  /* template: RendaraTemplate | string, data: arbitrary JSON */
}
```

## Public API (brief §8)

| Input      | Type                                | Notes                                                                    |
| ---------- | ----------------------------------- | ------------------------------------------------------------------------ |
| `template` | `RendaraTemplate \| string \| null` | A validated template object or a raw JSON string. `null` paints nothing. |
| `data`     | `unknown`                           | Arbitrary host JSON bound into the template.                             |
| `config`   | `ViewerConfig`                      | `locale`, `initialZoom`, `toolbar`, `watermark`, `pageMode`, `pdfExporter`, `exportFilename`, `pdfMetadata`. |
| `theme`    | `ViewerTheme`                       | `--rdr-*` CSS custom-property overrides for the host.                    |

| Output       | Payload              | Fired when                                       |
| ------------ | -------------------- | ------------------------------------------------ |
| `rendered`   | `{ pageCount }`      | a template+data render completes.                |
| `pageChange` | `{ current, total }` | the visible page changes (E7-S3).                |
| `error`      | `ViewerError`        | a validation/binding/render failure is surfaced. |

## Render pipeline (E7-S2)

On any change to `template`/`data`/`config` the viewer runs a single, shared
**validate → bind → paginate → render** pipeline:

1. **Validate** — a JSON string is parsed; any input is migrated to the current
   schema and validated. Older templates are carried forward automatically.
2. **Bind** — bound elements and data tables are resolved through the sandboxed
   JSONata + `Intl` engine (no `eval` / `new Function`).
3. **Paginate** — the bound document is laid out into pages by the shared engine.
4. **Render** — the paginated document is painted by the shared renderer.

The pipeline is **total**: a failure surfaces through `(error)` (and the viewer
paints nothing) rather than throwing. It is the same engine path the designer
preview uses, so the viewer and the designer agree pixel-for-pixel.

## Export PDF (E8-S3)

The toolbar's **Export PDF** action opens a dialog (filename · pages · include
watermark) and produces a PDF through a **swappable `PdfExporter`**:

- **Default (client-side):** `defaultPdfExporter` renders a **selectable-text,
  vector** PDF entirely in the browser via the shared renderer — no server
  round-trip, no heavy dependency, no rasterisation — and downloads it. It covers
  text, vector shapes, table grids and a text watermark; it does **not** paint
  images and approximates typography (base-14 Helvetica). For pixel-perfect
  output use **Print** or a server-side exporter. See [ADR 0012](../../docs/adr/0012-viewer-pdf-export.md).
- **Custom / server-side:** pass your own `config.pdfExporter` to, e.g., POST the
  `PdfExportRequest` to a Puppeteer/Playwright route for pixel-perfect or batch
  output.

```ts
// Swap in a server-side exporter (the documented optional path):
const config: ViewerConfig = {
  exportFilename: 'invoice.pdf',
  pdfMetadata: { title: 'Invoice INV-2042', author: 'Acme Corp' },
  pdfExporter: {
    async export(req) {
      const res = await fetch('/api/pdf', { method: 'POST', body: serialize(req) });
      const blob = await res.blob();
      download(blob, req.filename);
      return { pageCount: req.document.pageCount, filename: req.filename, blob };
    },
  },
};
```
