# ADR 0016 — `viewer-demo` consumes the built viewer package

- **Status:** Accepted
- **Date:** 2026-06-30
- **Story:** E9-S4 · Real integration in `viewer-demo`

## Context

`apps/viewer-demo` exists to **prove the integration story**: a host Angular app
that depends **only** on `@rendara/report-viewer` (brief §4) and renders a report
from a template + data with the public inputs/outputs wired. Until now the demo
imported the viewer through the workspace `tsconfig.base.json` path mapping
`@rendara/report-viewer` → `libs/report-viewer/src` — i.e. it consumed the
**source**, exactly like `apps/designer`. E9-S4 requires it to consume the
**built package** (the self-contained APF artifact from ADR 0013), so what the
demo exercises is what a host actually installs.

Making that real surfaced two problems the source-consuming setup had hidden:

1. **The Angular Linker only runs on `node_modules`.** The published FESM is in
   Angular *partial* compilation form (`ɵɵngDeclare*`); a consumer's build
   resolves it to full AOT instructions via the Angular Linker. The Linker only
   processes files whose real path is under `node_modules`. Resolving the package
   through a `tsconfig` path mapping (first-party), or through a symlink/junction
   into `dist/` (esbuild resolves symlinks to their real `dist/` path), leaves the
   Linker skipping it — and the app dies at runtime with *"JIT compiler
   unavailable"*.

2. **A latent bug in the E9-S1 bundle step.** `tools/bundle-viewer.mjs` ran the
   inlined FESM through esbuild with esbuild's default `charset: 'ascii'`, which
   escaped the `ɵ` (theta) characters to `ɵ`. The Linker decides whether to
   process a file by testing for the **literal** substring `ɵɵngDeclare`; once
   escaped, that substring is absent, so the Linker skipped the package for **all**
   consumers (this demo, and any external `npm i`). E9-S4 is the first real
   consumer, so it is where this surfaced. E9-S1's `verify-viewer-pack` only
   checked tarball *shape*, not that the package *runs*.

A third, smaller wrinkle: the vite dev server's dependency optimizer does not run
the Linker on this package the way the production build does, so the dev server
renders a blank app even once the package is correctly installed.

## Decision

1. **Fix the packaging bug: `charset: 'utf8'` in `tools/bundle-viewer.mjs`.** Keep
   the `ɵɵngDeclare*` calls as real Unicode so the Angular Linker recognises and
   processes the FESM. This fixes the bundled package for **every** consumer, not
   just the demo.

2. **Install the built package into `node_modules` (a copy, not a link).** A new
   `report-viewer:local-install` target (`dependsOn: bundle`) runs
   `tools/install-viewer-local.mjs`, which copies `dist/libs/report-viewer` to
   `node_modules/@rendara/report-viewer`. Real files under `node_modules` mean the
   package's real path is under `node_modules`, so the Linker runs — exactly as it
   would after a published `npm i`. A junction is deliberately **not** used
   because esbuild would resolve it back to `dist/`.

3. **Resolve the package by node resolution for the app build only.** The demo's
   `tsconfig.app.json` empties `paths`, dropping the base-config source mapping for
   the **app build** so `@rendara/report-viewer` resolves to the installed package.
   Unit tests (`tsconfig.spec.json`) keep the base source mapping, so component
   tests still run without a prior build. `build` and `serve` `dependsOn`
   `report-viewer:local-install`.

4. **Run the demo e2e against the production build.** The Playwright `webServer`
   uses `viewer-demo:serve-static` (production build + file server) instead of the
   vite dev server, because the Linker runs in the production build but not the dev
   server's dep optimizer — and the production bundle is what a host ships anyway.

5. **Wire and surface the public outputs; gate it in CI.** The host binds
   `(rendered)` / `(pageChange)` / `(error)` and surfaces the latest value of each,
   with a "Load invalid template" action to demonstrate the surfaced (never thrown)
   error. A new `viewer-demo-integration` CI job runs a static guard
   (`tools/verify-demo-consumes-build.mjs` — asserts the demo resolves the built
   package, not source) and the e2e (render, navigation, outputs, print, export).

## Consequences

- The demo now consumes the real built package, so it genuinely proves the
  integration story and would catch a packaging regression that E9-S1's
  shape-only check could not.
- The `charset: 'utf8'` fix makes the published viewer package actually runnable
  in a consumer's AOT build — a prerequisite the clean-room smoke test (E9-S7) now
  builds on.
- The demo build/serve are slightly slower: they first build + bundle + install
  the viewer. The demo's initial-bundle budget was raised (it now includes the
  whole self-contained viewer + `ajv`/`jsonata`); the **viewer package's** own size
  budget (E10-S3) remains the enforced one.
- `ajv` + `ajv-formats` are added to the workspace root `dependencies` so the
  viewer package's runtime deps resolve for the demo, mirroring what a host's
  install provides.
- Running the demo e2e against the fully-rendered production app exposed an
  ambiguous `getByText(/^Page \d+ of \d+$/)` locator (the report footer, thumbnail
  rail and print mirror all render that text). The existing specs were scoped to
  the canonical `.rdr-viewer-status` element — a locator-precision fix, with the
  assertions unchanged. (These e2e specs were not previously gated: CI ran no e2e
  job before this story.)
