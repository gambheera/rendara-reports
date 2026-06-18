# ADR 0004 — Design tokens as CSS custom properties; provisional dark theme

- **Status:** Accepted
- **Date:** 2026-06-18
- **Story:** E0-S8 · Design tokens & ui-kit base

> The formal ADR template + `ARCHITECTURE.md`/`CONTRIBUTING.md` land in **E0-S9**;
> this is a lightweight ADR recording decisions made in E0-S8, matching ADR
> 0001–0003.

## Context

E0-S8 asks for a "CSS-custom-property token set (color, spacing, typography,
radii, elevation)", `ui-kit` scaffolding, and **optionally** Tailwind for
`apps/designer`, with the QA that a token-driven component renders in Storybook
in **light/dark**. Two constraints shape the implementation:

- `docs/ui-mockups/.../design.md` specifies a **light theme only** — there is no
  authored dark palette — yet the QA demands light **and** dark.
- `ui-kit` is shared by the designer, but the embeddable `report-viewer` must
  stay **UI-kit-light** (CDK + scoped CSS) and must never inherit a heavy styling
  dependency (brief §3, hard rules).

## Decision

1. **Tokens are plain `--rdr-*` CSS custom properties** in
   `libs/ui-kit/src/styles/tokens.css`, authored straight from `design.md` with
   brief §12.3 applied (accent `#4F46E5`). This is the single source of truth and
   is framework-neutral: it backs scoped component CSS today and can back a
   Tailwind `theme` later without changing the contract. Naming is flat and
   prefixed (`--rdr-color-*`, `--rdr-space-*`, `--rdr-font-*`, `--rdr-size-*`,
   `--rdr-radius-*`, `--rdr-elevation-*`, plus focus-ring and motion).

2. **Light is authoritative at `:root`; dark is a provisional scaffold** under a
   `.rdr-theme-dark` class. Only the surface/text/border ramp inverts (toward a
   slate ramp); the indigo accent + semantic colors are kept and the accent is
   lightened (`#818cf8`) for AA contrast on dark. This satisfies the light/dark
   QA now and is explicitly **derived** — it will be revisited if/when a dark
   palette is authored into `design.md`. Class-based theming (vs. a media query)
   keeps it explicit and per-subtree, which also fits the future viewer theming
   API (CSS-var overrides, optional Shadow DOM).

3. **Elevation is derived.** `design.md` asks for "soft shadow" without values, so
   a small scale (`--rdr-elevation-1/2/paper`) was authored to match the quiet
   aesthetic.

4. **Defer Tailwind (the story marks it optional).** The designer is still an
   E0-S2 skeleton — the real four-zone chrome is **Epic 5**. Adding a Tailwind
   build now buys nothing and risks coupling `ui-kit` (shared with the viewer's
   neighbours) to it. When Epic 5 builds the designer chrome we wire Tailwind
   **into `apps/designer` only**, binding its `theme` to these tokens (exactly as
   the mockup's `tailwind.config` does). `ui-kit` components stay token + scoped
   CSS regardless, so nothing the viewer could transitively touch depends on
   Tailwind.

5. **`ui-kit`'s first real component is `Button`**, an **attribute selector**
   (`button[rdr-button]`) on a native `<button>` so built-in keyboard/focus/
   `type`/form/`:disabled` semantics come for free and we only paint from tokens.
   This required extending `ui-kit`'s `@angular-eslint/component-selector` rule to
   `type: ['element', 'attribute']` (same `rdr` prefix + kebab style) — the same
   convention Angular Material uses for `button mat-button`. Scoped to `ui-kit`'s
   ESLint config; it does not loosen any other project.

## Alternatives considered

- **Tailwind now, tokens as its theme only.** Rejected: Tailwind is optional for
  this story, there is no designer chrome to style yet, and CSS custom properties
  are the more portable contract (usable by the viewer's CSS-var theming and by
  any future non-Tailwind consumer).
- **SCSS variables / a TS token object.** Rejected: SCSS vars don't theme at
  runtime (no light/dark toggle without recompiling); a TS object can't be
  consumed by plain CSS. CSS custom properties theme at runtime and work
  everywhere.
- **`prefers-color-scheme` media query for dark.** Rejected for now: a class lets
  Storybook toggle on demand and matches a future explicit user/host theme
  choice; we can layer a media-query default later.
- **Element-selector button (`<rdr-button>` wrapping a native button).** Rejected:
  adds a wrapper element and re-plumbs `disabled`/`type`/click instead of
  inheriting native semantics.

## Consequences

- Components consume tokens via `var(--rdr-*)`; consumers load `tokens.css` once
  as a global stylesheet (the designer adds it to its build `styles`).
- The dark theme is **not** a committed spec — treat dark values as provisional
  until `design.md` gains a dark palette; visual work should not pin dark
  baselines yet.
- Adding Tailwind in Epic 5 must keep it inside `apps/designer` and bound to
  these tokens; `ui-kit` and anything the viewer can reach stay Tailwind-free.
- The `component-selector` relaxation is `ui-kit`-local; other projects keep the
  element-only rule.
