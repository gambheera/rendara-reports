import { describe, expect, it } from 'vitest';
import type { ImageElement, RendaraTemplate, TextElement } from '@rendara/report-schema';
import { createEmptyTemplate } from './template-ops';
import { resolveBoundValues } from './binding-preview';

/** Builds a one-body-element template over the empty-document defaults. */
function templateWith(...elements: (TextElement | ImageElement)[]): RendaraTemplate {
  const base = createEmptyTemplate();
  return { ...base, body: { elements } };
}

const data = {
  invoice: {
    customer: { name: 'Acme Corp' },
    total: 1234.5,
    lineItems: [{ amount: 10 }, { amount: 20 }],
  },
};

describe('resolveBoundValues', () => {
  it('resolves a bound text element to its formatted display string', async () => {
    const el: TextElement = {
      id: 'el_name',
      type: 'text',
      frame: { xMm: 0, yMm: 0, wMm: 40, hMm: 10 },
      z: 1,
      binding: { expr: 'invoice.customer.name' },
    };
    const map = await resolveBoundValues(templateWith(el), data);
    expect(map.get('el_name')).toBe('Acme Corp');
  });

  it('applies the binding format token (currency)', async () => {
    const el: TextElement = {
      id: 'el_total',
      type: 'text',
      frame: { xMm: 0, yMm: 0, wMm: 40, hMm: 10 },
      z: 1,
      binding: { expr: 'invoice.total', format: 'currency:USD' },
    };
    const map = await resolveBoundValues(templateWith(el), data, { locale: 'en-US' });
    expect(map.get('el_total')).toBe('$1,234.50');
  });

  it('resolves an aggregate expression', async () => {
    const el: TextElement = {
      id: 'el_sum',
      type: 'text',
      frame: { xMm: 0, yMm: 0, wMm: 40, hMm: 10 },
      z: 1,
      binding: { expr: '$sum(invoice.lineItems.amount)' },
    };
    const map = await resolveBoundValues(templateWith(el), data);
    expect(map.get('el_sum')).toBe('30');
  });

  it('falls back for a missing path and uses the fallback literal', async () => {
    const el: TextElement = {
      id: 'el_missing',
      type: 'text',
      frame: { xMm: 0, yMm: 0, wMm: 40, hMm: 10 },
      z: 1,
      binding: { expr: 'invoice.nope', fallback: 'n/a' },
    };
    const map = await resolveBoundValues(templateWith(el), data);
    expect(map.get('el_missing')).toBe('n/a');
  });

  it('omits static (unbound) elements — the renderer keeps their literal value', async () => {
    const bound: TextElement = {
      id: 'el_bound',
      type: 'text',
      frame: { xMm: 0, yMm: 0, wMm: 40, hMm: 10 },
      z: 1,
      binding: { expr: 'invoice.customer.name' },
    };
    const staticEl: TextElement = {
      id: 'el_static',
      type: 'text',
      frame: { xMm: 0, yMm: 20, wMm: 40, hMm: 10 },
      z: 2,
      text: 'Literal',
    };
    const map = await resolveBoundValues(templateWith(bound, staticEl), data);
    expect(map.has('el_bound')).toBe(true);
    expect(map.has('el_static')).toBe(false);
  });

  it('is empty for a template with no bound elements', async () => {
    const map = await resolveBoundValues(createEmptyTemplate(), data);
    expect(map.size).toBe(0);
  });
});
