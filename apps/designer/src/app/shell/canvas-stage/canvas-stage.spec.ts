import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';
import { resolvePage } from '@rendara/report-schema';
import { mmToPx } from '@rendara/report-engine';
import { CanvasStage, buildRulerTicks, clientPointToPageMm, fitWidthZoom } from './canvas-stage';
import { DesignerStore } from '../../state/designer-store';

/** Overrides an element's layout box (jsdom reports zeros) so drop mapping is testable. */
function stubRect(el: HTMLElement, left: number, top: number): void {
  el.getBoundingClientRect = () =>
    ({
      left,
      top,
      right: left,
      bottom: top,
      width: 0,
      height: 0,
      x: left,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
}

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

describe('clientPointToPageMm', () => {
  it('maps the sheet origin to (0, 0) mm', () => {
    expect(clientPointToPageMm(10, 20, { left: 10, top: 20 }, 1)).toEqual({ xMm: 0, yMm: 0 });
  });

  it('converts the offset from the sheet to mm at 96 dpi', () => {
    // 96 px from the origin is exactly one inch = 25.4 mm.
    const { xMm, yMm } = clientPointToPageMm(106, 20, { left: 10, top: 20 }, 1);
    expect(xMm).toBeCloseTo(25.4, 6);
    expect(yMm).toBeCloseTo(0, 6);
  });

  it('divides out the zoom before converting (a 2× sheet halves the mm)', () => {
    const { xMm } = clientPointToPageMm(106, 20, { left: 10, top: 20 }, 2);
    expect(xMm).toBeCloseTo(12.7, 6);
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

  it('creates an element at the drop point when a palette tile is dropped', async () => {
    const view = await render(CanvasStage);
    const store = TestBed.inject(DesignerStore);

    // Pin the rendered sheet to a known origin (jsdom has no layout).
    const sheet = view.container.querySelector<HTMLElement>('.rdr-page');
    if (sheet === null) throw new Error('expected a rendered page sheet');
    stubRect(sheet, 0, 0);

    // Drop a Text tile over the page centre (105 mm, 148.5 mm at 96 dpi).
    const drop = {
      previousContainer: {},
      container: {},
      item: { data: 'text' as const },
      event: { clientX: mmToPx(105), clientY: mmToPx(148.5) } as unknown as MouseEvent,
      dropPoint: { x: 0, y: 0 },
    };
    view.fixture.componentInstance['onDrop'](drop as never);
    view.detectChanges();

    expect(store.bodyElements()).toHaveLength(1);
    const [element] = store.bodyElements();
    expect(element.type).toBe('text');
    // 40×10 text centred on the page centre, page-absolute mm.
    expect(element.frame).toEqual({ xMm: 85, yMm: 143.5, wMm: 40, hMm: 10 });
    expect(store.selectedIds()).toEqual([element.id]);
  });

  it('ignores a drop that did not originate from the palette', async () => {
    const view = await render(CanvasStage);
    const store = TestBed.inject(DesignerStore);

    const sameList = {};
    const drop = {
      previousContainer: sameList,
      container: sameList,
      item: { data: 'text' as const },
      event: { clientX: 10, clientY: 10 } as unknown as MouseEvent,
      dropPoint: { x: 10, y: 10 },
    };
    view.fixture.componentInstance['onDrop'](drop as never);

    expect(store.bodyElements()).toHaveLength(0);
  });

  it('maps a touch drop from its changed touch point', async () => {
    const view = await render(CanvasStage);
    const store = TestBed.inject(DesignerStore);

    const sheet = view.container.querySelector<HTMLElement>('.rdr-page');
    if (sheet === null) throw new Error('expected a rendered page sheet');
    stubRect(sheet, 0, 0);

    const drop = {
      previousContainer: {},
      container: {},
      item: { data: 'rect' as const },
      event: {
        changedTouches: [{ clientX: mmToPx(50), clientY: mmToPx(40) }],
      } as unknown as TouchEvent,
      dropPoint: { x: 0, y: 0 },
    };
    view.fixture.componentInstance['onDrop'](drop as never);

    expect(store.bodyElements()).toHaveLength(1);
    // 40×25 rect centred on (50, 40) mm → top-left (30, 27.5).
    expect(store.bodyElements()[0].frame).toEqual({ xMm: 30, yMm: 27.5, wMm: 40, hMm: 25 });
  });

  it('does nothing when there is no rendered sheet to map against', async () => {
    const view = await render(CanvasStage);
    const store = TestBed.inject(DesignerStore);

    view.container.querySelector('.rdr-page')?.remove();
    const drop = {
      previousContainer: {},
      container: {},
      item: { data: 'text' as const },
      event: { clientX: 10, clientY: 10 } as unknown as MouseEvent,
      dropPoint: { x: 10, y: 10 },
    };
    view.fixture.componentInstance['onDrop'](drop as never);

    expect(store.bodyElements()).toHaveLength(0);
  });
});
