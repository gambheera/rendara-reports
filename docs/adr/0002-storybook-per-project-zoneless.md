# ADR 0002 — Storybook: one per library, Storybook 10, zoneless, dev-only

- **Status:** Accepted
- **Date:** 2026-06-18
- **Story:** E0-S6 · Storybook

> The formal ADR template and `ARCHITECTURE.md`/`CONTRIBUTING.md` land in
> **E0-S9**; this is a lightweight ADR recording decisions made in E0-S6.

## Context

E0-S6 asks for Storybook to "run for `report-renderer`, `report-viewer`,
`ui-kit`" and "build in CI." Three constraints from the brief shape the
implementation:

- The workspace is **Angular 21, zoneless by default** (no `zone.js` in the
  dependency tree).
- The viewer is a **publishable, UI-kit-light** package; nothing here may add
  weight to its runtime bundle.
- Nx **module boundaries** (brief §4) must not be relaxed.

## Decision

1. **One Storybook host per library** (`.storybook/` + `storybook` /
   `build-storybook` targets in each `project.json`). This maps directly onto the
   "runs for X, Y, Z" acceptance and lets each lib be documented and visually
   tested in isolation. Ports 4400 / 4401 / 4402. A thin root **composition
   host** then aggregates them under one sidebar (decision 7).
2. **Storybook 10.4.x** (`storybook`, `@storybook/angular`,
   `@storybook/addon-docs`). `@storybook/angular@10` supports `@angular/core`
   `>=18 <22` — i.e. Angular 21. Storybook 9 caps at `<21` and is therefore not
   an option.
3. **Zoneless via the builder, not a provider.** The Angular builder's
   `experimentalZoneless: true` option bootstraps stories with the zoneless
   change detector; `zone.js` is an **optional** peer of `@storybook/angular@10`
   and is deliberately *not* installed. We do **not** also add
   `provideZonelessChangeDetection()` in `preview.ts`, to avoid providing both a
   zoned and a zoneless change detector.
4. **Dev-tooling only.** All four packages are `devDependencies`; the Angular
   Storybook builder pulls in `@angular-devkit/build-angular` (webpack), which is
   build-time only and never enters the `report-viewer` bundle — the
   UI-kit-light rule is unaffected.
5. **Explicit targets, no `@nx/storybook` plugin.** The `@storybook/angular`
   CLI builders are referenced directly from each `project.json`, keeping the
   wiring minimal and fully under our control. `build-storybook` is cached in
   `nx.json` `targetDefaults`; `.storybook/**` and `*.stories.ts` are excluded
   from the `production` input and from each lib's `tsconfig.lib.json` so stories
   never enter test coverage or the publishable build.
6. **"Builds in CI" is a thin stub now.** A minimal `.github/workflows/storybook.yml`
   runs `pnpm storybook:build` on every PR. The full pipeline (lint / typecheck /
   test / build via `nx affected`, caching, branch protection) is owned by
   **E0-S3**, which should fold this step in and drop the stub.
7. **Single composed UI via a root host.** A root `.storybook/` (port 4500) uses
   Storybook Composition `refs` to aggregate the three lib Storybooks under one
   sidebar, keeping their isolation. The host renders no Angular, so it uses the
   lightweight **`@storybook/html-vite`** builder: the Angular dev-server builder
   cannot run a refs-only host through the Storybook CLI (the
   `AngularLegacyBuildOptionsError` legacy-options check requires a
   `browserTarget`, which only the Nx Angular executor supplies). The host is a
   **dev-time** aggregator (refs point at `localhost:4400/4401/4402`) and is not
   part of the CI build gate.

## Consequences

- **+** Each lib has an isolated, buildable Storybook; the acceptance criterion
  is met for all three.
- **+** Zoneless stays honest end-to-end — proven by a `--smokeTest` render that
  boots the preview without `zone.js`.
- **+** No impact on the publishable viewer bundle or on module boundaries.
- **+** The composition host gives a single aggregated sidebar **without**
  sacrificing per-lib isolation or the per-lib CI builds.
- **−** The `start-storybook` (dev server) builder requires a defined
  `browserTarget`, so each `storybook` target carries a self-referential
  `"<project>:build-storybook"` — a known Storybook-for-Angular quirk
  (`build-storybook` itself does not need it).
- **−** The composed view is dev-time only: the three lib dev servers (or
  deployed URLs) must be running for the refs to resolve, and the host adds a
  second Storybook builder (`@storybook/html-vite`) to the dev toolchain.

## Alternatives considered

- **One merged root Storybook** (a single host globbing every lib's
  `*.stories.ts`, replacing the per-lib ones) — fewer moving parts and one static
  build, but drops per-lib isolation and the per-lib "runs for X, Y, Z" targets.
  Rejected in favour of **composition** (`refs`), which keeps the three isolated
  Storybooks and layers a single sidebar on top.
- **Storybook 9** — rejected: its `@storybook/angular` peer range stops at
  Angular `<21`.
- **`provideZonelessChangeDetection()` in `preview.ts`** — redundant with (and
  potentially conflicting with) the builder's `experimentalZoneless`; dropped in
  favour of the single, supported switch.
