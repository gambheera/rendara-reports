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

/**
 * Drives a CDK drag from a palette tile to a viewport point. CDK listens to
 * pointer/mouse move events (not the HTML5 drag API), so the gesture is built
 * from mouse down → stepped move (past the 5 px threshold) → up.
 */
async function dragTileTo(page: Page, label: string, target: { x: number; y: number }) {
  const box = await boxOf(page.getByRole('button', { name: label }));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.mouse.move(target.x, target.y);
  await page.mouse.up();
}

/**
 * E5-S5 — drag-and-drop create from the palette. Covers both creation paths: the
 * CDK drag (positioned drop) and the single-pointer / keyboard click-to-add
 * alternative (WCAG 2.2 SC 2.5.7).
 */
test.describe('Palette create', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('adds a control by clicking a palette tile (single-pointer path)', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Drag a control here to begin')).toBeVisible();

    await page.getByRole('button', { name: 'Add Text' }).click();

    await expect(page.getByText('Drag a control here to begin')).toBeHidden();
    await expect(page.locator('[data-element-id]')).toHaveCount(1);
  });

  test('drops a Text control onto the canvas at the drop point', async ({ page }) => {
    await page.goto('/');

    const sheet = await boxOf(page.locator('[data-page-number="1"]').first());
    const target = { x: sheet.x + 150, y: sheet.y + 150 };

    await dragTileTo(page, 'Add Text', target);

    const element = page.locator('[data-element-id]').first();
    await expect(element).toBeVisible();

    const box = await boxOf(element);
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    // The default footprint is centred on the drop point (within a small tolerance
    // for zoom rounding).
    expect(Math.abs(center.x - target.x)).toBeLessThan(24);
    expect(Math.abs(center.y - target.y)).toBeLessThan(24);
  });

  test('creates an element for every palette control type', async ({ page }) => {
    await page.goto('/');

    const sheet = await boxOf(page.locator('[data-page-number="1"]').first());

    // The data table renders no rows until E6 binds data, so confirm its creation
    // via the empty state clearing on an otherwise-empty canvas.
    await expect(page.getByText('Drag a control here to begin')).toBeVisible();
    await dragTileTo(page, 'Add Data Table', { x: sheet.x + 150, y: sheet.y + 360 });
    await expect(page.getByText('Drag a control here to begin')).toBeHidden();

    // The five fixed controls each render a selectable element box on the sheet.
    const fixedTiles = ['Add Text', 'Add Image', 'Add Line', 'Add Rectangle', 'Add Ellipse'];
    let y = sheet.y + 120;
    for (const label of fixedTiles) {
      await dragTileTo(page, label, { x: sheet.x + 150, y });
      y += 28;
    }
    await expect(page.locator('[data-element-id]')).toHaveCount(fixedTiles.length);
  });

  test('has no accessibility violations after adding an element', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Add Text' }).click();
    await expect(page.locator('[data-element-id]')).toHaveCount(1);

    await expectNoAxeViolations(page);
  });
});
