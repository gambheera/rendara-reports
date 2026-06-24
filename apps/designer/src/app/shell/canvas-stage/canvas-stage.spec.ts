import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';
import { resolvePage } from '@rendara/report-schema';
import { CanvasStage, buildRulerTicks, fitWidthZoom } from './canvas-stage';
import { DesignerStore } from '../../state/designer-store';

describe('buildRulerTicks', () => {
  it('emits a graduation every 10 mm with the 0 mark unlabelled', () => {
    // 50 mm over 200 px → 6 ticks (0,10,20,30,40,50); the 0 mark has no label.
    const ticks = buildRulerTicks(50, 200);

    expect(ticks).toHaveLength(6);
    expect(ticks[0]).toEqual({ posPx: 0, label: null });
    expect(ticks[1]).toEqual({ posPx: 40, label: '10' });
    expect(ticks.at(-1)).toEqual({ posPx: 200, label: '50' });
  });

  it('thins labels to every fifth tick when graduations are tight', () => {
    // 100 mm over 100 px → 10 px between majors (< 28), so only 50/100 labelled.
    const labelled = buildRulerTicks(100, 100).filter((t) => t.label !== null);

    expect(labelled.map((t) => t.label)).toEqual(['50', '100']);
  });

  it('returns nothing for a non-positive dimension', () => {
    expect(buildRulerTicks(0, 200)).toEqual([]);
    expect(buildRulerTicks(50, 0)).toEqual([]);
  });
});

describe('fitWidthZoom', () => {
  it('fits the page width into the usable viewport', () => {
    expect(fitWidthZoom(848, 800, 48)).toBe(1);
    expect(fitWidthZoom(448, 800, 48)).toBe(0.5);
  });

  it('falls back to 1 when nothing is measurable', () => {
    expect(fitWidthZoom(0, 800, 48)).toBe(1);
    expect(fitWidthZoom(848, 0, 48)).toBe(1);
  });
});

describe('CanvasStage', () => {
  it('hosts the shared renderer in design mode', async () => {
    const { container } = await render(CanvasStage);

    expect(container.querySelector('rdr-report-document')).toBeTruthy();
    // The renderer stamps a `data-rdr-mode="design"` marker on the page (E4-S6).
    expect(container.querySelector('[data-rdr-mode="design"]')).toBeTruthy();
  });

  it('shows the empty-state placeholder until an element exists', async () => {
    const view = await render(CanvasStage);
    expect(screen.getByText('Drag a control here to begin')).toBeTruthy();

    const store = TestBed.inject(DesignerStore);
    store.addElement({
      id: 'el_1',
      type: 'text',
      frame: { xMm: 10, yMm: 10, wMm: 40, hMm: 8 },
      text: 'Hello',
      style: {},
      z: 1,
    });
    view.detectChanges();

    expect(screen.queryByText('Drag a control here to begin')).toBeNull();
  });

  it('builds A4-portrait rulers and updates them on a page change', async () => {
    const view = await render(CanvasStage);
    const component = view.fixture.componentInstance;

    // A4 portrait: 210 mm wide → 22 ticks (0..210 mm), 297 mm tall → 30 ticks.
    expect(component['horizontalTicks']()).toHaveLength(22);
    expect(component['verticalTicks']()).toHaveLength(30);

    const store = TestBed.inject(DesignerStore);
    store.setPage(resolvePage({ size: 'A4', orientation: 'landscape' }));
    view.detectChanges();

    // Landscape swaps the axes: 297 mm wide → 30 ticks, 210 mm tall → 22 ticks.
    expect(component['horizontalTicks']()).toHaveLength(30);
    expect(component['verticalTicks']()).toHaveLength(22);
  });

  it('scales the page box with the store zoom', async () => {
    const view = await render(CanvasStage);
    const component = view.fixture.componentInstance;
    const store = TestBed.inject(DesignerStore);

    const natural = component['pageBox']().widthPx;
    store.setZoom(0.5);
    view.detectChanges();

    expect(component['pageBox']().widthPx).toBeCloseTo(natural * 0.5);
  });
});
