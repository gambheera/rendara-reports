---
'@rendara/report-viewer': patch
---

Add consumer docs for the viewer (E9-S6): a copy-pasteable **quick-start** in the
package README (install + a minimal standalone `rdr-report-viewer` integration with
typed `rendered`/`error` handlers), a generated **TypeDoc input/output reference**
(`pnpm docs:build` → `dist/docs/report-viewer`, the README as its landing page, wired
as the `report-viewer:build-docs` Nx target and gated in CI), the Storybook file
called out as the documented viewer-state gallery, and a seeded, Changesets-versioned
`CHANGELOG.md`. A `docs-consistency` test uses `reflectComponentType` to keep the
README's selector/inputs/outputs in sync with the component. No API or runtime
behaviour change. See ADR 0018.
