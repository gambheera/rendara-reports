# Contributing to Rendara Reports

Thanks for working on Rendara Reports. This guide is the operational rulebook;
the architecture map is [`ARCHITECTURE.md`](ARCHITECTURE.md) and the full vision +
Definition of Done is [`docs/claude_prompts/RENDARA_PROJECT_BRIEF.md`](docs/claude_prompts/RENDARA_PROJECT_BRIEF.md).

## Prerequisites

- **Node** `>= 22.12` (repo is pinned via [`.nvmrc`](.nvmrc) to `22.20.0`).
- **pnpm** `>= 11` — enable via Corepack: `corepack enable` (or `npm i -g pnpm@11`).

```bash
pnpm install     # also installs the husky commit-msg hook
```

The command reference (lint, test, e2e, visual, Storybook, releases) lives in the
[README](README.md#commands).

## How we work: one story at a time

Rendara is built **one small, reviewable story at a time**, each from
[`docs/claude_prompts/RENDARA_BACKLOG.md`](docs/claude_prompts/RENDARA_BACKLOG.md).
The rules:

1. **Plan first.** Restate the story scope, its acceptance criteria, and the
   Definition of Done, then **get approval before writing code.** (The `/story`
   command drives this loop.)
2. **Implement only that story.** Keep the change small and scoped — don't fold in
   the next story or unrelated cleanup.
3. **Open a single-story PR** with the DoD checklist filled in, then **stop for
   review.** Don't start the next story until the current one is approved/merged.

### Branching & commits

- Branch per story: `feat/e0-s9-governance-docs`, `fix/...`, `docs/...`,
  `chore/...` (kebab story id + short slug).
- Commits follow **[Conventional Commits](https://www.conventionalcommits.org)**,
  enforced locally by a **husky `commit-msg`** hook (commitlint) and re-checked in
  CI. Use a scope where it helps: `feat(report-schema): ...`, `docs: ...`,
  `chore(ci): ...`. A non-conventional message is rejected.

## Definition of Done (every story)

A story is **not** done until **all** of brief §9 is satisfied, **plus** that
story's own QA. The checklist is embedded in the
[PR template](.github/PULL_REQUEST_TEMPLATE.md). In short:

- [ ] Functionality meets the acceptance criteria.
- [ ] **Unit + component tests** for new logic/components. Coverage bars:
      engine/schema **≥90%**, UI **≥80%** (enforced in CI).
- [ ] **Visual-regression snapshots** added/updated for any rendered-output change
      — no unreviewed pixel diffs. See [visual regression](docs/testing/visual-regression.md);
      never blindly overwrite baselines.
- [ ] **UI fidelity** to the approved mockup after the **brief §12.3
      reconciliation rules** (canonical name "Rendara Reports", `Insert/Layers/Data`
      tabs, v1 palette, **mm** units, accent `#4F46E5`, fixed Invoice sample).
- [ ] **Schema round-trip** preserved where templates are involved (export →
      re-import yields an equivalent, ajv-valid template).
- [ ] **Accessibility:** no new axe violations; keyboard operability; WCAG 2.2 AA.
- [ ] **Lint, format, strict typecheck** clean; **Nx module boundaries** respected.
- [ ] **Performance budgets** respected (viewer bundle size; render time on
      large-data fixtures).
- [ ] **Docs updated** (Storybook / API docs / README / `viewer-demo`), and an
      **ADR** for any significant decision.
- [ ] **CI green** (`nx affected` lint + test + build + e2e + visual + a11y).
- [ ] **PR opened with the DoD checklist**, scoped to one story, awaiting review.

Mark items **N/A** with a one-line reason where they genuinely don't apply (e.g. a
docs-only story has no tests/visual/schema/perf surface).

## Quality gates (run before opening a PR)

```bash
pnpm lint            # nx run-many -t lint  (incl. module-boundary rules)
pnpm test            # Vitest unit + component tests, with coverage bars
pnpm e2e             # Playwright e2e        (first run: npx playwright install chromium)
pnpm visual          # visual-regression     (update only with explanation: pnpm visual:update)
pnpm format:check    # Prettier              (pnpm format to fix)
```

Prefer `:affected` variants (`pnpm lint:affected`, `pnpm test:affected`) while
iterating. **Never weaken, skip, or delete a test to make CI pass.**

## Nx module boundaries

The layer graph is enforced by `@nx/enforce-module-boundaries`:
`report-schema → report-engine → report-renderer → report-viewer`; apps depend
**inward only** (`viewer-demo` may import the viewer **only**). Adding an illegal
import fails lint. See [`docs/architecture/module-boundaries.md`](docs/architecture/module-boundaries.md).

## Releases & changesets

The two publishable packages (`@rendara/report-schema`, `@rendara/report-viewer`)
are versioned with **Changesets**. **Any PR that changes a published package must
add a changeset:**

```bash
pnpm changeset       # describe the change + pick the bump
```

Versioning + CHANGELOGs: `pnpm release:version`; publishing is **dry-run only**
until package builds land in E9. See [`docs/tooling/releases.md`](docs/tooling/releases.md).
Docs-only or designer/internal-only PRs need **no** changeset.

## Architecture Decision Records (ADRs)

Write an ADR for any **significant** or **non-obvious** architectural decision —
a new dependency, a contract/boundary change, a deviation from the brief, or a
choice future contributors might otherwise re-litigate.

- Copy [`docs/adr/template.md`](docs/adr/template.md) to the **next free number**
  `docs/adr/NNNN-kebab-title.md` (ADRs are append-only — never renumber).
- Add it to the [ADR index](docs/adr/README.md) and link it from the story PR.
- To change a past decision, write a **new** ADR and mark the old one
  `Superseded by [ADR XXXX]`.

## Hard rules (never violate)

- **No `eval` / `new Function`.** Template expressions run **only** through the
  sandboxed JSONata engine.
- The **viewer must not leak styles** into host apps and must not depend on a heavy
  UI kit (Angular CDK + scoped CSS only).
- Respect the **Nx module boundaries** above.
- The **Template JSON schema is a versioned contract** — any change needs a
  `schemaVersion` bump + migration + maintainer sign-off (**ask first**).
- For UI work, apply the **brief §12.3 reconciliation rules**.
- **Never weaken, skip, or delete a test** to make CI pass; update visual baselines
  only with an explanation.

## Code style

Strict TypeScript, ESLint (+ angular-eslint), Prettier. Angular: **standalone
components, signals, the new control flow (`@if`/`@for`), zoneless** — no
`NgModule`/Zone.js. Match the conventions of the surrounding code.

## Opening a PR

GitHub auto-populates the [PR template](.github/PULL_REQUEST_TEMPLATE.md). Fill in
the summary, link the story, tick the DoD checklist (with N/A reasons where
applicable), attach evidence for the story-specific QA, and **stop for review** —
a PR is scoped to a single story. The maintainer in [`CODEOWNERS`](.github/CODEOWNERS)
is requested automatically.
