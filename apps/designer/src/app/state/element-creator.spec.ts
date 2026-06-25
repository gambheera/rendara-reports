import { describe, expect, it, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { validateElement } from '@rendara/report-schema';
import { ElementCreator } from './element-creator';
import { DesignerStore } from './designer-store';
import type { PaletteKind } from './drag-create';

const ALL_KINDS: readonly PaletteKind[] = ['text', 'image', 'line', 'rect', 'ellipse', 'dataTable'];

describe('ElementCreator', () => {
  let creator: ElementCreator;
  let store: InstanceType<typeof DesignerStore>;

  beforeEach(() => {
    creator = TestBed.inject(ElementCreator);
    store = TestBed.inject(DesignerStore);
  });

  it('adds a schema-valid, selected element for every kind at a drop point', () => {
    for (const kind of ALL_KINDS) {
      const id = creator.addAtPoint(kind, { xMm: 100, yMm: 100 });
      const element = store.elementsById().get(id);

      expect(element).toBeDefined();
      // The factory's whole point: every dropped element is immediately valid.
      if (element !== undefined) {
        expect(validateElement(element)).toEqual([]);
      }
      // Each add focuses the new element.
      expect(store.selectedIds()).toEqual([id]);
    }
    // Six adds, all in the body band.
    expect(store.bodyElements()).toHaveLength(ALL_KINDS.length);
  });

  it('centres a dropped element on the page-absolute drop point (A4 portrait)', () => {
    const id = creator.addAtPoint('text', { xMm: 105, yMm: 148.5 });
    const element = store.elementsById().get(id);

    // 40×10 text centred on the page centre → top-left (85, 143.5).
    expect(element?.frame).toEqual({ xMm: 85, yMm: 143.5, wMm: 40, hMm: 10 });
  });

  it('marks the document dirty when an element is added', () => {
    expect(store.dirty()).toBe(false);
    creator.addAtPoint('rect', { xMm: 50, yMm: 50 });
    expect(store.dirty()).toBe(true);
  });

  it('stacks each new element on top via an increasing z-order', () => {
    const first = creator.addAtPoint('rect', { xMm: 50, yMm: 50 });
    const second = creator.addAtPoint('ellipse', { xMm: 60, yMm: 60 });

    const zOf = (id: string) => store.elementsById().get(id)?.z;
    expect(zOf(first)).toBe(1);
    expect(zOf(second)).toBe(2);
  });

  it('cascades click-to-add placements so they do not stack exactly', () => {
    const first = creator.addAtDefault('text');
    const second = creator.addAtDefault('text');

    const frameOf = (id: string) => store.elementsById().get(id)?.frame;
    // First centred (85, 143.5); second nudged by one 6 mm cascade step.
    expect(frameOf(first)).toEqual({ xMm: 85, yMm: 143.5, wMm: 40, hMm: 10 });
    expect(frameOf(second)).toEqual({ xMm: 91, yMm: 149.5, wMm: 40, hMm: 10 });
  });
});
