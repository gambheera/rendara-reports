import type { RendaraTemplate } from '@rendara/report-schema';
import type { Groups } from './group-ops';

/**
 * One undoable point in the editing timeline (E5-S9): the slice of designer state
 * that an undo/redo restores. It is **only** the document model the user edits —
 * the {@link RendaraTemplate}, the current selection, and the (view-state)
 * grouping — so undoing a delete brings the element back *selected*, and undoing a
 * group ungroups. Pure view preferences (zoom, snapping) are deliberately excluded:
 * undo should never jump the zoom level.
 */
export interface HistorySnapshot {
  readonly template: RendaraTemplate;
  readonly selectedIds: readonly string[];
  readonly groups: Groups;
}

/**
 * The command/history stack: `past` holds older snapshots (most recent last, the
 * next one an undo restores) and `future` holds redo snapshots (next redo last).
 * Both are immutable; every operation returns a new {@link History}.
 */
export interface History {
  readonly past: readonly HistorySnapshot[];
  readonly future: readonly HistorySnapshot[];
}

/**
 * Maximum number of undo steps kept. Bounds memory for long editing sessions;
 * once exceeded, the oldest snapshot is dropped (you can no longer undo past it).
 */
export const HISTORY_LIMIT = 100;

/** A fresh, empty history (nothing to undo or redo). */
export function emptyHistory(): History {
  return { past: [], future: [] };
}

/**
 * Records `prev` (the state *before* an edit) as the new top of the undo stack,
 * clearing the redo stack — a fresh edit always invalidates any redo branch. The
 * undo stack is capped at {@link HISTORY_LIMIT}, dropping the oldest entry.
 */
export function pushHistory(history: History, prev: HistorySnapshot): History {
  const past = [...history.past, prev];
  return {
    past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
    future: [],
  };
}

/** The result of an undo/redo: the snapshot to apply plus the advanced history. */
export interface HistoryStep {
  readonly snapshot: HistorySnapshot;
  readonly history: History;
}

/**
 * Steps back one edit: returns the previous snapshot to restore and a history
 * with `current` pushed onto the redo stack, or `null` when there is nothing to
 * undo. `current` is the live state at the moment of the undo.
 */
export function undo(history: History, current: HistorySnapshot): HistoryStep | null {
  const snapshot = history.past.at(-1);
  if (snapshot === undefined) return null;
  return {
    snapshot,
    history: {
      past: history.past.slice(0, -1),
      future: [...history.future, current],
    },
  };
}

/**
 * Steps forward one edit: returns the next snapshot to restore and a history with
 * `current` pushed back onto the undo stack, or `null` when there is nothing to
 * redo.
 */
export function redo(history: History, current: HistorySnapshot): HistoryStep | null {
  const snapshot = history.future.at(-1);
  if (snapshot === undefined) return null;
  return {
    snapshot,
    history: {
      past: [...history.past, current],
      future: history.future.slice(0, -1),
    },
  };
}
