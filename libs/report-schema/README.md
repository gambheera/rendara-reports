# report-schema

`@rendara/report-schema` — the framework-agnostic Template JSON contract for
Rendara Reports: TypeScript types, JSON Schema, ajv validator, and migrations.
Depends on nothing internal (brief §4). **No Angular** — usable in any Node
backend or template-tooling script.

## Status

Built incrementally across Epic 1:

- **E1-S1 ✅ Core document & element-base types** — `RendaraTemplate`, `Page`
  (structural), band containers (`header`/`body`/`footer`), `ElementBase`, and
  the stubbed `TemplateElement` discriminated union (`text` / `shape` / `image`
  / `dataTable`). Plus `SCHEMA_VERSION` (E0-S2).
- **E1-S2 ✅ Page & document settings** — defaults, named-size → mm resolution,
  `resolvePage`, and focused `validatePageSettings`.
- **E1-S3 ✅ Per-type element models** — concrete `TextElement`,
  `ShapeElement` (`line`/`rect`/`ellipse`), `ImageElement` (`src`/`binding`,
  `fit`), `DataTableElement` (`source.arrayExpr`, columns with
  header/cell/footer, optional groups, `repeatHeaderOnEachPage`,
  `keepTogether`); an `ElementBinding` slot (completed in E1-S5); type
  guards, an `assertNever` exhaustiveness guard, and a focused
  `validateElement`.
- **E1-S4 ✅ Style model** — concrete `ElementStyle`: `font`
  (family/sizePt/weight/style), `color`, `fill`, per-side `border`
  (widthMm/style/color), `align` (horizontal/vertical), `padding`, `stroke`,
  and a number/date `format` token slot. Runtime literal mirrors
  (`FONT_WEIGHTS`/`FONT_STYLES`/`LINE_STYLES`/`HORIZONTAL_ALIGNS`/
  `VERTICAL_ALIGNS`) and a focused `validateStyle` (folded into
  `validateElement`).
- **E1-S5 ✅ Binding model** — structured `ElementBinding` (`expr` +
  optional `format` token + `fallback`), reused at every binding location
  (element `binding`, column `cell`/`footer`); grouping with header/footer
  `GroupBand`s carrying a `label` and per-column `GroupAggregate` subtotals;
  `visibleWhen` boolean expression. A focused `validateBinding` (folded into
  `validateElement`, with a column-key referential check on group aggregates).
- **E1-S6 ✅ JSON Schema + validator API** — a generated `TEMPLATE_JSON_SCHEMA`
  (the machine-readable mirror of the E1-S1…S5 types, also emitted to
  `schema/rendara-template.schema.json`), an ajv-backed
  `validate(template): Result<RendaraTemplate, RendaraValidationError[]>` with
  human-readable, path-pointed errors, and `parse(stringOrObject)`. Validation
  is layered: ajv handles structure (shape/required/enums/ranges, the element
  discriminated union via the `discriminator` keyword), and the focused
  semantic validators (`validatePageSettings`, `validateElement`) fold in the
  cross-field/referential rules JSON Schema can't express.
- **E1-S7 ✅ Versioning & migrations** — a `migrate(template)` runner that chains
  registered version→version migrations up to `CURRENT_SCHEMA_VERSION` (with an
  identity migration for the current version), handling missing/unknown versions
  gracefully.
- **E1-S8 ✅ Canonical golden fixtures** — three reference templates, each paired
  with sample data (`GOLDEN_FIXTURES`): `invoice` (text + table + total),
  `certificate` (absolute layout + image + shapes), and `tabular-report` (large
  grouped table with subtotals + grand total). Reused as the basis for tests
  across the monorepo. See _Golden fixtures_ below.

```ts
import { parse, validate, type RendaraTemplate } from '@rendara/report-schema';

const result = validate(templateJson); // or parse(jsonStringOrObject)
if (result.ok) {
  const template: RendaraTemplate = result.value;
} else {
  for (const { path, message } of result.errors) {
    console.error(`${path}: ${message}`);
  }
}
```

## Packaging (E9-S3)

The package is built **framework-agnostic — no Angular** (`tools/bundle-schema.mjs`,
not ng-packagr; see [ADR 0015](../../docs/adr/0015-schema-framework-agnostic-packaging.md)).
It ships **dual ESM + CommonJS**, so it works in either Node module system:

```js
import { validate } from '@rendara/report-schema'; // ESM
const { validate } = require('@rendara/report-schema'); // CommonJS
```

The raw JSON Schema is shipped as a file and exposed as a subpath, for backends
that consume it directly (e.g. with ajv):

```js
import schema from '@rendara/report-schema/schema.json' with { type: 'json' };
```

Build, then verify the package is Angular-free and consumable in Node (the QA
gate imports + validates a golden via both `import` and `require`):

```sh
npx nx build report-schema       # -> dist/libs/report-schema (ESM + CJS + types + schema.json)
npx nx run report-schema:pack    # verify-schema-pack + verify-schema-node
```

## Schema artifact

`schema/rendara-template.schema.json` is **generated** from `TEMPLATE_JSON_SCHEMA`.
Re-run after any schema change (a test fails if it drifts):

```sh
pnpm schema:generate            # or: npx nx run report-schema:generate-schema
```

## Golden fixtures

`src/lib/fixtures.ts` is the single source of truth for the canonical golden
templates + sample data (`GOLDEN_FIXTURES`, plus the individual
`golden*Template` / `golden*Data` exports). They are committed as JSON under
`fixtures/<name>/{template.json,data.json}` for use as raw test inputs. Re-run
after any fixture change (a test fails if the committed JSON drifts):

```sh
pnpm fixtures:generate          # or: npx nx run report-schema:generate-fixtures
```

## Test

```sh
npx nx test report-schema
```
