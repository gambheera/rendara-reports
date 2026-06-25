import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoAxeViolations } from '../../../tools/testing/axe';

/** The bounding box of a locator, failing loudly if it is not laid out. */
async function boxOf(locator: Locator): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
}> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error('element has no bounding box');
  return box;
}

/** Drags from `from` to `to` via stepped pointer move (down → move → up). */
async function dragBetween(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.move(to.x, to.y);
  await page.mouse.up();
}

/** Adds a Text then a Rectangle (distinct type labels in the Layers list). */
async function addTextAndRect(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Add Text' }).click();
  await page.getByRole('button', { name: 'Add Rectangle' }).click();
}

/**
 * E5-S7 — multi-select, z-order and grouping. Multi-select is driven from both the
 * Layers panel (deterministic, accessible) and a canvas marquee; z-order is verified
 * through the Layers list, which lists elements top-first in paint order.
 */
test.describe('Multi-select, z-order, grouping', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('shift-selects two elements in the Layers panel and groups them', async ({ page }) => {
    await addTextAndRect(page);
    await page.getByRole('tab', { name: 'Layers' }).click();

    const rows = page.locator('.rdr-layers__row');
    await expect(rows).toHaveCount(2);

    await rows.nth(0).click();
    await rows.nth(1).click({ modifiers: ['Shift'] });

    // Two selection boxes + an "N selected" badge confirm the multi-selection.
    await expect(page.locator('.rdr-selection__box--multi')).toHaveCount(2);
    await expect(page.locator('.rdr-selection__badge')).toContainText('2 selected');

    await page.getByRole('button', { name: 'Group selection' }).click();
    await expect(page.locator('.rdr-layers__row-group')).toHaveCount(2);
  });

  test('a grouped selection moves as a unit', async ({ page }) => {
    await addTextAndRect(page);
    await page.getByRole('tab', { name: 'Layers' }).click();

    const rows = page.locator('.rdr-layers__row');
    await rows.nth(0).click();
    await rows.nth(1).click({ modifiers: ['Shift'] });
    await page.getByRole('button', { name: 'Group selection' }).click();

    // Selecting one group member selects the whole group.
    await rows.nth(0).click();
    const boxes = page.locator('.rdr-selection__box--multi');
    await expect(boxes).toHaveCount(2);

    const before0 = await boxOf(boxes.nth(0));
    const before1 = await boxOf(boxes.nth(1));
    const start = { x: before0.x + before0.width / 2, y: before0.y + before0.height / 2 };
    await dragBetween(page, start, { x: start.x + 70, y: start.y + 50 });

    const after0 = await boxOf(boxes.nth(0));
    const after1 = await boxOf(boxes.nth(1));
    // Both boxes shift by (roughly) the same delta — the group moved together.
    expect(after0.x - before0.x).toBeGreaterThan(40);
    expect(after1.x - before1.x).toBeGreaterThan(40);
    expect(after0.y - before0.y).toBeGreaterThan(30);
    expect(after1.y - before1.y).toBeGreaterThan(30);
  });

  test('bring to front changes the paint order', async ({ page }) => {
    await addTextAndRect(page);
    await page.getByRole('tab', { name: 'Layers' }).click();

    const rows = page.locator('.rdr-layers__row');
    // Rectangle was added last (higher z) → it leads the top-first list; Text is last.
    await expect(rows.nth(0)).toContainText('Shape');
    await expect(rows.nth(1)).toContainText('Text');

    await rows.nth(1).click(); // select the Text (currently behind)
    await page.getByRole('button', { name: 'Bring to front' }).click();

    // The Text now paints on top, so it leads the list.
    await expect(rows.nth(0)).toContainText('Text');
  });

  test('a marquee drag selects the elements it covers', async ({ page }) => {
    await addTextAndRect(page);

    const sheet = await boxOf(page.locator('[data-page-number="1"]').first());
    // Rubber-band from an empty top-left corner across the whole sheet.
    await dragBetween(
      page,
      { x: sheet.x + 8, y: sheet.y + 8 },
      { x: sheet.x + sheet.width - 8, y: sheet.y + sheet.height - 8 },
    );

    await expect(page.locator('.rdr-selection__box--multi')).toHaveCount(2);
  });

  test('has no accessibility violations with a multi-selection', async ({ page }) => {
    await addTextAndRect(page);
    await page.getByRole('tab', { name: 'Layers' }).click();
    const rows = page.locator('.rdr-layers__row');
    await rows.nth(0).click();
    await rows.nth(1).click({ modifiers: ['Shift'] });
    await expect(page.locator('.rdr-selection__box--multi')).toHaveCount(2);

    await expectNoAxeViolations(page);
  });
});
