import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { render, screen, fireEvent } from '@testing-library/angular';
import { PalettePanel } from './palette-panel';
import { DesignerStore } from '../../state/designer-store';
import type { PaletteKind } from '../../state/drag-create';

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

  it('switches to the Data tab, showing its sample-data empty state', async () => {
    await render(PalettePanel);

    await fireEvent.click(screen.getByRole('tab', { name: 'Data' }));

    expect(screen.getByText('No sample data')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Import sample data' })).toBeTruthy();
  });

  // Each palette tile is a button (the WCAG 2.5.7 single-pointer alternative to
  // dragging): clicking / activating it adds the element at a default position.
  const KIND_BY_LABEL: ReadonlyArray<{ label: string; kind: PaletteKind; type: string }> = [
    { label: 'Add Text', kind: 'text', type: 'text' },
    { label: 'Add Image', kind: 'image', type: 'image' },
    { label: 'Add Line', kind: 'line', type: 'shape' },
    { label: 'Add Rectangle', kind: 'rect', type: 'shape' },
    { label: 'Add Ellipse', kind: 'ellipse', type: 'shape' },
    { label: 'Add Data Table', kind: 'dataTable', type: 'dataTable' },
  ];

  for (const { label, type } of KIND_BY_LABEL) {
    it(`adds an element when the "${label}" tile is clicked`, async () => {
      await render(PalettePanel);
      const store = TestBed.inject(DesignerStore);

      await fireEvent.click(screen.getByRole('button', { name: label }));

      expect(store.bodyElements()).toHaveLength(1);
      expect(store.bodyElements()[0].type).toBe(type);
      // The new element becomes the selection.
      expect(store.selectionCount()).toBe(1);
    });
  }

  it('does not add a second element when the click merely concludes a drag', async () => {
    const view = await render(PalettePanel);
    const store = TestBed.inject(DesignerStore);
    const component = view.fixture.componentInstance;

    // Simulate a real drag: pointer down, drag starts, then the trailing click.
    component['onPointerDown']();
    component['onDragStarted']();
    component['addOnClick']('text');
    expect(store.bodyElements()).toHaveLength(0);

    // A subsequent genuine click (fresh pointer interaction) still adds.
    component['onPointerDown']();
    component['addOnClick']('text');
    expect(store.bodyElements()).toHaveLength(1);
  });
});
