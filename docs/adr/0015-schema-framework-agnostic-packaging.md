# ADR 0015 — Framework-agnostic packaging for `@rendara/report-schema`

- **Status:** Accepted
- **Date:** 2026-06-29
- **Story:** E9-S3 · Publish `@rendara/report-schema`

## Context

`@rendara/report-schema` is the Template JSON **contract**: TypeScript types, the
generated JSON Schema, an ajv validator, migrations, and golden fixtures. It is
**pure TypeScript with no Angular** and is meant to be published standalone so a
**backend or template-tooling developer** can validate/generate templates in
plain Node (brief §4, §5; the persona in the story).

Until now every workspace lib — including the framework-agnostic `report-schema`
and `report-engine` — was built with the Angular toolchain (`@nx/angular:package`
→ ng-packagr), because the viewer's two-stage bundle (ADR 0013) inlines their
APF artifacts. For a lib that is only ever *bundled into the viewer*
(`report-engine`, `private: true`) that is fine. But for a lib we actually
**publish for Node**, the ng-packagr output is wrong:

- it is **ESM-only** (`"type":"module"`, `module`, no `main`), so a CommonJS Node
  backend cannot `require()` it;
- it injects a **`prepublishOnly` guard that hard-fails any publish**
  ("compiled in full compilation mode… not allowed") — the package literally
  cannot be published;
- it adds a spurious `tslib` runtime dependency;
- conceptually it is an *Angular* build of a deliberately framework-agnostic lib.

The constraint: `tools/bundle-viewer.mjs` inlines the schema by reading the exact
artifact paths `dist/libs/report-schema/fesm2022/rendara-report-schema.mjs` and
`dist/libs/report-schema/types/rendara-report-schema.d.ts`. Whatever replaces the
build must keep emitting those, or the (fragile) viewer build breaks.

## Decision

1. **Replace ng-packagr with a small framework-agnostic build**
   (`tools/bundle-schema.mjs`), reusing the tools the viewer bundle already
   depends on (esbuild + rollup-plugin-dts), so no new dependencies:
   - `tsc --emitDeclarationOnly` → a temp tree, then **rollup-plugin-dts** flattens
     it into a single `types/rendara-report-schema.d.ts`;
   - **esbuild** bundles `src/index.ts` to **both** an ESM entry
     (`fesm2022/rendara-report-schema.mjs`) and a CJS entry (`index.cjs`), with
     `ajv`/`ajv-formats` left external and everything else inlined;
   - a clean publishable `package.json` is written: dual
     `main`/`module`/`types`/`exports`, `sideEffects:false`, deps = ajv/ajv-formats
     only (**no** `tslib`, **no** `prepublishOnly`), plus the `README.md` and the
     raw JSON Schema (shipped and exposed as the `./schema.json` subpath for
     backends, brief §5).

2. **Dual ESM + CJS.** The package's persona is a Node backend, which may be ESM
   *or* CommonJS; shipping both (`import` → FESM, `require` → CJS) makes it usable
   in either without an interop dance.

3. **Keep the viewer's expected artifact paths.** The ESM bundle and flattened
   `.d.ts` are emitted at the same paths ng-packagr used, so
   `tools/bundle-viewer.mjs` inlines schema unchanged — zero risk to the viewer's
   two-stage build (ADR 0013).

4. **Prove it in Node, deterministically.** Two gates run after the build via the
   `pack` target:
   - `tools/verify-schema-pack.mjs` — `npm pack --dry-run` asserts the tarball has
     the dual entries + flattened types + the JSON Schema artifact, the manifest
     has the Node entry fields, and the package is framework-agnostic (no
     `@angular/*`/`@rendara/*` deps, no `tslib`, no `prepublishOnly`);
   - `tools/verify-schema-node.mjs` — the story's QA: imports the **built** package
     via **both** `import()` (ESM) and `require()` (CJS) and validates a golden
     fixture (and rejects a malformed one). Because pnpm does not hoist the
     schema's deps to the workspace root, the smoke test links the lib's own
     `node_modules` (which holds exactly its declared deps) beside the `dist`, so
     `ajv` resolves the way it would for a real consumer. A full out-of-monorepo
     install is the clean-room smoke test's job (E9-S7).

## Consequences

- `@rendara/report-schema` is now genuinely publishable and consumable in plain
  Node, in both module systems, with the JSON Schema available as a file artifact
  — the framework-agnostic contract the brief promises backends.
- `report-engine` stays on ng-packagr: it is `private` and only ever inlined into
  the viewer, so it does not need (and should not pay for) a standalone Node
  build. Only the published framework-agnostic lib moves off the Angular
  toolchain.
- The viewer build is untouched: it still inlines schema's FESM/`.d.ts` from the
  same paths; `nx run report-viewer:pack` continues to pass.
- The `pack` target gates the contract in CI (a new `schema-pack` job, parity with
  `viewer-apf-build`), so a regression that re-introduces Angular, drops a format,
  or breaks Node consumption fails loudly.
- This does **not** wire `pnpm publish` to publish from `dist`; real publishing is
  still deferred (as for the viewer in E9-S1/S2). E9-S3 delivers the build + Node
  proof.
