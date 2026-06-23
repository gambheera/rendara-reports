# ADR 0007 — Page chrome: repeating header/footer, page numbers, watermark

- **Status:** Accepted
- **Date:** 2026-06-23
- **Story:** E3-S5 · Page header/footer, page numbers, watermark model

> Records how the paginator grows the page model from "body only" (E3-S4 / ADR
> 0006) to a full page with repeating chrome: header/footer bands on every page,
> `{{pageNumber}}`/`{{pageCount}}` tokens resolved per page, and a watermark
> config echoed into the model.

## Context

ADR 0006 deliberately deferred page header/footer **bands**, page-number tokens
and the watermark to E3-S5, noting the page model would be "incrementally
extended … onto each `PaginatedPage`" without re-architecting the slicer. E3-S5
delivers exactly that. The constraints from E3-S4 still hold: the paginator must
stay **pure, synchronous and byte-reproducible** for the E3-S7 snapshot suite,
and must **compose** the earlier passes rather than re-derive them.

Two design questions needed deciding:

1. **Where do header/footer geometry and page tokens live?** The bands are
   already laid out by E3-S2 (`layoutStaticPage`) in the page margins; only their
   per-page *text* (page numbers) changes from page to page.
2. **Where does the watermark config come from?** The template JSON schema has
   **no** `watermark` field today, and changing the schema is a versioned-contract
   action requiring a version bump + migration + explicit sign-off.

## Decision

1. **Header/footer are re-emitted per page.** `paginate` filters the existing
   `layoutStaticPage` output for the `header` and `footer` bands and attaches a
   copy of those laid-out elements to **every** `PaginatedPage` (`page.header`,
   `page.footer`). Geometry is identical across pages (chrome is fixed in the
   margins); only the resolved page tokens differ. No new layout math.

2. **Page tokens resolve into `PlacedElement.resolvedText`.** A new
   `PlacedElement = LaidOutElement & { resolvedText: string | null }` carries, for
   a text element whose **literal** `text` contains `{{pageNumber}}`/
   `{{pageCount}}`, the substituted string for that page (e.g. `"Page 2 of 12"`).
   When the literal carries no token — or the element is binding-driven / non-text
   — `resolvedText` is `null` and the renderer uses the element's own content. The
   body's fixed `elements` are `PlacedElement`s too, so a page token works in any
   band, not just the footer. Substitution is a plain literal string replace
   (tolerant of inner whitespace) — **not** JSONata; page tokens are document
   chrome, not data bindings.

3. **Watermark is a render-time option, not a schema field.** `paginate` accepts
   an optional `PaginateOptions.watermark` and echoes it as
   `PaginatedDocument.watermark` (or `null`). This matches brief §8, where the
   **viewer config** — not the template — owns the watermark; the viewer's
   watermark dialog (E8-S4) will populate it. It keeps the versioned template
   contract **frozen** (no bump/migration) while still "producing watermark config
   in the page model" as the story asks. The `Watermark` type mirrors the dialog's
   fields (type text/image, text/src, opacity, angle, colour, font size); the
   engine only produces the config — painting it is the renderer's job (E4).

## Alternatives considered

- **Add `watermark` to the template schema.** Rejected for v1: it is a versioned
  contract change (bump + migration + sign-off) and conceptually the watermark is
  a viewer/runtime concern (brief §8), not authored template content. The
  options-based seam can be promoted to a schema field later if authoring a
  template-level watermark is ever wanted.
- **Resolve page tokens via JSONata.** Rejected: tokens are fixed document
  placeholders with no data scope; routing them through the expression engine
  would be slower and add an evaluation surface for no benefit.
- **Bake the resolved string into every text element (non-null always).**
  Rejected: it would duplicate static text into the page model on every page and
  bloat snapshots. `resolvedText` is an *override*, present only when a token was
  actually substituted.
- **Store the watermark per page instead of per document.** Rejected: the
  watermark is uniform across the report; one document-level config the renderer
  stamps on each page is smaller and clearer.

## Consequences

- The page model is now complete enough for the shared renderer (E4) to paint a
  full page: chrome in the margins, body flow, table slices and a watermark layer.
- `PaginatedPage` gained `header`/`footer`; `elements` changed from
  `LaidOutElement[]` to `PlacedElement[]` (additive `resolvedText`); the
  tabular-report page-model snapshot was regenerated to include them. Existing
  E3-S4 assertions (which read only `.id`) are unaffected.
- Pagination stays pure, synchronous and deterministic — token substitution is
  arithmetic + string replace; the watermark is a passthrough echo.
- Grouping bands and cross-page subtotals remain E3-S6; DOM rendering of the
  chrome and watermark remains E4.
