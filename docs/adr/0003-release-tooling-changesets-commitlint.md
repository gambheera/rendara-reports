# ADR 0003 — Release tooling & commit hygiene: Changesets + commitlint + husky

- **Status:** Accepted
- **Date:** 2026-06-18
- **Story:** E0-S7 · Release tooling & commit hygiene

> The formal ADR template and `ARCHITECTURE.md`/`CONTRIBUTING.md` land in
> **E0-S9**; this is a lightweight ADR recording decisions made in E0-S7.

## Context

E0-S7 asks for "versioned releases and consistent commits": **Changesets**
configured for `@rendara/report-viewer` and `@rendara/report-schema`,
**commitlint + Conventional Commits**, **CHANGELOG generation**, and an **npm
publish dry-run** with **no real publish yet**. Two constraints shape the
implementation:

- The two publishable packages are named in the brief (§4) but have **no build
  yet** — packaging (ng-packagr/APF, `exports`, peer ranges) is **E9**.
- The workspace is **Nx-classic**: internal libs are linked by `tsconfig` path
  aliases, and `pnpm-workspace.yaml` intentionally declared **no** `packages:`.

## Decision

1. **Changesets** for versioning + CHANGELOG generation (mandated by the story).
   `.changeset/config.json` uses the built-in `@changesets/cli/changelog`
   generator (no GitHub token / remote needed yet), `access: public`,
   `baseBranch: main`. The flow is `changeset` → `changeset status` (preview) →
   `changeset version` (bump + CHANGELOG) → publish.

2. **Register the two publishable libs as pnpm workspace packages.** Changesets
   discovers packages via the monorepo tool; for pnpm that is
   `pnpm-workspace.yaml` `packages:`. We add **only** `libs/report-schema` and
   `libs/report-viewer` there, each with a minimal `package.json`
   (`@rendara/report-schema` / `@rendara/report-viewer`, `version: 0.0.0`,
   `publishConfig.access: public`). The other libs/apps stay pure-Nx and remain
   invisible to both pnpm and Changesets. Internal dev linking is unchanged
   (still TS path aliases); the resulting pnpm symlinks are benign and unused by
   the dev toolchain. `nx show projects` confirms project names are unaffected —
   `project.json`'s `name` still wins over the scoped `package.json` name.

3. **commitlint with `@commitlint/config-conventional`.** The default
   `type-enum` and free-form scopes already match this repo's history
   (`chore(tooling)`, `docs(test)`, …). `body-leading-blank` /
   `footer-leading-blank` are kept as warnings so the required
   `Co-Authored-By:` trailer never hard-fails a commit.

4. **husky v9 `commit-msg` hook** runs commitlint locally; a CI `commitlint` job
   re-validates the whole PR commit range because local hooks can be bypassed
   with `--no-verify`. `prepare: husky` installs the hook on `pnpm install`;
   husky's generated `.husky/_/` is git-ignored and regenerated per clone.

5. **Dry-run publish only.** `pnpm -r publish --dry-run --no-git-checks`
   exercises the publish path for the two packages without touching a registry.
   Real `changeset publish` is deliberately **not** wired until the packages have
   a real build (**E9**) — matching the story's "no real publish yet".

## Alternatives considered

- **`nx release`** (Nx's built-in versioning/publishing, which can read projects
  straight from the Nx graph without pnpm workspace registration). Rejected: the
  story explicitly mandates **Changesets** and **commitlint**. Revisit only if we
  later consolidate on Nx-native release orchestration.
- **semantic-release** — heavier, tag/CI-centric, and couples releases to commit
  messages rather than explicit intent. Changesets' per-PR intent files suit a
  reviewed, one-story-at-a-time workflow better.
- **Keeping zero pnpm `packages:`** (e.g. a root `workspaces` field). Rejected:
  pnpm ignores `workspaces` and Changesets/manypkg reads `pnpm-workspace.yaml`,
  so there is no way for Changesets to see the two packages otherwise.

## Consequences

- Adding/renaming a publishable package means updating both
  `pnpm-workspace.yaml` and `tsconfig.base.json` paths.
- A PR that changes a publishable package should add a changeset; CI will later
  (E9/E0-S3) be able to enforce this.
- The dry-run currently packs source (no build), so its output is a flow check,
  not a representation of the final published artifact. That becomes accurate
  once E9 adds the package build.
