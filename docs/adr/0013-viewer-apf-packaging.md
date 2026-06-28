# ADR 0013 — Publishable viewer build: ng-packagr APF per lib + an esbuild/dts inline pass

- **Status:** Accepted
- **Date:** 2026-06-28
- **Story:** E9-S1 · Publishable viewer build (APF)

## Context

`@rendara/report-viewer` ships as one npm package that **bundles** the engine,
renderer and schema, so a host runs `npm i @rendara/report-viewer` and gets
everything with no `@rendara/*` dependencies (brief §4). The viewer is the only
Angular publishable lib; engine/renderer are internal and never published
standalone, and the bundle must be **Angular Package Format (APF)** compliant and
production-optimized (story acceptance).

The obvious approach — let ng-packagr follow the `tsconfig.base.json` path
aliases (`@rendara/report-engine` → its `src`) and inline the source — **does not
work.** ng-packagr forces `rootDir` to the entry lib's own `src`
(`ts/tsconfig.ts`: `rootDir: path.dirname(entryFilePath)`, merged as an override
that a project tsconfig can't beat). Pulling another lib's source into that
program puts every cross-lib file "outside rootDir" → TS6059 → and the diagnostic
explainer then crashes on a `referencedFiles` desync (`Cannot destructure
property 'pos' of file.referencedFiles[index]`). Empirically: ng-packagr builds
`report-schema` (no cross-lib source) cleanly, but **anything importing another
`@rendara/*` lib's source crashes** the same way. So ng-packagr cannot compile a
sibling lib's *source* into a package — by design.

## Decision

Build the publishable viewer in **two stages** (`nx run report-viewer:pack`):

1. **ng-packagr produces an APF package per lib** (`@nx/angular:package`), bottom
   up via Nx `dependsOn: ["^build"]`: schema → engine → renderer → viewer, each to
   `dist/libs/<lib>`. Each lib's `tsconfig.lib.prod.json` repoints its `@rendara/*`
   path aliases at the **already-built `dist` `.d.ts`** of its deps, and declares
   those deps in `package.json` + `ng-package.json` `allowedNonPeerDependencies`,
   so ngc type-checks against declarations (no rootDir violation) and ng-packagr
   leaves them **external** in the FESM/`.d.ts`. Libs with Angular code
   (renderer, viewer) compile in **partial** mode (Ivy linker), required for a
   version-tolerant published package.

2. **An inline pass makes the viewer self-contained** (`tools/bundle-viewer.mjs`):
   - **JS** — esbuild bundles the viewer FESM, resolving `@rendara/*` to the built
     `dist` FESMs and keeping every third-party import (Angular, jsonata, ajv,
     tslib) external.
   - **Types** — `rollup-plugin-dts` bundles the viewer `.d.ts`, inlining the
     `@rendara/*` declarations (including re-exported `PdfMetadata`/`Watermark`)
     and keeping third-party type imports external.
   - **Manifest** — strips `@rendara/*` from `dependencies`, leaving Angular as
     `peerDependencies` and the genuine runtime third-party deps (jsonata, ajv,
     ajv-formats, tslib) as `dependencies`.

`tools/verify-viewer-pack.mjs` then runs `npm pack` and asserts the tarball is APF
(FESM2022 + typings + `module`/`typings`/`exports`) and **self-contained** (no
`@rendara/*` left in deps). Wired as the `pack` target and a CI job.

engine/renderer gain a `private: true` `package.json` and are registered in
`pnpm-workspace.yaml` so pnpm can link them as `workspace:*` deps of the viewer;
Changesets ignores private packages, and the published tarball never carries the
`@rendara/*` deps (stage 2 strips them).

## Consequences

- **Self-contained, APF-compliant, partial-compiled** viewer package from a single
  `npm i`, matching brief §4. Third-party libs stay external (peers/deps), so they
  aren't duplicated into the bundle.
- **ng-packagr stays the APF builder** (story asks for an ng-packagr build); the
  extra pass only inlines workspace code it structurally cannot.
- **`nx build report-viewer` alone is not publishable** — its FESM still imports
  `@rendara/*`. The `bundle`/`pack` targets (and CI) are the source of truth;
  the inline pass is idempotent on a fresh `build`.
- Peer ranges are pinned to the current Angular (`^21`); widening to `>=20` plus
  the tree-shaking/SSR/version-matrix tests is **E9-S2**. Wiring the actual
  `publish` to consume `dist/libs/report-viewer` (not the source dir) is left to
  the release/clean-room work (E9-S7); the current `pnpm -r publish --dry-run`
  placeholder still passes.
- A latent type error surfaced once the renderer was type-checked under ngc
  (`parseColor(string | null)` vs `string | undefined`) and was fixed by widening
  the parameter to match its runtime guard — no behavior change.
