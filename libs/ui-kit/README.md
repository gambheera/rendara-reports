# ui-kit

Designer-only shared UI: the **design-token contract** plus the components built
on it. Not published — the embeddable `report-viewer` must stay UI-kit-light
(Angular CDK + scoped CSS only), so it never depends on `ui-kit`.

## Design tokens (E0-S8)

[`src/styles/tokens.css`](src/styles/tokens.css) is the single source of truth
for colors, spacing (8px grid), typography, radii, elevation and motion, all as
`--rdr-*` CSS custom properties. It is authored from the design system in
`docs/ui-mockups/.../design.md` (with brief §12.3 applied). See
[`docs/design-system/tokens.md`](../../docs/design-system/tokens.md) and
[ADR 0004](../../docs/adr/0004-design-tokens-theming.md).

- **Light** is the authoritative `:root` theme; **dark** is a provisional
  scaffold under the `.rdr-theme-dark` class (design.md specifies light only).
- Load it once as a global stylesheet (the designer adds it to its build
  `styles`), then reference tokens from scoped component CSS:
  `background: var(--rdr-color-accent)`.

## Components

- **`Button`** — `button[rdr-button]`, an attribute selector on a native button
  (keeps built-in a11y/form semantics). Variants: `primary` · `secondary` ·
  `ghost`.

  ```html
  <button rdr-button variant="primary">Create new report</button>
  ```

## Storybook

`nx storybook ui-kit` (port 4400). The **Theme** toolbar toggles light/dark so
token-driven components can be reviewed in both. `nx build-storybook ui-kit`
builds the static site (gated in CI).
