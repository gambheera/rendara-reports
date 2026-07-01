---
'@rendara/report-viewer': patch
---

Fix the published viewer bundle so it runs in a consumer's AOT build (E9-S4).
`tools/bundle-viewer.mjs` now bundles the inlined FESM with esbuild
`charset: 'utf8'`, keeping the Angular partial-declaration calls
(`ɵɵngDeclareComponent`, …) as real Unicode. esbuild previously escaped `ɵ` to
`\uXXXX`, and because the Angular Linker decides whether to process a file by
testing for the literal `ɵɵngDeclare` substring, it skipped the package entirely
— any consumer hit "JIT compiler unavailable" at runtime. This was surfaced by
`apps/viewer-demo`, which now consumes the **built** package (not workspace
source) and proves the integration end-to-end: it renders a report from
template + data and demonstrates the `rendered` / `pageChange` / `error` outputs,
print and export. The viewer's public API is unchanged.
