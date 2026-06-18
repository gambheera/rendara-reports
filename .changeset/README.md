# Changesets

This folder holds [Changesets](https://github.com/changesets/changesets) — the
release tooling for Rendara's publishable packages (`@rendara/report-schema`,
`@rendara/report-viewer`).

## When to add a changeset

Add one in **every PR that changes a publishable package's behaviour or public
API**. Internal-only libs (`report-engine`, `report-renderer`, `ui-kit`) and the
apps are not published and do not need changesets.

```bash
pnpm changeset          # interactively pick packages + bump (patch/minor/major)
```

This writes a markdown file here describing the change. Commit it with your PR.

## Cutting a release (later — see docs/tooling/releases.md)

```bash
pnpm release:status     # preview the pending version bumps (non-destructive)
pnpm release:version    # consume changesets: bump versions + write CHANGELOGs
pnpm release:dry-run    # `pnpm -r publish --dry-run` — no real publish yet
```

Real publishing (`changeset publish`) is wired once package builds exist (E9).
