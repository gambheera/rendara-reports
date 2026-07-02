# ADR 0021 — Internationalization: locale-derived direction, RTL rendering, runtime designer i18n

- **Status:** Accepted
- **Date:** 2026-07-02
- **Story:** E10-S2 · Internationalization & RTL

## Context

E10-S2 requires three things (brief §9): **locale-aware formatting end-to-end**,
**RTL rendering in the renderer**, and **translatable designer UI strings**.

Two constraints shape the design:

- The **Template JSON schema is a frozen, versioned contract** (brief §5 hard rule):
  any new field needs a version bump + migration + sign-off. So RTL must **not** add
  a `direction` field — the template already carries `metadata.locale`.
- The shared renderer paints an **absolutely-positioned `<div>` DOM** driven by one
  pure view-model consumed by both the Angular component and the headless serializer
  (ADR 0020). RTL must be encoded **in that view-model** so it is unit-testable and
  the component / serializer / visual-regression paths stay byte-parallel, and it
  must be **additive** so every existing LTR baseline is unchanged.

Formatting was already locale-aware and locale-pinned end-to-end (the `Intl`-based
`format` layer; the viewer pipeline and both designer preview resolvers thread
`config.locale ?? metadata.locale`), so that acceptance is mostly proven with
Arabic/German tests rather than new plumbing.

## Decision

1. **Direction is derived from the locale, not stored.** A new pure engine helper
   `textDirection(locale)` maps a BCP-47 tag → `'ltr' | 'rtl'` (script subtag first,
   then the primary language subtag). It is the direction analogue of the formatting
   locale and the single source of truth; the viewer, the designer preview and the
   designer shell all derive direction from it.

2. **RTL lives in the renderer view-model, gated and additive.** `buildPageViewModel`
   takes a `direction` (default `'ltr'`) and, for `'rtl'` only:
   - sets the sheet's inline `direction: rtl` (inline so it beats the renderer's
     `direction: ltr` reset) and emits `dir="rtl"` on `.rdr-page`;
   - right-aligns text runs that carry **no authored** horizontal alignment (an
     authored alignment is always honoured);
   - **mirrors data-table columns** across the table width (`tableWidth − xPx −
     colWidth`) so the first declared column sits on the right; each cell keeps its
     authored `text-align`.
   LTR emits none of this, so the view-model — and thus the DOM, the serialized HTML
   and every visual baseline — is byte-identical to before.

3. **The designer i18n is a runtime, signal-native service** in `ui-kit`
   (`I18nService`): a `locale` signal + a `t(key, params?)` lookup with **English as
   the source of truth and fallback**. Chrome templates call `i18n.t('key')`
   directly (a signal read, so it re-renders on a locale switch) rather than through
   a pure pipe (which memoises on its input and would not react to a locale signal).
   Direction is **not** derived in `ui-kit` (Nx boundaries forbid `ui-kit → engine`);
   the designer shell owns the `locale → dir` mapping via `textDirection`.

## Consequences

- **+** RTL reports (Arabic/Hebrew/…) render right-to-left — bidi text, right-aligned
  headings, mirrored table columns — in the viewer **and** the designer preview,
  with no schema change and no migration.
- **+** LTR output is provably unchanged: the `direction` default is `'ltr'`, every
  RTL effect is gated on it, and the drift-guarded golden HTML fixtures show only the
  new `rtl-table-page.html` added (no existing fixture moved).
- **+** Designer chrome strings are translatable and locale-switchable at runtime;
  the default English designer is byte-for-byte unchanged (English is the fallback),
  so existing component text/aria specs keep passing.
- **−** RTL **column mirroring is geometric**: cells keep their authored `text-align`,
  so a `left`-authored column hugs the left of its mirrored cell. This is
  deterministic and documented; per-locale default-alignment flipping is not done.
- **−** Setting `dir="rtl"` on the designer shell flips text/logical flow, but the
  designer chrome CSS is not authored with logical properties, so a fully **mirrored
  designer layout** is a follow-up; the report **output** (the story's core) is fully
  RTL.
- **−** i18n adoption in this story covers the **always-visible chrome** (top bar,
  status bar, preview mode) + the shell direction. The data-driven palette/panels and
  the dense property/data editors keep their literal strings until a follow-up; the
  foundation (service + catalogs + fallback) is complete, so that is incremental.

## Alternatives considered

- **Add a `direction` field to the Template schema** — rejected: it is a versioned
  contract change for something fully derivable from the existing `metadata.locale`.
- **`@angular/localize` (compile-time i18n)** — the canonical Angular path, but it is
  build-time per-locale, needs an extraction/build step, and does not switch locale
  at runtime (which the designer wants to preview RTL chrome). Rejected for a
  runtime, dependency-light signal service; `$localize` remains an option if the app
  later ships per-locale builds.
- **A `TranslatePipe`** — nicer template ergonomics, but a *pure* pipe memoises on its
  input and would not re-render on a `locale` **signal** change (zoneless), and an
  *impure* pipe is not reliably marked dirty by a signal write. Direct `i18n.t()`
  calls read the signal in the template's reactive context, so they are correctly
  reactive. Rejected the pipe to avoid shipping a subtly non-reactive helper.
- **RTL via CSS only (`dir` attribute + stylesheet rules)** — would spread the logic
  across component CSS, the harness CSS and the surface CSS and keep it out of the
  pure view-model, breaking the "one view-model, byte-parallel paths" invariant.
  Rejected in favour of encoding RTL in the view-model.
