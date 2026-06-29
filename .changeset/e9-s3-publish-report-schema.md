---
'@rendara/report-schema': minor
---

Make `@rendara/report-schema` a standalone, framework-agnostic, publishable
package (E9-S3). The build no longer uses the Angular toolchain (ng-packagr):
`tools/bundle-schema.mjs` produces a dual **ESM + CommonJS** package (`import`
and `require` both work in plain Node), a flattened type-declarations entry, and
ships the raw JSON Schema artifact (exposed as the `./schema.json` subpath). The
emitted manifest drops ng-packagr's publish-blocking `prepublishOnly` guard and
the spurious `tslib` dependency; runtime deps stay exactly `ajv` + `ajv-formats`.
A new `pack` target gates the contract: `verify-schema-pack` (tarball/manifest
shape, no Angular) and `verify-schema-node` (imports + validates a golden in both
ESM and CJS). The exported API is unchanged — types, `TEMPLATE_JSON_SCHEMA`,
`validate`/`parse`, migrations and golden fixtures — so this is purely a
packaging change for backend/template-tooling consumers.
