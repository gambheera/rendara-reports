import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ARRAY_SAMPLE_SIZE,
  DEFAULT_MAX_DEPTH,
  DEFAULT_MAX_KEYS,
  DEFAULT_MAX_NODES,
  introspect,
  type FieldNode,
} from './introspect';

/** Finds a direct child by name (test readability helper). */
function child(node: FieldNode, name: string): FieldNode {
  const found = node.children?.find((c) => c.name === name);
  if (!found) {
    throw new Error(`no child '${name}' on node '${node.name}'`);
  }
  return found;
}

/** The single element node ('[]') of an array node. */
function element(node: FieldNode): FieldNode {
  expect(node.kind).toBe('array');
  const el = node.children?.[0];
  if (!el) {
    throw new Error(`array node '${node.name}' has no element`);
  }
  return el;
}

describe('introspect — scalars and the root', () => {
  it.each([
    { value: 'hi', scalarType: 'string' },
    { value: 42, scalarType: 'number' },
    { value: true, scalarType: 'boolean' },
    { value: null, scalarType: 'null' },
  ] as const)('classifies the root scalar $value', ({ value, scalarType }) => {
    const { root, nodeCount, truncated } = introspect(value);
    expect(root.kind).toBe('scalar');
    expect(root.scalarType).toBe(scalarType);
    expect(root.path).toBe('');
    expect(root.children).toBeUndefined();
    expect(nodeCount).toBe(1);
    expect(truncated).toBe(false);
  });

  it('treats undefined as a string scalar (defensive, exotic input)', () => {
    expect(introspect(undefined).root.scalarType).toBe('string');
  });
});

describe('introspect — nested objects and path building', () => {
  const data = {
    invoice: {
      number: 'INV-2042',
      customer: { name: 'Acme Corp', vip: true },
    },
  };

  it('builds object nodes with full JSONata paths', () => {
    const { root } = introspect(data);
    expect(root.kind).toBe('object');

    const invoice = child(root, 'invoice');
    expect(invoice.kind).toBe('object');
    expect(invoice.path).toBe('invoice');

    const customer = child(invoice, 'customer');
    expect(customer.path).toBe('invoice.customer');

    const name = child(customer, 'name');
    expect(name.kind).toBe('scalar');
    expect(name.scalarType).toBe('string');
    expect(name.path).toBe('invoice.customer.name');

    expect(child(customer, 'vip').scalarType).toBe('boolean');
  });

  it('counts every node including the root', () => {
    // root + invoice + number + customer + name + vip = 6
    expect(introspect(data).nodeCount).toBe(6);
  });

  it('bracket-quotes keys that are not bare identifiers', () => {
    const { root } = introspect({ 'first name': 1, 'a.b': 2 });
    expect(child(root, 'first name').path).toBe('`first name`');
    expect(child(root, 'a.b').path).toBe('`a.b`');
  });
});

describe('introspect — arrays of objects (table sources)', () => {
  const data = {
    invoice: {
      lineItems: [
        { description: 'Widget', amount: 10 },
        { description: 'Gadget', amount: 20 },
      ],
    },
  };

  it('detects the element shape and exposes both path forms', () => {
    const { root } = introspect(data);
    const lineItems = child(child(root, 'invoice'), 'lineItems');
    expect(lineItems.kind).toBe('array');
    expect(lineItems.path).toBe('invoice.lineItems');

    const el = element(lineItems);
    expect(el.name).toBe('[]');
    expect(el.kind).toBe('object');

    const amount = child(el, 'amount');
    expect(amount.kind).toBe('scalar');
    expect(amount.scalarType).toBe('number');
    // mapped path (used by aggregates: $sum(invoice.lineItems.amount))
    expect(amount.path).toBe('invoice.lineItems.amount');
    // row-relative path (used by a table column cell.expr)
    expect(amount.rowPath).toBe('$.amount');

    expect(child(el, 'description').rowPath).toBe('$.description');
  });

  it('marks no fields optional when every element has the same keys', () => {
    const { root } = introspect(data);
    const el = element(child(child(root, 'invoice'), 'lineItems'));
    expect(el.children?.every((c) => c.optional === undefined)).toBe(true);
  });
});

describe('introspect — ragged arrays', () => {
  it('unions keys across elements and flags missing ones optional', () => {
    const { root } = introspect({
      rows: [
        { a: 1, b: 2 },
        { a: 3, c: 4 },
        { a: 5 },
      ],
    });
    const el = element(child(root, 'rows'));

    // first-seen order: a, b, c
    expect(el.children?.map((c) => c.name)).toEqual(['a', 'b', 'c']);

    expect(child(el, 'a').optional).toBeUndefined(); // present in all
    expect(child(el, 'b').optional).toBe(true); // missing from 2 of 3
    expect(child(el, 'c').optional).toBe(true);
  });

  it('walks the first element that actually has a key for its shape', () => {
    const { root } = introspect({
      rows: [{ a: 1 }, { a: 2, nested: { deep: 'x' } }],
    });
    const el = element(child(root, 'rows'));
    const nested = child(el, 'nested');
    expect(nested.kind).toBe('object');
    expect(child(nested, 'deep').scalarType).toBe('string');
    expect(child(nested, 'deep').rowPath).toBe('$.nested.deep');
  });
});

describe('introspect — scalar, empty, and mixed arrays', () => {
  it('describes an array of scalars by a single scalar element', () => {
    const { root } = introspect({ tags: ['a', 'b', 'c'] });
    const el = element(child(root, 'tags'));
    expect(el.kind).toBe('scalar');
    expect(el.scalarType).toBe('string');
    expect(el.name).toBe('[]');
    expect(el.rowPath).toBe('$');
  });

  it('handles an empty array with no element children', () => {
    const { root } = introspect({ items: [] });
    const items = child(root, 'items');
    expect(items.kind).toBe('array');
    expect(items.children).toBeUndefined();
  });

  it('resolves a mixed array to its dominant kind (scalar wins the tie)', () => {
    const { root } = introspect({ mix: [1, 2, { a: 1 }] });
    const el = element(child(root, 'mix'));
    expect(el.kind).toBe('scalar');
  });

  it('resolves an object-dominant mixed array to an object element', () => {
    const { root } = introspect({ mix: [{ a: 1 }, { b: 2 }, 5] });
    const el = element(child(root, 'mix'));
    expect(el.kind).toBe('object');
  });

  it('resolves an array of arrays to an array element', () => {
    const { root } = introspect({ matrix: [[1, 2], [3, 4]] });
    const el = element(child(root, 'matrix'));
    expect(el.kind).toBe('array');
    expect(element(el).scalarType).toBe('number');
  });

  it('opens a fresh row scope for each nested array of objects', () => {
    const { root } = introspect({
      orders: [{ lines: [{ sku: 'X' }] }],
    });
    const order = element(child(root, 'orders'));
    const lines = child(order, 'lines');
    expect(lines.rowPath).toBe('$.lines'); // the inner array, relative to an order row
    const line = element(lines);
    // mapped path keeps the full chain (for aggregates over all lines)…
    expect(child(line, 'sku').path).toBe('orders.lines.sku');
    // …while rowPath restarts at the inner row scope (a nested table's cell expr).
    expect(child(line, 'sku').rowPath).toBe('$.sku');
  });
});

describe('introspect — limits keep the walk responsive', () => {
  it('applies documented defaults when no options are given', () => {
    // sanity: defaults are sensible positive numbers
    expect(DEFAULT_MAX_DEPTH).toBeGreaterThan(0);
    expect(DEFAULT_MAX_NODES).toBeGreaterThan(0);
    expect(DEFAULT_MAX_KEYS).toBeGreaterThan(0);
    expect(DEFAULT_ARRAY_SAMPLE_SIZE).toBeGreaterThan(0);
  });

  it('stops descending at maxDepth and flags the node truncated', () => {
    const data = { a: { b: { c: { d: 1 } } } };
    const { root, truncated } = introspect(data, { maxDepth: 2 });
    const a = child(root, 'a'); // depth 1
    const b = child(a, 'b'); // depth 2 — at the cap, not descended
    expect(b.kind).toBe('object');
    expect(b.truncated).toBe(true);
    expect(b.children).toBeUndefined();
    expect(truncated).toBe(true);
  });

  it('caps properties read per object at maxKeys', () => {
    const obj: Record<string, number> = {};
    for (let i = 0; i < 10; i++) {
      obj[`k${i}`] = i;
    }
    const { root, truncated } = introspect(obj, { maxKeys: 3 });
    expect(root.children).toHaveLength(3);
    expect(root.truncated).toBe(true);
    expect(truncated).toBe(true);
  });

  it('samples only arraySampleSize elements to infer the shape', () => {
    const rows = Array.from({ length: 50 }, (_, i) =>
      i < 49 ? { a: i } : { a: i, late: true },
    );
    const { root, truncated } = introspect({ rows }, { arraySampleSize: 10 });
    const el = element(child(root, 'rows'));
    // the 'late' key only appears past the sample window, so it is not seen
    expect(el.children?.map((c) => c.name)).toEqual(['a']);
    expect(truncated).toBe(true);
  });

  it('enforces the huge-object guard via maxNodes (bounded nodeCount)', () => {
    // A wide, deep structure that would explode without the guard.
    const huge: Record<string, unknown> = {};
    for (let i = 0; i < 100; i++) {
      const branch: Record<string, unknown> = {};
      for (let j = 0; j < 100; j++) {
        branch[`f${j}`] = j;
      }
      huge[`b${i}`] = branch;
    }
    const { nodeCount, truncated } = introspect(huge, { maxNodes: 50 });
    expect(truncated).toBe(true);
    // never produces more than the cap (+1 root counted up front).
    expect(nodeCount).toBeLessThanOrEqual(51);
  });

  it('stops creating array-element fields when the node budget runs out', () => {
    // Root(1) + rows array(2) + element(3) leaves room for ~2 fields before cap.
    const { truncated } = introspect(
      { rows: [{ a: 1, b: 2, c: 3, d: 4 }] },
      { maxNodes: 5 },
    );
    expect(truncated).toBe(true);
  });

  it('flags truncation when even the array element cannot be created', () => {
    const { root, truncated } = introspect({ rows: [{ a: 1 }] }, { maxNodes: 2 });
    const rows = child(root, 'rows');
    expect(rows.kind).toBe('array');
    expect(rows.truncated).toBe(true);
    expect(truncated).toBe(true);
  });

  it('stops creating a scalar array element when the node budget runs out', () => {
    const { root, truncated } = introspect({ tags: ['a', 'b'] }, { maxNodes: 2 });
    const tags = child(root, 'tags');
    expect(tags.kind).toBe('array');
    expect(tags.truncated).toBe(true);
    expect(truncated).toBe(true);
  });
});
