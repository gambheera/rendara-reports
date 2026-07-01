import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';
import { resolvePage } from '@rendara/report-schema';
import { mmToPx } from '@rendara/report-engine';
import {
  CanvasStage,
  buildRulerTicks,
  clientPointToPageMm,
  fitWidthZoom,
  hitElementId,
  marqueeBoxPx,
} from './canvas-stage';
import { DesignerStore } from '../../state/designer-store';

/** A text element for the selection tests. */
const TEXT = {
  id: 'el_1',
  type: 'text' as const,
  frame: { xMm: 10, yMm: 10, wMm: 40, hMm: 8 },
  text: 'Hello',
  style: {},
  z: 1,
};

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

describe('hitElementId', () => {
  it('reads the element id from the nearest design hit target', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div data-rdr-hit="element" data-element-id="el_9"><span></span></div>';
    expect(hitElementId(root.querySelector('span'))).toBe('el_9');
  });

  it('reads the table id from a table hit target', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div data-rdr-hit="table" data-table-id="el_t"></div>';
    expect(hitElementId(root.firstElementChild)).toBe('el_t');
  });

  it('returns null off any hit target (empty canvas)', () => {
    expect(hitElementId(document.createElement('div'))).toBeNull();
    expect(hitElementId(null)).toBeNull();
  });
});

describe('marqueeBoxPx', () => {
  it('builds a normalised, container-relative rectangle from two points', () => {
    const box = marqueeBoxPx({ x: 80, y: 60 }, { x: 20, y: 10 }, { left: 5, top: 5 });
    expect(box).toEqual({ leftPx: 15, topPx: 5, widthPx: 60, heightPx: 50 });
  });
});

describe('CanvasStage', () => {
  it('hosts the shared renderer in design mode', async () => {
    const { container } = await render(CanvasStage);

    expect(container.querySelector('rdr-report-document')).toBeTruthy();
    // The renderer stamps a `data-rdr-mode="design"` marker on the page (E4-S6).
    expect(container.querySelector('[data-rdr-mode="design"]')).toBeTruthy();
  });

  it('makes the scroll viewport keyboard-focusable for keyboard scrolling', async () => {
    const { container } = await render(CanvasStage);
    expect(container.querySelector('.rdr-canvas__scroll')?.getAttribute('tabindex')).toBe('0');
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

  it('selects an element when its rendered box is pressed (E5-S6)', async () => {
    const view = await render(CanvasStage);
    const store = TestBed.inject(DesignerStore);
    store.addElement(TEXT);
    view.detectChanges();

    const boxEl = view.container.querySelector('[data-element-id="el_1"]');
    if (boxEl === null) throw new Error('expected a rendered element box');
    boxEl.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));

    expect(store.selectedIds()).toEqual(['el_1']);
  });

  it('clears the selection when empty canvas is clicked (no marquee drag) (E5-S6)', async () => {
    const view = await render(CanvasStage);
    const store = TestBed.inject(DesignerStore);
    store.addElement(TEXT);
    store.selectOne('el_1');
    view.detectChanges();

    const pages = view.container.querySelector('.rdr-canvas__pages');
    if (pages === null) throw new Error('expected the pages area');
    // A press that never moves is a click: clearing happens on release.
    pages.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    window.dispatchEvent(new MouseEvent('pointerup', {}));

    expect(store.hasSelection()).toBe(false);
  });

  it('shift-clicks an element to add it to the selection (E5-S7)', async () => {
    const view = await render(CanvasStage);
    const store = TestBed.inject(DesignerStore);
    store.addElement(TEXT);
    store.addElement({ ...TEXT, id: 'el_2', frame: { xMm: 80, yMm: 80, wMm: 40, hMm: 8 } });
    store.selectOne('el_1');
    view.detectChanges();

    const second = view.container.querySelector('[data-element-id="el_2"]');
    if (second === null) throw new Error('expected a rendered element box');
    second.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, button: 0, shiftKey: true }),
    );

    expect(store.selectedIds()).toEqual(['el_1', 'el_2']);
  });

  it('marquee-selects every element the rubber-band intersects (E5-S7)', async () => {
    const view = await render(CanvasStage);
    const store = TestBed.inject(DesignerStore);
    store.addElement({ ...TEXT, id: 'el_a', frame: { xMm: 10, yMm: 10, wMm: 20, hMm: 20 } });
    store.addElement({ ...TEXT, id: 'el_b', frame: { xMm: 120, yMm: 120, wMm: 20, hMm: 20 } });
    view.detectChanges();

    const sheet = view.container.querySelector<HTMLElement>('.rdr-page');
    const pages = view.container.querySelector<HTMLElement>('.rdr-canvas__pages');
    if (sheet === null || pages === null) throw new Error('expected the sheet and pages area');
    stubRect(sheet, 0, 0);
    stubRect(pages, 0, 0);

    // Drag a marquee from the page origin over a 50 × 50 mm region (covers el_a only).
    pages.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 0, clientY: 0 }),
    );
    window.dispatchEvent(
      new MouseEvent('pointermove', { clientX: mmToPx(50), clientY: mmToPx(50) }),
    );
    window.dispatchEvent(new MouseEvent('pointerup', {}));

    expect(store.selectedIds()).toEqual(['el_a']);
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
