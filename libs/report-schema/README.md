# report-schema

`@rendara/report-schema` — the framework-agnostic Template JSON contract for
Rendara Reports: TypeScript types, (later) JSON Schema, ajv validator, and
migrations. Depends on nothing internal (brief §4).

## Status

Built incrementally across Epic 1:

- **E1-S1 ✅ Core document & element-base types** — `RendaraTemplate`, `Page`
  (structural), band containers (`header`/`body`/`footer`), `ElementBase`, and
  the stubbed `TemplateElement` discriminated union (`text` / `shape` / `image`
  / `dataTable`). Plus `SCHEMA_VERSION` (E0-S2).
- E1-S2 page settings & defaults · E1-S3 per-type element models · E1-S4 style
  model · E1-S5 binding model · E1-S6 JSON Schema + validator · E1-S7 versioning
  & migrations · E1-S8 golden fixtures — _to come._

```ts
import type { RendaraTemplate } from '@rendara/report-schema';
import { SCHEMA_VERSION } from '@rendara/report-schema';
```

## Test

```sh
npx nx test report-schema
```
