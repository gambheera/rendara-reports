# ADR 0001 — Visual-regression baselines are Linux-canonical, generated in CI

- **Status:** Accepted
- **Date:** 2026-06-18
- **Story:** E0-S5 · Visual-regression harness

> The formal ADR template and `ARCHITECTURE.md`/`CONTRIBUTING.md` land in
> **E0-S9**; this is a lightweight ADR recording a decision made in E0-S5.

## Context

Visual regression compares Playwright screenshots against committed baselines.
Screenshots are **OS-rasterizer-dependent**: the same font renders differently
on Windows (DirectWrite) than on Linux (FreeType). Development happens on
Windows; CI will run on Linux (GitHub Actions, wired in E0-S3). A baseline
generated on one OS will not match the other, so we must pick a single canonical
environment. We also cannot run Linux locally without Docker, and the team opted
**not** to take a Docker dependency for this story.

## Decision

1. **Canonical baselines are Linux only** (`*-linux.png`), generated and checked
   in the same Linux Playwright environment (CI). `*-win32.png` / `*-darwin.png`
   are git-ignored throwaways for local iteration.
2. **No baselines are committed in E0-S5.** CI (E0-S3) seeds the first Linux
   baselines via the documented `update-snapshots` workflow, after which they are
   committed and diffed against.
3. **Determinism beyond the OS** is maximised so the OS is the *only* variable:
   fixed viewport + device scale, disabled animations, forced
   light scheme, and **self-contained fixtures** (`page.setContent()` + an
   **embedded** woff2 font + `document.fonts.ready`) — no app server, no system
   fonts.
4. **Visual regression is a separate `visual` target**, not folded into `e2e`,
   so an unseeded baseline never blocks functional e2e. Playwright is pinned
   (1.61.0) since the renderer is part of the snapshot contract.

## Consequences

- **+** One portable baseline set; identical pixels locally-via-CI and in CI.
- **+** No Docker dependency; the harness is fully usable today for the
  diff-mechanism, and CI-ready for real baselines.
- **+** Fixtures are decoupled from the (still-skeleton) app UI, so baselines
  don't churn before the renderer exists.
- **−** Baselines can only be created/updated in the Linux environment; Windows
  contributors iterate with throwaway local baselines and rely on CI for the
  canonical set.
- **−** Until E0-S3 seeds baselines, `visual` is intentionally outside the green
  gate (tracked in the E0-S5 PR and `docs/testing/visual-regression.md`).

## Alternatives considered

- **Docker (Playwright Linux image) locally** — most robust, but adds a Docker
  dependency and a cross-platform `node_modules` concern; deferred (can be
  adopted later without changing the baselines, since they are already Linux).
- **Per-OS baselines** (commit `-win32` and `-linux`) — doubles maintenance and
  still can't be generated for Linux on a Windows machine.
- **Threshold-only tolerance across OSes** — cross-rasterizer differences are far
  too large for pixel thresholds to absorb reliably.
