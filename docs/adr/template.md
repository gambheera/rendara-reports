# ADR NNNN — <short decision title, present tense>

- **Status:** Proposed | Accepted | Superseded by [ADR XXXX](XXXX-...md) | Deprecated
- **Date:** YYYY-MM-DD
- **Story:** <ID · Title> (the story or epic that prompted the decision)

<!--
How to use this template:
- Copy it to `docs/adr/NNNN-kebab-title.md`, taking the next free 4-digit
  number (ADRs are append-only — never renumber an existing one).
- Keep ADRs short and decision-focused: one accepted decision per file.
- An ADR is immutable once Accepted. To change a decision, write a NEW ADR and
  set this one's Status to "Superseded by [ADR XXXX]".
- Add an entry to `docs/adr/README.md` and link the ADR from the story PR.
- See `CONTRIBUTING.md` (“Architecture Decision Records”) for when one is required.
-->

## Context

What is the situation, constraint, or force that requires a decision? Capture the
relevant facts — requirements from the brief/backlog, hard rules, trade-offs in
play — so a future reader understands _why_ a choice was needed without re-reading
everything. State the problem, not the solution.

## Decision

The decision we are making, stated plainly. Number the sub-decisions if there are
several. Be specific enough that someone can act on it (names, paths, values).

## Consequences

What becomes easier or harder as a result. Use `+` for benefits and `−` for
costs/risks so the trade-off is explicit and honest.

- **+** A positive consequence.
- **−** A cost, risk, or follow-up this decision creates.

## Alternatives considered

The other options and why they were rejected. This is where most of an ADR's
long-term value lives — it stops the same debate from recurring.

- **<Alternative>** — why it was rejected.
