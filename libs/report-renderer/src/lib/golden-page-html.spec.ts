import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  renderCertificatePageHtml,
  renderElementTypesPageHtml,
  renderGroupedTablePageHtml,
  renderMultiPageDocumentHtml,
  renderPlainTablePageHtml,
  renderStyleIsolationContent,
} from './golden-page-html';

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

describe('renderPlainTablePageHtml (E4-S3)', () => {
  it('matches the committed visual fixture (regenerate with render-fixtures:generate)', () => {
    const committed = readFileSync(fixturePath('plain-table-page.html'), 'utf8');
    expect(committed.trimEnd()).toBe(renderPlainTablePageHtml());
  });

  it('paints a header, detail rows and a grand-total footer', () => {
    const html = renderPlainTablePageHtml();
    expect(html).toContain('class="rdr-table"');
    expect(html).toContain('data-row-kind="header"');
    expect(html).toContain('data-row-kind="detail"');
    expect(html).toContain('data-row-kind="columnFooter"');
    expect(html).toContain('Aurora Desk Lamp'); // a detail cell
    expect(html).toContain('$1,590.00'); // the grand total
  });
});

describe('renderGroupedTablePageHtml (E4-S3)', () => {
  it('matches the committed visual fixture (regenerate with render-fixtures:generate)', () => {
    const committed = readFileSync(fixturePath('grouped-table-page.html'), 'utf8');
    expect(committed.trimEnd()).toBe(renderGroupedTablePageHtml());
  });

  it('paints group header labels, subtotal footers and a grand total', () => {
    const html = renderGroupedTablePageHtml();
    expect(html).toContain('data-row-kind="groupHeader"');
    expect(html).toContain('data-row-kind="groupFooter"');
    expect(html).toContain('class="rdr-table-label"');
    expect(html).toContain('Region: North'); // a band label
    expect(html).toContain('Region: South');
    expect(html).toContain('$23,765.00'); // grand total revenue
  });
});

describe('renderMultiPageDocumentHtml (E4-S4)', () => {
  it('matches the committed visual fixture (regenerate with render-fixtures:generate)', () => {
    const committed = readFileSync(fixturePath('multi-page-document.html'), 'utf8');
    expect(committed.trimEnd()).toBe(renderMultiPageDocumentHtml());
  });

  it('stacks several pages in one document wrapper at the reduced zoom', () => {
    const html = renderMultiPageDocumentHtml();
    expect(html).toContain('class="rdr-document"');
    // The table overflows a single page, so the document carries ≥2 page slots.
    const slots = html.match(/class="rdr-page-slot"/g) ?? [];
    expect(slots.length).toBeGreaterThanOrEqual(2);
    // Each page sheet carries the document's reduced zoom transform.
    expect(html).toContain('transform: scale(0.4)');
    // The repeated page-number footer resolves per page.
    expect(html).toContain('Page 1 of');
    expect(html).toContain('data-page-number="2"');
  });
});

describe('renderStyleIsolationContent (E4-S5)', () => {
  it('matches the committed visual fixture (regenerate with render-fixtures:generate)', () => {
    const committed = readFileSync(fixturePath('style-isolation.html'), 'utf8');
    expect(committed.trimEnd()).toBe(renderStyleIsolationContent());
  });

  it('carries the reset/theme stylesheet plus a serialized report page', () => {
    const html = renderStyleIsolationContent();
    // The shared reset/theme/chrome stylesheet is embedded for the shadow root.
    expect(html).toContain('<style>');
    expect(html).toContain('--rdr-text-color');
    expect(html).toContain('--rdr-table-header-fill');
    // A real serialized page follows, with a tokenised table fill to theme.
    expect(html).toContain('class="rdr-page"');
    expect(html).toContain('var(--rdr-table-header-fill, #F1F5F9)');
    expect(html).toContain('Aurora Desk Lamp');
  });
});
