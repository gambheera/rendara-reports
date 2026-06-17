# Rendara Reports — Epic & Story Backlog

> Companion to `RENDARA_PROJECT_BRIEF.md`. Implement **one story at a time**, each opened as a small PR and **reviewed by you** before the next.
> Every story must satisfy the **global Definition of Done (DoD)** in §9 of the brief, **plus** the story-specific QA listed here.
> Story format: **ID · Title** → *user story* → **Acceptance criteria** → **Story-specific QA**.

**Legend:** 🟥 critical-path · 🟦 parallelizable · ⭐ has notable risk/complexity worth extra review.

> **UI mockups:** user-facing stories carry a **🖼 UI ref** pointing to the approved mockup in `docs/ui-mockups/`. Build to that mockup **after** applying the reconciliation rules in **brief §12.3** (canonical name, top bar, tabs, palette, units, accent, sample data). Mockups are visual references — the written stories + `design.md` are authoritative, and Stitch's `code.html` is a hint, not production code.

---

## Epic 0 — Foundations, Tooling & Quality Gates 🟥
*Goal: a clean Nx monorepo with all quality gates wired before any feature code exists. Nothing ships without the gates.*

**E0-S1 · Initialize Nx workspace**
*As a developer, I want a configured Nx workspace so all later work shares one toolchain.*
- **Acceptance:** Nx workspace created; pnpm; Angular 21; strict TypeScript; Prettier + ESLint + angular-eslint; editorconfig; root README placeholder. `nx graph` runs.
- **QA:** `nx run-many -t lint` and a trivial smoke test pass; CI not yet required but commands documented.

**E0-S2 · Project skeleton & module boundaries** 🟥
*As an architect, I want all projects scaffolded with enforced boundaries so layers can't bleed into each other.*
- **Acceptance:** empty projects exist — `apps/designer`, `apps/viewer-demo`, `libs/report-schema`, `libs/report-engine`, `libs/report-renderer`, `libs/report-viewer`, `libs/ui-kit`. Nx tags + `@nx/enforce-module-boundaries` configured exactly per brief §4.
- **QA:** a deliberate illegal import (e.g. schema → renderer) **fails lint**; a legal import passes. Test documented.

**E0-S3 · CI pipeline**
*As a maintainer, I want CI so every PR is gated.*
- **Acceptance:** GitHub Actions runs install → lint → typecheck → test → build using `nx affected`; Nx cache enabled; branch protection requires the checks.
- **QA:** a PR with a lint error is blocked by CI; a clean PR passes. Screenshot/log in PR.

**E0-S4 · Test harness (unit/component/e2e/a11y)**
*As a developer, I want all test types ready so stories can include tests from day one.*
- **Acceptance:** Vitest + Angular Testing Library configured for libs/apps; Playwright e2e project for `designer` and `viewer-demo`; axe-core helper available; coverage thresholds set (engine/schema ≥90%, UI ≥80%) and enforced in CI.
- **QA:** one example unit test, one component test, one Playwright test, one axe assertion all run green in CI.

**E0-S5 · Visual-regression harness** ⭐
*As a reviewer, I want pixel-diff snapshots so rendering regressions are caught automatically.*
- **Acceptance:** Playwright screenshot snapshotting configured with a stable rendering environment (fixed viewport, fonts pinned/embedded, deterministic); a `update-snapshots` workflow documented; baseline storage strategy decided.
- **QA:** an intentional visual change produces a diff that fails CI and can be reviewed/approved.

**E0-S6 · Storybook**
*As a developer, I want Storybook so components are documented and visually testable in isolation.*
- **Acceptance:** Storybook runs for `report-renderer`, `report-viewer`, `ui-kit`; builds in CI.
- **QA:** one example story renders; build step green.

**E0-S7 · Release tooling & commit hygiene**
*As a maintainer, I want versioned releases and consistent commits.*
- **Acceptance:** Changesets configured for `@rendara/report-viewer` and `@rendara/report-schema`; commitlint + Conventional Commits; CHANGELOG generation; npm publish dry-run wired (no real publish yet).
- **QA:** a non-conventional commit is rejected; `changeset version` dry-run produces a correct bump.

**E0-S8 · Design tokens & ui-kit base** 🟦
*As a designer-app developer, I want shared tokens so the UI is consistent.*
- **Acceptance:** CSS-custom-property token set (color, spacing, typography, radii, elevation); `ui-kit` scaffolding; Tailwind configured for `apps/designer` (optional) bound to the tokens.
- **QA:** a token-driven sample component renders in Storybook in light/dark.
- **🖼 UI ref:** `docs/ui-mockups/style_guide/` (swatches, type scale, components gallery, geometry/grid, iconography — the visual encoding of `design.md`).

**E0-S9 · Repo governance docs**
*As a contributor, I want the rules written down.*
- **Acceptance:** `ARCHITECTURE.md`, `CONTRIBUTING.md`, ADR template + first ADR (stack decisions), PR template embedding the DoD checklist, `CODEOWNERS`.
- **QA:** PR template auto-populates; ADR renders.

---

## Epic 1 — Template Schema & Contract (`@rendara/report-schema`) 🟥⭐
*Goal: the versioned, validated Template JSON contract that everything depends on. Get this right before building on it.*

**E1-S1 · Core document & element-base types**
*As an engineer, I want the foundational TS types so all layers share one model.*
- **Acceptance:** `RendaraTemplate`, `Page`, band containers (header/body/footer), `ElementBase` (id, type, frame, style ref, z, visibleWhen). Discriminated union for element types stubbed.
- **QA:** types compile; a hand-written fixture is assignable to `RendaraTemplate`.

**E1-S2 · Page & document settings model**
*As a report author, I want page setup so reports target real paper sizes.*
- **Acceptance:** page size (A4 | Letter | custom mm), orientation, margins (mm), authoring units, default font, optional background; sensible defaults.
- **QA:** unit tests for default resolution and custom-size validation.

**E1-S3 · Element models (text, shape, image, dataTable)** ⭐
*As a report author, I want all v1 element types defined.*
- **Acceptance:** `TextElement`, `ShapeElement` (`line|rect|ellipse`), `ImageElement` (src/url, fit mode), `DataTableElement` (source arrayExpr, columns with header/cell/footer, optional groups, repeatHeaderOnEachPage, keepTogether). Common frame + binding + style on each.
- **QA:** fixtures for each type validate; exhaustive discriminated-union handling enforced by type tests.

**E1-S4 · Style model**
*As a report author, I want a complete style model.*
- **Acceptance:** font (family/size/weight/style), color, background/fill, border (per side, width/style/color), alignment (h/v), padding, line/shape stroke, number/date format slot.
- **QA:** invalid style values rejected by validator with clear messages.

**E1-S5 · Binding model**
*As a report author, I want a structured data-binding definition.*
- **Acceptance:** element `binding` (`expr`, `format`, `fallback`); table column `cell`/`footer` bindings; table `source.arrayExpr`; group definitions with aggregate bindings; `visibleWhen`.
- **QA:** fixtures exercising each binding location validate; malformed bindings rejected.

**E1-S6 · JSON Schema + validator API** 🟥
*As a developer, I want machine validation of templates.*
- **Acceptance:** generated JSON Schema; `validate(template): Result<RendaraTemplate, RendaraValidationError[]>` using ajv; human-readable, path-pointed error messages; `parse(stringOrObject)`.
- **QA:** golden valid templates pass; a suite of intentionally-broken templates each produce the *expected* specific error.

**E1-S7 · Schema versioning & migrations** ⭐
*As a maintainer, I want safe schema evolution so old templates never break.*
- **Acceptance:** `schemaVersion` (semver); a `migrate(template)` runner chaining version→version migrations to current; identity migration for current version.
- **QA:** a v0.9-style fixture migrates to current and then validates; round-trip stable; missing/unknown version handled gracefully.

**E1-S8 · Canonical golden fixtures** 🟥
*As a tester, I want reference templates used across the whole test suite.*
- **Acceptance:** at least 3 golden templates committed — **invoice** (text + table + totals), **certificate** (absolute layout + image + shapes), **tabular report** (large table + grouping). Each paired with a sample Data JSON.
- **QA:** all goldens validate; they become the basis for later pagination/render/visual tests.

---

## Epic 2 — Binding & Expression Engine (`@rendara/report-engine`) 🟥⭐
*Goal: safe, locale-aware data binding. Pure TypeScript, framework-agnostic, heavily unit-tested.*

**E2-S1 · Sandboxed expression evaluation**
*As the renderer, I want to evaluate template expressions safely.*
- **Acceptance:** JSONata integrated behind a `evaluate(expr, scope)` API; **no `eval`/`new Function` anywhere**; compile-once/cache; structured errors for bad expressions.
- **QA:** unit tests for nested access, string ops, conditionals; a malicious-string test proves no code execution; error cases return typed errors, never throw raw.

**E2-S2 · Formatting layer** 🟦
*As a report author, I want locale-aware formatting.*
- **Acceptance:** `Intl`-based registry resolving `currency:USD`, `number:0.00`, `percent`, `date:short|medium|long|custom`, plus a fallback raw format; locale parameterized.
- **QA:** table-driven tests across locales (e.g. en-US, de-DE, ar-EG) for number/currency/date; null/undefined → fallback.

**E2-S3 · Conditional visibility & formatting**
*As a report author, I want elements to show/hide and restyle based on data.*
- **Acceptance:** `visibleWhen` boolean evaluation; conditional style rules resolved to concrete style.
- **QA:** truthy/falsy/error-expression cases; an errored condition fails safe (documented default).

**E2-S4 · Sample-data introspection**
*As the designer, I want a field tree derived from sample data.*
- **Acceptance:** walk arbitrary JSON → tree of paths with types (scalar/object/array), array element shapes detected for table sources; depth/size limits to stay responsive.
- **QA:** tests over nested + array + mixed/ragged data; huge-object guard verified.

**E2-S5 · Binding resolver & aggregates** ⭐
*As the renderer, I want resolved values for every bound element and table cell.*
- **Acceptance:** resolve element values, table rows (row scope `$`), column/group/grand-total aggregates (`sum/avg/count/min/max`); deterministic ordering.
- **QA:** aggregate correctness tests incl. empty arrays, single row, nulls; grouped totals reconcile to grand total.

**E2-S6 · Missing/invalid-data handling**
*As a viewer user, I want graceful output when data is incomplete.*
- **Acceptance:** missing path → `fallback` or blank (never crash); type mismatches handled; an errors/warnings report surfaced to the host via the engine result.
- **QA:** partial-data fixtures render values where present and fall back elsewhere; warnings collected and asserted.

---

## Epic 3 — Pagination & Layout Engine (`@rendara/report-engine`) 🟥⭐
*Goal: turn template + resolved data into a deterministic multi-page layout. The hardest core; test with snapshots of the computed page model.*

**E3-S1 · Units & coordinate system**
*As the layout engine, I want reliable unit conversion.*
- **Acceptance:** mm/pt ↔ px conversions at configurable DPI; page/printable-area geometry from page settings + margins.
- **QA:** conversion round-trip tests; A4/Letter printable areas match expected mm/px.

**E3-S2 · Static single-page layout**
*As the renderer, I want fixed elements placed on a page.*
- **Acceptance:** resolve frames to absolute px boxes within the printable area; z-order; clipping rules.
- **QA:** snapshot of computed layout for the certificate golden matches baseline.

**E3-S3 · Data-table expansion & row measurement** ⭐
*As a report author, I want tables that grow with data.*
- **Acceptance:** expand detail rows from the bound array; per-row height from content (text wrap/measurement strategy decided and documented); column widths honoured.
- **QA:** wrapping/long-content fixtures produce correct row heights; deterministic across runs.

**E3-S4 · Pagination algorithm** 🟥⭐
*As a report author, I want correct page breaks.*
- **Acceptance:** break body/table across pages; **repeat table header each page**; `keepTogether`; basic widow/orphan handling; carry remaining rows forward.
- **QA:** the tabular-report golden paginates to the expected page count with headers on every page; snapshot the page model; edge cases (table starts near page end, single huge row) covered.

**E3-S5 · Page header/footer, page numbers, watermark model**
*As a report author, I want repeating chrome and page numbers.*
- **Acceptance:** header/footer bands rendered per page; `{{pageNumber}}`/`{{pageCount}}` tokens resolved; watermark config produced in the page model.
- **QA:** multi-page fixture shows correct, incrementing page numbers and repeating header/footer.

**E3-S6 · Grouping & group aggregates across pages** ⭐
*As a report author, I want grouped tables with subtotals.*
- **Acceptance:** group headers/footers; subtotal aggregates; group-continued labels when a group spans pages; grand total.
- **QA:** grouped golden reconciles subtotals → grand total; page-spanning group renders continuation correctly.

**E3-S7 · Pagination snapshot suite** 🟥
*As a maintainer, I want regression protection on the layout brain.*
- **Acceptance:** serialized page-model snapshots for all goldens checked into the repo.
- **QA:** any change to layout output requires an explicit, reviewed snapshot update.

---

## Epic 4 — Shared Rendering Engine (`@rendara/report-renderer`) 🟥⭐
*Goal: render the page model to DOM. Same renderer powers designer preview and viewer (true WYSIWYG).*

**E4-S1 · Single-page DOM renderer**
*As the viewer/designer, I want a page rendered from the page model.*
- **Acceptance:** absolutely-positioned DOM page at a given zoom; units→px; page frame with correct printable area; background.
- **QA:** component test asserts element positions; visual snapshot of the certificate golden.
- **🖼 UI ref (rendered-output target):** `docs/ui-mockups/a_professional_minimalist_document_preview…/` and `docs/ui-mockups/report_designer_preview_mode/` (the crisp, document-first invoice the renderer must produce).

**E4-S2 · Element renderers (text, shape, image)** 🟦
*As a report author, I want each element type to render.*
- **Acceptance:** text (font/align/wrap/format applied); shapes (line/rect/ellipse with stroke/fill); image with fit modes and **safe URL handling** (block `javascript:`; sanitize).
- **QA:** per-type visual snapshots; malicious image URL is neutralised (security test).

**E4-S3 · Data-table renderer** ⭐
*As a report author, I want tables rendered with header/detail/footer and groups.*
- **Acceptance:** renders the paginated table model incl. repeated headers, group headers/footers, aggregates, alignment.
- **QA:** visual snapshots for plain + grouped tables; matches the pagination model.

**E4-S4 · Multi-page rendering + zoom**
*As a viewer user, I want all pages with zoom.*
- **Acceptance:** render N pages; zoom transform (fit-width/fit-page/%); single vs continuous layout hook.
- **QA:** multi-page golden renders correct page count; zoom levels visually snapshotted.

**E4-S5 · Style isolation & theming** 🟥
*As a host-app developer, I want the viewer not to fight my CSS.*
- **Acceptance:** scoped styles + CSS reset; `ViewEncapsulation` strategy; opt-in Shadow DOM mode; theme via CSS custom properties.
- **QA:** rendered inside a host page with hostile global CSS, output is unaffected (e2e test); host styles unchanged by the viewer.

**E4-S6 · Design-mode hooks**
*As the designer, I want the renderer to expose selection/interaction anchors without forking.*
- **Acceptance:** render mode flag (`view`|`design`); per-element hit targets/metadata exposed in design mode; output identical in view mode.
- **QA:** test confirms view-mode DOM is byte-stable regardless of design hooks.

**E4-S7 · Watermark & page-chrome rendering**
*As a report author, I want watermark and repeating header/footer drawn.*
- **Acceptance:** watermark overlay (text/image, opacity, angle); header/footer + page numbers drawn from page model.
- **QA:** visual snapshot with watermark; print-mode snapshot.

**E4-S8 · Render visual-regression baseline** 🟥
*As a maintainer, I want a complete rendered baseline.*
- **Acceptance:** every golden rendered and snapshotted (screen + print stylesheet) as the protected baseline.
- **QA:** suite green; diffs require review.

---

## Epic 5 — Designer: Canvas & Manipulation (`apps/designer`) 🟦⭐
*Goal: the editing surface and core direct-manipulation. Uses the shared renderer in design mode.*

**E5-S1 · Designer shell layout**
*As a report author, I want the four-zone layout (top bar, left palette, center canvas, right properties).*
- **Acceptance:** responsive shell; resizable/collapsible panels; empty placeholders wired.
- **QA:** layout e2e at desktop widths; a11y landmark roles present.
- **🖼 UI ref:** `docs/ui-mockups/report_designer_workspace/` (calm treatment: `refined_report_designer_quiet_precise_style/`).

**E5-S2 · Designer state store** ⭐
*As the designer, I want a single source of truth for the document.*
- **Acceptance:** `@ngrx/signals` store holding template model, selection, zoom, dirty flag; immutable updates; selectors as signals.
- **QA:** store unit tests; mutations produce new references; selection invariants hold.

**E5-S3 · Page setup UI**
*As a report author, I want to set page size/orientation/margins/units.*
- **Acceptance:** controls bound to the schema page model; canvas resizes live.
- **QA:** changing A4→Letter updates canvas geometry; values validated against schema.
- **🖼 UI ref:** `docs/ui-mockups/report_designer_page_setup_dialog/`.

**E5-S4 · Canvas renders document (WYSIWYG)** 🟥
*As a report author, I want my design shown exactly as it will render.*
- **Acceptance:** canvas hosts the shared renderer in design mode; rulers + grid; zoom.
- **QA:** the same template renders identically in canvas and (later) viewer — cross-checked by a shared visual snapshot.
- **🖼 UI ref:** `docs/ui-mockups/report_designer_workspace/` (canvas: mm rulers, dotted grid, white A4 paper, "Drag a control here to begin" empty state).

**E5-S5 · Drag-and-drop create from palette**
*As a report author, I want to drop a control onto the canvas to add it.*
- **Acceptance:** Angular CDK drag from palette → element created at drop point in store with default props.
- **QA:** e2e drops each type; element appears at correct coordinates; undoable (after E5-S9).

**E5-S6 · Select / move / resize** ⭐
*As a report author, I want to manipulate elements directly.*
- **Acceptance:** click-select; selection overlay; drag-move; resize handles; live coordinate/size readout; keyboard nudge.
- **QA:** e2e for move + resize updates store; coordinates match; pixel-snapping correct.
- **🖼 UI ref:** `docs/ui-mockups/report_designer_text_properties/` (selection model: indigo rectangle + 8 handles + floating `x/y · w×h mm` badge).

**E5-S7 · Multi-select, z-order, grouping**
*As a report author, I want to manage multiple/overlapping elements.*
- **Acceptance:** shift/marquee multi-select; bring-forward/back/front/back; group/ungroup.
- **QA:** z changes reflected in render order; group moves as a unit.

**E5-S8 · Snapping & alignment guides**
*As a report author, I want help aligning elements.*
- **Acceptance:** grid snap; smart guides to other elements/margins; align + distribute tools.
- **QA:** guides appear at expected thresholds; align/distribute math tested.

**E5-S9 · Undo/redo & clipboard** ⭐
*As a report author, I want to undo mistakes and copy elements.*
- **Acceptance:** command/history stack; undo/redo; copy/cut/paste/duplicate/delete; standard keyboard shortcuts.
- **QA:** property-based test: random op sequences + full undo returns to initial state; clipboard round-trips.

---

## Epic 6 — Designer: Controls, Properties & Binding (`apps/designer`) 🟦
*Goal: the actual authoring features — controls, properties, and data binding, plus import/export.*

**E6-S1 · Text control** → palette item + default; editable text + style.
- **Acceptance:** add text; edit literal text; style via properties.
- **QA:** renders identically in canvas and viewer; snapshot.
- **🖼 UI ref:** `docs/ui-mockups/report_designer_text_properties/` (palette Text tile + Layout/Text/Style/Binding panel).

**E6-S2 · Shape controls (line/box/circle)**
- **Acceptance:** add each shape; stroke/fill/size editable.
- **QA:** per-shape snapshots; line endpoints/resize correct.

**E6-S3 · Image control**
- **Acceptance:** add image via upload or URL; fit modes; safe URL handling.
- **QA:** large image handled; malicious URL blocked; snapshot.

**E6-S4 · Data-table control** ⭐
- **Acceptance:** add table; add/remove/reorder columns; set header text; resize columns; configure header/detail/footer; group config UI.
- **QA:** table structure round-trips through schema; e2e for column add/remove/resize.
- **🖼 UI ref:** `docs/ui-mockups/report_designer_data_table_properties/` (floating table mini-toolbar; Columns list with type/format chips; Selected-column editor; Options toggles).

**E6-S5 · Properties panel framework** ⭐
*As a report author, I want a context-aware properties panel per element type.*
- **Acceptance:** dynamic panel resolves controls by element type; style editors (font, color, border, fill, align, padding, format); multi-select edits common props.
- **QA:** changing any property updates store + canvas live; validation against schema; component tests per editor.
- **🖼 UI ref:** `docs/ui-mockups/report_designer_text_properties/` + `…/report_designer_data_table_properties/` (collapsible Layout / Text-Style / Data Binding / Visibility sections; empty "select an element" state).

**E6-S6 · Import sample data & field tree**
*As a report author, I want to load sample data and see bindable fields.*
- **Acceptance:** import Data JSON; field-tree panel (scalars/objects/arrays); search/filter.
- **QA:** nested + array data introspected correctly; invalid JSON handled with a clear error.
- **🖼 UI ref:** `docs/ui-mockups/report_designer_data_binding/` (left `Data` tab: sample-data file + Replace, Filter fields, field tree with type chips + array `[ ]` chip + drag grips).

**E6-S7 · Binding editor (drag-to-bind + expressions)** ⭐
*As a report author, I want to bind elements to data with formatting and conditions.*
- **Acceptance:** drag field onto element to bind; expression input with autocomplete; format picker; fallback; `visibleWhen`.
- **QA:** bound element previews resolved value; invalid expression shows inline error; binding persists in schema.
- **🖼 UI ref:** `docs/ui-mockups/report_designer_data_binding/` (binding popover: `FX` expression + autocomplete + valid state, resolved-value preview, Format, Fallback, `Visible when`, Cancel/Apply; drag-to-bind drop highlight on canvas).

**E6-S8 · Table data binding & aggregates**
*As a report author, I want to bind a table to an array and add totals.*
- **Acceptance:** pick array source; bind columns (row-scope `$`); column/group footers with aggregates.
- **QA:** preview shows repeated rows + correct totals; round-trips.
- **🖼 UI ref:** `docs/ui-mockups/report_designer_data_table_properties/` (Data Source bound-array chip + row count; Selected-column `$.field` expression; footer-aggregate toggle + function).

**E6-S9 · Live preview mode** 🟥
*As a report author, I want to preview the finished report with sample data.*
- **Acceptance:** toggle to viewer-style render with sample data; multi-page; uses the shared renderer/engine (no separate code path).
- **QA:** preview output equals what the viewer would produce for the same template+data (shared snapshot).
- **🖼 UI ref:** `docs/ui-mockups/report_designer_preview_mode/` (top bar `‹ Back to editor`, `PREVIEW` badge, page nav + zoom + "Rendered with invoice-sample.json"; full rendered invoice, no side panels).

**E6-S10 · Export / import Template JSON** 🟥⭐
*As a report author, I want to take my template out and bring it back in.*
- **Acceptance:** export validated Template JSON (download); import validates + migrates; load into designer.
- **QA:** **round-trip integrity** — export → import → export yields equivalent JSON; invalid/older templates handled (validated/migrated).
- **🖼 UI ref:** `docs/ui-mockups/export_template_dialog/` (Export tab: mono JSON preview with `"schemaVersion"`, green **validated** chip, Copy, filename, pretty-print, Download JSON) + `…/import_template_dialog/` (dashed drop zone, "Older templates are migrated automatically", validation-success row).

**E6-S11 · Draft persistence & file UX**
*As a report author, I want my work saved locally so I don't lose it.*
- **Acceptance:** autosave to local storage; new/open/save; unsaved-changes guard on navigation.
- **QA:** reload restores draft; guard prevents accidental loss; (no browser-storage in any published lib — designer app only).

---

## Epic 7 — Viewer: Core (`@rendara/report-viewer`) 🟥
*Goal: the embeddable viewer that turns template+data into a rendered, navigable report.*

**E7-S1 · Public component API** ⭐
*As a host-app developer, I want a clean, documented component API.*
- **Acceptance:** standalone `<rendara-report-viewer>` with inputs (`template`,`data`,`config`,`theme`) and outputs (`rendered`,`pageChange`,`error`) per brief §8; signal-based inputs.
- **QA:** API contract test; TypeScript consumers get full typing; SSR-safe (browser APIs guarded).
- **🖼 UI ref:** `docs/ui-mockups/report_viewer_embedded_view/` (overall viewer shell shown embedded in a host app).

**E7-S2 · Render pipeline integration** 🟥
*As a host-app developer, I want valid template+data to render.*
- **Acceptance:** viewer validates → binds → paginates → renders via engine + shared renderer; emits `rendered`.
- **QA:** all goldens render in the viewer matching the shared baseline snapshots.

**E7-S3 · Page navigation**
*As a viewer user, I want to move between pages.*
- **Acceptance:** next/prev/goto; current/total display; single vs continuous mode.
- **QA:** e2e navigation; `pageChange` events correct; keyboard navigation works.
- **🖼 UI ref:** `docs/ui-mockups/report_viewer_embedded_view/` (toolbar `‹ 1/12 ›`, left thumbnail rail with current page outlined indigo, bottom `Page x of y`).

**E7-S4 · Zoom**
*As a viewer user, I want to zoom and fit.*
- **Acceptance:** zoom in/out/%, fit-width, fit-page; responsive to container resize.
- **QA:** zoom levels snapshotted; fit math correct across container sizes.
- **🖼 UI ref:** `docs/ui-mockups/report_viewer_embedded_view/` (zoom group `− 100% +` and `Fit width ▾`).

**E7-S5 · Loading / empty / error states**
*As a viewer user, I want clear feedback when things go wrong.*
- **Acceptance:** loading indicator; empty-data state; invalid template/data → friendly error + `error` output (never a blank crash).
- **QA:** broken-template and missing-data fixtures produce the intended states; errors surfaced, not thrown.
- **🖼 UI ref:** `docs/ui-mockups/report_viewer_loading_empty_and_error_states/` (Loading = spinner + skeleton page; Empty = "No data to display"; Error = calm danger icon + reason + "View details").

---

## Epic 8 — Viewer: Toolbar & Output (`@rendara/report-viewer`) 🟦
*Goal: the report-viewer toolbar functions.*

**E8-S1 · Configurable toolbar**
*As a host-app developer, I want to control which toolbar actions appear.*
- **Acceptance:** toolbar with show/hide per button via `config.toolbar`; custom-action slot; themed; accessible buttons.
- **QA:** hidden buttons absent from DOM; keyboard + screen-reader labels verified.
- **🖼 UI ref:** `docs/ui-mockups/report_viewer_embedded_view/` (recessive toolbar: title · page nav · zoom · Print / Export ▾ / Watermark / overflow).

**E8-S2 · Print** 🟥
*As a viewer user, I want to print a crisp, correctly-paginated report.*
- **Acceptance:** print stylesheet + `@page`; `window.print()`; one rendered page per paper page; vector text.
- **QA:** print-emulation snapshot matches page model; headers/footers/page numbers correct in print.
- **🖼 UI ref:** `docs/ui-mockups/report_viewer_embedded_view/` (Print toolbar action) + the rendered-invoice fidelity in `…/report_designer_preview_mode/`.

**E8-S3 · Export PDF** ⭐
*As a viewer user, I want to download a PDF.*
- **Acceptance:** `PdfExporter` interface + default client-side implementation; filename + metadata configurable; watermark honoured; documented optional server-side path.
- **QA:** generated PDF page count = report page count; text is selectable (not pure raster) on the default path, or limitation documented; exporter is swappable (test a stub exporter).
- **🖼 UI ref:** `docs/ui-mockups/report_viewer_export_watermark_dialogs/` (Export PDF tab: filename, Pages All/Current/Range, Quality select, Include-watermark toggle, "Generated in your browser…", Export PDF).

**E8-S4 · Watermark**
*As a viewer user, I want to add a watermark.*
- **Acceptance:** toggle/config (text or image, opacity, angle); appears on every page and in print/PDF.
- **QA:** visual snapshot screen + print; honoured in export.
- **🖼 UI ref:** `docs/ui-mockups/report_viewer_export_watermark_dialogs/` (Watermark tab: Text/Image, opacity, angle, color + live preview tile).

**E8-S5 · Optional viewer extras** 🟦 *(scope as time allows; each its own small story)*
- In-report text search + highlight; rotate; download source JSON; thumbnail page rail.
- **Acceptance/QA:** per chosen sub-feature, with snapshot + e2e. Mark explicitly optional in planning.

---

## Epic 9 — Packaging, Integration & Docs 🟥⭐
*Goal: ship the viewer as a real npm package that drops into any Angular app, with docs and proof.*

**E9-S1 · Publishable viewer build (APF)**
*As a maintainer, I want a spec-compliant package build.*
- **Acceptance:** ng-packagr build for `@rendara/report-viewer`; Angular Package Format compliant; engine/renderer/schema bundled in; production build optimized.
- **QA:** `npm pack` produces a valid tarball; contents inspected; build green in CI.

**E9-S2 · Peer deps & version tolerance**
*As a host-app developer, I want the package to fit my Angular version.*
- **Acceptance:** `peerDependencies` set with a wide Angular range (`>=20`); CDK peer; tree-shakeable; secondary entry points if needed; SSR-safe.
- **QA:** installs cleanly against the min and max supported Angular; unused features tree-shake out (bundle test).

**E9-S3 · Publish `@rendara/report-schema`**
*As a backend/template-tooling developer, I want the schema package standalone.*
- **Acceptance:** framework-agnostic build (no Angular); types + JSON Schema + validator exported; works in Node.
- **QA:** import + validate a golden in a plain Node script.

**E9-S4 · Real integration in `viewer-demo`** 🟥
*As a maintainer, I want to prove the integration story.*
- **Acceptance:** `apps/viewer-demo` consumes the **built package** (not source) and renders a report from template+data with inputs/outputs wired.
- **QA:** e2e renders + prints + exports in the demo; demonstrates `rendered`/`pageChange`/`error`.

**E9-S5 · Theming & encapsulation docs**
*As a host-app developer, I want to theme and isolate the viewer.*
- **Acceptance:** documented CSS-variable theming API; Shadow-DOM opt-in usage; isolation guarantees.
- **QA:** doc examples actually work in `viewer-demo` (tested).

**E9-S6 · API docs, Storybook & README**
*As a consumer, I want clear usage docs.*
- **Acceptance:** README quick-start; full input/output reference (TypeDoc/Compodoc); Storybook stories for viewer states; versioned CHANGELOG.
- **QA:** docs build in CI; quick-start copy-pasted into a clean app works.

**E9-S7 · Clean-room install smoke test** ⭐
*As a maintainer, I want proof it works outside the monorepo.*
- **Acceptance:** script creates a fresh Angular app, installs the packed tarball, renders a report.
- **QA:** automated smoke test green; documented as a release gate.

---

## Epic 10 — Hardening: A11y, i18n, Performance, Security, Release 🟥
*Goal: take it from "works" to "industry-grade", then cut v1.0.0.*

**E10-S1 · Accessibility audit & fixes** ⭐
*As an enterprise buyer, I require WCAG 2.2 AA.*
- **Acceptance:** designer fully keyboard-operable with ARIA; viewer output semantically structured; axe CI gate at zero violations; focus management + contrast verified.
- **QA:** axe automated suite green; manual keyboard + screen-reader pass documented.

**E10-S2 · Internationalization & RTL**
*As a global user, I want localized formatting and RTL.*
- **Acceptance:** locale-aware formatting end-to-end; RTL rendering in the renderer; translatable designer UI strings.
- **QA:** Arabic/German locale fixtures render correctly; RTL visual snapshot.

**E10-S3 · Performance & budgets** ⭐
*As a user, I want large reports to stay fast and the bundle small.*
- **Acceptance:** viewer virtualizes large tables while keeping pagination correct; render-time benchmark for a 10k-row fixture within budget; viewer bundle-size budget enforced in CI; lazy-load heavy bits (e.g. PDF exporter).
- **QA:** benchmark + bundle-size checks in CI; regressions fail the build.

**E10-S4 · Security review**
*As a host-app developer, I trust the viewer with my data.*
- **Acceptance:** HTML sanitization for any string rendered as markup; image/URL allow-listing; confirmed no `eval`/`new Function`; CSP guidance documented; `npm audit`/dependency review clean.
- **QA:** XSS-attempt fixtures (in data and template) are neutralised (tests); audit gate green.

**E10-S5 · Cross-browser & print fidelity**
*As a user, I want consistent output across browsers.*
- **Acceptance:** verified on Chrome, Edge, Firefox, Safari (screen + print); known differences documented.
- **QA:** Playwright matrix across browsers; print snapshots compared.

**E10-S6 · Full visual-regression sweep**
*As a maintainer, I want one comprehensive visual gate before release.*
- **Acceptance:** all goldens across screen/print/zoom/RTL snapshotted and green; flaky tests stabilized.
- **QA:** suite deterministic over repeated CI runs.

**E10-S7 · Release v1.0.0** 🟥
*As a maintainer, I want to publish a stable, versioned product.*
- **Acceptance:** Changesets version bump; CHANGELOG; `@rendara/report-viewer` + `@rendara/report-schema` published; schema-versioning & migration policy documented; upgrade/integration guide.
- **QA:** publish dry-run → real publish; clean-room install of the **published** packages renders a report.

---

## Future / Backlog (post-v1, do not build in v1)
Charts & data visualizations · barcodes/QR codes · report parameters & live datasource connectors · server-side/headless (Puppeteer) PDF microservice for batch/pixel-perfect · template gallery/marketplace & sharing · real-time multi-user collaboration · sub-reports & nested templates · expanded expression/function library · theme packs · conditional sections/bands · AI-assisted template generation from a sample document.

---

### How to use this backlog with Claude Code
For each story, run: *"Implement **[Story ID · Title]** only, per `RENDARA_BACKLOG.md` and the global DoD in `RENDARA_PROJECT_BRIEF.md` §9. Write the tests, run lint/typecheck/test/build, and stop at a reviewable PR with the DoD checklist. Do not start the next story."* Review, then proceed.
