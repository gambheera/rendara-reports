import type { TemplateElement } from '@rendara/report-schema';

/**
 * The pure stacking logic behind z-order (E5-S7): bring-to-front, bring-forward,
 * send-backward and send-to-back over a band's elements.
 *
 * The renderer paints by explicit `z` (CSS `z-index`) with array order as the
 * tiebreak, so the **visual stack** is the elements sorted by `(z asc, index asc)`.
 * Each op reorders the selected ids within that stack and then **reassigns a clean
 * sequential `z`** (1-based, bottom → top) so paint order is fully determined by
 * `z` alone and never drifts. Everything here is framework-agnostic and total, so
 * the stacking maths is exhaustively unit-testable; the store only applies the
 * returned `z` changes through an immutable patch.
 */

/** The four stacking operations a user can invoke on the selection. */
export type ZOrderOp = 'front' | 'forward' | 'backward' | 'back';

/** Body elements as ids in visual stack order (bottom → top): `z` asc, index asc. */
export function stackOrder(elements: readonly TemplateElement[]): readonly string[] {
  return elements
    .map((el, index) => ({ id: el.id, z: el.z, index }))
    .sort((a, b) => a.z - b.z || a.index - b.index)
    .map((entry) => entry.id);
}

/** Moves the selected ids one slot toward the top, never crossing each other. */
function forward(order: readonly string[], selected: ReadonlySet<string>): string[] {
  const result = [...order];
  for (let i = result.length - 2; i >= 0; i -= 1) {
    if (selected.has(result[i]) && !selected.has(result[i + 1])) {
      [result[i], result[i + 1]] = [result[i + 1], result[i]];
    }
  }
  return result;
}

/** Moves the selected ids one slot toward the bottom, never crossing each other. */
function backward(order: readonly string[], selected: ReadonlySet<string>): string[] {
  const result = [...order];
  for (let i = 1; i < result.length; i += 1) {
    if (selected.has(result[i]) && !selected.has(result[i - 1])) {
      [result[i], result[i - 1]] = [result[i - 1], result[i]];
    }
  }
  return result;
}

/** The reordered stack for `op`, preserving the selection's relative order. */
function reorder(order: readonly string[], selected: ReadonlySet<string>, op: ZOrderOp): string[] {
  switch (op) {
    case 'forward':
      return forward(order, selected);
    case 'backward':
      return backward(order, selected);
    case 'front': {
      const kept = order.filter((id) => !selected.has(id));
      return [...kept, ...order.filter((id) => selected.has(id))];
    }
    case 'back': {
      const kept = order.filter((id) => !selected.has(id));
      return [...order.filter((id) => selected.has(id)), ...kept];
    }
  }
}

/**
 * Plans the `z` changes for applying `op` to `selectedIds` within `elements`.
 *
 * Returns a map of `id → new z` containing **only the elements whose `z` actually
 * changes** — so a no-op (e.g. "bring to front" on the already-topmost element, or
 * a selection with no member in this band) yields an empty map and the store can
 * skip the patch and the dirty flag. When the stack order does change, every
 * element is renumbered to a contiguous `1..n` so `z` stays tidy and total.
 */
export function planZOrder(
  elements: readonly TemplateElement[],
  selectedIds: Iterable<string>,
  op: ZOrderOp,
): ReadonlyMap<string, number> {
  const order = stackOrder(elements);
  const present = new Set(order);
  const selected = new Set<string>();
  for (const id of selectedIds) if (present.has(id)) selected.add(id);

  const changes = new Map<string, number>();
  if (selected.size === 0) return changes;

  const next = reorder(order, selected, op);
  // Unchanged order → nothing to renumber; a true no-op keeps the document clean.
  if (next.every((id, i) => id === order[i])) return changes;

  const zById = new Map(elements.map((el) => [el.id, el.z]));
  next.forEach((id, i) => {
    const newZ = i + 1;
    if (zById.get(id) !== newZ) changes.set(id, newZ);
  });
  return changes;
}
