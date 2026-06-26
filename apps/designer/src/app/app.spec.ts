import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';
import { App } from './app';
import { DesignerStore } from './state/designer-store';

describe('Designer App', () => {
  it('mounts the four-zone designer shell', async () => {
    await render(App);

    // The shell stands up all four landmarks (banner / main / complementary x2 /
    // contentinfo); asserting the canonical zones proves the root wires it in.
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getByRole('main', { name: 'Report canvas' })).toBeTruthy();
    expect(screen.getByRole('contentinfo')).toBeTruthy();
    expect(screen.getByText('Rendara')).toBeTruthy();
  });

  it('swaps the editing shell for the live preview when preview mode is on (E6-S9)', async () => {
    const view = await render(App);
    TestBed.inject(DesignerStore).enterPreview();
    view.detectChanges();

    // Preview replaces the whole editing chrome — no canvas main, no side panels.
    expect(view.container.querySelector('rdr-preview-mode')).not.toBeNull();
    expect(view.container.querySelector('rdr-designer-shell')).toBeNull();
    expect(screen.queryByRole('main', { name: 'Report canvas' })).toBeNull();
  });
});
