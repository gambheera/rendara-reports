import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { render } from '@testing-library/angular';
import { mmToPx } from '@rendara/report-engine';
import type { TemplateElement } from '@rendara/report-schema';
import { SelectionOverlay } from './selection-overlay';
import { DesignerStore } from '../../state/designer-store';

const TEXT: TemplateElement = {
  id: 'el_1',
  type: 'text',
  frame: { xMm: 50, yMm: 60, wMm: 40, hMm: 20 },
  text: 'Hello',
  style: {},
  z: 1,
};

/** Renders the overlay with a single text element pre-selected. */
async function renderSelected() {
  const view = await render(SelectionOverlay);
  const store = TestBed.inject(DesignerStore);
  store.addElement(TEXT);
  store.selectOne(TEXT.id);
  view.detectChanges();
  return { view, store };
}

/** A pointer-ish event jsdom can build (MouseEvent carries clientX/clientY/button). */
function pointer(type: string, init: MouseEventInit): MouseEvent {
  return new MouseEvent(type, { bubbles: true, ...init });
}

/** Runs a full drag gesture from `box`/handle: down on the node, move + up on window. */
function drag(node: Element, dxPx: number, dyPx: number): void {
  node.dispatchEvent(pointer('pointerdown', { clientX: 0, clientY: 0, button: 0 }));
  window.dispatchEvent(pointer('pointermove', { clientX: dxPx, clientY: dyPx }));
  window.dispatchEvent(pointer('pointerup', { clientX: dxPx, clientY: dyPx }));
}

describe('SelectionOverlay', () => {
  it('paints the box, eight handles and the coordinate badge for the selection', async () => {
    const { view } = await renderSelected();

    expect(view.container.querySelector('.rdr-selection__box')).toBeTruthy();
    expect(view.container.querySelectorAll('.rdr-selection__handle')).toHaveLength(8);

    const badge = view.container.querySelector('.rdr-selection__badge');
    expect(badge?.textContent?.replace(/\s+/g, ' ').trim()).toBe('x 50 y 60 · 40 × 20 mm');
  });

  it('renders nothing when there is no selection', async () => {
    const view = await render(SelectionOverlay);
    expect(view.container.querySelector('.rdr-selection__box')).toBeNull();
  });

  it('drag-moves the element, committing the new frame to the store', async () => {
    const { view, store } = await renderSelected();
    const box = view.container.querySelector('.rdr-selection__box');
    if (box === null) throw new Error('expected a selection box');

    // Drag 10 mm right and 5 mm down (px → mm at 96 dpi, zoom 1).
    drag(box, mmToPx(10), mmToPx(5));

    expect(store.bodyElements()[0].frame).toMatchObject({ xMm: 60, yMm: 65 });
  });

  it('resizes from the east handle, growing the width in the store', async () => {
    const { view, store } = await renderSelected();
    const east = view.container.querySelector('.rdr-selection__handle--e');
    if (east === null) throw new Error('expected an east handle');

    drag(east, mmToPx(10), 0);

    expect(store.bodyElements()[0].frame).toMatchObject({ wMm: 50, xMm: 50 });
  });

  it('nudges the element with the arrow keys (1 mm, 10 mm with Shift)', async () => {
    const { view, store } = await renderSelected();
    const box = view.container.querySelector('.rdr-selection__box');
    if (box === null) throw new Error('expected a selection box');

    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(store.bodyElements()[0].frame.xMm).toBe(51);

    box.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true }),
    );
    expect(store.bodyElements()[0].frame.yMm).toBe(70);
  });

  it('ignores a non-primary button press and unhandled keys', async () => {
    const { view, store } = await renderSelected();
    const box = view.container.querySelector('.rdr-selection__box');
    const east = view.container.querySelector('.rdr-selection__handle--e');
    if (box === null || east === null) throw new Error('expected a box and handle');

    // Right-button (button 2) drags must not move or resize the element.
    box.dispatchEvent(pointer('pointerdown', { clientX: 0, clientY: 0, button: 2 }));
    window.dispatchEvent(pointer('pointermove', { clientX: mmToPx(20), clientY: 0 }));
    window.dispatchEvent(pointer('pointerup', {}));
    east.dispatchEvent(pointer('pointerdown', { clientX: 0, clientY: 0, button: 2 }));
    window.dispatchEvent(pointer('pointermove', { clientX: mmToPx(20), clientY: 0 }));
    window.dispatchEvent(pointer('pointerup', {}));

    // An unhandled key is a no-op too.
    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));

    expect(store.bodyElements()[0].frame).toEqual(TEXT.frame);
  });

  it('paints a box per element and an "N selected" badge for a multi-selection', async () => {
    const view = await render(SelectionOverlay);
    const store = TestBed.inject(DesignerStore);
    store.addElement(TEXT);
    store.addElement({ ...TEXT, id: 'el_2', frame: { xMm: 10, yMm: 10, wMm: 20, hMm: 20 } });
    store.select(['el_1', 'el_2']);
    view.detectChanges();

    expect(view.container.querySelectorAll('.rdr-selection__box--multi')).toHaveLength(2);
    // No resize handles in multi-selection mode.
    expect(view.container.querySelectorAll('.rdr-selection__handle')).toHaveLength(0);
    expect(view.container.querySelector('.rdr-selection__badge')?.textContent?.trim()).toBe(
      '2 selected',
    );
  });

  it('drag-moves the whole multi-selection as a unit', async () => {
    const view = await render(SelectionOverlay);
    const store = TestBed.inject(DesignerStore);
    store.addElement(TEXT); // (50, 60)
    store.addElement({ ...TEXT, id: 'el_2', frame: { xMm: 10, yMm: 10, wMm: 20, hMm: 20 } });
    store.select(['el_1', 'el_2']);
    view.detectChanges();

    const box = view.container.querySelector('.rdr-selection__box--multi');
    if (box === null) throw new Error('expected a multi-selection box');
    drag(box, mmToPx(10), 0); // 10 mm right

    expect(store.elementsById().get('el_1')?.frame).toMatchObject({ xMm: 60, yMm: 60 });
    expect(store.elementsById().get('el_2')?.frame).toMatchObject({ xMm: 20, yMm: 10 });
  });

  it('clears the selection on Escape', async () => {
    const { view, store } = await renderSelected();
    const box = view.container.querySelector('.rdr-selection__box');
    if (box === null) throw new Error('expected a selection box');

    box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    view.detectChanges();

    expect(store.hasSelection()).toBe(false);
    expect(view.container.querySelector('.rdr-selection__box')).toBeNull();
  });
});
