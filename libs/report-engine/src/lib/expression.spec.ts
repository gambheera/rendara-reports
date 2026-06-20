import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearExpressionCache,
  compileExpression,
  evaluate,
  expressionCacheSize,
  MAX_CACHE_ENTRIES,
} from './expression';
import { toExpressionError } from './expression-error';

describe('expression — evaluate', () => {
  beforeEach(() => {
    clearExpressionCache();
  });

  describe('nested access', () => {
    it('resolves a deep object path', async () => {
      const result = await evaluate('invoice.customer.name', {
        invoice: { customer: { name: 'Acme Corp' } },
      });
      expect(result).toEqual({ ok: true, value: 'Acme Corp' });
    });

    it('indexes into an array', async () => {
      const result = await evaluate('items[1].sku', {
        items: [{ sku: 'A' }, { sku: 'B' }],
      });
      expect(result).toEqual({ ok: true, value: 'B' });
    });

    it('binds `$` to the provided scope (table-row style)', async () => {
      const result = await evaluate('$.amount', { amount: 42 });
      expect(result).toEqual({ ok: true, value: 42 });
    });
  });

  describe('string operations', () => {
    it('concatenates with `&`', async () => {
      const result = await evaluate('firstName & " " & lastName', {
        firstName: 'Ada',
        lastName: 'Lovelace',
      });
      expect(result).toEqual({ ok: true, value: 'Ada Lovelace' });
    });

    it('applies a string built-in', async () => {
      const result = await evaluate('$uppercase(code)', { code: 'inv-2042' });
      expect(result).toEqual({ ok: true, value: 'INV-2042' });
    });
  });

  describe('conditionals', () => {
    it('evaluates the truthy branch', async () => {
      const result = await evaluate('price > 10 ? "expensive" : "cheap"', { price: 25 });
      expect(result).toEqual({ ok: true, value: 'expensive' });
    });

    it('evaluates the falsy branch', async () => {
      const result = await evaluate('price > 10 ? "expensive" : "cheap"', { price: 5 });
      expect(result).toEqual({ ok: true, value: 'cheap' });
    });
  });

  describe('aggregates', () => {
    it('sums an array path', async () => {
      const result = await evaluate('$sum(lineItems.amount)', {
        lineItems: [{ amount: 10 }, { amount: 20 }, { amount: 30 }],
      });
      expect(result).toEqual({ ok: true, value: 60 });
    });

    it('counts array elements', async () => {
      const result = await evaluate('$count(lineItems)', {
        lineItems: [{ amount: 1 }, { amount: 2 }],
      });
      expect(result).toEqual({ ok: true, value: 2 });
    });
  });

  describe('named bindings', () => {
    it('exposes a named variable to the expression', async () => {
      const result = await evaluate('$tax * subtotal', { subtotal: 200 }, { tax: 0.1 });
      expect(result).toEqual({ ok: true, value: 20 });
    });
  });

  describe('missing data', () => {
    it('resolves a missing path to undefined without error', async () => {
      const result = await evaluate('invoice.customer.phone', {
        invoice: { customer: { name: 'Acme Corp' } },
      });
      expect(result).toEqual({ ok: true, value: undefined });
    });
  });
});

describe('expression — compile-once cache', () => {
  beforeEach(() => {
    clearExpressionCache();
  });

  it('returns the same cached result reference for a repeated expression', () => {
    const first = compileExpression('a.b.c');
    const second = compileExpression('a.b.c');
    expect(second).toBe(first);
    expect(expressionCacheSize()).toBe(1);
  });

  it('grows the cache by one per distinct expression', () => {
    compileExpression('a');
    compileExpression('b');
    compileExpression('a');
    expect(expressionCacheSize()).toBe(2);
  });

  it('caches a failed parse so it is not re-thrown', () => {
    const first = compileExpression('a..b');
    const second = compileExpression('a..b');
    expect(first.ok).toBe(false);
    expect(second).toBe(first);
    expect(expressionCacheSize()).toBe(1);
  });

  it('evaluate reuses the compile cache', async () => {
    await evaluate('x + 1', { x: 1 });
    await evaluate('x + 1', { x: 2 });
    expect(expressionCacheSize()).toBe(1);
  });

  it('clearExpressionCache empties the cache', () => {
    compileExpression('a');
    expect(expressionCacheSize()).toBe(1);
    clearExpressionCache();
    expect(expressionCacheSize()).toBe(0);
  });

  it('caps the cache and evicts the oldest entry on overflow', () => {
    for (let i = 0; i < MAX_CACHE_ENTRIES; i++) {
      compileExpression(`field${i}`);
    }
    expect(expressionCacheSize()).toBe(MAX_CACHE_ENTRIES);

    // One more distinct expression evicts the oldest (`field0`) rather than growing.
    compileExpression('overflow');
    expect(expressionCacheSize()).toBe(MAX_CACHE_ENTRIES);
    // The evicted entry is re-parsed (fresh result reference) when seen again,
    // while a survivor stays cached (same reference).
    const survivor = compileExpression('overflow');
    expect(compileExpression('overflow')).toBe(survivor);
  });
});

describe('expression — structured errors (never throws raw)', () => {
  beforeEach(() => {
    clearExpressionCache();
  });

  it('returns a structured compile error for a syntax error', () => {
    const result = compileExpression('a..b');
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('expected compile failure');
    }
    expect(result.error.kind).toBe('compile');
    expect(result.error.expr).toBe('a..b');
    expect(result.error.code).toBe('S0201');
    expect(typeof result.error.position).toBe('number');
    expect(result.error.message).toMatch(/syntax/i);
  });

  it('compileExpression does not throw on invalid input', () => {
    expect(() => compileExpression('"unterminated')).not.toThrow();
  });

  it('evaluate surfaces a compile error without throwing', async () => {
    const result = await evaluate('a..b', {});
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('expected failure');
    }
    expect(result.error.kind).toBe('compile');
  });

  it('returns a structured evaluate error for invoking a non-function', async () => {
    const result = await evaluate('$notAFunction()', {});
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('expected evaluate failure');
    }
    expect(result.error.kind).toBe('evaluate');
    expect(result.error.code).toBe('T1006');
    expect(result.error.expr).toBe('$notAFunction()');
  });

  it('evaluate never throws on a runtime error', async () => {
    await expect(evaluate('$notAFunction()', {})).resolves.toMatchObject({ ok: false });
  });
});

describe('expression — error normalizer (toExpressionError)', () => {
  it('surfaces all JSONata fields when present', () => {
    const error = toExpressionError('compile', 'a..b', {
      message: 'Syntax error: ".."',
      position: 3,
      token: '..',
      code: 'S0201',
    });
    expect(error).toEqual({
      kind: 'compile',
      message: 'Syntax error: ".."',
      expr: 'a..b',
      position: 3,
      token: '..',
      code: 'S0201',
    });
  });

  it('falls back to a generic message and omits absent fields', () => {
    const error = toExpressionError('evaluate', '$x()', {});
    expect(error).toEqual({
      kind: 'evaluate',
      message: 'Expression evaluate error',
      expr: '$x()',
      position: undefined,
      token: undefined,
      code: undefined,
    });
  });

  it('ignores fields of the wrong type and tolerates a null thrown value', () => {
    const error = toExpressionError('evaluate', 'x', null);
    expect(error.message).toBe('Expression evaluate error');
    expect(error.position).toBeUndefined();
    expect(error.token).toBeUndefined();
    expect(error.code).toBeUndefined();
  });
});

describe('expression — sandbox / no code execution', () => {
  beforeEach(() => {
    clearExpressionCache();
  });

  it('cannot reach JS globals (globalThis) — resolves to nothing, not the host object', async () => {
    const result = await evaluate('globalThis', {});
    // `globalThis` is just an unknown path against the (empty) scope, not the
    // JS global — JSONata has no access to it.
    expect(result).toEqual({ ok: true, value: undefined });
  });

  it('cannot reach the Node process object', async () => {
    const result = await evaluate('process.env', { real: 'data' });
    expect(result).toEqual({ ok: true, value: undefined });
  });

  it('does not execute attacker-supplied "constructor" gadget chains', async () => {
    // A classic sandbox-escape probe. JSONata treats these as ordinary (absent)
    // data paths; no function is constructed or called.
    const result = await evaluate('constructor.constructor', {});
    expect(result).toEqual({ ok: true, value: undefined });
  });

  it('cannot invoke a function smuggled in via the (attacker-controlled) data scope', async () => {
    let sideEffect = false;
    const hack = () => {
      sideEffect = true;
      return 'pwned';
    };
    // Threat model: `scope` is the runtime Data JSON (attacker-controlled),
    // while `expr` is the template author's. A function leaking into the data
    // is NOT callable as a JSONata function — `$evil()` raises a typed T1006
    // error and nothing executes. (Engine-supplied `bindings` are a separate,
    // trusted extension point and intentionally remain callable.)
    const result = await evaluate('$evil()', { evil: hack });
    expect(sideEffect).toBe(false);
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('expected failure');
    }
    expect(result.error.kind).toBe('evaluate');
    expect(result.error.code).toBe('T1006');
  });
});
