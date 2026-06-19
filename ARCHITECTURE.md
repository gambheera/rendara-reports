# Architecture

A navigable map of how Rendara Reports is put together and **where to read more**.
It summarises and links the authoritative sources — it does not duplicate them.

- **Authoritative source of truth:** [`docs/claude_prompts/RENDARA_PROJECT_BRIEF.md`](docs/claude_prompts/RENDARA_PROJECT_BRIEF.md)
  (vision §1, stack §3, monorepo §4, schema §5, binding §6, rendering §7, viewer
  API §8, Definition of Done §9).
- **The "why" behind the choices:** [`docs/adr/`](docs/adr/README.md) — Architecture
  Decision Records, starting with the foundational [ADR 0000](docs/adr/0000-stack-and-architecture-decisions.md).
- **How to work in the repo:** [`CONTRIBUTING.md`](CONTRIBUTING.md).

## 1. What it is

Rendara Reports is a **100% front-end** Angular reporting platform with two parts
that share one codebase:

- **Report Designer** (`apps/designer`) — a web portal to design reports on a
  canvas and **export a versioned Template JSON**.
- **Report Viewer** (`libs/report-viewer`, published as `@rendara/report-viewer`)
  — an embeddable Angular component that takes a **Template JSON + Data JSON** and
  renders the final report inside any Angular host app.

The contract between them is the **Template JSON schema**. At runtime the
developer's only job is to fetch the template + data from their backend and hand
them to the viewer.

```
 Designer ──exports──▶ Template JSON ─┐
                                      ├─▶ Report Viewer ──▶ rendered report
 Backend  ──fetches──▶ Data JSON ─────┘   (npm package)
```

## 2. Monorepo layout

Single **Nx** workspace; layers kept clean by Nx tags + module-boundary lint.
Full rules and the target tree are in **brief §4**; the boundary enforcement is
documented in [`docs/architecture/module-boundaries.md`](docs/architecture/module-boundaries.md).

```
apps/
  designer/        Report Designer web app
  viewer-demo/     Example host app — consumes @rendara/report-viewer only
libs/
  report-schema/   PUBLISHABLE @rendara/report-schema — TS types, JSON Schema,
                   ajv validator, version + migrations (framework-agnostic)
  report-engine/   Pure TS core — expression eval (JSONata), formatting,
                   binding resolver, pagination/layout algorithm
  report-renderer/ Angular — the SHARED renderer (template+data → paginated DOM)
  report-viewer/   PUBLISHABLE @rendara/report-viewer — renderer + toolbar +
                   public API; bundles engine/renderer/schema at build time
  ui-kit/          Designer-only shared UI components/tokens (not published)
docs/              brief, backlog, UI mockups, design system, ADRs, this map
e2e (apps/*-e2e, visual-e2e/)  Playwright e2e + visual-regression projects
tools/             scripts, generators, fixtures
```

### Dependency rules (enforced by `@nx/enforce-module-boundaries`)

Apps depend **inward only**; libs form a one-directional chain:

```
report-schema ◀ report-engine ◀ report-renderer ◀ report-viewer
ui-kit (self-contained)
designer    → schema, engine, renderer, ui-kit
viewer-demo → report-viewer ONLY  (proves the npm integration story)
```

A deliberate illegal import (e.g. `schema → renderer`) **fails lint**. Tag scheme,
the legal/illegal-edge QA, and reproduction steps live in
[`docs/architecture/module-boundaries.md`](docs/architecture/module-boundaries.md).
The rationale for Nx + this layering is [ADR 0000](docs/adr/0000-stack-and-architecture-decisions.md).

## 3. The core pieces

| Piece                     | Where             | What it does                                                                                                                                                                                 |
| ------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Template JSON schema**  | `report-schema`   | The versioned contract (`schemaVersion`). JSON Schema + ajv validator + typed `parse()/validate()` + migration runner. **Crown jewel** — see brief §5.                                       |
| **Binding & expressions** | `report-engine`   | **Sandboxed JSONata** over the Data JSON (no `eval`) + an `Intl`-based formatting registry. Aggregates, conditional visibility. brief §6.                                                    |
| **Pagination engine**     | `report-engine`   | Framework-agnostic paginator: page breaks, repeat-header-per-page, keep-together, grouping/subtotals, page headers/footers. brief §7.                                                        |
| **Shared renderer**       | `report-renderer` | Turns (validated template + data) into absolutely-positioned **DOM** pages. **One renderer, two modes**: _view_ (viewer) and _design_ (designer canvas + overlays) → real WYSIWYG. brief §7. |
| **Viewer**                | `report-viewer`   | Standalone Angular component wrapping renderer + toolbar + public API (print, PDF, paging, zoom, watermark). brief §8.                                                                       |
| **Designer**              | `apps/designer`   | The four-zone authoring portal (palette · canvas · properties · status bar). State via `@ngrx/signals`. brief §12.                                                                           |

## 4. Cross-cutting principles (the hard rules)

These are non-negotiable and enforced in review (see [`CONTRIBUTING.md`](CONTRIBUTING.md)
and `CLAUDE.md`):

- **No `eval` / `new Function`, ever.** Template expressions run **only** through
  the sandboxed JSONata engine.
- **Viewer style isolation & light footprint.** The viewer must not leak styles
  into (or inherit from) host apps, and must not depend on a heavy UI kit — Angular
  CDK + scoped CSS only. Theming via CSS custom properties; opt-in Shadow DOM.
- **The Template JSON schema is a versioned contract.** Any change needs a version
  bump + migration + sign-off.
- **One shared renderer** for designer preview and viewer, so designed output and
  rendered output are pixel-identical.
- **Security:** HTML sanitisation, image-URL allow-listing, CSP-friendliness — the
  viewer runs inside other people's apps with their data.

## 5. Tooling & quality

Nx · Angular 21 (standalone, signals, **zoneless**) · pnpm · strict TypeScript ·
ESLint (+ angular-eslint, Nx boundary rules) · Prettier · **Vitest** + Angular
Testing Library · **Playwright** (e2e + **visual-regression**) · **axe-core** ·
**ajv** · **Changesets** · **Storybook** · GitHub Actions (`nx affected`).

- **Definition of Done (every story):** brief §9 — also embedded in the
  [PR template](.github/PULL_REQUEST_TEMPLATE.md).
- **Coverage bars (CI-enforced):** engine/schema **≥90%**, UI **≥80%**.
- **Testing guide:** [`docs/testing/test-harness.md`](docs/testing/test-harness.md);
  **visual regression:** [`docs/testing/visual-regression.md`](docs/testing/visual-regression.md)
  ([ADR 0001](docs/adr/0001-visual-regression-determinism.md)).
- **Storybook:** [`docs/tooling/storybook.md`](docs/tooling/storybook.md)
  ([ADR 0002](docs/adr/0002-storybook-per-project-zoneless.md)).
- **Releases & commits:** [`docs/tooling/releases.md`](docs/tooling/releases.md)
  ([ADR 0003](docs/adr/0003-release-tooling-changesets-commitlint.md)).
- **Design tokens:** [`docs/design-system/tokens.md`](docs/design-system/tokens.md)
  ([ADR 0004](docs/adr/0004-design-tokens-theming.md)).

## 6. Build sequence

The repo is built **one small story at a time** through epics (brief §11):

```
E0 Foundations ─▶ E1 Schema ─▶ E2 Binding ─▶ E3 Pagination ─▶ E4 Shared Renderer
                                         ┌───────────────────────────┴───────────┐
                                  E5+E6 Designer                        E7+E8 Viewer
                                         └──────────────┬────────────────────────┘
                                          E9 Packaging/Integration/Docs
                                          E10 Hardening (a11y, i18n, perf, security, release)
```

The full epic + story backlog (with acceptance criteria and per-story QA) is in
[`docs/claude_prompts/RENDARA_BACKLOG.md`](docs/claude_prompts/RENDARA_BACKLOG.md).
**Epic 0 (Foundations)** — the Nx workspace, all quality gates, and this
governance — is complete; feature epics build on top of it.
