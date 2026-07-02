---
'@rendara/report-viewer': minor
---

Internationalization & RTL (E10-S2). The viewer now renders reports **right-to-left**
when the effective locale is RTL: direction is derived from `config.locale`
(falling back to the template's `metadata.locale`) via the new engine
`textDirection(locale)` helper — no schema change (ADR 0021). RTL is applied in the
shared renderer's pure view-model and is fully additive: the page sheet gets
`dir="rtl"`, un-aligned text right-aligns, and data-table columns mirror across the
table width, while LTR output — and every existing visual-regression baseline —
stays byte-identical. Locale-aware `Intl` formatting (currency/number/percent/date)
already flowed end-to-end; this adds Arabic/German fixture coverage and a committed
RTL golden render. No breaking change: reports keep rendering LTR unless the locale
is RTL.
