# Architecture Decision Records (ADRs)

This directory records the significant architectural decisions for Rendara
Reports — one decision per file, in the order they were made. An ADR explains
**why** a choice was made so the same debate doesn't recur and future readers
have the context behind the code.

## Conventions

- Files are named `NNNN-kebab-title.md` with a zero-padded, **monotonically
  increasing** number. **0000** is reserved for the foundational architecture
  ADR; numbered ADRs start at 0001. ADRs are **append-only**: never renumber or
  rewrite an accepted one — to change a decision, write a new ADR and mark the
  old one `Superseded by [ADR XXXX]`.
- Start from [`template.md`](template.md). Copy it to the next free number.
- Every ADR links the **story** that prompted it and is referenced from that
  story's PR. See [`CONTRIBUTING.md`](../../CONTRIBUTING.md) for when an ADR is
  required.

## Index

| ADR                                                   | Decision                                                         | Status   | Story |
| ----------------------------------------------------- | ---------------------------------------------------------------- | -------- | ----- |
| [0000](0000-stack-and-architecture-decisions.md)      | **Foundational** stack & architecture decisions (brief §3–§4)    | Accepted | E0-S9 |
| [0001](0001-visual-regression-determinism.md)         | Visual-regression baselines are Linux-canonical, generated in CI | Accepted | E0-S5 |
| [0002](0002-storybook-per-project-zoneless.md)        | Per-project, zoneless Storybook composition                      | Accepted | E0-S6 |
| [0003](0003-release-tooling-changesets-commitlint.md) | Release tooling: Changesets + commitlint                         | Accepted | E0-S7 |
| [0004](0004-design-tokens-theming.md)                 | Design tokens as CSS custom properties; provisional dark theme   | Accepted | E0-S8 |
| [0005](0005-headless-text-measurement.md)             | Headless, deterministic text measurement for table row heights   | Accepted | E3-S3 |
| [0006](0006-pagination-algorithm.md)                  | Pagination algorithm: page breaks, repeated headers, widow/orphan | Accepted | E3-S4 |
| [0007](0007-page-chrome-page-numbers-watermark.md)    | Page chrome: repeating header/footer, page numbers, watermark    | Accepted | E3-S5 |
| [0008](0008-grouping-pagination.md)                   | Grouping & group aggregates across pages                         | Accepted | E3-S6 |
| [0009](0009-renderer-style-isolation.md)              | Renderer style isolation: emulated default + opt-in Shadow DOM   | Accepted | E4-S5 |
| [0010](0010-renderer-print-stylesheet.md)             | Renderer print stylesheet: a shared `@media print` block         | Accepted | E4-S8 |
| [0011](0011-viewer-print-path.md)                     | Viewer print path: hidden per-page mirror + native `window.print()` | Accepted | E8-S2 |
| [0012](0012-viewer-pdf-export.md)                     | Viewer PDF export: dependency-free selectable-text writer behind a swappable `PdfExporter` | Accepted | E8-S3 |
| [0013](0013-viewer-apf-packaging.md)                  | Publishable viewer build: ng-packagr APF per lib + an esbuild/dts inline pass | Accepted | E9-S1 |
| [0014](0014-viewer-peer-deps-and-version-tolerance.md) | Viewer wide Angular peers (`>=20`), tree-shake + version-tolerance gates | Accepted | E9-S2 |
| [0015](0015-schema-framework-agnostic-packaging.md)   | Framework-agnostic schema build (esbuild/dts), dual ESM+CJS, Node-proven | Accepted | E9-S3 |
| [0016](0016-viewer-demo-consumes-built-package.md)    | `viewer-demo` consumes the built viewer package; Linker/`charset` + prod-serve e2e | Accepted | E9-S4 |
| [0017](0017-viewer-theming-and-isolation.md)          | Viewer theming API (`--rdr-*` families) + isolation guarantees; content-only shadow-DOM opt-in | Accepted | E9-S5 |
| [0018](0018-viewer-api-docs-and-changelog.md)         | Viewer consumer docs: TypeDoc API reference, Storybook state gallery, Changesets CHANGELOG | Accepted | E9-S6 |
| [0019](0019-viewer-clean-room-smoke-test.md)          | Clean-room install smoke test: packed tarball → fresh external Angular app → AOT build + browser render gate | Accepted | E9-S7 |

> **Numbering note:** ADRs 0001–0004 were written first, during E0-S5…S8, each
> recording one Epic 0 tooling decision. The foundational stack/architecture ADR
> was recorded later, in E0-S9, but is the baseline the others refine — so it
> takes the reserved foundational slot **[0000](0000-stack-and-architecture-decisions.md)**
> and sorts first. From here, ADRs are append-only at 0001+.
