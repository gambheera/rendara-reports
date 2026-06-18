# Storybook (E0-S6)

Storybook documents and visually tests components **in isolation**. Per the
brief, it runs for the three component libraries:

| Project | Dev port | Build output |
| --- | --- | --- |
| `ui-kit` | 4400 | `dist/storybook/ui-kit` |
| `report-renderer` | 4401 | `dist/storybook/report-renderer` |
| `report-viewer` | 4402 | `dist/storybook/report-viewer` |

Each lib owns a `.storybook/` config (`main.ts`, `preview.ts`, `tsconfig.json`)
and `storybook` / `build-storybook` targets in its `project.json`. See
[ADR 0002](../adr/0002-storybook-per-project-zoneless.md) for the
why (one-per-lib, Storybook 10, zoneless, dev-only).

## Versions

- `storybook`, `@storybook/angular`, `@storybook/addon-docs` — **10.4.6**
  (`@storybook/angular@10` is the first/only line that supports Angular 21).
- `@angular-devkit/build-angular` — the Angular Storybook builder compiles
  through it. **devDependency only**; it never enters the `report-viewer`
  bundle.

## Commands

```bash
# Run one lib's Storybook dev server (watch)
npx nx storybook ui-kit            # http://localhost:4400
npx nx storybook report-renderer   # http://localhost:4401
npx nx storybook report-viewer     # http://localhost:4402

# Build static Storybooks (what CI gates)
pnpm storybook:build               # nx run-many -t build-storybook
npx nx build-storybook ui-kit      # a single lib -> dist/storybook/ui-kit

# Smoke-test that the (zoneless) preview boots and renders the first story
npx nx storybook ui-kit --smokeTest --ci
```

## Composition — one aggregated UI

The three per-lib Storybooks stay isolated, and a thin **composition host** at
the repo root (`.storybook/`) aggregates them under a single sidebar via
[Storybook Composition](https://storybook.js.org/docs/sharing/storybook-composition)
`refs`. The host renders no Angular itself — it uses the lightweight HTML/Vite
builder and just links to the running lib Storybooks (ports 4400/4401/4402). See
[ADR 0002](../adr/0002-storybook-per-project-zoneless.md).

```bash
# Terminal 1 — start all three lib Storybooks (4400/4401/4402)
npx nx run-many -t storybook

# Terminal 2 — start the composition host (http://localhost:4500)
pnpm storybook:compose
```

The host's `refs` point at `http://localhost:<port>`; to publish a single
aggregated Storybook later, repoint them at the deployed lib Storybook URLs. The
composition host is a **dev-time convenience** and is intentionally *not* part of
the CI build gate — CI builds each lib Storybook independently.

## Writing a story

Stories live next to their component as `*.stories.ts` and use Storybook's
Component Story Format (CSF3) for Angular:

```ts
import type { Meta, StoryObj } from '@storybook/angular';
import { UiKit } from './ui-kit';

const meta: Meta<UiKit> = {
  title: 'ui-kit/UiKit',
  component: UiKit,
  tags: ['autodocs'], // generates a Docs page via @storybook/addon-docs
};
export default meta;

type Story = StoryObj<UiKit>;
export const Default: Story = {};
```

The current stories cover the E0-S2 skeleton components only; real
token-driven `ui-kit` components (light/dark) arrive with **E0-S8**, and real
rendered output is mounted in `report-renderer` / `report-viewer` stories from
**Epic 4** onward.

## Zoneless

The workspace is zoneless (no `zone.js`). Stories bootstrap zoneless via the
builder option **`experimentalZoneless: true`** (in each `project.json`), so we
do not provide a change detector in `preview.ts`. `zone.js` is an optional peer
of `@storybook/angular` and is intentionally not installed.

> The `storybook` (dev-server) target carries a self-referential
> `"browserTarget": "<project>:build-storybook"`. Storybook-for-Angular's dev
> server requires a defined `browserTarget`; `build-storybook` does not.

## How it's wired into Nx

- `build-storybook` is **cacheable** (`nx.json` → `targetDefaults`), output
  keyed off `{options.outputDir}`.
- `.storybook/**` and `**/*.stories.ts` are excluded from the `production`
  named input and from each lib's `tsconfig.lib.json`, so stories never count
  toward test coverage or land in the publishable build.

## CI

A minimal [`.github/workflows/storybook.yml`](../../.github/workflows/storybook.yml)
runs `pnpm storybook:build` on every PR, satisfying the "builds in CI"
acceptance criterion. The full pipeline (lint / typecheck / test / build via
`nx affected`, caching, branch protection) is **E0-S3**'s job; it should absorb
this build-storybook step and remove the stub workflow.
