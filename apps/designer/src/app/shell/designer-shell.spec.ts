import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/angular';
import { DesignerShell } from './designer-shell';

describe('DesignerShell', () => {
  it('lays out the four zones as landmarks', async () => {
    await render(DesignerShell);

    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getByRole('main', { name: 'Report canvas' })).toBeTruthy();
    expect(screen.getByRole('contentinfo')).toBeTruthy();
    // Two complementary panels, distinctly labelled for assistive tech.
    expect(screen.getByRole('complementary', { name: 'Insert palette' })).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Properties' })).toBeTruthy();
  });

  it('collapses and re-expands the left palette', async () => {
    await render(DesignerShell);

    expect(screen.getByRole('complementary', { name: 'Insert palette' })).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'Collapse insert panel' }));
    expect(screen.queryByRole('complementary', { name: 'Insert palette' })).toBeNull();

    await fireEvent.click(screen.getByRole('button', { name: 'Expand insert panel' }));
    expect(screen.getByRole('complementary', { name: 'Insert palette' })).toBeTruthy();
  });

  it('collapses and re-expands the right properties panel', async () => {
    await render(DesignerShell);

    await fireEvent.click(screen.getByRole('button', { name: 'Collapse properties panel' }));
    expect(screen.queryByRole('complementary', { name: 'Properties' })).toBeNull();

    await fireEvent.click(screen.getByRole('button', { name: 'Expand properties panel' }));
    expect(screen.getByRole('complementary', { name: 'Properties' })).toBeTruthy();
  });

  it('resizes the left panel from the keyboard within bounds', async () => {
    await render(DesignerShell);

    const handle = screen.getByRole('separator', { name: 'Resize insert panel' });
    const start = Number(handle.getAttribute('aria-valuenow'));

    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(Number(handle.getAttribute('aria-valuenow'))).toBe(start + 16);

    // Spam left past the minimum; the width clamps at MIN_WIDTH (200).
    for (let i = 0; i < 50; i++) fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(Number(handle.getAttribute('aria-valuenow'))).toBe(200);
  });
});
