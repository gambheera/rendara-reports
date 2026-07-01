import { describe, expect, it } from 'vitest';
import type { RendaraTemplate } from '@rendara/report-schema';
import {
  HISTORY_LIMIT,
  emptyHistory,
  pushHistory,
  redo,
  undo,
  type HistorySnapshot,
} from './history';
import { createEmptyTemplate } from './template-ops';

/** A snapshot whose template carries a marker name, for identity assertions. */
function snap(name: string): HistorySnapshot {
  const template: RendaraTemplate = {
    ...createEmptyTemplate(),
    metadata: { ...createEmptyTemplate().metadata, name },
  };
  return { template, selectedIds: [name], groups: [] };
}

describe('history', () => {
  it('starts empty', () => {
    const h = emptyHistory();
    expect(h.past).toEqual([]);
    expect(h.future).toEqual([]);
  });

  describe('pushHistory', () => {
    it('appends to the undo stack and clears redo', () => {
      const h = pushHistory({ past: [snap('a')], future: [snap('redo')] }, snap('b'));
      expect(h.past.map((s) => s.selectedIds[0])).toEqual(['a', 'b']);
      expect(h.future).toEqual([]);
    });

    it('caps the undo depth at HISTORY_LIMIT, dropping the oldest', () => {
      let h = emptyHistory();
      for (let i = 0; i < HISTORY_LIMIT + 5; i++) h = pushHistory(h, snap(`s${i}`));
      expect(h.past).toHaveLength(HISTORY_LIMIT);
      // Oldest five (s0..s4) were dropped; the window now starts at s5.
      expect(h.past[0].selectedIds[0]).toBe('s5');
      expect(h.past.at(-1)?.selectedIds[0]).toBe(`s${HISTORY_LIMIT + 4}`);
    });
  });

  describe('undo', () => {
    it('returns null when there is nothing to undo', () => {
      expect(undo(emptyHistory(), snap('cur'))).toBeNull();
    });

    it('pops the last snapshot and pushes current onto redo', () => {
      const h = { past: [snap('a'), snap('b')], future: [] };
      const step = undo(h, snap('cur'));
      expect(step).not.toBeNull();
      expect(step?.snapshot.selectedIds[0]).toBe('b');
      expect(step?.history.past.map((s) => s.selectedIds[0])).toEqual(['a']);
      expect(step?.history.future.map((s) => s.selectedIds[0])).toEqual(['cur']);
    });
  });

  describe('redo', () => {
    it('returns null when there is nothing to redo', () => {
      expect(redo(emptyHistory(), snap('cur'))).toBeNull();
    });

    it('pops the last future snapshot and pushes current onto past', () => {
      const h = { past: [snap('a')], future: [snap('x'), snap('y')] };
      const step = redo(h, snap('cur'));
      expect(step?.snapshot.selectedIds[0]).toBe('y');
      expect(step?.history.future.map((s) => s.selectedIds[0])).toEqual(['x']);
      expect(step?.history.past.map((s) => s.selectedIds[0])).toEqual(['a', 'cur']);
    });
  });

  it('round-trips: push → undo → redo returns to the pushed state', () => {
    const before = snap('before');
    const after = snap('after');
    const pushed = pushHistory(emptyHistory(), before);
    const undone = undo(pushed, after);
    expect(undone).not.toBeNull();
    if (undone === null) return;
    expect(undone.snapshot).toBe(before);
    const redone = redo(undone.history, before);
    expect(redone?.snapshot).toBe(after);
  });
});
