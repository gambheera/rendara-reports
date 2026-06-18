import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/**
 * Shared accessibility helper for Playwright e2e specs (E0-S4).
 *
 * Wraps `@axe-core/playwright` so every story can assert "no new axe
 * violations" (brief §9 DoD, targeting WCAG 2.2 AA) with one call. The tag set
 * scopes the scan to the WCAG A/AA success criteria the product commits to.
 */
const WCAG_2_2_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

export async function expectNoAxeViolations(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_2_2_AA_TAGS).analyze();

  const summary = violations
    .map((v) => `- [${v.id}] ${v.help} (${v.nodes.length} node(s)) — ${v.helpUrl}`)
    .join('\n');

  expect(violations, summary || 'expected no accessibility violations').toEqual([]);
}
