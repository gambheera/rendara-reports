# viewer-demo

The example **host app** for `@rendara/report-viewer`. It proves the integration
story (brief §4): a plain Angular app that depends **only** on the viewer
package, hands it a Template JSON + Data JSON, and wires the public
inputs/outputs.

## What it demonstrates (E9-S4)

- Consumes the **built** `@rendara/report-viewer` package — the self-contained
  APF artifact — **not** the workspace source, so it exercises exactly what a
  host installs.
- Renders a multi-page sample invoice through `<rdr-report-viewer>`.
- Wires every public output (brief §8) and surfaces the latest value of each:
  - `(rendered)` → `{ pageCount }`
  - `(pageChange)` → `{ current, total }`
  - `(error)` → a surfaced (never thrown) validation/binding/render failure.
    A **Load invalid template** action swaps in a schema-invalid template to show
    the `(error)` path and the viewer's error UI; **Load sample** recovers.
- The toolbar **Print** and **Export PDF** actions are exercised by the e2e.

## How it consumes the built package

The viewer publishes an Angular _partial_-compiled FESM; a consumer's build
resolves it to full AOT via the Angular **Linker**, which only processes packages
under `node_modules`. So the demo installs the built package like a real host
would (see [ADR 0016](../../docs/adr/0016-viewer-demo-consumes-built-package.md)):

1. `report-viewer:local-install` builds + bundles the viewer and **copies** it to
   `node_modules/@rendara/report-viewer` (`tools/install-viewer-local.mjs`).
2. The app build's `tsconfig.app.json` empties `paths`, so
   `@rendara/report-viewer` resolves to that installed package (not the base
   config's source mapping). Unit tests keep resolving source.
3. `build` and `serve` `dependsOn` `report-viewer:local-install`.

## Run it

```sh
# Serve (production build; installs the built viewer first)
npx nx run viewer-demo:serve-static

# Unit/component tests
npx nx test viewer-demo

# End-to-end (render, navigation, outputs, print, export)
npx nx e2e viewer-demo-e2e
```

> The **development** dev server (`nx serve viewer-demo`) does not run the Angular
> Linker over the installed package, so the app renders blank there. Use
> `serve-static` (production build), which is also what the e2e drives.
