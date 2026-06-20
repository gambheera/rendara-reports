---
'@rendara/report-schema': minor
---

Add canonical golden fixtures (E1-S8). Ships three reference templates — each
paired with a sample Data JSON — exported as `GOLDEN_FIXTURES` plus individual
`golden{Invoice,Certificate,TabularReport}Template` / `*Data` consts: an
**invoice** (text + data table + `$sum` column total), a **certificate**
(absolute layout + image + shapes, no table), and a **tabular report** (large
grouped table with subtotal aggregates + grand total). Each golden validates
against the schema and is committed as JSON under
`fixtures/<name>/{template.json,data.json}` (generated from the in-code source by
`pnpm fixtures:generate`; a test guards against drift). Purely additive — these
become the shared basis for later pagination/render/visual tests.
