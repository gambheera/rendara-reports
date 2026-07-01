# ADR 0019 — Clean-room install smoke test for the viewer package

- **Status:** Accepted
- **Date:** 2026-07-01
- **Story:** E9-S7 · Clean-room install smoke test

## Context

`@rendara/report-viewer` is meant to `npm i` into **any** Angular host app
(brief §4, §8). E9-S1…S4 got us close: the tarball is APF-compliant and
self-contained (E9-S1), advertises wide Angular peers (E9-S2), and the in-repo
`apps/viewer-demo` consumes the **built** package and renders/prints/exports it
(E9-S4). But every one of those checks runs **inside the monorepo**, where the
workspace `node_modules`, `tsconfig.base.json` path mappings and Nx are present.
E9-S7 asks for the one proof they can't give: that the packed tarball works from a
**fresh app outside the monorepo**.

This matters because of a failure mode ADR 0016 documented and explicitly left for
E9-S7 to guard: the published FESM is Angular **partial-compiled** (`ɵɵngDeclare*`)
and only becomes runnable once the Angular **Linker** resolves it to full AOT
instructions — and the Linker only processes files whose real path is under
`node_modules`. A packaging regression (e.g. the escaped-`ɵ` `charset` bug that
E9-S4 surfaced) does **not** fail the build; it throws *"JIT compiler unavailable"*
at **runtime, in a browser**. A smoke test that only compiles would stay green
through exactly that regression.

Constraints/forces:

- The consumer must be a genuine external install (a real `npm install` of the
  packed `.tgz`), not a workspace resolution — so it must live **outside** the repo
  tree where npm can't walk up into the workspace.
- The test must **run** the built app, not just build it, to catch the Linker
  regression that is the whole point of the story.
- It must be deterministic and CI-runnable, not a flaky live scaffold.

## Decision

Add a `report-viewer:clean-room` Nx target (`dependsOn: bundle`) running
`tools/clean-room-smoke.mjs`, wired as a **release gate** in `release.yml`.

1. **A checked-in fixture consumer app, not a live `ng new`.**
   `tools/clean-room/fixture/` is a minimal, standalone Angular 21 app — its own
   `package.json` / `angular.json` / `tsconfig` (no `tsconfig.base.json`), a
   zoneless standalone component whose code mirrors the README quick-start
   verbatim, and a self-contained invoice template+data. It declares
   `@rendara/report-viewer` as `file:./report-viewer.tgz`. It is **not** an Nx
   project: excluded via `.nxignore` and the workspace ESLint `ignores`.

2. **Run in a throwaway temp dir outside the repo.** The script `npm pack`s the
   built `dist/libs/report-viewer` into `mkdtemp(os.tmpdir())/…` as
   `report-viewer.tgz`, copies the fixture beside it, then `npm install` — pulling
   fresh Angular from the registry plus the local tarball (with its bundled
   engine/renderer/schema and jsonata/ajv/tslib). Being outside the repo, npm
   cannot resolve up into the workspace: a genuine clean room.

3. **Build with production AOT, then render in a real browser.** `ng build`
   (the `@angular/build:application` builder) runs the Linker on the installed
   package; then the script serves the output and loads it in headless Chromium
   (`chromium` from the already-present `@playwright/test`), asserting the report
   actually paints — title `INVOICE`, the bound customer, currency totals, and the
   resolved `Page 1 of N` footer — with **no** uncaught runtime error. The browser
   step is what distinguishes this from a build-only check.

4. **Document it as a release gate.** `docs/tooling/releases.md` gains a "Release
   gates" table listing this test (alongside the E9-S1/S2/S3/S4 checks) as a
   must-be-green-before-publish gate; the viewer README links it. CI installs
   Chromium and runs `nx run report-viewer:clean-room --skip-nx-cache`.

## Consequences

- **+** Catches, in CI, a packaging regression that makes the published package
  fail at a consumer's runtime while still building cleanly — the gap E9-S1's
  shape-only check and a compile-only smoke test both leave open.
- **+** Exercises the exact thing a host does: `npm i` the tarball into a fresh
  app and render, proving peers resolve, deps are bundled, and the Linker runs.
- **+** Doubles as living proof the README quick-start works verbatim (E9-S6 QA).
- **−** Slow and network-dependent: a real `npm install` of Angular plus an
  `ng build` add minutes to CI and require registry + a Playwright Chromium.
  Mitigated with `--skip-nx-cache`, pinned versions, `--no-audit --no-fund`.
- **−** A second, non-Nx Angular app to maintain; pinned to 21.2.x, it can drift
  from the workspace Angular version and needs a bump when that moves.
- **−** The fixture must be kept out of Nx/ESLint/pnpm-workspace discovery
  (`.nxignore`, ESLint `ignores`, and `pnpm-workspace.yaml` listing only the four
  libs), or tooling would try to treat it as a first-class project.

## Alternatives considered

- **Live `ng new` at test time.** Most faithful to "a brand-new app", but pulls the
  Angular CLI + schematics over the network on every run, is slow, and drifts with
  CLI releases — flaky for a gate. A checked-in fixture is the deterministic
  equivalent and still a real external `npm install`.
- **Build-only smoke test (no browser).** Simpler and faster, but a production
  build succeeds even with the escaped-`ɵ` Linker bug — it would miss the runtime
  "JIT compiler unavailable" failure this story exists to catch. Rejected.
- **Reuse `apps/viewer-demo` (E9-S4).** It already consumes the built package, but
  from inside the monorepo (workspace `node_modules`, Nx, path mappings). It cannot
  prove the "outside the monorepo" story, which is the entire point of E9-S7.
- **Render via SSR/`platform-server` to a string instead of a browser.** Avoids
  Chromium, but the viewer's render path is browser-guarded for SSR-safety (it
  no-ops server-side), so an SSR render would not paint the report — it wouldn't
  prove rendering. A real browser is required.
- **Temp dir inside the repo (e.g. `tmp/`).** npm/pnpm would discover the workspace
  root above it and resolve dependencies against it, defeating the clean room. An
  `os.tmpdir()` location keeps the install genuinely isolated.
