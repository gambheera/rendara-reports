<!--
Single-story PR. Fill in every section, then STOP for review.
See CONTRIBUTING.md and the Definition of Done (brief §9) below.
-->

## Story

<!-- e.g. E0-S9 · Repo governance docs -->

**Story:** `<ID · Title>` — Epic `<N>`

## Summary

<!-- What this PR does and why, in a few sentences. -->

## Acceptance criteria

<!-- Copy the story's acceptance criteria; show evidence for each. -->

| Criterion | Evidence |
| --------- | -------- |
|           |          |

## Story-specific QA

<!-- The story's own QA from the backlog, with evidence (logs, screenshots). -->

## Definition of Done (brief §9)

> Tick each item, or mark it **N/A** with a one-line reason where it genuinely
> doesn't apply (e.g. a docs-only story has no test/visual/schema/perf surface).

- [ ] **Functionality** meets the story's acceptance criteria.
- [ ] **Unit tests** for new logic; **component tests** for new components (Vitest + Angular Testing Library). Engine/schema/pagination held to **≥90%**; UI to
      **≥80%**.
- [ ] **Visual-regression snapshots** added/updated for any change affecting
      rendered output (Playwright). No unreviewed pixel diffs.
- [ ] **UI fidelity:** user-facing screens follow the approved mockup in
      `docs/ui-mockups/` after the **brief §12.3 reconciliation rules**. Intentional
      deviations noted.
- [ ] **Schema round-trip** integrity preserved where templates are involved
      (export → re-import yields an equivalent template; ajv-validated).
- [ ] **Accessibility:** no new axe violations; keyboard operability; **WCAG 2.2 AA**.
- [ ] **Lint, format, strict typecheck** clean; **Nx module-boundary** rules
      respected.
- [ ] **Performance budgets** respected (viewer bundle-size budget; render-time
      budget for large-data fixtures).
- [ ] **Docs updated:** Storybook / API docs / README / `viewer-demo` wiring as
      applicable; an **ADR** for any significant architectural decision.
- [ ] **CI green** on the PR (`nx affected` lint + test + build + e2e + visual +
      a11y).
- [ ] **PR is single-story**, scoped, with this checklist filled in, **awaiting
      review before merge.**

## Changeset

<!-- Required if this PR changes a published package (@rendara/report-schema or
@rendara/report-viewer): run `pnpm changeset`. Otherwise state "N/A — no published
package changed". -->

- [ ] Changeset added, **or** N/A (no published-package change).

## Notes for reviewers / follow-ups

<!-- Anything reviewers should know; deferred work tracked for later stories. -->
