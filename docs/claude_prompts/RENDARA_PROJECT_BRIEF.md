# Rendara Reports — Project Brief & Master Prompt

> This document is the single source of truth (the "context pack") for building **Rendara Reports** with Claude Code.
> Keep it at the repo root (e.g. `/docs/RENDARA_PROJECT_BRIEF.md`) and reference it at the start of every Claude Code session.
> The companion file `RENDARA_BACKLOG.md` contains the epics and the granular, reviewable user stories.

---

## 1. Product vision

Rendara Reports is a **100% front-end** reporting platform that removes the pain of report changes for both developers and end-users. Today, changing a report's look or structure means a code change and a redeploy. Rendara makes report design a **data-driven, zero-code, zero-deploy** activity.

It has two parts that share one codebase (monorepo):

1. **Report Designer** — a web portal where non-developers design a report on a canvas (drag-and-drop text, shapes, images, data tables; set properties; bind to data fields) and export a **Template JSON**.
2. **Report Viewer** — an Angular component, distributed as an **NPM package**, that takes a **Template JSON** + a **Data JSON** and renders the final report inside any Angular host application, with a toolbar (print, export PDF, page navigation, zoom, watermark, etc.).

The contract between them is the **Template JSON schema**. The developer's only job at runtime is to fetch the template + data from their backend and hand them to the viewer.

```
 ┌──────────────┐    designs &     ┌───────────────┐
 │   Designer   │ ───exports────▶  │ Template JSON │
 │  (web portal)│                  └───────┬───────┘
 └──────────────┘                          │
                                           ▼
 ┌──────────────┐    fetched at    ┌───────────────┐    renders    ┌──────────────┐
 │   Backend    │ ───runtime────▶  │  Data JSON +  │ ───────────▶  │ Report Viewer│
 │ (developer)  │                  │ Template JSON │               │ (npm package)│
 └──────────────┘                  └───────────────┘               └──────────────┘
```

**Quality bar:** this is meant to be a **stable, standardised product for industry professionals**. Every story carries its own quality gate (see §9). Correctness of rendering, pagination, and the template contract are non-negotiable.

---

## 2. What the original idea got right, and the gaps I'm filling

Your concept is solid. The research below surfaced several areas that are essential for a *professional-grade* reporting tool but were under-specified. These are folded into the architecture and backlog.

**Already in your idea (kept as-is):** two-component split, canvas designer with palette/properties/data-binding, template-JSON-as-contract, front-end-only viewer, NPM-packaged viewer, toolbar with print/PDF/zoom/paging/watermark, single repo.

**Gaps I'm adding (and why):**

| Gap | Why it matters for a professional product |
|---|---|
| **A versioned Template JSON *schema*** with formal validation + migrations | The template is the contract. It must be machine-validated, versioned, and forward/backward-migratable, or every future change breaks existing templates. This is the crown jewel of the product. |
| **A page & pagination model** (A4/Letter/custom, margins, orientation, multi-page, page headers/footers, page numbers) | Reports are paginated documents, not single screens. Invoices, statements, and tabular reports span pages. Your idea didn't define page setup or multi-page behaviour. |
| **A "banded"/region model for data tables** (repeating detail rows, grouping, aggregates, repeat-header-per-page, keep-together) | A real data table grows with the data and must paginate correctly, repeat its header on each page, and support group sub-totals and grand totals. This is the single hardest algorithmic piece. |
| **A safe data-binding expression language + formatting** | Placeholders need a real (but *sandboxed*, non-`eval`) expression model for nested data, arrays, computed values, conditional visibility, and locale-aware number/date/currency formatting. |
| **One shared rendering engine** used by *both* designer preview and viewer | Guarantees true WYSIWYG: what you design is exactly what renders. Avoids two diverging renderers. |
| **Security** (no `eval`, HTML sanitisation, image-URL allow-listing, CSS isolation, CSP-friendliness) | The viewer runs inside *other people's* Angular apps with *their* data. It must not leak styles, execute template-supplied code, or open XSS holes. |
| **Designer productivity** (undo/redo, copy/paste, multi-select, snapping/alignment guides, z-order, grouping, keyboard shortcuts) | These are table-stakes for anyone who designs visually; without them the tool feels like a prototype. |
| **Accessibility (WCAG 2.2 AA) + i18n/RTL** | Industry/enterprise buyers frequently require both, for the designer UI *and* the rendered output. |
| **A full quality system** (unit, component, e2e, **visual-regression**, schema-contract/round-trip, a11y, performance budgets, cross-browser) | A rendering product lives or dies on visual correctness; visual-regression snapshots and round-trip tests are mandatory, not optional. |
| **Embeddable-library concerns** (public API surface, peer-dependency range, theming API, tree-shaking, packaging/APF, example host app) | "Integrates with any Angular app via NPM" implies a deliberately designed, documented, version-tolerant public API and packaging. |
| **Performance for large data** (table virtualization, render-time budgets, bundle-size budgets) | Reports with thousands of rows must stay responsive and ship a small viewer bundle. |

**Explicitly out of scope for v1 (tracked in the backlog's "Future" epic):** charts/graphs, barcodes/QR, report parameters & live datasource connectors, server-side/headless PDF rendering service, template gallery/marketplace, real-time collaboration, sub-reports, AI-assisted template generation. Flag these as future so v1 stays focused.

---

## 3. Recommended technology stack (researched, June 2026)

> Rationale links to current ecosystem state. Treat versions as "latest stable at build time" — pin exact versions in the lockfile.

- **Framework: Angular 21 (LTS through May 2027).** Angular 22 shipped 3 June 2026; 21 is the safer LTS target for a product that must be stable, while keeping the *library's* peer range wide (`>=20`) for adoption. Use **standalone components, signals, the new control flow (`@if`/`@for`), and zoneless change detection** (default in 21). Avoid `NgModule` and Zone.js patterns.
- **Monorepo: Nx.** Standard for an app-plus-publishable-library workspace. Gives `nx affected` builds/tests, dependency-graph **module-boundary enforcement** (keeps designer/viewer/schema cleanly separated), caching, and first-class `ng-packagr` publishing. (Angular CLI native workspaces are a lighter alternative, but Nx's boundary rules and caching are worth it for a product of this size.)
- **Designer state: `@ngrx/signals` SignalStore.** Signal-native store that fits the designer's document/selection/undo-redo state well. The renderer and viewer use plain signals + component inputs (no global store needed there).
- **Data binding / expressions: JSONata.** Powerful, JSON-native query/transform language that is **sandboxed (no `eval`/`Function`)** — ideal for safe placeholder expressions, computed fields, conditional visibility, and aggregates. Pair with a thin **formatting layer built on `Intl`** (numbers, currency, percent, dates) plus a small format-token registry. **Never** evaluate template strings with `eval`/`new Function`.
- **Rendering: a single shared Angular renderer emitting HTML/CSS** (absolute-positioned page model), **not raster canvas.** Research is decisive here: canvas (Konva/Fabric) gives a nicer free-form *editing* feel, but rasterises text — which wrecks print/PDF crispness, accessibility, and growing/paginating data tables. A DOM/SVG renderer keeps text vector-sharp, accessible, and paginates naturally. (Konva is noted as a possible enhancement for rich free-form graphics, but the default is the shared HTML renderer so designer preview and viewer are pixel-identical.)
- **Pagination: a custom paginator** in the framework-agnostic engine (computes page breaks, repeats table headers, handles keep-together/grouping/page footers). Paged.js is a useful reference for CSS-paged-media behaviour, but a custom, testable paginator gives the control and deterministic snapshots this product needs.
- **Print & PDF: native browser print + a *pluggable* PDF exporter.** For **Print**, render a paginated, print-optimised DOM with a `@page`/print stylesheet and call `window.print()` (native, crisp, vector text). For **Export PDF**, define a `PdfExporter` interface with a default client-side implementation, and document an optional server-side **Puppeteer/Playwright** path for headless/batch pixel-perfect output. (Pure `html2canvas`+`jsPDF` rasterises and mishandles page breaks — avoid as the primary path; keep the exporter swappable.)
- **UI & interactions: Angular CDK** throughout (Drag-Drop, Overlay, A11y, Virtual Scroll, Portal). CDK is lightweight and official. The **designer app** may add Tailwind (or a small in-repo `ui-kit`) for its chrome. The **viewer library must stay UI-kit-light** — CDK + scoped CSS only — to keep the bundle small and avoid forcing a design system on host apps.
- **Styling & isolation: CSS custom properties for theming**, `ViewEncapsulation.Emulated` by default with an opt-in **Shadow DOM** mode and a CSS reset, so the viewer never leaks styles into (or inherits styles from) the host app.
- **Testing: Vitest** (Angular 21's default runner) for unit/component, **Angular Testing Library**, **Playwright** for e2e and **visual-regression snapshots**, **axe-core** for accessibility, **ajv** for schema-contract tests.
- **Tooling: pnpm, ESLint (+ angular-eslint) with Nx module-boundary rules, Prettier, strict TypeScript, commitlint + Conventional Commits, Changesets** for versioned releases of the published packages, **Storybook** for component docs, **Compodoc/TypeDoc** for API docs, **GitHub Actions** CI with `nx affected`.

---

## 4. Monorepo & package architecture

Single Nx workspace. Clean separation enforced by Nx tags / module boundaries.

```
rendara-reports/
├─ apps/
│  ├─ designer/            # The Report Designer web portal (Angular app)
│  └─ viewer-demo/         # Example host app: demonstrates consuming the viewer as an npm package
│
├─ libs/
│  ├─ report-schema/       # PUBLISHABLE  @rendara/report-schema
│  │                       #   Framework-agnostic: TS types, JSON Schema, ajv validator,
│  │                       #   version + migrations. Usable on the backend too.
│  ├─ report-engine/       # Framework-agnostic core (pure TS, no Angular):
│  │                       #   expression eval (JSONata), formatting, binding resolver,
│  │                       #   pagination/layout algorithm, data introspection.
│  ├─ report-renderer/     # Angular: the SHARED renderer. (template+data → paginated DOM pages)
│  │                       #   Used by BOTH the designer preview and the viewer.
│  ├─ report-viewer/       # PUBLISHABLE  @rendara/report-viewer
│  │                       #   Angular component wrapping renderer + toolbar + public API.
│  │                       #   Bundles report-engine + report-renderer at build time.
│  └─ ui-kit/              # Designer-only shared UI components/tokens (not published)
│
├─ tools/                  # scripts, generators, fixtures
├─ e2e/                    # Playwright projects (designer + viewer-demo)
└─ docs/                   # this brief, ADRs, architecture, contributing
```

**Dependency rules (enforced by Nx):**
- `report-schema` depends on nothing internal.
- `report-engine` depends only on `report-schema`.
- `report-renderer` depends on `report-engine` + `report-schema` (+ Angular/CDK).
- `report-viewer` depends on `report-renderer` (+ engine/schema transitively); it is the only Angular publishable lib and **bundles** engine/renderer/schema so consumers `npm i @rendara/report-viewer` and get everything.
- `apps/designer` depends on `report-renderer`, `report-engine`, `report-schema`, `ui-kit`.
- `apps/viewer-demo` depends **only** on `@rendara/report-viewer` (consumed as a package, to prove the integration story).

**Published packages:**
- `@rendara/report-viewer` — the Angular viewer component (everything bundled).
- `@rendara/report-schema` — framework-agnostic types + JSON Schema + validator, so backends can validate/generate templates and developers get strong typing. (Optional: also publish `@rendara/report-engine` if you want headless rendering/validation server-side.)

---

## 5. The Template JSON schema (the contract)

This is the most important artifact. Design it deliberately, version it from day one (`schemaVersion`), and never break it without a migration.

**Top-level shape (illustrative — finalise in Epic 1):**

```jsonc
{
  "schemaVersion": "1.0.0",
  "metadata": { "name": "Invoice", "id": "uuid", "createdAt": "...", "locale": "en-US" },
  "page": {
    "size": "A4",                 // A4 | Letter | { widthMm, heightMm }
    "orientation": "portrait",
    "marginsMm": { "top": 20, "right": 15, "bottom": 20, "left": 15 },
    "units": "mm",                // authoring units; renderer converts to px
    "defaultFont": { "family": "Inter", "sizePt": 10 },
    "background": null
  },
  "header": { "elements": [ /* repeats on every page */ ] },
  "footer": { "elements": [ /* page numbers, totals */ ] },
  "body": {
    "elements": [
      {
        "id": "el_1", "type": "text",
        "frame": { "xMm": 15, "yMm": 30, "wMm": 80, "hMm": 8 },
        "binding": { "expr": "invoice.customer.name", "format": null, "fallback": "" },
        "style": { /* font, color, align, border, fill, padding */ },
        "visibleWhen": null,         // JSONata boolean expr or null
        "z": 1
      },
      {
        "id": "el_tbl", "type": "dataTable",
        "frame": { "xMm": 15, "yMm": 60, "wMm": 180, "hMm": null /* grows */ },
        "source": { "arrayExpr": "invoice.lineItems" },
        "groups": [ /* optional grouping with header/footer + aggregates */ ],
        "columns": [
          { "key": "desc", "header": "Description", "cell": { "expr": "$.description" }, "widthMm": 90 },
          { "key": "amt",  "header": "Amount",
            "cell": { "expr": "$.amount", "format": "currency:USD" },
            "footer": { "expr": "$sum(invoice.lineItems.amount)", "format": "currency:USD" },
            "widthMm": 40, "align": "right" }
        ],
        "rowStyle": { /* ... */ }, "repeatHeaderOnEachPage": true, "keepTogether": false
      }
      // shape, image elements ...
    ]
  }
}
```

**Schema must define / validate:** page setup; element base (id, type, frame, style, z, visibleWhen); element types (text, shape{line|rect|ellipse}, image, dataTable); style model; binding model; table columns/groups/aggregates; header/footer bands; watermark config. Ship a **JSON Schema + ajv validator + typed `parse()/validate()`** with friendly errors, and a **migration runner** keyed off `schemaVersion`.

---

## 6. Data binding & expressions

- **Access & compute:** JSONata expressions over the Data JSON (`invoice.customer.name`, `$sum(...)`, `firstName & " " & lastName`, conditionals).
- **Table rows:** the table's `source.arrayExpr` resolves to an array; each column `cell.expr` is evaluated with `$` bound to the current row.
- **Aggregates:** `$sum/$average/$count/$min/$max` for column footers, group footers, and grand totals.
- **Formatting:** a format string (e.g. `currency:USD`, `date:medium`, `number:0.00`, `percent`) resolved by an `Intl`-based registry; locale comes from template metadata or viewer config.
- **Conditional visibility & formatting:** `visibleWhen` and style-conditions are JSONata boolean expressions.
- **Sample-data introspection (designer):** walk an imported sample Data JSON to build a field tree (scalars/objects/arrays) that powers drag-to-bind and array selection for tables.
- **Safety:** all evaluation goes through the sandboxed engine. No `eval`, no `new Function`, no template-supplied JS execution, ever.

---

## 7. Rendering, pagination, print & PDF

- **One renderer, two modes.** `report-renderer` turns (validated template + data) into a **paginated page model** (via `report-engine`) and renders each page as absolutely-positioned DOM in authoring units converted to px at the current zoom. **View mode** = static output (used by the viewer). **Design mode** = same output + selection/drag overlays (used by the designer canvas). This is what makes WYSIWYG real.
- **Pagination engine** handles: fixed elements per page; data tables that expand and break across pages; repeat-header-per-page; keep-together; grouping with group headers/footers and carry-over subtotals; page headers/footers; `{{pageNumber}}`/`{{pageCount}}` tokens; watermark layer.
- **Print:** dedicated print stylesheet + `@page` rules; `window.print()` produces crisp, vector, correctly-paginated output.
- **Export PDF:** `PdfExporter` interface; default client-side implementation; documented optional server-side Puppeteer path for headless/pixel-perfect/batch. Filename + PDF metadata configurable. Watermark honoured.
- **Performance:** virtualize very large tables in the *viewer's* scroll view while keeping pagination math correct; enforce render-time and bundle-size budgets.

---

## 8. Embeddable viewer — public API (shape to finalise in Epic 7/9)

```ts
// @rendara/report-viewer  (standalone Angular component)
<rendara-report-viewer
  [template]="templateJson"        // RendaraTemplate | string (validated)
  [data]="dataJson"                // arbitrary JSON
  [config]="{ locale, initialZoom, toolbar, watermark, pageMode }"
  [theme]="cssVarOverrides"
  (rendered)="onRendered($event)"  // { pageCount }
  (pageChange)="onPage($event)"    // { current, total }
  (error)="onError($event)"        // validation/binding/render errors
/>
```

- **Inputs:** `template`, `data`, `config`, `theme`. **Outputs:** `rendered`, `pageChange`, `error`.
- **Toolbar** is configurable (show/hide buttons, custom action slot).
- **Theming** via CSS custom properties; **style isolation** so host CSS can't break it and it can't leak into the host.
- **Peer deps:** Angular `>=20` (wide range); document supported versions. Standalone, tree-shakeable, SSR-safe (guard browser-only APIs).

---

## 9. Definition of Done (applies to EVERY story)

A story is **not** done until all of these are true. Each story in the backlog also lists **story-specific QA** on top of this baseline.

- [ ] **Functionality** meets the story's acceptance criteria.
- [ ] **Unit tests** for all new logic; **component tests** for new components (Vitest + Angular Testing Library). Engine/schema/pagination logic held to a **high coverage bar (≥90%)**; UI to a sensible bar (≥80%).
- [ ] **Visual-regression snapshots** added/updated for any change that affects rendered output (Playwright). No unreviewed pixel diffs.
- [ ] **UI fidelity:** for any user-facing screen, the result follows the approved mockup in `docs/ui-mockups/` (layout, components, states) **after applying the reconciliation rules in §12** (canonical naming, palette, units, panels). Intentional deviations are noted in the PR.
- [ ] **Schema round-trip** integrity preserved where templates are involved (export → re-import yields an equivalent template; validated by ajv).
- [ ] **Accessibility:** no new axe violations; keyboard operability for interactive UI; target **WCAG 2.2 AA**.
- [ ] **Lint, format, strict typecheck** all clean; **Nx module-boundary** rules respected.
- [ ] **Performance budgets** respected (bundle-size budget for the viewer package; render-time budget for large-data fixtures).
- [ ] **Docs updated:** Storybook story / API docs / README / `viewer-demo` wiring as applicable; an **ADR** for any significant architectural decision.
- [ ] **CI green** on the PR (`nx affected` lint + test + build + e2e + visual + a11y).
- [ ] **PR opened with the DoD checklist**, scoped to a single story, **awaiting your review before merge.**

---

## 10. How to drive this with Claude Code

Rendara is built **one small story at a time, each reviewed by you before the next.** Recommended loop:

1. Start a session with: *"Read `docs/RENDARA_PROJECT_BRIEF.md` and `docs/RENDARA_BACKLOG.md`. We are implementing Epic X, Story X-Sn only. Confirm the plan and the Definition of Done, then implement it. Stop at a reviewable PR; do not start the next story."*
2. Claude Code implements the story, writes its tests, runs lint/typecheck/test/build, and opens a PR with the DoD checklist filled in.
3. You review. Request changes or approve.
4. Merge, then move to the next story.

Guardrails to give Claude Code: keep PRs small and single-story; never weaken a test to make it pass; never introduce `eval`/`new Function`; never let the viewer leak styles or depend on a heavy UI kit; update visual snapshots only with explanation; respect the Nx module boundaries; ask before changing the Template JSON schema (schema changes require a version bump + migration + your sign-off).

Claude Code is Anthropic's agentic command-line coding tool; see https://docs.claude.com/en/docs/claude-code/overview for current setup and usage.

---

## 11. Sequencing (epic order)

Build the foundation and the *contract* first, then the engine, then the shared renderer, then the two apps in parallel-ish, then harden and release.

```
E0 Foundations ─▶ E1 Schema ─▶ E2 Binding/Expressions ─▶ E3 Pagination ─▶ E4 Shared Renderer
                                                                                │
                          ┌─────────────────────────────────────────────────────┤
                          ▼                                                       ▼
                 E5+E6 Designer                                        E7+E8 Viewer
                          └───────────────────────┬─────────────────────────────┘
                                                  ▼
                                  E9 Packaging/Integration/Docs
                                                  ▼
                                  E10 Hardening (a11y, i18n, perf, security, release)
```

See `RENDARA_BACKLOG.md` for the full epic + story breakdown with acceptance criteria and per-story QA.

---

## 12. UI mockups (visual reference)

High-fidelity mockups for every screen were generated in Google Stitch from the prompts in `RENDARA_STITCH_PROMPTS.md` and committed to **`docs/ui-mockups/`**. Each screen folder contains a `screen.png` (the visual) and a `code.html` (Stitch's HTML/CSS).

> **Path note:** the table below assumes the screen folders sit directly under `docs/ui-mockups/`. If the Stitch wrapper folder was kept, prefix paths with `docs/ui-mockups/stitch_rendara_design_system/`.

> **Status of these files — read carefully.**
> - The mockups are a **visual reference, not a specification.** Where a mockup and this brief/backlog/`design.md` disagree, **the written docs + `design.md` win.**
> - Stitch's `code.html` is a **reference only** — it is **not** production code. Re-implement every screen in Angular per the architecture in §3–§8 (standalone components, signals, shared renderer, Angular CDK, scoped styles). Do not paste Stitch HTML into the apps.
> - `docs/ui-mockups/design.md` and `docs/ui-mockups/.../DESIGN.md` are Stitch's echo of the design system; the **authoritative** design system is the top-level `design.md` (it adds a Material-3 token scaffold that we do not need).

### 12.1 Screen → folder → where it's used

| Mockup folder (`docs/ui-mockups/…`) | Screen | Backlog story |
|---|---|---|
| `style_guide/` | Design system / Style guide | E0-S8 (tokens), E0-S6 (Storybook) |
| `templates_dashboard/` | Designer — Templates home *(optional, only if templates are stored server-side)* | E6 (pre-req) / out-of-scope if local-only |
| `report_designer_workspace/` | Designer — workspace, empty state | E5-S1, E5-S4 |
| `report_designer_text_properties/` | Designer — text element selected | E5-S6, E6-S1, E6-S5 |
| `report_designer_data_table_properties/` | Designer — data table selected | E6-S4, E6-S5, E6-S8 |
| `report_designer_data_binding/` | Designer — sample data + field tree + binding editor | E6-S6, E6-S7 |
| `report_designer_page_setup_dialog/` | Designer — page setup dialog | E5-S3 |
| `report_designer_preview_mode/` | Designer — preview mode | E6-S9 |
| `export_template_dialog/` + `import_template_dialog/` | Designer — export / import template | E6-S10 |
| `report_viewer_embedded_view/` | Viewer — main (toolbar + thumbnails + pages) | E7-S1…S4, E8-S1, E8-S2 |
| `report_viewer_loading_empty_and_error_states/` | Viewer — loading / empty / error | E7-S5 |
| `report_viewer_export_watermark_dialogs/` | Viewer — export PDF / watermark dialogs | E8-S3, E8-S4 |
| `refined_report_designer_quiet_precise_style/` | Alt cleaner designer pass — reference for the calm/quiet treatment | E5-S1 styling |
| `a_professional_minimalist_document_preview…/` | Standalone rendered-invoice reference (renderer output target) | E4-S1…S3 |

### 12.2 What the mockups confirmed (build to these)
- **Designer = four zones:** top bar · left palette (`Insert` / `Layers` / `Data` tabs) · center canvas with **mm rulers**, dotted grid, white A4 "paper", and a "Drag a control here to begin" empty state · right **Properties** panel with collapsible sections (Layout, Text/Style, Data Binding, Visibility) and a "select an element" empty state. A bottom **status bar** shows zoom / `Fit` / `A4 · Portrait · mm` / `Page x of y`, plus a keyboard-shortcuts hint.
- **Selection model:** indigo selection rectangle + 8 handles + a floating `x/y · w×h mm` coordinate badge; a floating mini-toolbar over a selected table (`Add column`, `Add group`, gear).
- **Data table properties:** Data Source (bound array chip `invoice.lineItems[]` + row count), reorderable Columns list with type/format chips, Selected-column editor (header text, `$.field` expression with `FX`, width mm, align, footer-aggregate toggle + function), Grouping, Options (`Repeat header on each page`, `Keep table together`).
- **Binding editor popover:** `FX` expression input with field autocomplete + green "valid" state, resolved-value preview, Format, Fallback, `Visible when`, Cancel/Apply.
- **Page setup dialog:** Paper select, Portrait/Landscape segmented, linked margins (T/R/B/L mm), Units `mm/pt/in`, default font, live scaled page preview.
- **Export/Import dialog:** Export/Import tabs; export shows a mono JSON preview with `"schemaVersion": "1.0.0"`, a green **validated** chip, `Copy`, filename, pretty-print toggle, Download JSON; import shows a dashed drop zone, "Older templates are migrated automatically", and a validation-success row.
- **Viewer:** recessive toolbar (title · `‹ 1/12 ›` · `− 100% +` · `Fit width ▾` · Print / Export ▾ / Watermark / overflow), optional left **thumbnail rail** (current page outlined indigo), scrolling white pages on the grey backdrop, bottom status. **Loading** = spinner + skeleton page; **Empty** = "No data to display"; **Error** = calm danger icon + reason (`Template failed validation: missing 'page.size'`) + "View details".

### 12.3 Reconciliation rules (resolve Stitch drift before building)
Stitch varied some details between screens. **These are the canonical choices — apply them everywhere; ignore the mockup where it conflicts:**
1. **Product name is "Rendara Reports"** (wordmark "Rendara"). Ignore stray names in mockups (`ReportGen Pro`, `Report Designer`, `RendaraGen`, etc.).
2. **Canonical designer top bar** = the `report_designer_workspace` one: wordmark · editable doc name + pencil · `Saved` status · `Import data` · `Preview` · `Export ▾` · overflow. Ignore the `File/Edit/View/Format/Tools` menu bars and the `Drafts/Published/Archived` tabs seen on some screens.
3. **Canonical left-panel tabs** = `Insert` · `Layers` · `Data` (the "Styles" tab some screens show is folded into the right **Properties** panel).
4. **v1 palette** = Text, Image, Line, Rectangle, Ellipse, Data Table **only.** `Shape`, `Chart`, `QR Code`, `List` appear in one mockup but are **Future-epic** items — do not build them in v1.
5. **Authoring unit = mm** (with pt/in options). Ignore the `px` coordinates shown on the data-binding screen.
6. **Viewer toolbar is the clean one** (`report_viewer_embedded_view`). The `File/View/Annotate/Review` menus and "Annotate/Review" on the states screen are **not** in v1 scope.
7. **Sample content is fixed** by `design.md` §8 (Invoice — Acme Corp, Northwind Trading Ltd, `INV-2042`, 17 Jun 2026). Ignore other sample values/dates in mockups.
8. **Accent indigo is `#4F46E5`** (the documented accent). Ignore the slightly darker `#3525cd` "primary" in Stitch's Material scaffold.

### 12.4 How Claude Code should use the mockups
When implementing a user-facing story: open the matching `docs/ui-mockups/<folder>/screen.png`, apply §12.3, then build the screen in Angular against `design.md` tokens and the shared renderer. Treat `code.html` as a layout hint only. The DoD's **UI fidelity** check (see §9) is met when the built screen matches the mockup *after* reconciliation.
