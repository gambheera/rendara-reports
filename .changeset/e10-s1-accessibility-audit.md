---
'@rendara/report-viewer': patch
---

Accessibility hardening for the viewer output (E10-S1, WCAG 2.2 AA). The rendered
report is now **semantically structured** for assistive tech: data tables carry ARIA
table semantics (`role="table"`/`row`/`columnheader`/`cell` with an accessible name)
and each page is a labelled `role="group"` ("Page N") — attribute-only, so the
rendered pixels and every visual-regression baseline are unchanged (ADR 0020). The
thumbnail rail's decorative mini-renders are hidden from assistive tech, so a screen
reader reads the report once, not once per thumbnail. No API or runtime behaviour
change. An axe CI gate (`.github/workflows/a11y.yml`) now scans the viewer at zero
violations; see `docs/testing/accessibility.md`.
