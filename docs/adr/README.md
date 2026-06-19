# Architecture Decision Records (ADRs)

This directory records the significant architectural decisions for Rendara
Reports — one decision per file, in the order they were made. An ADR explains
**why** a choice was made so the same debate doesn't recur and future readers
have the context behind the code.

## Conventions

- Files are named `NNNN-kebab-title.md` with a zero-padded, **monotonically
  increasing** number. ADRs are **append-only**: never renumber or rewrite an
  accepted one — to change a decision, write a new ADR and mark the old one
  `Superseded by [ADR XXXX]`.
- Start from [`template.md`](template.md). Copy it to the next free number.
- Every ADR links the **story** that prompted it and is referenced from that
  story's PR. See [`CONTRIBUTING.md`](../../CONTRIBUTING.md) for when an ADR is
  required.

## Index

| ADR                                                 | Decision                                                            | Status   | Story |
| --------------------------------------------------- | ------------------------------------------------------------------- | -------- | ----- |
| [0001](0001-visual-regression-determinism.md)       | Visual-regression baselines are Linux-canonical, generated in CI    | Accepted | E0-S5 |
| [0002](0002-storybook-per-project-zoneless.md)      | Per-project, zoneless Storybook composition                         | Accepted | E0-S6 |
| [0003](0003-release-tooling-changesets-commitlint.md) | Release tooling: Changesets + commitlint                          | Accepted | E0-S7 |
| [0004](0004-design-tokens-theming.md)               | Design tokens as CSS custom properties; provisional dark theme      | Accepted | E0-S8 |
| [0005](0005-stack-and-architecture-decisions.md)    | **Foundational** stack & architecture decisions (brief §3–§4)       | Accepted | E0-S9 |

> **Numbering note:** ADRs 0001–0004 were written during E0-S5…S8, ahead of the
> formal template. The foundational stack ADR ([0005](0005-stack-and-architecture-decisions.md))
> was recorded later, in E0-S9, but is logically the baseline the others refine —
> the number reflects creation order, as the append-only convention requires.
