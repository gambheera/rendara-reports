# Visual-regression harness (E0-S5)

Pixel-diff snapshots catch unintended changes to rendered output (brief §9: "no
unreviewed pixel diffs"). This is the **harness**; the renderer it ultimately
guards lands in Epic 4.

## Why a "stable rendering environment" is the whole game

A screenshot baseline is **OS-rasterizer-specific** — the *same* font renders
differently on Windows (DirectWrite) and Linux (FreeType). Embedding a font
removes font-*availability* variance but **not** rasterizer variance. So
baselines are only portable if the OS is fixed too.

**Decision:** canonical baselines are **Linux only**, generated in CI (the same
Linux Playwright environment that checks them). See
[ADR 0001](../adr/0001-visual-regression-determinism.md). Determinism knobs, in
[`apps/visual-e2e/playwright.visual.config.mts`](../../apps/visual-e2e/playwright.visual.config.mts):

- fixed `1280×720` viewport + `deviceScaleFactor: 1`
- `colorScheme: 'light'`, `toHaveScreenshot({ animations: 'disabled', caret: 'hide' })`
- small tolerances (`maxDiffPixelRatio: 0.01`, `threshold: 0.2`) to absorb sub-pixel noise
- the example spec renders a **self-contained fixture** via `page.setContent()`
  with an **embedded woff2 font** and `await document.fonts.ready` — no app, no
  web server, nothing environment-dependent except the OS rasterizer.

## A separate `visual` target (not `e2e`)

Visual regression runs under its own **`visual`** target, kept out of the
functional `e2e` gate so the two never block each other. The config is named
`playwright.visual.config.mts` (not `playwright.config.mts`) specifically so the
`@nx/playwright/plugin` does **not** infer an `e2e` target for the project.

```bash
pnpm visual          # check current output against committed baselines
pnpm visual:update   # regenerate baselines (nx run visual-e2e:visual:update)
```

## Baseline storage strategy

- Baselines live next to the spec under
  `apps/visual-e2e/e2e/__screenshots__/<spec>/<name>-<project>-<platform>.png`.
- **Only `*-linux.png` is committed** (canonical). `*-win32.png` / `*-darwin.png`
  are **git-ignored** — they are throwaway baselines for local iteration and must
  never be committed (they would not match CI).
- PNGs are marked `binary` in `.gitattributes`.

## Bootstrapping (why no baselines are committed yet)

This story ships the harness but **no committed baselines** — none exist for
Linux yet, because there is no Linux environment here (local is Windows) and
**CI is E0-S3**. The bootstrap, once CI exists:

1. CI runs `pnpm visual` on Linux; with no baseline it **fails** and uploads the
   `*-actual.png` it captured.
2. A maintainer runs `pnpm visual:update` in the same Linux environment (CI
   artifact, the CI "update" job, or a Playwright container) and commits the
   resulting `*-linux.png`.
3. Subsequent runs diff against that committed baseline.

Until then the `visual` target is **armed but unseeded** and is deliberately
**not** part of the default green gate. Locally you can still exercise the full
pipeline: `pnpm visual:update` writes a `-win32.png` (git-ignored), `pnpm visual`
then passes, and any change to the fixture produces a failing diff with
`*-actual.png` / `*-diff.png` under the git-ignored `dist/.playwright/…` output.
(Verified during E0-S5: a one-colour fixture change failed the check and emitted
a reviewable diff image.)

**E4-S8** defines the **complete render baseline set** (the screen + print matrix
above) but, on a Windows dev machine, still cannot produce the canonical
`*-linux.png`. The specs/stylesheet/fixtures are verified green locally on
`-win32`; the protected Linux baselines are seeded by the CI "update" job per the
bootstrap above, after which every golden's screen and print snapshot diffs
against a committed baseline and **changes require review** (brief §9: "no
unreviewed pixel diffs").

## The render baseline (E4-S8)

E4-S8 is the Epic-4 capstone that turns the per-story renderer specs into one
**complete, protected baseline**: every golden snapshotted **on screen *and*
under the print stylesheet**. The set:

| Spec (`apps/visual-e2e/e2e/…`)        | Golden                              | Screen | Print |
| ------------------------------------- | ----------------------------------- | :----: | :---: |
| `certificate-page.visual.spec.ts`     | Certificate (text + shapes + image) |   ✓    |   ✓   |
| `element-types.visual.spec.ts`        | One of each element type            |   ✓    |   ✓   |
| `plain-table.visual.spec.ts`          | Ungrouped data table                |   ✓    |   ✓   |
| `grouped-table.visual.spec.ts`        | Grouped data table                  |   ✓    |   ✓   |
| `multi-page-document.visual.spec.ts`  | Multi-page document at reduced zoom |   ✓    |   ✓   |
| `watermark-page.visual.spec.ts`       | Watermarked page (E4-S7)            |   ✓    |   ✓   |

(`harness.visual.spec.ts` is the E0-S5 smoke fixture, and
`style-isolation.visual.spec.ts` is a Shadow-DOM isolation e2e — neither is a
golden render, so they are not part of this screen+print matrix.)

### Print snapshots and the print stylesheet

The print snapshots run the same fixture under
`page.emulateMedia({ media: 'print' })`. The print rules are the renderer's
**genuine** `@media print` stylesheet (`RENDERER_PRINT_CSS`, see
[ADR 0010](../adr/0010-renderer-print-stylesheet.md)): the page drop-shadow and
the dashed printable-area guide vanish, the grey backdrop goes white, inter-page
gaps collapse, `@page { margin: 0 }` hands the physical page to the browser, and
`print-color-adjust: exact` keeps fills/table-bands/the watermark from being
dropped. e2e projects can't import workspace libs (Nx boundaries), so the
stylesheet is emitted to `__fixtures__/renderer-print.css` by
`pnpm render-fixtures:generate` (drift-guarded by `golden-page-html.spec.ts`) and
applied by the shared `e2e/fixture-page.ts` helper.

### Shared fixture scaffold

`e2e/fixture-page.ts` is the single home for the fixture document (embedded font
+ on-screen chrome + the print stylesheet). A golden spec supplies only its
serialized HTML and a test id via `fixtureDocument(html, testId)`, then asserts a
screen and a print `toHaveScreenshot`.

## Adding a visual test in later stories

1. Add `*.visual.spec.ts` under `apps/visual-e2e/e2e/` (render via
   `page.setContent()` or, once the renderer exists, mount it), embed/await fonts,
   and assert `toHaveScreenshot('<name>.png')`.
2. Generate the Linux baseline in CI / a Linux container and commit the
   `*-linux.png`.
3. When a change to rendered output is **intentional**, run `pnpm visual:update`
   in the canonical environment and commit the new baselines **with an
   explanation** — never blind-overwrite (brief Epic-0 guidance).
