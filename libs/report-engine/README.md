# report-engine

This library was generated with [Nx](https://nx.dev).

## Formatting layer (E2-S2)

`formatValue(value, token, options)` renders a resolved value as a locale-aware
display string via `Intl`. Format tokens:

| Token                        | Result                                              |
| ---------------------------- | --------------------------------------------------- |
| `currency:USD`               | currency (ISO 4217 code parameterized)              |
| `number:0.00` / `#,##0.0`    | number; pattern sets digits + grouping              |
| `percent` / `percent:0.0`    | percent of a ratio (`0.15 → "15%"`)                 |
| `date:short\|medium\|long\|full` | localized date style                            |
| `date:custom:yyyy-MM-dd`     | token pattern (`yyyy MMMM dd HH mm ss`, …)           |
| absent / unknown             | raw `String(value)`                                 |

`options`: `locale` (default `en-US`), `fallback` for `null`/uncoercible values
(default `''`), `timeZone` for dates (default `UTC`). Total — never throws.

## Conditional visibility & styling (E2-S3)

Both APIs run their conditions through the sandboxed evaluator (no `eval`), coerce
results with **JSONata `$boolean` semantics** (via `jsonataBoolean`, exported), and
are total (never throw).

`evaluateVisibility(visibleWhen, scope, options?)` → `{ visible, error? }`:

- `null`/`undefined`/blank `visibleWhen` ⇒ `visible: true` (no condition = always shown).
- Otherwise evaluate + coerce to a boolean.
- A **clean falsy** result (e.g. a missing data path → `undefined`) ⇒ `visible: false`
  (not an error).
- A compile/runtime **error** ⇒ **fail safe**: `visible` defaults to `true` so an
  authoring mistake never silently hides content, and the structured `error` is
  returned. Override the default with `options.defaultOnError`.

`resolveConditionalStyle(base, rules, scope)` → `{ style, errors }`:

- `rules` is `StyleRule[]` (`{ when, style }`) — an **engine-level** type; the Template
  JSON schema does not model conditional style yet, so a future schema story can feed
  this resolver.
- Starts from `base` (or `{}`) and, for each rule whose `when` is truthy **in array
  order**, deep-merges its `style` overrides on top (later matches win; nested
  sub-objects merge, preserving siblings).
- A rule whose `when` **errors** is skipped (fail safe) and its error collected in
  `errors`. The `base`/inputs are never mutated.
