/**
 * commitlint — enforces Conventional Commits (E0-S7).
 *
 * Extends the conventional preset, which is what Changesets and the CHANGELOG
 * tooling expect. The default `type-enum` (feat, fix, chore, docs, style,
 * refactor, perf, test, build, ci, revert) and free-form scopes cover the
 * commit style already used in this repo (e.g. `chore(tooling)`, `docs(test)`).
 *
 * Notes:
 * - `body-leading-blank` / `footer-leading-blank` are kept as warnings (level 1)
 *   so the `Co-Authored-By:` trailer required by our commit convention does not
 *   hard-fail a commit.
 * - `body-max-line-length` is relaxed to allow wrapped trailers/URLs.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  ignores: [
    // Agent progress checkpoints currently create an "Initial plan" empty commit.
    // Keep lint strict otherwise, but ignore this one known automation message.
    (message) => message.trim() === 'Initial plan',
  ],
  rules: {
    'body-max-line-length': [1, 'always', 100],
  },
};
