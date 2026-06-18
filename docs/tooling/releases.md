# Releases & commit hygiene (E0-S7)

This repo uses **Changesets** for versioning + CHANGELOGs and **commitlint** for
Conventional Commits, enforced by a **husky** git hook and a CI job. Background
and trade-offs: [ADR 0003](../adr/0003-release-tooling-changesets-commitlint.md).

## Publishable packages

Only two packages are published; Changesets versions **only** these:

| Package | Path |
| --- | --- |
| `@rendara/report-schema` | `libs/report-schema` |
| `@rendara/report-viewer` | `libs/report-viewer` |

They are registered in `pnpm-workspace.yaml` `packages:` so Changesets can
discover them. The other libs/apps are pure-Nx (no `package.json`) and are not
published. The packages currently carry **no build config** — packaging
(ng-packagr/APF, `exports`, peer ranges) and real publishing land in **E9**;
until then the publish step is a **dry-run** only.

## Commit messages — Conventional Commits

Every commit must follow [Conventional Commits](https://www.conventionalcommits.org):

```
<type>(<optional scope>): <subject>
```

`type` is one of `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `perf`,
`test`, `build`, `ci`, `revert`. Scope is free-form (e.g. `chore(tooling)`,
`docs(test)`). Config: [`commitlint.config.mjs`](../../commitlint.config.mjs).

- **Locally:** the husky `commit-msg` hook (`.husky/commit-msg`) runs commitlint
  on every commit; it is installed automatically by `prepare: husky` on
  `pnpm install`.
- **In CI:** `.github/workflows/release.yml` re-lints the whole PR commit range
  (local hooks can be skipped with `--no-verify`).

Check a message manually:

```bash
echo "feat(schema): add page-size model" | pnpm exec commitlint   # passes
echo "added page model"                   | pnpm exec commitlint   # rejected
```

## Adding a changeset (every PR that touches a published package)

```bash
pnpm changeset      # pick package(s) + bump (patch/minor/major), write a summary
```

Commit the generated `.changeset/*.md` file with your PR. Internal-only changes
(engine/renderer/ui-kit/apps) need no changeset.

## Cutting a release

```bash
pnpm release:status     # preview pending bumps + CHANGELOG entries (non-destructive)
pnpm release:version    # consume changesets: bump versions + write/append CHANGELOG.md
pnpm release:dry-run    # pnpm -r publish --dry-run --no-git-checks (no real publish)
```

`release:version` deletes the consumed changeset files and updates each
package's `version` and `CHANGELOG.md`. Commit that as the release PR.

**Real publishing is not wired yet.** Once E9 adds the package builds, a
`changeset publish` step (gated on an `NPM_TOKEN`) replaces the dry-run.
