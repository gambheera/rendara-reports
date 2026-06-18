# Design tokens

The Rendara design tokens are the single source of truth for designer-app
theming, authored from `docs/ui-mockups/.../design.md` (with brief §12.3
applied). They live in
[`libs/ui-kit/src/styles/tokens.css`](../../libs/ui-kit/src/styles/tokens.css)
as plain `--rdr-*` CSS custom properties — framework-neutral, so they back
scoped component CSS today and can back a Tailwind `theme` in Epic 5 without
changing the contract. Rationale: [ADR 0004](../adr/0004-design-tokens-theming.md).

## Using tokens

1. Load `tokens.css` **once** as a global stylesheet. The designer does this via
   its build `styles` array (`apps/designer/project.json`); Storybook imports it
   in `.storybook/preview.ts`.
2. Reference tokens from any scoped component CSS:

   ```css
   .panel {
     padding: var(--rdr-space-panel);
     background: var(--rdr-color-surface);
     border: 1px solid var(--rdr-color-border-hairline);
     border-radius: var(--rdr-radius-panel);
     box-shadow: var(--rdr-elevation-1);
   }
   ```

Never hard-code a hex/px value that a token already covers.

## Theming (light / dark)

Light is the authoritative theme on `:root`. Dark is a **provisional** scaffold
(design.md specifies light only — see ADR 0004) applied by adding the
`rdr-theme-dark` class to any container:

```html
<div class="rdr-theme-dark">…tokens here resolve to dark…</div>
```

Only the surface/text/border ramp inverts; the indigo accent and semantic colors
hold (accent is lightened for contrast). In Storybook, use the **Theme** toolbar
to toggle.

## Token groups

| Group | Examples | Notes |
| --- | --- | --- |
| Color — surfaces | `--rdr-color-surface`, `--rdr-color-recessed`, `--rdr-color-backdrop`, `--rdr-color-paper`, `--rdr-color-border-hairline`, `--rdr-color-border-input` | Theme-dependent |
| Color — text | `--rdr-color-text-primary`, `--rdr-color-text-secondary`, `--rdr-color-text-placeholder`, `--rdr-color-text-on-accent` | Theme-dependent |
| Color — accent | `--rdr-color-accent` (`#4F46E5`), `--rdr-color-accent-hover`, `--rdr-color-accent-subtle` | Accent lightened in dark |
| Color — semantic | `--rdr-color-success`, `--rdr-color-warning`, `--rdr-color-danger` | Theme-agnostic |
| Typography | `--rdr-font-ui`, `--rdr-font-mono`, `--rdr-font-size-{title,section,body,label,caption}`, `--rdr-line-height-*`, `--rdr-font-weight-{regular,medium,semibold}`, `--rdr-font-numeric` | Inter / JetBrains Mono with system fallbacks; web-font embedding is a later concern |
| Spacing | `--rdr-space-{0,1,2,3,4,5,6,8}`, `--rdr-space-panel` | 8px base grid |
| Sizing | `--rdr-size-control` (32px), `--rdr-size-row` (28px), `--rdr-size-icon-button`, `--rdr-size-icon-inline`, `--rdr-size-icon-toolbar` | Control/row heights |
| Radii | `--rdr-radius-control` (6px), `--rdr-radius-panel` (8px), `--rdr-radius-full` | |
| Elevation | `--rdr-elevation-0/1/2`, `--rdr-elevation-paper` | Derived "soft" shadows |
| Focus / motion | `--rdr-focus-ring`, `--rdr-motion-duration`, `--rdr-motion-easing` | Indigo 3px ring; 140ms ease-out |

See the **ui-kit/Foundations** Storybook stories for a live swatch + type-scale
reference.
