import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { renderCertificatePageHtml, renderElementTypesPageHtml } from './golden-page-html';

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
 * Drift guard (E4-S1, content in E4-S2) for the committed render fixtures the
 * visual harness snapshots. Mirrors the golden-JSON guard (E1-S8): the in-code
 * renderer output is the source of truth, and the committed
 * `apps/visual-e2e/e2e/__fixtures__/*.html` must stay in sync — regenerate via
 * `pnpm render-fixtures:generate` when the renderer output legitimately changes
 * (never hand-edit the artifact to pass).
 */
function fixturePath(name: string): string {
  return join(workspaceRoot(), 'apps', 'visual-e2e', 'e2e', '__fixtures__', name);
}

describe('renderCertificatePageHtml (E4-S2)', () => {
  it('matches the committed visual fixture (regenerate with render-fixtures:generate)', () => {
    const committed = readFileSync(fixturePath('certificate-page.html'), 'utf8');
    // The generator appends a trailing newline; compare against the raw render.
    expect(committed.trimEnd()).toBe(renderCertificatePageHtml());
  });

  it('paints resolved binding text and inline-SVG shapes', () => {
    const html = renderCertificatePageHtml();
    expect(html).toContain('class="rdr-page"');
    expect(html).toContain('transform: scale(0.55)');
    // Resolved binding value from the golden data (recipient name).
    expect(html).toContain('Jane A. Smith');
    // The framing rectangle renders as an inline SVG with a stroke.
    expect(html).toContain('<svg class="rdr-shape"');
    expect(html).toContain('<rect');
  });
});

describe('renderElementTypesPageHtml (E4-S2)', () => {
  it('matches the committed visual fixture (regenerate with render-fixtures:generate)', () => {
    const committed = readFileSync(fixturePath('element-types-page.html'), 'utf8');
    expect(committed.trimEnd()).toBe(renderElementTypesPageHtml());
  });

  it('paints one of each fixed element type', () => {
    const html = renderElementTypesPageHtml();
    expect(html).toContain('Element renderers'); // text
    expect(html).toContain('<line'); // line shape
    expect(html).toContain('<rect'); // rect shape
    expect(html).toContain('<ellipse'); // ellipse shape
    expect(html).toContain('<img class="rdr-image"'); // image
    expect(html).toContain('src="data:image/png;base64,'); // safe data-URI src
  });
});
