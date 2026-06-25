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

  describe('snapping toggle (E5-S8)', () => {
    it('defaults on, toggles and sets without marking dirty', () => {
      expect(store.snapEnabled()).toBe(true);

      store.toggleSnap();
      expect(store.snapEnabled()).toBe(false);

      store.setSnapEnabled(true);
      expect(store.snapEnabled()).toBe(true);
      expect(store.dirty()).toBe(false);
    });
  });

  describe('align & distribute (E5-S8)', () => {
    /** Three body elements at known frames for the align/distribute maths. */
    function spread(): RendaraTemplate {
      return {
        ...createEmptyTemplate(),
        body: {
          elements: [
            {
              id: 'a',
              type: 'text',
              frame: { xMm: 10, yMm: 5, wMm: 20, hMm: 10 },
              z: 1,
              text: 'a',
            },
            {
              id: 'b',
              type: 'text',
              frame: { xMm: 40, yMm: 30, wMm: 20, hMm: 10 },
              z: 1,
              text: 'b',
            },
            {
              id: 'c',
              type: 'text',
              frame: { xMm: 90, yMm: 55, wMm: 20, hMm: 10 },
              z: 1,
              text: 'c',
            },
          ],
        },
      };
    }

    beforeEach(() => store.loadTemplate(spread()));

    it('aligns the selection left and marks dirty', () => {
      store.select(['a', 'b', 'c']);
      store.alignSelection('left');
      expect(store.bodyElements().map((el) => el.frame.xMm)).toEqual([10, 10, 10]);
      expect(store.dirty()).toBe(true);
    });

    it('does nothing for a single selection (needs 2+)', () => {
      store.selectOne('b');
      store.alignSelection('left');
      expect(store.elementsById().get('b')?.frame.xMm).toBe(40);
      expect(store.dirty()).toBe(false);
    });

    it('distributes horizontal centres evenly', () => {
      store.select(['a', 'b', 'c']);
      store.distributeSelection('horizontal');
      // centres 20, 50, 100 → even centres 20, 60, 100 → middle x = 50.
      expect(store.elementsById().get('b')?.frame.xMm).toBe(50);
    });

    it('does nothing to distribute with fewer than three selected', () => {
      store.select(['a', 'b']);
      store.distributeSelection('horizontal');
      expect(store.elementsById().get('b')?.frame.xMm).toBe(40);
      expect(store.dirty()).toBe(false);
    });

    it('exposes canAlign (2+) and canDistribute (3+)', () => {
      store.select(['a']);
      expect(store.canAlign()).toBe(false);
      expect(store.canDistribute()).toBe(false);
      store.select(['a', 'b']);
      expect(store.canAlign()).toBe(true);
      expect(store.canDistribute()).toBe(false);
      store.select(['a', 'b', 'c']);
      expect(store.canDistribute()).toBe(true);
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

  describe('multi-select, z-order, grouping (E5-S7)', () => {
    beforeEach(() => store.loadTemplate(seededTemplate()));

    it('starts ungrouped and lists the body stack top-first', () => {
      // a, b, c all share z 1, so the stack is array order; top-first reverses it.
      expect(store.groups()).toEqual([]);
      expect(store.bodyStack().map((el) => el.id)).toEqual(['c', 'b', 'a']);
    });

    describe('z-order', () => {
      it('brings the selection to the front and renumbers the stack', () => {
        store.selectOne('a');
        store.reorderSelection('front');
        // a now paints on top of all → top-first list leads with a.
        expect(store.bodyStack().map((el) => el.id)).toEqual(['a', 'c', 'b']);
        expect(store.dirty()).toBe(true);
      });

      it('sends the selection to the back', () => {
        store.selectOne('c');
        store.reorderSelection('back');
        expect(store.bodyStack().map((el) => el.id)).toEqual(['b', 'a', 'c']);
      });

      it('steps an element forward and backward by one slot', () => {
        store.selectOne('a');
        store.reorderSelection('forward'); // a moves above b
        expect(store.bodyStack().map((el) => el.id)).toEqual(['c', 'a', 'b']);
        store.reorderSelection('backward'); // back to the bottom
        expect(store.bodyStack().map((el) => el.id)).toEqual(['c', 'b', 'a']);
      });

      it('is a no-op (clean) when already at the requested extreme', () => {
        store.selectOne('a'); // bottom of the stack
        store.markClean();
        const before = store.template();
        store.reorderSelection('back');
        expect(store.template()).toBe(before);
        expect(store.dirty()).toBe(false);
      });
    });

    describe('grouping', () => {
      it('groups 2+ selected elements and exposes can-group/can-ungroup', () => {
        store.select(['a', 'b']);
        expect(store.canGroup()).toBe(true);
        store.groupSelection();
        expect(store.groups()).toEqual([['a', 'b']]);
        expect(store.canUngroup()).toBe(true);
      });

      it('grouping does not mark the document dirty (view-state only)', () => {
        store.select(['a', 'b']);
        store.groupSelection();
        expect(store.dirty()).toBe(false);
      });

      it('selecting one grouped element selects the whole group', () => {
        store.select(['a', 'b']);
        store.groupSelection();
        store.selectOne('a');
        expect(store.selectedIds()).toEqual(['a', 'b']);
      });

      it('shift-toggle removes the whole group as a unit', () => {
        store.select(['a', 'b']);
        store.groupSelection();
        store.selectOne('a'); // selects [a, b]
        store.toggleSelection('a'); // toggles the group off
        expect(store.selectedIds()).toEqual([]);
      });

      it('ungroups, after which a member selects alone again', () => {
        store.select(['a', 'b']);
        store.groupSelection();
        store.ungroupSelection();
        expect(store.groups()).toEqual([]);
        store.selectOne('a');
        expect(store.selectedIds()).toEqual(['a']);
      });

      it('prunes a group when one of its members is removed', () => {
        store.select(['a', 'b']);
        store.groupSelection();
        store.removeElement('a'); // group falls below 2 members → dropped
        expect(store.groups()).toEqual([]);
      });

      it('refuses to group a single element', () => {
        store.selectOne('a');
        expect(store.canGroup()).toBe(false);
        store.groupSelection();
        expect(store.groups()).toEqual([]);
      });
    });

    describe('group move', () => {
      it('moves the whole selection by the same delta, preserving offsets', () => {
        store.updateElement('a', { frame: { xMm: 10, yMm: 10, wMm: 20, hMm: 20 } });
        store.updateElement('b', { frame: { xMm: 50, yMm: 30, wMm: 20, hMm: 20 } });
        store.select(['a', 'b']);
        store.moveSelection(5, 5);

        expect(store.elementsById().get('a')?.frame).toMatchObject({ xMm: 15, yMm: 15 });
        expect(store.elementsById().get('b')?.frame).toMatchObject({ xMm: 55, yMm: 35 });
      });

      it('setFrames commits a batch and is a no-op for unknown ids', () => {
        const before = store.template();
        store.setFrames(new Map([['ghost', { xMm: 1, yMm: 1, wMm: 1, hMm: 1 }]]));
        expect(store.template()).toBe(before);
      });
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

  describe('sample data (E6-S6)', () => {
    const sample = {
      fileName: 'invoice-sample.json',
      value: { a: 1 },
      root: { name: '$root', path: '', kind: 'object' as const },
      truncated: false,
    };

    it('starts with no sample data', () => {
      expect(store.sampleData()).toBeNull();
      expect(store.hasSampleData()).toBe(false);
    });

    it('loads sample data without marking the document dirty or undoable', () => {
      store.setSampleData(sample);
      expect(store.sampleData()).toEqual(sample);
      expect(store.hasSampleData()).toBe(true);
      expect(store.dirty()).toBe(false);
      expect(store.canUndo()).toBe(false);
    });

    it('replaces and clears sample data', () => {
      store.setSampleData(sample);
      const next = { ...sample, fileName: 'other.json' };
      store.setSampleData(next);
      expect(store.sampleData()?.fileName).toBe('other.json');
      store.clearSampleData();
      expect(store.sampleData()).toBeNull();
      expect(store.hasSampleData()).toBe(false);
    });

    it('keeps sample data across an undo (it is view-state, not in history)', () => {
      store.addElement(textEl('a'));
      store.setSampleData(sample);
      store.undo();
      expect(store.bodyElements()).toEqual([]);
      expect(store.sampleData()).toEqual(sample);
    });
  });

  describe('undo / redo', () => {
    it('starts with nothing to undo or redo', () => {
      expect(store.canUndo()).toBe(false);
      expect(store.canRedo()).toBe(false);
    });

    it('undoes an add and redoes it', () => {
      store.addElement(textEl('a'));
      expect(store.canUndo()).toBe(true);

      store.undo();
      expect(store.bodyElements()).toEqual([]);
      expect(store.canUndo()).toBe(false);
      expect(store.canRedo()).toBe(true);

      store.redo();
      expect(store.bodyElements().map((el) => el.id)).toEqual(['a']);
      expect(store.canRedo()).toBe(false);
    });

    it('does nothing when there is nothing to undo or redo', () => {
      const before = store.template();
      store.undo();
      store.redo();
      expect(store.template()).toBe(before);
    });

    it('restores the selection that existed before a delete', () => {
      store.loadTemplate(seededTemplate());
      store.selectOne('b');
      store.removeElement('b');
      expect(store.bodyElements().map((el) => el.id)).toEqual(['a', 'c']);

      store.undo();
      expect(store.bodyElements().map((el) => el.id)).toEqual(['a', 'b', 'c']);
      expect(store.selectedIds()).toEqual(['b']);
    });

    it('marks the document dirty after undo and redo', () => {
      store.addElement(textEl('a'));
      store.markClean();
      store.undo();
      expect(store.dirty()).toBe(true);
      store.markClean();
      store.redo();
      expect(store.dirty()).toBe(true);
    });

    it('a fresh edit clears the redo stack', () => {
      store.addElement(textEl('a'));
      store.undo();
      expect(store.canRedo()).toBe(true);
      store.addElement(textEl('b'));
      expect(store.canRedo()).toBe(false);
    });

    it('steps through a multi-edit timeline', () => {
      store.addElement(textEl('a'));
      store.addElement(textEl('b'));
      store.updateElement('a', { text: 'changed' });

      store.undo(); // undo the text change
      expect((store.elementsById().get('a') as TextElement).text).toBe('a');
      store.undo(); // undo add b
      expect(store.bodyElements().map((el) => el.id)).toEqual(['a']);
      store.undo(); // undo add a
      expect(store.bodyElements()).toEqual([]);
      expect(store.canUndo()).toBe(false);
    });

    it('treats group / ungroup as undoable steps', () => {
      store.loadTemplate(seededTemplate());
      store.select(['a', 'b']);
      store.groupSelection();
      expect(store.groups()).toHaveLength(1);

      store.undo();
      expect(store.groups()).toEqual([]);
      store.redo();
      expect(store.groups()).toHaveLength(1);
    });

    it('treats setPage as an undoable step', () => {
      const landscape = { ...store.page(), orientation: 'landscape' as const };
      store.setPage(landscape);
      expect(store.page().orientation).toBe('landscape');
      store.undo();
      expect(store.page().orientation).toBe('portrait');
    });

    it('loadTemplate clears the history', () => {
      store.addElement(textEl('a'));
      expect(store.canUndo()).toBe(true);
      store.loadTemplate(seededTemplate());
      expect(store.canUndo()).toBe(false);
      expect(store.canRedo()).toBe(false);
    });
  });

  describe('interaction coalescing', () => {
    beforeEach(() => store.loadTemplate(seededTemplate()));

    it('coalesces a multi-step drag into a single undo entry', () => {
      store.selectOne('a');
      const start = store.elementsById().get('a')?.frame;

      store.beginInteraction();
      store.setFrames(new Map([['a', { xMm: 5, yMm: 5, wMm: 10, hMm: 5 }]]));
      store.setFrames(new Map([['a', { xMm: 12, yMm: 9, wMm: 10, hMm: 5 }]]));
      store.setFrames(new Map([['a', { xMm: 20, yMm: 15, wMm: 10, hMm: 5 }]]));
      store.endInteraction();

      expect(store.elementsById().get('a')?.frame).toMatchObject({ xMm: 20, yMm: 15 });

      // A single undo reverts the entire gesture back to the pre-drag frame.
      store.undo();
      expect(store.elementsById().get('a')?.frame).toEqual(start);
      expect(store.canUndo()).toBe(false);
    });

    it('records nothing when a gesture makes no change', () => {
      store.selectOne('a');
      store.beginInteraction();
      store.endInteraction();
      expect(store.canUndo()).toBe(false);
    });

    it('beginInteraction is idempotent while one is open', () => {
      store.selectOne('a');
      store.beginInteraction();
      store.setFrames(new Map([['a', { xMm: 5, yMm: 5, wMm: 10, hMm: 5 }]]));
      store.beginInteraction(); // ignored — must not capture the mid-drag frame
      store.setFrames(new Map([['a', { xMm: 30, yMm: 30, wMm: 10, hMm: 5 }]]));
      store.endInteraction();

      store.undo();
      expect(store.elementsById().get('a')?.frame).toMatchObject({ xMm: 0, yMm: 0 });
    });
  });

  describe('clipboard', () => {
    beforeEach(() => store.loadTemplate(seededTemplate()));

    it('copy then paste appends an equivalent element with a new id, offset and selected', () => {
      store.updateElement('a', { frame: { xMm: 10, yMm: 10, wMm: 20, hMm: 8 } });
      store.selectOne('a');
      store.copySelection();
      expect(store.hasClipboard()).toBe(true);

      const before = store.bodyElements().length;
      store.paste();

      expect(store.bodyElements().length).toBe(before + 1);
      const pasted = store.selectedElements();
      expect(pasted).toHaveLength(1);
      expect(pasted[0].id).not.toBe('a');
      expect(pasted[0].type).toBe('text');
      expect(pasted[0].frame).toMatchObject({ xMm: 15, yMm: 15, wMm: 20, hMm: 8 });
    });

    it('paste is undoable as one step and a no-op with an empty clipboard', () => {
      const before = store.template();
      store.paste(); // clipboard empty
      expect(store.template()).toBe(before);

      store.selectOne('a');
      store.copySelection();
      store.paste();
      expect(store.bodyElements().length).toBe(4);
      store.undo();
      expect(store.bodyElements().length).toBe(3);
    });

    it('cut copies then deletes in a single undo step', () => {
      store.selectOne('b');
      store.cutSelection();
      expect(store.bodyElements().map((el) => el.id)).toEqual(['a', 'c']);
      expect(store.hasClipboard()).toBe(true);

      store.undo();
      expect(store.bodyElements().map((el) => el.id)).toEqual(['a', 'b', 'c']);

      // The cut element is still on the clipboard and pastes back.
      store.paste();
      expect(store.bodyElements().length).toBe(4);
    });

    it('duplicate clones the selection without touching the clipboard', () => {
      store.selectOne('a');
      store.copySelection(); // clipboard now holds [a]
      store.selectOne('c');
      store.duplicateSelection();

      // The duplicate came from c, not from the clipboard's a.
      const dup = store.selectedElements();
      expect(dup).toHaveLength(1);
      expect(dup[0].id).not.toBe('c');
      expect((dup[0] as TextElement).text).toBe('c');
      expect(store.bodyElements().length).toBe(4);
      // Clipboard is unchanged: pasting still yields a copy of a.
      store.paste();
      expect((store.selectedElements()[0] as TextElement).text).toBe('a');
    });

    it('removeSelection deletes every selected element in one undo step', () => {
      store.select(['a', 'c']);
      store.removeSelection();
      expect(store.bodyElements().map((el) => el.id)).toEqual(['b']);
      expect(store.selectedIds()).toEqual([]);

      store.undo();
      expect(store.bodyElements().map((el) => el.id)).toEqual(['a', 'b', 'c']);
    });

    it('copy with nothing selected keeps the clipboard empty', () => {
      store.clearSelection();
      store.copySelection();
      expect(store.hasClipboard()).toBe(false);
    });
  });

  describe('property: random ops then full undo returns to the initial document', () => {
    /** Deterministic PRNG (mulberry32) so failures reproduce from the seed. */
    function rng(seed: number): () => number {
      let s = seed >>> 0;
      return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    for (const seed of [1, 7, 42, 123, 2024]) {
      it(`seed ${seed}`, () => {
        store.loadTemplate(seededTemplate()); // initial: a, b, c — and an empty history
        const initialTemplate = store.template();
        const initialGroups = store.groups();
        let counter = 0;

        const ids = (): readonly string[] => store.bodyElements().map((el) => el.id);
        const pick = <T>(r: number, xs: readonly T[]): T => xs[Math.floor(r * xs.length)];

        const next = rng(seed);
        const ops: Array<() => void> = [
          () => store.addElement(textEl(`gen${counter++}`)),
          () => {
            const list = ids();
            if (list.length > 0) store.removeElement(pick(next(), list));
          },
          () => {
            const list = ids();
            if (list.length > 0) {
              store.updateElement(pick(next(), list), {
                frame: { xMm: 5, yMm: 5, wMm: 12, hMm: 6 },
              });
            }
          },
          () => {
            const list = ids();
            if (list.length > 0) {
              store.selectOne(pick(next(), list));
              store.moveSelection(3, 2);
            }
          },
          () => {
            const list = ids();
            if (list.length >= 2) {
              store.select([list[0], list[1]]);
              store.groupSelection();
            }
          },
          () => {
            const list = ids();
            if (list.length > 0) {
              store.selectOne(pick(next(), list));
              store.copySelection();
              store.paste();
            }
          },
          () => {
            const list = ids();
            if (list.length > 0) {
              store.selectOne(pick(next(), list));
              store.reorderSelection('front');
            }
          },
        ];

        for (let i = 0; i < 40; i++) pick(next(), ops)();

        // Unwind the whole timeline.
        let guard = 0;
        while (store.canUndo() && guard++ < 1000) store.undo();

        expect(store.template()).toEqual(initialTemplate);
        expect(store.groups()).toEqual(initialGroups);
      });
    }
  });
});
