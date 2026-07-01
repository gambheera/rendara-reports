# Clean-room consumer fixture (E9-S7)

A minimal, standalone **Angular 21** application — the equivalent of a fresh
`ng new` — that a host developer would write to consume `@rendara/report-viewer`.
It is **not part of the Nx workspace**: it has its own `package.json`,
`angular.json` and `tsconfig`, uses no `tsconfig.base.json` path mappings, and is
excluded from Nx (`.nxignore`) and workspace ESLint.

It exists only to be driven by [`tools/clean-room-smoke.mjs`](../../clean-room-smoke.mjs),
which:

1. `npm pack`s the built `@rendara/report-viewer` into a throwaway temp dir
   **outside the repo** as `report-viewer.tgz` (the `file:` dependency below);
2. copies this fixture beside it and runs a real `npm install` — so the package
   is installed exactly as an external consumer's would be, with the Angular
   Linker running on `node_modules`;
3. AOT-builds the app (`ng build`) and loads it in headless Chromium, asserting
   the report actually renders (title, bound customer, currency totals, the
   `Page 1 of N` footer) with no runtime error.

The `@rendara/report-viewer` dependency is pinned to `file:./report-viewer.tgz`;
the smoke script drops the freshly packed tarball at that path before installing.
The component code mirrors the README quick-start verbatim, so a green run proves
the documented integration works outside the monorepo.
