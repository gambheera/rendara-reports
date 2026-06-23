# report-renderer

The **shared** Angular renderer (brief §7): it turns an engine page model into
absolutely-positioned DOM, so the designer preview and the embeddable viewer are
pixel-identical (true WYSIWYG). It depends inward only on `@rendara/report-engine`
and `@rendara/report-schema` (Nx module boundaries).

## What it renders

- **Page frame (E4-S1):** the page sheet sized in px (units→px), the printable
  area guide, a resolved background, and every fixed element as an absolutely
  positioned host box at a given `zoom` (`transform: scale`).
- **Element content (E4-S2):**
  - **text** — display string + font/colour/horizontal align/wrapping
    (`pre-wrap`), with vertical alignment realised as a flex column on the host
    box, plus box decoration (fill / per-side border / padding);
  - **shapes** — `line`/`rect`/`ellipse` as inline **SVG** (vector-crisp) with
    stroke (incl. dashed/dotted) and fill; a line is drawn corner-to-corner of its
    frame (a zero-height frame becomes a horizontal rule);
  - **image** — `object-fit` from the element's `fit`, with a **URL-sanitised**
    `src` (see Security).

Deferred to later E4 stories: data-table slices (E4-S3), multi-page + zoom
controls (E4-S4), style isolation / Shadow DOM (E4-S5), design-mode hooks
(E4-S6), watermark (E4-S7).

## Usage

```html
<rdr-report-renderer
  [page]="doc.pages[0]"
  [geometry]="doc.geometry"
  [template]="template"
  [resolvedValues]="resolvedValues"
  [zoom]="1"
  [background]="null"
/>
```

`page` + `geometry` come from the engine's `paginate(...)`. `template` supplies
each element's style and static content; `resolvedValues` is a
`Map<elementId, string>` of **data-bound** display strings — the `formatted`
value from the engine's async `resolveElement` (text bindings, image URLs). A
page-token `resolvedText` wins, then `resolvedValues`, then the static literal.
Omitting `template` renders empty host boxes (the E4-S1 behaviour).

The pure `buildPageViewModel(page, geometry, options)` holds all layout→style→
content math; the Angular component and the headless `serializePageToHtml`
serializer both consume it, so the component DOM and the visual-regression
fixtures never diverge.

## Security: image URLs

`sanitizeImageUrl(url)` hardens image sources against XSS (brief §6/§7). It allows
`http:`/`https:`, `data:image/…` URIs, and relative / protocol-relative URLs, and
**blocks** `javascript:`/`vbscript:`/`file:` and non-image `data:` URIs — robust
to case and whitespace/control-character obfuscation. A blocked URL renders **no**
`<img>` at all. No `eval`/`new Function`, no reliance on the DOM.

## Visual fixtures

`golden-page-html.ts` pre-renders the certificate golden and a compact per-type
page to committed HTML (`apps/visual-e2e/e2e/__fixtures__/*.html`) the Playwright
visual suite loads via `fs` (e2e projects can't import workspace libs).
Regenerate with `pnpm render-fixtures:generate`; `golden-page-html.spec.ts` guards
the committed artifacts against drift. Linux baselines are CI-seeded — see
`docs/testing/visual-regression.md`.

## Testing

```bash
npx nx test report-renderer
```
