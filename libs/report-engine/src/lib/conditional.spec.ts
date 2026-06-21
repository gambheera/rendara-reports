import type { ElementStyle } from '@rendara/report-schema';
import { beforeEach, describe, expect, it } from 'vitest';

import { clearExpressionCache } from './expression';
import {
  evaluateVisibility,
  jsonataBoolean,
  resolveConditionalStyle,
  type StyleRule,
} from './conditional';

// Each test gets a clean compile cache so cross-test leakage can't mask a bug.
beforeEach(() => {
  clearExpressionCache();
});

describe('jsonataBoolean — JSONata $boolean semantics', () => {
  it.each([
    { value: null, expected: false },
    { value: undefined, expected: false },
    { value: true, expected: true },
    { value: false, expected: false },
    { value: 0, expected: false },
    { value: NaN, expected: false },
    { value: 1, expected: true },
    { value: -2, expected: true },
    { value: '', expected: false },
    { value: 'x', expected: true },
    { value: 'false', expected: true }, // non-empty string is truthy
    { value: [], expected: false },
    { value: [0, '', false], expected: false }, // no element casts to true
    { value: [0, 1], expected: true }, // some element casts to true
    { value: [[false], [true]], expected: true }, // recursive
    { value: {}, expected: false },
    { value: { a: 1 }, expected: true },
  ])('coerces $value → $expected', ({ value, expected }) => {
    expect(jsonataBoolean(value)).toBe(expected);
  });

  it('treats a function as false', () => {
    expect(jsonataBoolean(() => true)).toBe(false);
  });

  it('treats other primitives (symbol, bigint) as false', () => {
    expect(jsonataBoolean(Symbol('x'))).toBe(false);
    expect(jsonataBoolean(10n)).toBe(false);
  });
});

describe('evaluateVisibility — absent condition', () => {
  it.each([{ when: null }, { when: undefined }, { when: '' }, { when: '   ' }])(
    'is visible (no evaluation) when visibleWhen is $when',
    async ({ when }) => {
      expect(await evaluateVisibility(when, {})).toEqual({ visible: true });
    },
  );
});

describe('evaluateVisibility — truthy / falsy conditions', () => {
  it('shows when the condition is truthy', async () => {
    const res = await evaluateVisibility('invoice.isPaid', { invoice: { isPaid: true } });
    expect(res).toEqual({ visible: true });
  });

  it('hides when the condition is falsy', async () => {
    const res = await evaluateVisibility('invoice.isPaid', { invoice: { isPaid: false } });
    expect(res).toEqual({ visible: false });
  });

  it('hides when the condition resolves to a missing path (clean undefined, not an error)', async () => {
    const res = await evaluateVisibility('invoice.isPaid', { invoice: {} });
    expect(res).toEqual({ visible: false });
    expect(res.error).toBeUndefined();
  });

  it('evaluates a comparison expression', async () => {
    expect(await evaluateVisibility('total > 100', { total: 250 })).toEqual({ visible: true });
    expect(await evaluateVisibility('total > 100', { total: 5 })).toEqual({ visible: false });
  });

  it('hides on an empty-array result and shows on a non-empty one', async () => {
    expect(await evaluateVisibility('items', { items: [] })).toEqual({ visible: false });
    expect(await evaluateVisibility('items', { items: [1] })).toEqual({ visible: true });
  });
});

describe('evaluateVisibility — error fails safe', () => {
  it('defaults to visible on a compile error and returns the error', async () => {
    const res = await evaluateVisibility('total >', { total: 1 });
    expect(res.visible).toBe(true);
    expect(res.error?.kind).toBe('compile');
  });

  it('defaults to visible on a runtime error and returns the error', async () => {
    // Invoking a non-function is a runtime (evaluate) error in JSONata.
    const res = await evaluateVisibility('value()', { value: 5 });
    expect(res.visible).toBe(true);
    expect(res.error?.kind).toBe('evaluate');
  });

  it('honours an overridden defaultOnError (hide on error)', async () => {
    const res = await evaluateVisibility('total >', { total: 1 }, { defaultOnError: false });
    expect(res.visible).toBe(false);
    expect(res.error?.kind).toBe('compile');
  });
});

describe('resolveConditionalStyle — no-op cases', () => {
  it('returns the base unchanged when there are no rules', async () => {
    const base: ElementStyle = { color: '#111' };
    const res = await resolveConditionalStyle(base, undefined, {});
    expect(res.style).toEqual({ color: '#111' });
    expect(res.errors).toEqual([]);
  });

  it('returns an empty style when base and rules are absent', async () => {
    const res = await resolveConditionalStyle(undefined, undefined, {});
    expect(res.style).toEqual({});
    expect(res.errors).toEqual([]);
  });

  it('does not apply a rule whose condition is falsy', async () => {
    const base: ElementStyle = { color: '#111' };
    const rules: StyleRule[] = [{ when: 'overdue', style: { color: '#b00' } }];
    const res = await resolveConditionalStyle(base, rules, { overdue: false });
    expect(res.style).toEqual({ color: '#111' });
  });
});

describe('resolveConditionalStyle — matching rules', () => {
  it('applies a matching rule over the base', async () => {
    const base: ElementStyle = { color: '#111' };
    const rules: StyleRule[] = [{ when: 'overdue', style: { color: '#b00' } }];
    const res = await resolveConditionalStyle(base, rules, { overdue: true });
    expect(res.style).toEqual({ color: '#b00' });
    expect(res.errors).toEqual([]);
  });

  it('applies rules in order so a later match wins on a shared field', async () => {
    const rules: StyleRule[] = [
      { when: 'a', style: { color: '#111' } },
      { when: 'b', style: { color: '#222' } },
    ];
    const res = await resolveConditionalStyle({}, rules, { a: true, b: true });
    expect(res.style).toEqual({ color: '#222' });
  });

  it('accumulates disjoint fields from multiple matching rules', async () => {
    const rules: StyleRule[] = [
      { when: 'a', style: { color: '#111' } },
      { when: 'b', style: { fill: '#eee' } },
    ];
    const res = await resolveConditionalStyle({}, rules, { a: true, b: true });
    expect(res.style).toEqual({ color: '#111', fill: '#eee' });
  });

  it('deep-merges nested sub-objects, preserving sibling fields', async () => {
    const base: ElementStyle = {
      font: { family: 'Inter', sizePt: 10 },
      border: { bottom: { widthMm: 0.2, color: '#ccc' } },
    };
    const rules: StyleRule[] = [
      { when: 'highlight', style: { font: { weight: 'bold' }, border: { top: { widthMm: 0.3 } } } },
    ];
    const res = await resolveConditionalStyle(base, rules, { highlight: true });
    expect(res.style).toEqual({
      font: { family: 'Inter', sizePt: 10, weight: 'bold' },
      border: { bottom: { widthMm: 0.2, color: '#ccc' }, top: { widthMm: 0.3 } },
    });
  });

  it('does not mutate the base style object', async () => {
    const base: ElementStyle = { font: { family: 'Inter' } };
    const rules: StyleRule[] = [{ when: 'x', style: { font: { weight: 'bold' } } }];
    await resolveConditionalStyle(base, rules, { x: true });
    expect(base).toEqual({ font: { family: 'Inter' } });
  });
});

describe('resolveConditionalStyle — error fails safe (rule skipped)', () => {
  it('skips an errored rule, keeps the base, and collects the error', async () => {
    const base: ElementStyle = { color: '#111' };
    const rules: StyleRule[] = [{ when: 'total >', style: { color: '#b00' } }];
    const res = await resolveConditionalStyle(base, rules, { total: 1 });
    expect(res.style).toEqual({ color: '#111' });
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0].kind).toBe('compile');
  });

  it('still applies a later valid rule after skipping an errored one', async () => {
    const rules: StyleRule[] = [
      { when: 'bad >', style: { color: '#b00' } },
      { when: 'ok', style: { color: '#0a0' } },
    ];
    const res = await resolveConditionalStyle({}, rules, { ok: true });
    expect(res.style).toEqual({ color: '#0a0' });
    expect(res.errors).toHaveLength(1);
  });
});

describe('conditional engine — no eval/Function execution (sandbox)', () => {
  it('cannot reach JS globals from a condition — resolves to a benign falsy, not the host', async () => {
    // A template-supplied condition must not touch the host. `globalThis` is just
    // an absent data path to JSONata (no global access), so it resolves cleanly
    // to undefined → hidden, with no error and nothing executed.
    const res = await evaluateVisibility('globalThis', {});
    expect(res).toEqual({ visible: false });
  });

  it('does not execute a function smuggled in via the data scope', async () => {
    // Threat model: `scope` is attacker-controlled Data JSON; a function leaked
    // into it is not callable. The attempt errors and fails safe to visible.
    let sideEffect = false;
    const res = await evaluateVisibility('$evil()', {
      evil: () => {
        sideEffect = true;
        return true;
      },
    });
    expect(sideEffect).toBe(false);
    expect(res.visible).toBe(true);
    expect(res.error?.kind).toBe('evaluate');
  });
});
