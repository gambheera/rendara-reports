import { describe, expect, it } from 'vitest';
import type { TemplateElement } from '@rendara/report-schema';
import { planZOrder, stackOrder, type ZOrderOp } from './z-order-ops';

/** A minimal element carrying just the id + z the stacking maths reads. */
function el(id: string, z: number): TemplateElement {
  return { id, type: 'text', frame: { xMm: 0, yMm: 0, wMm: 10, hMm: 5 }, z, text: id };
}

/** Applies a plan to elements and returns the resulting stack order (bottom → top). */
function orderAfter(elements: readonly TemplateElement[], op: ZOrderOp, ids: string[]): string[] {
  const changes = planZOrder(elements, ids, op);
  const patched = elements.map((e) => {
    const z = changes.get(e.id);
    return z === undefined ? e : { ...e, z };
  });
  return [...stackOrder(patched)];
}

describe('stackOrder', () => {
  it('orders by z ascending, then array index for ties', () => {
    expect(stackOrder([el('a', 2), el('b', 1), el('c', 2)])).toEqual(['b', 'a', 'c']);
  });
});

describe('planZOrder', () => {
  // All three share z, so the visual stack is the array order [a, b, c].
  const flat = [el('a', 1), el('b', 1), el('c', 1)];

  it('brings a single element to the front (top of the stack)', () => {
    expect(orderAfter(flat, 'front', ['a'])).toEqual(['b', 'c', 'a']);
  });

  it('sends a single element to the back (bottom of the stack)', () => {
    expect(orderAfter(flat, 'back', ['c'])).toEqual(['c', 'a', 'b']);
  });

  it('brings an element forward one slot', () => {
    expect(orderAfter(flat, 'forward', ['a'])).toEqual(['b', 'a', 'c']);
  });

  it('sends an element backward one slot', () => {
    expect(orderAfter(flat, 'backward', ['c'])).toEqual(['a', 'c', 'b']);
  });

  it('moves a multi-selection as a contiguous block, preserving relative order', () => {
    expect(orderAfter(flat, 'front', ['a', 'b'])).toEqual(['c', 'a', 'b']);
    expect(orderAfter(flat, 'forward', ['a', 'b'])).toEqual(['c', 'a', 'b']);
  });

  it('never lets selected elements cross each other when stepping', () => {
    // a and c selected, b between them: forward lifts a above b; c is already top.
    expect(orderAfter(flat, 'forward', ['a', 'c'])).toEqual(['b', 'a', 'c']);
  });

  it('is a no-op when the element is already at the requested extreme', () => {
    expect(planZOrder(flat, ['c'], 'front').size).toBe(0);
    expect(planZOrder(flat, ['a'], 'back').size).toBe(0);
  });

  it('ignores ids not present in the band and an empty selection', () => {
    expect(planZOrder(flat, ['missing'], 'front').size).toBe(0);
    expect(planZOrder(flat, [], 'front').size).toBe(0);
  });

  it('only reports the elements whose z actually changes', () => {
    // Forward of `a` over `b`: a→2 and c→3 change; b keeps z 1.
    const changes = planZOrder(flat, ['a'], 'forward');
    expect(changes.get('a')).toBe(2);
    expect(changes.get('c')).toBe(3);
    expect(changes.has('b')).toBe(false);
  });

  it('renumbers to a contiguous 1..n stack so render order follows z', () => {
    const messy = [el('a', 10), el('b', 5), el('c', 7)]; // stack: b, c, a
    const order = orderAfter(messy, 'front', ['b']);
    expect(order).toEqual(['c', 'a', 'b']);
  });
});
