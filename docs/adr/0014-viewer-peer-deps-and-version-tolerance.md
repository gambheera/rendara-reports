# ADR 0014 — Viewer peer dependencies & version tolerance

- **Status:** Accepted
- **Date:** 2026-06-28
- **Story:** E9-S2 · Peer deps & version tolerance

## Context

`@rendara/report-viewer` is dropped into **other people's** Angular apps. To fit a
host's existing Angular install it must (brief §3, §8): advertise a **wide**
Angular peer range (`>=20`), depend on Angular as a **peer** (never bundle it),
stay **tree-shakeable**, be **SSR-safe**, and expose **secondary entry points only
if needed**.

After E9-S1 the package was APF-compliant and self-contained, but its peer ranges
were still pinned to the build-time Angular (`^21`), and there was no automated
proof of tree-shaking or the version contract.

The monorepo pins a single Angular version (21.2.9), so we **cannot** `npm install`
real Angular 20 and 22 trees inside it to test "installs cleanly against the min
and max supported Angular." That real, out-of-monorepo install is the **clean-room
smoke test's** job (E9-S7).

## Decision

1. **Wide Angular peers.** The viewer's `package.json` declares
   `@angular/core` and `@angular/cdk` peers as **`>=20.0.0`** — the open-ended
   range the brief asks for, for adoption. These are the only Angular packages the
   bundled source imports (`@angular/core`, and `@angular/cdk/a11y` in the
   dialogs); `@angular/common` is not used, so it is deliberately **not** a peer.
   Supported-and-tested band: Angular **20 (min) – 22 (max)**.

2. **No secondary entry points.** The viewer has a single public surface
   (`@rendara/report-viewer`) — the component, its API types, the default PDF
   exporter, the watermark result type. There is no Angular-free subset worth a
   secondary entry point: consumers who want framework-agnostic schema validation
   use the separately published **`@rendara/report-schema`** (E9-S3). So the
   "if needed" clause resolves to **not needed**.

3. **Tree-shakeable.** The package stays `"sideEffects": false` and ships a single
   FESM2022, so a bundler drops it entirely when unreferenced and a host pays
   nothing for it unless it imports it. A new gate
   (`tools/verify-viewer-treeshake.mjs`) esbuild-bundles two synthetic consumers
   of the **built** FESM (Angular/jsonata/ajv/tslib external, as a host build
   would): a side-effect-only import that references nothing must tree-shake to
   (near) nothing — esbuild even reports it as droppable because the package has
   no side effects — while referencing `ReportViewer` pulls the real component in
   (its `rdr-report-viewer` selector marker present). Per-*feature* dead-code
   elimination inside the single Angular FESM (dropping a component while keeping a
   leaf helper) is the Angular optimizer/Ivy linker's job during the host's app
   build, not a plain esbuild pass — so the gate proves the package-level
   guarantee, which is also what underpins SSR-safe import (no eager side effects).

4. **SSR-safe.** Every browser API is already guarded and unit-tested — file
   download no-ops without `URL`/`document`, `onPrint` guards `typeof window`, and
   `defaultPdfExporter` returns bytes without the DOM. No new runtime code is
   needed; the guarantee is documented and kept covered.

5. **Version tolerance proven deterministically.** Because real min/max installs
   can't run in-monorepo, the contract is locked two ways:
   - a unit test (`peer-deps.spec.ts`) asserts the declared ranges admit
     20.0.0 / 21.2.9 / 22.0.0 and reject 19, the peers are exactly core+cdk, and
     `sideEffects` stays `false`;
   - `tools/verify-viewer-pack.mjs` asserts the same on the **emitted** APF
     manifest after the build.
   Actual clean-room installs against real Angular versions are E9-S7.

## Consequences

- A host on Angular 20, 21 or 22 can install the package without a peer-range
  conflict; Angular is never duplicated into the bundle (peer, not dependency).
- The `pack` target now runs both verifiers (`verify-viewer-pack` then
  `verify-viewer-treeshake`) after `bundle`, so CI fails loudly if a refactor
  narrows the peers, leaks Angular into deps, or breaks tree-shaking.
- The open-ended `>=20.0.0` range means npm won't warn on Angular majors beyond
  the tested band (23+); that's the intended adoption trade-off (brief §3). If a
  future major breaks the viewer, the range is tightened with a release note.
- No secondary entry points to maintain; the schema package covers the
  Angular-free use case.
