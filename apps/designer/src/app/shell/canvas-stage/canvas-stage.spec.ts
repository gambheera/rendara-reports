import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';
import { resolvePage } from '@rendara/report-schema';
import { CanvasStage } from './canvas-stage';
import { DesignerStore } from '../../state/designer-store';

function paper(): HTMLElement {
  return screen.getByRole('img', { name: 'Report page' });
}

describe('CanvasStage', () => {
  it('sizes the paper to the A4 portrait aspect ratio by default', async () => {
    await render(CanvasStage);

    expect(paper().style.aspectRatio).toBe('210 / 297');
  });

  it('resizes the paper live when the page geometry changes', async () => {
    const view = await render(CanvasStage);
    const store = TestBed.inject(DesignerStore);

    store.setPage(resolvePage({ size: 'Letter', orientation: 'landscape' }));
    view.detectChanges();

    // Letter is 215.9 × 279.4 mm; landscape swaps the two.
    expect(paper().style.aspectRatio).toBe('279.4 / 215.9');
  });
});
