import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';
import type { TextElement } from '@rendara/report-schema';
import { LayersPanel } from './layers-panel';
import { DesignerStore } from '../../state/designer-store';

function textEl(id: string): TextElement {
  return { id, type: 'text', frame: { xMm: 0, yMm: 0, wMm: 10, hMm: 5 }, z: 1, text: id };
}

/** Renders the panel over a store seeded with three body text elements (a, b, c). */
async function renderWithThree() {
  const view = await render(LayersPanel);
  const store = TestBed.inject(DesignerStore);
  store.addElement(textEl('a'));
  store.addElement(textEl('b'));
  store.addElement(textEl('c'));
  view.detectChanges();
  return { view, store };
}

/** The visible layer-row labels, in DOM (top-first) order. */
function rowLabels(view: Awaited<ReturnType<typeof render>>): string[] {
  return [...view.container.querySelectorAll('.rdr-layers__row-type')].map((n) =>
    (n.textContent ?? '').trim(),
  );
}

describe('LayersPanel', () => {
  it('shows the empty state when there are no elements', async () => {
    await render(LayersPanel);
    expect(screen.getByText('No elements yet')).toBeTruthy();
  });

  it('lists the body elements top-first', async () => {
    const { view } = await renderWithThree();
    // a, b, c added with equal z → stack a,b,c; top-first reverses to c, b, a.
    expect(view.container.querySelectorAll('.rdr-layers__row')).toHaveLength(3);
    expect(rowLabels(view)).toEqual(['Text', 'Text', 'Text']);
  });

  it('selects a single element on a plain click', async () => {
    const { view, store } = await renderWithThree();
    const rows = view.container.querySelectorAll<HTMLButtonElement>('.rdr-layers__row');
    rows[0].click(); // top row = element 'c'
    expect(store.selectedIds()).toEqual(['c']);
  });

  it('extends the selection on a shift-click', async () => {
    const { view, store } = await renderWithThree();
    const rows = view.container.querySelectorAll<HTMLButtonElement>('.rdr-layers__row');
    rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    rows[1].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    expect(store.selectedIds()).toEqual(['c', 'b']);
  });

  it('disables order actions with no selection and enables them once selected', async () => {
    const { view, store } = await renderWithThree();
    const front = screen.getByRole('button', { name: 'Bring to front' }) as HTMLButtonElement;
    expect(front.disabled).toBe(true);

    store.selectOne('a');
    view.detectChanges();
    expect(front.disabled).toBe(false);
  });

  it('brings the selection to the front', async () => {
    const { view, store } = await renderWithThree();
    store.selectOne('a');
    view.detectChanges();
    screen.getByRole('button', { name: 'Bring to front' }).click();
    // 'a' now paints on top → it leads the top-first list.
    expect(store.bodyStack().map((el) => el.id)).toEqual(['a', 'c', 'b']);
  });

  it('groups and ungroups the selection, tagging grouped rows', async () => {
    const { view, store } = await renderWithThree();
    const groupBtn = screen.getByRole('button', { name: 'Group selection' }) as HTMLButtonElement;
    expect(groupBtn.disabled).toBe(true);

    store.select(['a', 'b']);
    view.detectChanges();
    expect(groupBtn.disabled).toBe(false);

    groupBtn.click();
    view.detectChanges();
    expect(store.groups()).toEqual([['a', 'b']]);
    expect(view.container.querySelectorAll('.rdr-layers__row-group').length).toBe(2);

    screen.getByRole('button', { name: 'Ungroup selection' }).click();
    view.detectChanges();
    expect(store.groups()).toEqual([]);
  });
});
