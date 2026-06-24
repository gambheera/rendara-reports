import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/angular';
import { PalettePanel } from './palette-panel';

describe('PalettePanel', () => {
  it('shows the canonical Insert / Layers / Data tablist', async () => {
    await render(PalettePanel);

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent?.trim())).toEqual(['Insert', 'Layers', 'Data']);
  });

  it('opens on the Insert tab with the v1 palette only', async () => {
    await render(PalettePanel);

    expect(screen.getByRole('tab', { name: 'Insert' }).getAttribute('aria-selected')).toBe('true');
    for (const label of ['Text', 'Image', 'Line', 'Rectangle', 'Ellipse', 'Data Table']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    // Future-epic controls must not appear (brief §12.3.4).
    expect(screen.queryByText('Chart')).toBeNull();
    expect(screen.queryByText('QR Code')).toBeNull();
  });

  it('switches to the Layers empty state when its tab is selected', async () => {
    await render(PalettePanel);

    await fireEvent.click(screen.getByRole('tab', { name: 'Layers' }));

    expect(screen.getByRole('tab', { name: 'Layers' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('No elements yet')).toBeTruthy();
    expect(screen.queryByText('Rectangle')).toBeNull();
  });

  it('switches to the Data empty state when its tab is selected', async () => {
    await render(PalettePanel);

    await fireEvent.click(screen.getByRole('tab', { name: 'Data' }));

    expect(screen.getByText('No data imported')).toBeTruthy();
  });
});
