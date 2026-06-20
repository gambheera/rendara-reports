---
'@rendara/report-schema': minor
---

Add the Template JSON Schema and validator API (E1-S6). Ships a generated
`TEMPLATE_JSON_SCHEMA` (mirroring the E1-S1…S5 types, also emitted to
`schema/rendara-template.schema.json`), an ajv-backed
`validate(template): Result<RendaraTemplate, RendaraValidationError[]>` with
human-readable, path-pointed errors, and `parse(stringOrObject)`. Structural
(ajv) checks are layered with the existing focused semantic validators for the
cross-field/referential rules JSON Schema can't express.
