# Accessibility (WCAG 2.2 AA)

Rendara Reports targets **WCAG 2.2 Level AA** for both the Report Designer UI and
the rendered Report Viewer output (brief §9). This document records the E10-S1
accessibility audit: the automated gate, the designer/viewer guarantees, the
verified colour contrast, the documented **manual keyboard + screen-reader pass**,
and the known limitations.

## Automated gate — axe (zero violations)

The `.github/workflows/a11y.yml` **Accessibility** workflow runs the
`@axe-core/playwright` scans on every push to `main` and every PR and fails on **any**
WCAG 2.2 A/AA violation. The shared helper `tools/testing/axe.ts` scopes each scan to
the `wcag2a wcag2aa wcag21a wcag21aa wcag22aa` rule tags — which **includes
`color-contrast`**, so contrast is enforced automatically, not just spot-checked.

The scans are tagged `@a11y` so the gate selects only them:

```bash
# Designer surfaces (shell, palette tabs, populated Properties, dialogs, preview)
npx nx e2e designer-e2e -- --grep=@a11y

# Viewer surfaces (rendered report, toolbar, Export/Watermark dialogs, Find bar,
# error state, dark theme) — against the BUILT package in the demo host
npx nx e2e viewer-demo-e2e -- --grep=@a11y
```

Scans live in `apps/designer-e2e/e2e/designer-a11y.spec.ts` and
`apps/viewer-demo-e2e/e2e/viewer-a11y.spec.ts`. Because the viewer scan runs against
the demo host, which consumes the **built** `@rendara/report-viewer`, it exercises
the exact output a host application ships.

## Designer — keyboard operability & ARIA

- **Landmarks:** the top bar is `banner`, each side panel a labelled `complementary`,
  the canvas the single `main` ("Report canvas"), and the status bar `contentinfo`.
- **Palette tabs** are a WAI-ARIA `tablist` with roving `tabindex` and full keyboard
  navigation: `ArrowLeft`/`ArrowRight` move (and activate + focus) the adjacent tab,
  wrapping; `Home`/`End` jump to the ends (E10-S1). Each tab has `aria-selected` and
  `aria-controls`.
- **Palette tiles** are real `<button>`s (`Add …` accessible names) — the WCAG 2.5.7
  single-pointer alternative to dragging: click / `Enter` / `Space` adds the element.
- **Editing shortcuts** (E5): undo/redo, copy/cut/paste/duplicate/delete, group/ungroup
  and the four z-order moves, all keyboard-driven and suppressed while typing in a
  field. A selected element exposes a `role="group"` box that moves/resizes with the
  arrow keys.
- **Every icon-only button** carries an `aria-label` (rename, more actions, zoom,
  snap, page setup); decorative glyphs and rulers are `aria-hidden`.
- **Focus indicators:** every interactive control shows a visible ring via the shared
  `--rdr-focus-ring` token on `:focus-visible`.

## Viewer — semantically structured output

- **Data tables** render with ARIA table semantics (ADR 0020): the container is a
  `role="table"` (named "Data table"), each row a `role="row"`, header cells
  `role="columnheader"` and data cells `role="cell"`, so a screen reader announces a
  real, navigable table with column headers.
- **Pages** are labelled: each page slot is a `role="group"` with
  `aria-roledescription="page"` and `aria-label="Page N"`.
- **Toolbar** is a `role="toolbar"`; every control has an accessible name; the page
  and zoom read-outs use `aria-live="polite"`; the Find bar is a `role="search"`.
- **Feedback states** are announced: loading is a `role="status"`, empty a
  `role="status"`, and a surfaced error a `role="alert"` with a `View details`
  disclosure (`aria-expanded`/`aria-controls`).
- **Decorative duplicates are hidden:** the thumbnail rail's mini page renders and the
  print mirror are `aria-hidden`, so the report text is not read once per thumbnail —
  the thumbnail button's "Go to page N" is its accessible name.

## Focus management

All modals trap and **restore** focus without custom bookkeeping:

- The designer **Page setup** and **Export/Import** dialogs are native `<dialog>`
  elements opened with `showModal()`, so focus trapping, the top layer, `Escape`, and
  focus return to the invoking control come from the platform.
- The viewer **Export PDF** and **Watermark** dialogs use CDK `cdkTrapFocus
  cdkTrapFocusAutoCapture`, which moves focus into the dialog on open and **returns it
  to the trigger** on close. They are `role="dialog"` + `aria-modal="true"`, labelled
  by their title, and cancel on `Escape`.

## Colour contrast (verified)

axe's `color-contrast` rule gates these in CI; the measured ratios (WCAG AA needs
≥ 4.5:1 for normal text, ≥ 3:1 for large text / UI):

| Foreground | Background | Ratio | Use |
| --- | --- | --- | --- |
| Accent `#4F46E5` | White `#ffffff` | **6.29:1** | Primary actions, selection, links |
| Body text `#111827` | White `#ffffff` | **17.74:1** | Designer + rendered document text |
| Dark accent `#818cf8` | Dark surface `#111827` | **5.95:1** | Themed viewer (demo dark theme) |
| Dark text `#e5e7eb` | Dark surface `#111827` | **14.33:1** | Themed viewer text |
| Dark secondary `#94a3b8` | Dark backdrop `#0f172a` | **6.96:1** | Themed viewer secondary text |

## Manual keyboard + screen-reader pass

Performed for E10-S1 with keyboard-only operation and a screen reader (NVDA on
Windows / VoiceOver on macOS). Result: **pass** — no blocking issues.

**Designer (keyboard only):**

1. `Tab` from the top bar reaches, in order: the top-bar actions → the palette
   `tablist` (a single stop; arrows move between tabs) → the active tab panel and its
   `Add …` tiles → the canvas → the Properties panel → the status-bar controls. All
   landmarks are reachable and announced.
2. Adding an element from a palette tile with `Enter` selects it; the selection box
   takes focus and the arrow keys nudge/resize it; the editing shortcuts operate.
3. Opening **Page setup** from the status bar moves focus into the dialog; `Tab`
   cycles within it; `Escape` closes and returns focus to the trigger.

**Viewer (keyboard + screen reader):**

1. The toolbar is reached as a labelled toolbar; each button announces its name;
   page/zoom changes are announced via the live regions.
2. Reading into the document, the screen reader announces **"Page 1, group"** then the
   table as **"Data table, table"**, reads column headers, and ties each data cell to
   its column — the E10-S1 semantics.
3. The thumbnail rail announces only "Go to page N" buttons (the mini previews are
   silent), so the report content is read **once**, not once per thumbnail.
4. Loading/empty/error states are announced (status / alert), and the error
   `View details` disclosure toggles correctly.

## Known limitations (tracked, not regressions)

- **Data-bound image `alt`.** The template schema's image element has no `alt` field,
  so rendered images use `alt=""` (treated decorative). Meaningful alt text needs a
  **versioned schema change** (bump + migration + sign-off, brief hard rules) and is
  tracked as future work (ADR 0020).
- **Paginated tables** are exposed as one `role="table"` **per page slice** (header
  repeated), not a single logical table spanning pages — matching the paged-document
  model (ADR 0020).
