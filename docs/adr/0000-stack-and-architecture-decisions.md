# ADR 0000 — Foundational stack & architecture decisions

- **Status:** Accepted
- **Date:** 2026-06-18
- **Story:** E0-S9 · Repo governance docs (records decisions taken across Epic 0,
  per **brief §3–§4**)

> This is the **foundational ADR**, numbered **0000** so it sorts first as the
> baseline the rest build on. ADRs [0001](0001-visual-regression-determinism.md)–[0004](0004-design-tokens-theming.md)
> were written first chronologically (each recording one Epic 0 tooling decision)
> and are **downstream refinements** of the platform choices captured here. The
> formal ADR [template](template.md), `ARCHITECTURE.md`, and `CONTRIBUTING.md`
> land alongside this ADR in E0-S9; from here on every significant architectural
> decision gets its own ADR.

## Context

Rendara Reports is a stable, standardised product for industry professionals: a
**100% front-end** Angular reporting platform with a **Report Designer** app and
an **embeddable Report Viewer** npm package that share one codebase. The contract
between them is a **versioned Template JSON schema**. Correctness of rendering,
pagination, and that contract is non-negotiable (brief §1).

The platform-level technology and structural choices were researched up front
(brief §3–§4) and applied while scaffolding Epic 0. They were not, until now,
recorded as a single decision record. This ADR captures them so the rationale is
durable and so later ADRs have a baseline to refer back to (and, where needed, to
supersede).

## Decision

1. **Framework: Angular 21** — standalone components, signals, the new control
   flow (`@if`/`@for`), and **zoneless** change detection. No `NgModule`, no
   Zone.js patterns. Angular 21 is the LTS target for product stability; the
   **published viewer** keeps a **wide peer range (`>=20`)** for host adoption.

2. **Monorepo: Nx** with **pnpm**. Nx gives `affected` builds/tests, caching, and
   — critically — **module-boundary enforcement** (`@nx/enforce-module-boundaries`)
   that keeps the schema/engine/renderer/viewer layers from bleeding into each
   other. The layer graph and tag scheme are specified in **brief §4** and
   documented in [`docs/architecture/module-boundaries.md`](../architecture/module-boundaries.md).

3. **Designer state: `@ngrx/signals` SignalStore** for the designer's
   document/selection/undo-redo state. The renderer and viewer use plain signals
   + component inputs — **no global store** is forced on them or on host apps.

4. **Data binding / expressions: JSONata**, a JSON-native, **sandboxed** query/
   transform language (no `eval`, no `new Function`). It powers placeholder
   expressions, computed fields, conditional visibility, and aggregates. A thin
   **`Intl`-based formatting layer** handles numbers/currency/percent/dates.
   **No template-supplied string is ever evaluated as JS** — a hard rule.

5. **Rendering: one shared Angular renderer emitting absolutely-positioned
   HTML/CSS (DOM/SVG), not raster canvas.** Canvas (Konva/Fabric) gives a nicer
   free-form editing feel but **rasterises text**, which wrecks print/PDF
   crispness, accessibility, and paginating data tables. A DOM renderer keeps text
   vector-sharp, accessible, and paginates naturally. The **same renderer** drives
   both the designer preview (design mode + overlays) and the viewer (view mode),
   guaranteeing true WYSIWYG.

6. **Pagination: a custom paginator** in the framework-agnostic engine — computes
   page breaks, repeats table headers per page, handles keep-together, grouping
   with carry-over subtotals, and page headers/footers. A custom, testable
   paginator gives the deterministic output that visual-regression snapshots
   require; Paged.js is a reference only.

7. **Print & PDF: native browser print + a _pluggable_ PDF exporter.** Print
   renders a paginated print stylesheet (`@page`) and calls `window.print()` for
   crisp vector output. Export defines a `PdfExporter` interface with a default
   client-side implementation and a documented optional server-side
   Puppeteer/Playwright path. Raster-only `html2canvas`+`jsPDF` is rejected as the
   primary path.

8. **UI & isolation: Angular CDK throughout.** The **designer** may add Tailwind
   (or the in-repo `ui-kit`) for chrome; the **viewer must stay UI-kit-light** —
   CDK + scoped CSS only — to keep the bundle small and avoid forcing a design
   system on hosts. Theming via **CSS custom properties**; `ViewEncapsulation`
   plus an opt-in Shadow DOM mode so the viewer neither leaks styles into nor
   inherits them from the host.

9. **Testing & tooling:** **Vitest** + Angular Testing Library (unit/component),
   **Playwright** (e2e + **visual-regression**), **axe-core** (a11y), **ajv**
   (schema-contract). ESLint (+ angular-eslint) with Nx boundary rules, Prettier,
   strict TypeScript, **commitlint + Conventional Commits**, **Changesets** for
   versioned releases of the published packages, **Storybook** for component docs,
   and GitHub Actions CI with `nx affected`.

10. **Package boundaries (brief §4):** `report-schema` (publishable, framework-
    agnostic) → `report-engine` (pure TS) → `report-renderer` (Angular) →
    `report-viewer` (publishable Angular, **bundles** the inner libs). Apps depend
    inward only: `designer` on schema/engine/renderer/ui-kit; `viewer-demo` on
    `@rendara/report-viewer` **only**, to prove the integration story.

## Consequences

- **+** A single, shared rendering path means designer preview and rendered output
  are pixel-identical — WYSIWYG is structural, not aspirational.
- **+** Sandboxed expressions + DOM rendering + style isolation make the viewer
  safe to embed in arbitrary host apps with arbitrary data.
- **+** Enforced module boundaries keep the crown-jewel schema contract and the
  framework-agnostic engine cleanly reusable (incl. server-side).
- **−** A custom paginator and a shared two-mode renderer are the hardest pieces to
  build and test; they carry the most algorithmic risk (flagged ⭐ in the backlog).
- **−** Committing to DOM rendering forecloses canvas-style free-form editing as
  the default (noted as a possible future enhancement only).
- **−** Wide viewer peer range (`>=20`) constrains use of newest-Angular-only APIs
  in the published surface.

## Alternatives considered

- **Raster canvas renderer (Konva/Fabric).** Rejected as the default: rasterised
  text breaks print/PDF fidelity, accessibility, and table pagination — fatal for
  a reporting product. Kept on the table only as an optional free-form enhancement.
- **Two renderers (separate designer preview vs. viewer).** Rejected: guarantees
  drift between what is designed and what renders.
- **Angular CLI workspaces instead of Nx.** Lighter, but lacks Nx's
  module-boundary enforcement and `affected`/caching — both worth it at this size.
- **`eval`/`new Function` or a templating engine that compiles to JS.** Rejected
  outright (hard rule): it would execute template-supplied code in host apps.
- **CSS-paged-media library (Paged.js) for pagination.** Useful reference, but a
  custom engine gives the determinism and control the snapshot contract needs.
- **`html2canvas` + `jsPDF` as the primary PDF path.** Rejected: rasterises and
  mishandles page breaks; kept only behind the swappable `PdfExporter` if ever
  needed.
