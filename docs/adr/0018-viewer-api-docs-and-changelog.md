# ADR 0018 — Viewer consumer docs: TypeDoc API reference, Storybook state gallery, Changesets CHANGELOG

- **Status:** Accepted
- **Date:** 2026-07-01
- **Story:** E9-S6 · API docs, Storybook & README

## Context

`@rendara/report-viewer` is the product's public npm package; a host-app developer
integrates against it. E9-S6 asks for **clear usage docs**: a README quick-start, a
**full input/output reference** (the backlog names "TypeDoc/Compodoc"), Storybook
stories for the viewer states, and a **versioned CHANGELOG** — with the QA that
**docs build in CI** and the quick-start copy-pastes into a clean app.

Relevant facts / forces:

- The public surface is a mix of an **Angular standalone component** (`ReportViewer`,
  with **signal-based** `input()`/`output()` and new control-flow templates) and a
  set of **plain-TS contract interfaces** (`ViewerConfig`, `ViewerToolbarConfig`,
  `ViewerTheme`, `PdfExporter`/`PdfExportRequest`/`PdfExportResult`, the
  `Rendered`/`PageChange`/`ViewerError` payloads, and the `DEFAULT_*` consts), all
  re-exported from `src/index.ts` and already carrying rich JSDoc.
- The Storybook already ships a comprehensive **state gallery** (Default, Themed,
  Paginated, Zoom, toolbar variants, Export, Watermark, Download-source, Search,
  thumbnail rail, Empty / No-data / Error) with `tags: ['autodocs']`; the loading
  state is transient by design (it "never flashes" for a synchronous input change)
  and cannot be forced into a static story.
- **Changesets** is already the release tool (`.changeset/`, `changelog:
  @changesets/cli/changelog`), versioning the two published packages, but no
  `CHANGELOG.md` file existed yet.
- The DoD requires the docs gate to be **reliably green** in CI, and requires we do
  not expand the public API in a docs-only story.

## Decision

1. **Generate the input/output reference with TypeDoc, from the public entry point.**
   A `libs/report-viewer/typedoc.json` documents `src/index.ts` using
   `tsconfig.lib.json` (which resolves `@rendara/*` from source and already excludes
   specs/stories), emitting HTML to `dist/docs/report-viewer` with the package README
   as the landing page. An Nx target `report-viewer:build-docs`
   (`typedoc --options …`) and a root `pnpm docs:build` script drive it.

2. **Keep the docs gate at "generates without error", not "zero warnings".**
   `treatWarningsAsErrors: false`, and the noisy `validation` categories
   (`invalidLink`, `notExported`, `notDocumented`) are disabled — the component's
   internal JSDoc `{@link}`s point at intentionally non-public members, and the
   public types reference transitive engine/renderer types we deliberately don't
   re-export. A real failure (unresolvable entry point, broken tsconfig, TS error)
   still fails the build; cosmetic link noise does not.

3. **Treat the Storybook file as the documented state gallery; don't fabricate a
   loading story.** The existing stories satisfy "stories for viewer states"; a
   one-line meta note records the E9-S6 traceability and that `autodocs` renders the
   typed API into the Docs tab from the same source.

4. **Seed a Changesets-compatible `libs/report-viewer/CHANGELOG.md`.** It is headed
   by the `# @rendara/report-viewer` H1 that Changesets prepends releases under, with
   a `## 0.0.0 — pre-release development` summary of the milestones that shaped
   today's API; `pnpm release:version` will insert generated version entries above
   it. Scope is the viewer (the consumer package this story serves); the schema
   package's CHANGELOG is seeded when it next changes.

5. **Guard against doc drift with a test.** `docs-consistency.spec.ts` uses Angular's
   public `reflectComponentType` to assert the component's selector and its
   documented inputs/outputs match the README, that the referenced exports/config
   defaults exist, and that the CHANGELOG/README keep their documented shape.

6. **Gate it in CI.** A `build-docs` job in `.github/workflows/storybook.yml` (now
   "Docs & Storybook") runs `nx run report-viewer:build-docs`, so "docs build in CI"
   is enforced alongside the existing Storybook build.

## Consequences

- **+** One command (`pnpm docs:build`) produces a full, source-derived API reference
  from the JSDoc that already exists, so the reference can't drift from the types.
- **+** The CI gate is low-maintenance: it fails on genuine breakage but not on the
  many expected internal-link warnings, so it won't flap.
- **+** `reflectComponentType` ties the README/quick-start to the real component
  metadata — a rename of the selector or an I/O breaks the test before it ships.
- **+** The CHANGELOG is real today (informative pre-1.0 summary) and forward-
  compatible with the Changesets release flow.
- **−** TypeDoc is another devDependency + lockfile entry to keep current.
- **−** The generated HTML is a build artifact under `dist/` (git-ignored), not
  committed; consumers/maintainers run `pnpm docs:build` (or CI publishes it later).
- **−** Disabling link validation means a genuinely-broken `{@link}` in a public type
  won't warn; accepted, since the reference is source-derived and the human-readable
  input/output tables in the README are the authoritative contract.

## Alternatives considered

- **Compodoc instead of TypeDoc.** Compodoc is Angular-aware and is the tool the
  Storybook Angular builder can hook (`compodoc: false` today). Rejected as the
  generator: it historically lags on the newest Angular syntax, and this component
  uses **signal `input()`/`output()`** and **new control flow** — a real risk for a
  gate that must stay green — whereas TypeDoc is TS-native, tracks TS 5.9, and
  documents both the component and the contract interfaces reliably. The backlog
  explicitly allows either.
- **Enable Compodoc inside Storybook autodocs** (flip `compodoc: true`, generate
  `documentation.json`). Rejected: it couples an already-green Storybook build to a
  compodoc pre-step and the same newest-Angular parsing risk, for a docs story.
- **Hand-write the API reference in Markdown.** Rejected: it duplicates the JSDoc and
  rots; the README already carries the human-readable tables, and TypeDoc keeps the
  exhaustive reference generated from source.
- **A Keep-a-Changelog `## [Unreleased]`-topped file.** Rejected: Changesets prepends
  released versions under the H1, which would push a top "Unreleased" section down on
  each release; a bottom-anchored `## 0.0.0` dev summary composes cleanly with the
  tool instead.
- **Skip the doc-drift test** (rely on the build alone). Rejected: the build proves
  docs *generate*, not that the README's selector/imports still match the component —
  exactly the claims that silently rot.
