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
