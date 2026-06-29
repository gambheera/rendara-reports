# @rendara/report-viewer

The embeddable Angular **Report Viewer**: hand it a validated **Template JSON** and a
**Data JSON** and it renders the final, paginated report inside any Angular host app.
It bundles the shared engine + renderer, so what was designed is exactly what renders.

## Build & packaging (E9-S1)

The package is built to **Angular Package Format (APF)** with engine + renderer +
schema **bundled in**, so a host installs one package and gets everything:

```bash
nx run report-viewer:pack   # build schema→engine→renderer→viewer, inline, npm-pack verify
```

ng-packagr can't compile a sibling lib's _source_ into a package, so the build is
two stages: ng-packagr emits an APF package per lib (cross-lib refs left external),
then `tools/bundle-viewer.mjs` inlines those `@rendara/*` FESM + `.d.ts` into the
viewer and strips them from `dependencies`. The published tarball depends only on
Angular (peer) + jsonata/ajv/tslib. **Note:** `nx build report-viewer` alone is
_not_ publishable (its FESM still imports `@rendara/*`); use `bundle`/`pack`. See
[ADR 0013](../../docs/adr/0013-viewer-apf-packaging.md).

## Compatibility & version tolerance (E9-S2)

The package is built to fit a host app's existing Angular install:

- **Wide Angular peers.** `@angular/core` and `@angular/cdk` are declared as
  `peerDependencies` over `>=20.0.0` — tested against Angular **20 (min) – 22
  (max)**. Angular is a peer (never bundled), so it isn't duplicated into your
  app. `@angular/common` is **not** required.
- **Tree-shakeable.** The package is `"sideEffects": false` and ships a single
  FESM2022, so a bundler drops it entirely when you don't reference it and you
  pay only for what you import. (Per-feature dead-code elimination within the
  bundle happens in your Angular app build via the Ivy optimizer.) A CI gate
  (`tools/verify-viewer-treeshake.mjs`) proves the package has no eager side
  effects.
- **Single entry point.** Everything is exported from `@rendara/report-viewer`;
  there are no secondary entry points. For framework-agnostic schema
  validation without Angular, use the separate `@rendara/report-schema` package.
- **SSR-safe.** All browser APIs are guarded — file download, `window.print()`
  and the default PDF exporter no-op (or return bytes) without a DOM — so the
  component imports and renders under server-side rendering without throwing.

See [ADR 0014](../../docs/adr/0014-viewer-peer-deps-and-version-tolerance.md).

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

| Input      | Type                                | Notes                                                                                                                      |
| ---------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `template` | `RendaraTemplate \| string \| null` | A validated template object or a raw JSON string. `null` paints nothing.                                                   |
| `data`     | `unknown`                           | Arbitrary host JSON bound into the template.                                                                               |
| `config`   | `ViewerConfig`                      | `locale`, `initialZoom`, `toolbar`, `watermark`, `pageMode`, `thumbnails`, `pdfExporter`, `exportFilename`, `pdfMetadata`. |
| `theme`    | `ViewerTheme`                       | `--rdr-*` CSS custom-property overrides for the host.                                                                      |

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

## In-report search (E8-S6)

The toolbar's **Find in report** (magnifier) action opens a compact Find bar.
Typing a query highlights every matching run of text — text elements, data-table
cells and group labels — across all pages, shows an `N / total` match count, and
lets you step through hits with the prev/next buttons (or `Enter` /
`Shift+Enter`); the active match is scrolled into view. Matching is
case-insensitive.

Search is a **screen-only** aid: highlights never appear in **Print** or **PDF
export** output. Hide the control with `config.toolbar.search: false`. The
highlight colours are themeable via the renderer's `--rdr-search-highlight` and
`--rdr-search-active` CSS custom properties.

## Optional thumbnail rail (E8-S7)

The left **thumbnail rail** — one mini render per page, the current page outlined,
click to jump — is optional. The toolbar's **Toggle page thumbnails** action shows
or hides it at runtime (a hidden rail is removed from the DOM, freeing the width
for the report). Set the rail's initial visibility with `config.thumbnails: false`
(default `true`), and hide the toggle button itself with
`config.toolbar.thumbnails: false`.
