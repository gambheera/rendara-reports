---
'@rendara/report-schema': minor
---

Add schema versioning & migrations (E1-S7). Ships a forward-only
`migrate(input): Result<RendaraTemplate, RendaraMigrationError[]>` runner that
reads a template's semver `schemaVersion` and chains one-step migrations to the
current version (`CURRENT_SCHEMA_VERSION`), with an identity pass for an
already-current template. Migrations clone their input (round-trip stable, no
mutation); missing, unknown, or non-object inputs return a typed
`RendaraMigrationError`, never thrown. Includes the `0.9.0 -> 1.0.0` migration
(injects the page header/footer bands introduced in 1.0). Purely additive — the
JSON Schema already accepts any semver `schemaVersion`, so no contract change.
