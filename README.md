# Rendara Reports

> **Status:** early scaffolding. This is a placeholder README created in story
> **E0-S1 (Initialize Nx workspace)**. It will grow as the platform is built.

**Rendara Reports** is a 100% front-end Angular reporting platform with two parts
that share one codebase:

- **Report Designer** — a web portal for designing reports on a canvas and
  exporting a versioned **Template JSON**.
- **Report Viewer** — an embeddable Angular component (published to npm) that
  renders a Template JSON + Data JSON inside any Angular host app.

See [`docs/claude_prompts/RENDARA_PROJECT_BRIEF.md`](docs/claude_prompts/RENDARA_PROJECT_BRIEF.md)
for the full vision, architecture, and the Definition of Done.

**New here?** Read [`ARCHITECTURE.md`](ARCHITECTURE.md) for how the pieces fit
together, [`CONTRIBUTING.md`](CONTRIBUTING.md) for how we work (one story at a
time, the DoD, the hard rules), and [`docs/adr/`](docs/adr/README.md) for the
decisions behind the stack.

## Tech stack

Nx · Angular 21 (standalone, signals, zoneless) · TypeScript (strict) ·
ESLint + angular-eslint · Prettier · pnpm.

> The application projects (`apps/*`, `libs/*`) are scaffolded in later
> foundation stories (starting with **E0-S2**); this story sets up only the
> workspace and shared toolchain.

## Prerequisites

- **Node** `>= 22.12` (this repo is pinned to `22.20.0` via [`.nvmrc`](.nvmrc))
- **pnpm** `>= 11` — enable via Corepack: `corepack enable` (or
  `npm i -g pnpm@11`)

## Getting started

```bash
pnpm install
```

## Commands

| Task                     | Command                                          |
| ------------------------ | ------------------------------------------------ |
| Project/dependency graph | `pnpm graph` (`npx nx graph`)                    |
| Lint every project       | `pnpm lint` (`npx nx run-many -t lint`)          |
| Lint only affected       | `pnpm lint:affected` (`npx nx affected -t lint`) |
| Unit + component tests   | `pnpm test` (`npx nx run-many -t test`)          |
| Tests only affected      | `pnpm test:affected` (`npx nx affected -t test`) |
| One project's tests      | `npx nx test report-engine`                      |
| E2E (Playwright)         | `pnpm e2e` (`npx nx e2e designer-e2e`)           |
| Visual regression        | `pnpm visual` · update: `pnpm visual:update`     |
| Storybook (one lib)      | `npx nx storybook ui-kit` (4400)                 |
| Build all Storybooks     | `pnpm storybook:build`                           |
| Viewer API docs          | `pnpm docs:build` (TypeDoc)                      |
| Format (write)           | `pnpm format`                                    |
| Check formatting         | `pnpm format:check`                              |
| Add a changeset          | `pnpm changeset`                                 |
| Preview release bumps    | `pnpm release:status`                            |
| Version + CHANGELOGs     | `pnpm release:version`                           |
| Publish dry-run          | `pnpm release:dry-run`                           |
| Toolchain smoke check    | `pnpm smoke`                                     |
| Nx environment report    | `npx nx report`                                  |

> `pnpm smoke` runs `nx report`, renders the project graph to `tmp/graph.json`,
> runs lint across all projects, and verifies formatting — a quick check that
> the workspace toolchain is healthy. CI wiring is added in **E0-S3**.

## Testing

Vitest (unit + Angular component tests), Playwright (e2e), axe-core (a11y), and
Playwright screenshot **visual regression** are wired for every project, with
coverage bars enforced by the test runner (engine/schema ≥ 90%, UI ≥ 80%). First
e2e run needs a browser: `npx playwright install chromium`. See
[`docs/testing/test-harness.md`](docs/testing/test-harness.md) for the full
guide, and
[`docs/testing/visual-regression.md`](docs/testing/visual-regression.md) for the
visual-regression environment, baseline strategy, and `update-snapshots`
workflow.

## Storybook

Components are documented and visually testable in isolation. Each component lib
ships its own Storybook — `ui-kit` (port 4400), `report-renderer` (4401), and
`report-viewer` (4402): `npx nx storybook <lib>` to develop, `pnpm storybook:build`
to build all three (the step CI gates). A root **composition host**
(`pnpm storybook:compose`, port 4500) aggregates the three under one sidebar. See
[`docs/tooling/storybook.md`](docs/tooling/storybook.md) and
[ADR 0002](docs/adr/0002-storybook-per-project-zoneless.md).

## Viewer package docs

The published viewer's consumer docs live with the package: a **quick-start** and
the full theming/API guide in
[`libs/report-viewer/README.md`](libs/report-viewer/README.md), a versioned
[CHANGELOG](libs/report-viewer/CHANGELOG.md) (Changesets), the Storybook state
gallery, and a generated **TypeDoc input/output reference** — `pnpm docs:build`
emits it to `dist/docs/report-viewer` and CI builds it on every PR. Background:
[ADR 0018](docs/adr/0018-viewer-api-docs-and-changelog.md).

## Releases & commit conventions

Commits follow [Conventional Commits](https://www.conventionalcommits.org),
enforced locally by a **husky** `commit-msg` hook (installed on `pnpm install`)
and re-checked in CI. Releases of the two publishable packages
(`@rendara/report-schema`, `@rendara/report-viewer`) are versioned with
**Changesets**: add a changeset in any PR that changes a published package
(`pnpm changeset`), then `pnpm release:version` bumps versions + writes
CHANGELOGs. Publishing is a **dry-run only** until package builds land in E9. See
[`docs/tooling/releases.md`](docs/tooling/releases.md) and
[ADR 0003](docs/adr/0003-release-tooling-changesets-commitlint.md).

## Repository layout (target)

```
apps/      designer web app + viewer demo host (added from E0-S2)
libs/      report-schema, report-engine, report-renderer, report-viewer, ui-kit
docs/      project brief, backlog, UI mockups, design system
```

## License

MIT
