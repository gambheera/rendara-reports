import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import type { RendaraTemplate, TextElement } from '@rendara/report-schema';
import { DEFAULT_ZOOM, DesignerStore, MAX_ZOOM, MIN_ZOOM } from './designer-store';
import { createEmptyTemplate } from './template-ops';

type Store = InstanceType<typeof DesignerStore>;

function textEl(id: string): TextElement {
  return { id, type: 'text', frame: { xMm: 0, yMm: 0, wMm: 10, hMm: 5 }, z: 1, text: id };
}

/** A document with three body elements, ready for selection/mutation tests. */
function seededTemplate(): RendaraTemplate {
  return { ...createEmptyTemplate(), body: { elements: [textEl('a'), textEl('b'), textEl('c')] } };
}

describe('DesignerStore', () => {
  let store: Store;

  beforeEach(() => {
    store = TestBed.inject(DesignerStore);
  });

  it('starts with an empty document, no selection, 100% zoom and clean', () => {
    expect(store.bodyElements()).toEqual([]);
    expect(store.selectedIds()).toEqual([]);
    expect(store.hasSelection()).toBe(false);
    expect(store.selectedElements()).toEqual([]);
    expect(store.primarySelection()).toBeUndefined();
    expect(store.zoom()).toBe(DEFAULT_ZOOM);
    expect(store.zoomPercent()).toBe(100);
    expect(store.dirty()).toBe(false);
  });

  describe('loadTemplate / resetDocument', () => {
    it('replaces the document and clears selection + dirty', () => {
      store.addElement(textEl('a'));
      store.selectOne('a');
      expect(store.dirty()).toBe(true);

      store.loadTemplate(seededTemplate());
      expect(store.bodyElements().map((el) => el.id)).toEqual(['a', 'b', 'c']);
      expect(store.selectedIds()).toEqual([]);
      expect(store.dirty()).toBe(false);
    });

    it('resets to a fresh empty document', () => {
      store.loadTemplate(seededTemplate());
      store.resetDocument();
      expect(store.bodyElements()).toEqual([]);
      expect(store.dirty()).toBe(false);
    });
  });

  describe('zoom', () => {
    it('clamps to the supported range and never marks dirty', () => {
      store.setZoom(2);
      expect(store.zoom()).toBe(2);
      expect(store.zoomPercent()).toBe(200);

      store.setZoom(999);
      expect(store.zoom()).toBe(MAX_ZOOM);
      store.setZoom(-5);
      expect(store.zoom()).toBe(MIN_ZOOM);

      expect(store.dirty()).toBe(false);
    });
  });

  describe('rendered document (E5-S4)', () => {
    it('paginates the empty document to a single page', () => {
      expect(store.paginatedDocument().pageCount).toBe(1);
      expect(store.pageCount()).toBe(1);
    });

    it('recomputes when the document changes', () => {
      const first = store.paginatedDocument();
      store.addElement(textEl('a'));
      const second = store.paginatedDocument();

      expect(second).not.toBe(first);
      expect(store.pageCount()).toBe(1);
    });
  });

  describe('selection invariants', () => {
    beforeEach(() => store.loadTemplate(seededTemplate()));

    it('keeps only existing ids and dedupes, preserving order', () => {
      store.select(['c', 'a', 'a', 'ghost']);
      expect(store.selectedIds()).toEqual(['c', 'a']);
      expect(store.selectionCount()).toBe(2);
      expect(store.selectedElements().map((el) => el.id)).toEqual(['c', 'a']);
      expect(store.primarySelection()?.id).toBe('c');
    });

    it('selectOne selects a single existing element, or clears for an unknown id', () => {
      store.selectOne('b');
      expect(store.selectedIds()).toEqual(['b']);
      store.selectOne('ghost');
      expect(store.selectedIds()).toEqual([]);
    });

    it('toggleSelection adds then removes an id', () => {
      store.toggleSelection('a');
      store.toggleSelection('b');
      expect(store.selectedIds()).toEqual(['a', 'b']);
      store.toggleSelection('a');
      expect(store.selectedIds()).toEqual(['b']);
    });

    it('clearSelection empties the selection', () => {
      store.select(['a', 'b']);
      store.clearSelection();
      expect(store.selectedIds()).toEqual([]);
      expect(store.hasSelection()).toBe(false);
    });

    it('prunes removed elements from the selection', () => {
      store.select(['a', 'b']);
      store.removeElement('a');
      expect(store.selectedIds()).toEqual(['b']);
    });

    it('selection does not mark the document dirty', () => {
      store.select(['a']);
      store.toggleSelection('b');
      store.clearSelection();
      expect(store.dirty()).toBe(false);
    });
  });

  describe('mutations produce new references and set dirty', () => {
    it('addElement appends and yields a new template reference', () => {
      const before = store.template();
      store.addElement(textEl('x'));
      expect(store.template()).not.toBe(before);
      expect(before.body.elements).toEqual([]); // original untouched
      expect(store.bodyElements().map((el) => el.id)).toEqual(['x']);
      expect(store.dirty()).toBe(true);
    });

    it('updateElement patches immutably and marks dirty', () => {
      store.loadTemplate(seededTemplate());
      const before = store.template();
      store.updateElement('b', { z: 42 });

      expect(store.template()).not.toBe(before);
      expect(store.elementsById().get('b')?.z).toBe(42);
      expect(before.body.elements[1].z).toBe(1); // original untouched
      expect(store.dirty()).toBe(true);
    });

    it('updateElement on an unknown id is a no-op and leaves dirty alone', () => {
      store.loadTemplate(seededTemplate());
      const before = store.template();
      store.updateElement('ghost', { z: 5 });
      expect(store.template()).toBe(before);
      expect(store.dirty()).toBe(false);
    });

    it('removeElement removes immutably and marks dirty', () => {
      store.loadTemplate(seededTemplate());
      const before = store.template();
      store.removeElement('b');

      expect(store.template()).not.toBe(before);
      expect(store.bodyElements().map((el) => el.id)).toEqual(['a', 'c']);
      expect(before.body.elements.map((el) => el.id)).toEqual(['a', 'b', 'c']);
      expect(store.dirty()).toBe(true);
    });

    it('removeElement on an unknown id is a no-op', () => {
      store.loadTemplate(seededTemplate());
      const before = store.template();
      store.removeElement('ghost');
      expect(store.template()).toBe(before);
      expect(store.dirty()).toBe(false);
    });

    it('setPage replaces the page immutably and marks dirty', () => {
      const before = store.template();
      store.setPage({ ...before.page, orientation: 'landscape' });
      expect(store.template()).not.toBe(before);
      expect(store.page().orientation).toBe('landscape');
      expect(before.page.orientation).toBe('portrait');
      expect(store.dirty()).toBe(true);
    });
  });

  describe('markClean', () => {
    it('clears the dirty flag after a mutation', () => {
      store.addElement(textEl('a'));
      expect(store.dirty()).toBe(true);
      store.markClean();
      expect(store.dirty()).toBe(false);
    });
  });
});
