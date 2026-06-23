import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { renderCertificatePageHtml } from './golden-page-html';

/** Walks up from `process.cwd()` to the workspace root (the dir holding `nx.json`). */
function workspaceRoot(): string {
  let dir = process.cwd();
  while (!existsSync(join(dir, 'nx.json'))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error('workspace root (nx.json) not found');
    dir = parent;
  }
  return dir;
}

/**
 * Drift guard (E4-S1) for the committed render fixture the visual harness
 * snapshots. Mirrors the golden-JSON guard (E1-S8): the in-code renderer output
 * is the source of truth, and the committed
 * `apps/visual-e2e/e2e/__fixtures__/certificate-page.html` must stay in sync —
 * regenerate it via `pnpm render-fixtures:generate` when the renderer output
 * legitimately changes (never hand-edit the artifact to pass).
 */
const committedFixturePath = join(
  workspaceRoot(),
  'apps',
  'visual-e2e',
  'e2e',
  '__fixtures__',
  'certificate-page.html',
);

describe('renderCertificatePageHtml (E4-S1)', () => {
  it('matches the committed visual fixture (regenerate with render-fixtures:generate)', () => {
    const committed = readFileSync(committedFixturePath, 'utf8');
    // The generator appends a trailing newline; compare against the raw render.
    expect(committed.trimEnd()).toBe(renderCertificatePageHtml());
  });

  it('produces a page sheet with one positioned box per certificate element', () => {
    const html = renderCertificatePageHtml();
    expect(html).toContain('class="rdr-page"');
    expect(html).toContain('transform: scale(0.55)');
    expect((html.match(/class="rdr-element"/g) ?? []).length).toBeGreaterThan(0);
  });
});
