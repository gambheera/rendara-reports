import { describe, expect, it } from 'vitest';
import type { FieldNode } from '@rendara/report-engine';
import { filterFieldTree, parseSampleData } from './sample-data';

describe('parseSampleData', () => {
  it('parses and introspects a nested object document', () => {
    const result = parseSampleData(
      JSON.stringify({ invoice: { customer: { name: 'Acme', id: 7 } } }),
      'invoice-sample.json',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.fileName).toBe('invoice-sample.json');
    expect(result.data.value).toEqual({ invoice: { customer: { name: 'Acme', id: 7 } } });
    const invoice = result.data.root.children?.[0];
    expect(invoice?.name).toBe('invoice');
    expect(invoice?.kind).toBe('object');
    const name = invoice?.children?.[0].children?.[0];
    expect(name?.path).toBe('invoice.customer.name');
    expect(name?.scalarType).toBe('string');
  });

  it('introspects an array source with row-relative paths', () => {
    const result = parseSampleData(
      JSON.stringify({ lineItems: [{ desc: 'A', amount: 10 }] }),
      'data.json',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const array = result.data.root.children?.[0];
    expect(array?.kind).toBe('array');
    const element = array?.children?.[0];
    const amount = element?.children?.find((c) => c.name === 'amount');
    expect(amount?.rowPath).toBe('$.amount');
    expect(amount?.path).toBe('lineItems.amount');
  });

  it('reports a friendly error for invalid JSON instead of throwing', () => {
    const result = parseSampleData('{ not valid', 'broken.json');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/isn't valid JSON/);
  });

  it('reports a friendly error for empty / non-JSON text', () => {
    const result = parseSampleData('', 'empty.json');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/isn't valid JSON/);
  });
});

/** A tiny three-level object tree for filter tests. */
function sampleTree(): FieldNode {
  const built = parseSampleData(
    JSON.stringify({ invoice: { customer: { name: 'Acme' }, total: 42 } }),
    'f.json',
  );
  if (!built.ok) throw new Error('fixture parse failed');
  return built.data.root;
}

describe('filterFieldTree', () => {
  it('returns the tree unchanged for an empty / whitespace query', () => {
    const root = sampleTree();
    expect(filterFieldTree(root, '')).toBe(root);
    expect(filterFieldTree(root, '   ')).toBe(root);
  });

  it('keeps a matched leaf and all of its ancestors', () => {
    const filtered = filterFieldTree(sampleTree(), 'name');
    const invoice = filtered?.children?.[0];
    const customer = invoice?.children?.[0];
    expect(invoice?.name).toBe('invoice');
    expect(customer?.name).toBe('customer');
    expect(customer?.children).toHaveLength(1);
    expect(customer?.children?.[0].name).toBe('name');
    // The sibling `total` branch is pruned away.
    expect(invoice?.children?.some((c) => c.name === 'total')).toBe(false);
  });

  it('keeps a whole subtree when a container name matches', () => {
    const filtered = filterFieldTree(sampleTree(), 'customer');
    const customer = filtered?.children?.[0].children?.[0];
    expect(customer?.name).toBe('customer');
    expect(customer?.children?.[0].name).toBe('name');
  });

  it('matches case-insensitively and on the full path', () => {
    expect(filterFieldTree(sampleTree(), 'INVOICE.TOTAL')).not.toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(filterFieldTree(sampleTree(), 'zzz')).toBeNull();
  });
});
