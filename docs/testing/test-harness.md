# Test harness (E0-S4)

This workspace ships **all four test types from day one** so every story can
include tests immediately (brief §9 Definition of Done):

| Layer | Tooling | Where |
| --- | --- | --- |
| Unit (pure TS) | **Vitest** (node env) | `report-schema`, `report-engine` |
| Component (Angular) | **Vitest + `@analogjs/vite-plugin-angular` + Angular Testing Library**, zoneless `TestBed` | `report-renderer`, `report-viewer`, `ui-kit`, `designer`, `viewer-demo` |
| E2E | **Playwright** | `designer-e2e`, `viewer-demo-e2e` |
| Accessibility | **axe-core** via `@axe-core/playwright` | `tools/testing/axe.ts`, used in `designer-e2e` |
| Visual regression | **Playwright screenshots** | `visual-e2e` — see [visual-regression.md](visual-regression.md) |

The Vitest runner is wired through the inferred **`@nx/vitest/plugin`** (a
`test` target on every lib/app); Playwright through the inferred
**`@nx/playwright/plugin`** (an `e2e` target). Both match the inferred-plugin
style already used for lint (`@nx/eslint/plugin`).

## Commands

```bash
# Unit + component tests
pnpm test                      # nx run-many -t test  (all projects)
pnpm test:affected             # nx affected -t test
npx nx test report-engine      # a single project
npx nx test report-engine -- report-engine.spec   # a single file
npx nx test report-engine -- -t "contract version" # a single test by name

# E2E (boots the dev server, then runs Playwright)
pnpm e2e                       # nx run-many -t e2e
npx nx e2e designer-e2e
npx nx e2e viewer-demo-e2e
```

First-time setup for e2e installs the browser once: `npx playwright install chromium`.

## Coverage bars (enforced)

Coverage thresholds are set **per project in each Vitest config** and run on
every invocation (`coverage.enabled: true`), so `nx test <project>` **fails**
the moment coverage drops below the bar — enforcement lives in the test runner,
independent of CI:

- `report-schema`, `report-engine` → **≥90%** (engine/schema bar)
- all Angular projects → **≥80%** (UI bar)

Barrels (`src/index.ts`), `test-setup.ts`, specs, and app bootstrap/wiring
(`main.ts`, `*.config.ts`) are excluded from coverage. **E0-S3 (CI pipeline)**
then runs `nx affected -t lint test build e2e` to surface this in CI; no
threshold logic is duplicated there.

> Note: an empty placeholder component (e.g. `UiKit` today) reports `0%` because
> it contains no instrumentable statements — a degenerate `0/0` case that does
> not fail the threshold. Real code with statements that goes untested **does**
> fail (verified against the engine bar during E0-S4).

## How Angular component tests run (zoneless)

`@analogjs/vite-plugin-angular` compiles components/templates for Vitest. Each
Angular project's `src/test-setup.ts` initialises a **zoneless** `TestBed` via
`@analogjs/vitest-angular/setup-testbed` (which provides
`provideZonelessChangeDetection()` and `platformBrowserTesting()`) — matching the
app's zoneless runtime. No `zone.js` is installed. Tests use
`@testing-library/angular`'s `render()` + `screen` queries.

## Playwright specifics

- **Chromium only** in v1 for a fast, deterministic gate (the cross-browser
  matrix is an Epic 10 hardening concern). Fixed `1280×720` viewport — this also
  gives E0-S5's visual-regression baselines a stable environment.
- Each config's `webServer` starts the app's dev server (`designer` on `4200`,
  `viewer-demo` on `4201`) and waits for it before the specs run.
- The configs are **`.mts` and self-contained** — they deliberately do **not**
  import `@nx/devkit` / `@nx/playwright/preset`, because Playwright loads them
  through Node's ESM loader and pulling Nx's native addon in that path crashes.
- The inferred `e2e` target's auto-added `dependsOn: <app>:serve` is cleared in
  each e2e `project.json`, so the dev server is started **once** (by Playwright)
  instead of twice — otherwise Nx's recursive-task guard aborts the run.

## Accessibility helper

`tools/testing/axe.ts` exports `expectNoAxeViolations(page)`, scanning the page
against the WCAG 2.0/2.1/2.2 A & AA rule tags (brief §9 targets WCAG 2.2 AA).
Drop it into any Playwright spec to assert "no new axe violations".

## Adding tests in later stories

- **Pure-TS lib:** add `*.spec.ts` under `src/`; it runs under the node Vitest
  config automatically.
- **Angular lib/app:** add `*.spec.ts`; render with `@testing-library/angular`.
- **E2E:** add `*.spec.ts` under the e2e project's `e2e/` folder.
- Keep coverage above the bar — new untested source will fail `nx test`.
