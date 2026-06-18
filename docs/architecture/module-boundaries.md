# Module boundaries (Nx tags + `@nx/enforce-module-boundaries`)

Rendara's layers are kept clean by Nx tags and the
`@nx/enforce-module-boundaries` ESLint rule, configured in the workspace-root
[`eslint.config.mjs`](../../eslint.config.mjs). This is the enforcement of
**brief §4** ("Dependency rules"). Introduced in story **E0-S2**.

## Tag scheme

Every project carries two tags — a `scope:*` (its layer) and a `type:*` (its
role):

| Project | `scope:*` | `type:*` | May import (internal) |
| --- | --- | --- | --- |
| `libs/report-schema` | `scope:schema` | `type:util` | — (nothing internal) |
| `libs/report-engine` | `scope:engine` | `type:util` | schema |
| `libs/report-renderer` | `scope:renderer` | `type:feature` | schema, engine |
| `libs/report-viewer` | `scope:viewer` | `type:publishable` | schema, engine, renderer |
| `libs/ui-kit` | `scope:ui-kit` | `type:ui` | — (self-contained) |
| `apps/designer` | `scope:designer` | `type:app` | schema, engine, renderer, ui-kit |
| `apps/viewer-demo` | `scope:viewer-demo` | `type:app` | viewer **only** |

The `scope:*` constraints are the authoritative encoding of §4. The `type:*`
constraints add role-based defense-in-depth (nothing may import a `type:app`;
`type:util` stays a leaf). Every legal edge in the table satisfies **both**
dimensions.

The resulting dependency graph (verify with `npx nx graph`):

```
report-schema  ──▶ (nothing)
report-engine  ──▶ report-schema
report-renderer ─▶ report-engine ─▶ report-schema
report-viewer  ──▶ report-renderer ─▶ report-engine ─▶ report-schema
ui-kit         ──▶ (nothing)
designer (app) ──▶ report-schema, report-engine, report-renderer, ui-kit
viewer-demo (app) ▶ report-viewer
```

## Boundary QA (story E0-S2)

### Legal imports pass (CI-enforced)

The skeleton wires one real dependency per layer (`SCHEMA_VERSION` flows
schema → engine → renderer → viewer; the designer imports all four allowed
libs; viewer-demo imports the viewer). These legal edges are checked on every
PR by:

```sh
npx nx run-many -t lint
```

If a legal edge ever regressed, lint would fail — so the legal-import half of
the QA is permanently guarded by CI.

### Illegal imports fail lint (manual, reproducible)

An illegal import cannot live permanently in the tree (it would break CI), so
verify it on demand and revert. The rule reports illegal edges two ways — a
**tag-scope** violation, or a **circular-dependency** violation when the
illegal edge also closes a cycle. Both are `@nx/enforce-module-boundaries`
errors that fail lint. Both were verified for E0-S2:

**a) Tag-scope violation (non-circular edge — e.g. `ui-kit` → `report-schema`):**

1. In `libs/ui-kit/src/lib/ui-kit/ui-kit.ts`, add:
   ```ts
   import { SCHEMA_VERSION } from '@rendara/report-schema';
   ```
2. Run `npx nx lint ui-kit` and observe:
   ```
   error  A project tagged with "scope:ui-kit" can only depend on libs tagged
   with "scope:ui-kit"  @nx/enforce-module-boundaries
   ```
3. **Revert** the change.

**b) Circular-dependency violation (the story's example, `report-schema` →
`report-renderer`):** because `report-renderer` transitively depends back on
`report-schema`, this edge closes a cycle and is reported as such:

1. In `libs/report-schema/src/lib/report-schema.ts`, add:
   ```ts
   import { ReportRenderer } from '@rendara/report-renderer';
   ```
2. Run `npx nx lint report-schema` and observe:
   ```
   error  Circular dependency between "report-schema" and "report-renderer"
   detected: report-schema -> report-renderer -> report-engine -> report-schema
   @nx/enforce-module-boundaries
   ```
3. **Revert** the change.

The same holds for any other upward/illegal edge (e.g. `viewer-demo` importing
`report-engine` directly).
