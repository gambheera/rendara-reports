# Rendara Reports — Claude Code project memory

Rendara Reports is a **100% front-end Angular** reporting platform: a **Report Designer** web app plus an **embeddable Report Viewer** npm package, in an **Nx monorepo**. The full vision, architecture, tech stack, schema design, and Definition of Done are here (read this once at the start of a session):

@docs/claude_prompts/RENDARA_PROJECT_BRIEF.md

The build is planned as epics → small, single-PR **stories**. The backlog is large — **do not read all of it**; read only the one story you're told to implement.
- Backlog (read the named story only): `docs/claude_prompts/RENDARA_BACKLOG.md`
- UI mockups (each story's `🖼 UI ref`): `docs/ui-mockups/stitch_rendara_design_system/<screen-folder>/{screen.png,code.html}` — the Stitch wrapper folder was kept, so the brief §12.1 table paths need the `stitch_rendara_design_system/` prefix.
- Design system (authoritative tokens): `docs/ui-mockups/stitch_rendara_design_system/design.md`

## Repository status (read this first)
This repo is **docs-only right now** — the brief, backlog, and UI mockups exist, but there is **no code yet**: no Nx workspace, no `package.json`, no `apps/`/`libs/`, no lockfile, no tests. The structure in brief §4 is the **target**, not the current tree. The Nx workspace and all tooling are scaffolded by **Epic 0** (start at story **E0-S1 · Initialize Nx workspace**). Until E0 lands, the commands below do not exist.

## Commands (after Epic 0 scaffolds the workspace)
Package manager is **pnpm**; the runner is **Nx**. Per the E0 stories these are the intended commands:
- Install: `pnpm install`
- Dependency graph / boundaries: `npx nx graph`
- Lint everything / affected: `npx nx run-many -t lint` · `npx nx affected -t lint test build`
- Unit + component tests (Vitest): `npx nx test <project>` (e.g. `report-engine`, `report-schema`)
- A single test file / name: `npx nx test <project> -- <file>` · `npx nx test <project> -- -t "test name"`
- E2E + visual regression (Playwright): `npx nx e2e <app>-e2e`; update snapshots via the documented `update-snapshots` workflow (E0-S5) — never blindly overwrite baselines
- Build a publishable lib: `npx nx build report-viewer`
- Storybook (E0-S6): `npx nx storybook ui-kit`

Coverage bars are enforced in CI: engine/schema **≥90%**, UI **≥80%** (brief §9).

## Environment
Windows + **PowerShell** (a Bash tool is also available for POSIX scripts). Use `/story <id>` (`.claude/commands/story.md`) to drive a story: it reads only that story, restates scope + DoD, plans, and **stops for approval before any code**.

## How we work
- Implement **one story at a time.** Never start the next story without my explicit go-ahead.
- **Plan first and wait for my approval** before writing any code.
- Every story must meet the **Definition of Done (brief §9)** plus that story's own QA.
- Finish with a **single-story PR** with the DoD checklist filled in, then **stop for my review** before merging.
- Keep PRs small and scoped to the one story.

## Hard rules (never violate)
- Never introduce `eval` or `new Function`. Template expressions run **only** through the sandboxed engine (JSONata).
- The viewer must not leak styles into host apps and must not depend on a heavy UI kit (Angular CDK + scoped CSS only).
- Respect Nx module boundaries: `report-schema` → `report-engine` → `report-renderer` → `report-viewer`; apps depend inward only.
- Never weaken, skip, or delete a test to make CI pass.
- The Template JSON schema is a **versioned contract** — any change needs a version bump + migration + my sign-off (ask first).
- For UI work, apply the **reconciliation rules in brief §12.3** (canonical name "Rendara Reports"; clean designer top bar; `Insert / Layers / Data` tabs; v1 palette = Text, Image, Line, Rectangle, Ellipse, Data Table only; **mm** units; accent `#4F46E5`; fixed Invoice — Acme Corp sample data). Stitch `code.html` is a **layout hint, not production code** — re-implement in Angular.

## Stack (rationale in brief §3)
Nx · Angular 21 (standalone components, signals, zoneless) · `@ngrx/signals` for designer state · JSONata for expressions · Angular CDK · Vitest + Playwright + axe-core · Changesets for releases.
