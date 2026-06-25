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

/** Drags from `from` to `to` via CDK-style stepped pointer move (down → move → up). */
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

/**
 * E5-S6 — select / move / resize. The selection overlay (indigo box + 8 handles
 * + coordinate badge) mirrors the store frame, so these assertions read it back
 * through the on-screen box geometry, which is driven by that frame.
 */
test.describe('Select / move / resize', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('selects an added element and shows the overlay with eight handles', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Add Text' }).click();

    // A palette add selects the new element, so the overlay is shown immediately.
    await expect(page.locator('.rdr-selection__box')).toBeVisible();
    await expect(page.locator('.rdr-selection__handle')).toHaveCount(8);
    await expect(page.locator('.rdr-selection__badge')).toContainText('mm');
  });

  test('drag-moves a selected element to a new position', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Add Text' }).click();

    const box = page.locator('.rdr-selection__box');
    const before = await boxOf(box);
    const start = { x: before.x + before.width / 2, y: before.y + before.height / 2 };

    await dragBetween(page, start, { x: start.x + 80, y: start.y + 60 });

    const after = await boxOf(box);
    expect(after.x - before.x).toBeGreaterThan(40);
    expect(after.y - before.y).toBeGreaterThan(30);
  });

  test('resizes a selected element from the south-east handle', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Add Rectangle' }).click();

    const box = page.locator('.rdr-selection__box');
    const before = await boxOf(box);
    const handle = await boxOf(page.locator('.rdr-selection__handle--se'));
    const grip = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };

    await dragBetween(page, grip, { x: grip.x + 60, y: grip.y + 40 });

    const after = await boxOf(box);
    expect(after.width).toBeGreaterThan(before.width + 30);
    expect(after.height).toBeGreaterThan(before.height + 20);
  });

  test('nudges a selected element with the arrow keys', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Add Text' }).click();

    const box = page.locator('.rdr-selection__box');
    const before = await boxOf(box);

    // Focus lands on the box after selection; ten presses moves a visible amount.
    for (let i = 0; i < 10; i += 1) {
      await page.keyboard.press('ArrowRight');
    }

    const after = await boxOf(box);
    expect(after.x).toBeGreaterThan(before.x);
    expect(after.y).toBeCloseTo(before.y, 0);
  });

  test('clears the selection when empty canvas is clicked', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Add Text' }).click();
    await expect(page.locator('.rdr-selection__box')).toBeVisible();

    // Click a blank spot on the sheet, away from the element.
    const sheet = await boxOf(page.locator('[data-page-number="1"]').first());
    await page.mouse.click(sheet.x + sheet.width - 20, sheet.y + sheet.height - 20);

    await expect(page.locator('.rdr-selection__box')).toBeHidden();
  });

  test('has no accessibility violations with an element selected', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Add Text' }).click();
    await expect(page.locator('.rdr-selection__box')).toBeVisible();

    await expectNoAxeViolations(page);
  });
});
