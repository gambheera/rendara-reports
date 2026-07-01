---
'@rendara/report-viewer': patch
---

Document the viewer's theming API and style-isolation guarantees (E9-S5). The
README now catalogs both `--rdr-*` token families — the `--rdr-viewer-*` chrome
tokens and the renderer's `--rdr-*` content tokens — with defaults and a
`[theme]` example, states the isolation guarantees (emulated encapsulation means
no leak-out; inline styles + a reset keep a host's ordinary cascade out of the
report), and documents the content-only Shadow-DOM opt-in via the renderer's
`<rdr-report-surface>` for hostile-CSS environments. No API or runtime behaviour
change. See ADR 0017.
