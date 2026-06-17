---
description: "Implement a single Rendara story, plan-first and stop for review. Usage: /story E5-S4"
---
We are implementing **only** story `$ARGUMENTS` from `docs/claude_prompts/RENDARA_BACKLOG.md`.

Do this in order:
1. Read **just that one story** — its acceptance criteria, its story-specific QA, and its `🖼 UI ref` if it has one. If it's UI work, also open the referenced mockup under `docs/ui-mockups/` and apply the reconciliation rules in `RENDARA_PROJECT_BRIEF.md` §12.3.
2. Restate back to me: the story scope, the acceptance criteria, and the Definition of Done (brief §9) you'll be held to.
3. Produce a concrete implementation plan (files to add/change, tests you'll write) and then **STOP. Do not write any code until I approve the plan.**

After I approve:
- Implement only this story.
- Write the tests it requires; run lint, typecheck, unit/component tests, and build; fix what breaks.
- Open a **single-story PR** with the DoD checklist filled in.
- **Do not start any other story.** Wait for my review.
