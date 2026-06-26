import { describe, expect, it } from 'vitest';
import { introspect } from '@rendara/report-engine';
import type { ImageElement, ShapeElement, TextElement } from '@rendara/report-schema';
import {
  FORMAT_OPTIONS,
  bindElementToPath,
  buildBinding,
  collectFieldPaths,
  expressionError,
  isBindable,
  withExpr,
} from './binding-ops';

const textEl: TextElement = {
  id: 'el_t',
  type: 'text',
  frame: { xMm: 0, yMm: 0, wMm: 40, hMm: 10 },
  z: 1,
  text: 'Static',
};

const imageEl: ImageElement = {
  id: 'el_i',
  type: 'image',
  frame: { xMm: 0, yMm: 0, wMm: 40, hMm: 30 },
  z: 1,
  src: 'data:image/png;base64,xx',
  fit: 'contain',
};

const shapeEl: ShapeElement = {
  id: 'el_s',
  type: 'shape',
  shape: 'rect',
  frame: { xMm: 0, yMm: 0, wMm: 40, hMm: 25 },
  z: 1,
};

describe('isBindable', () => {
  it('is true for text and image, false for shape and data table', () => {
    expect(isBindable(textEl)).toBe(true);
    expect(isBindable(imageEl)).toBe(true);
    expect(isBindable(shapeEl)).toBe(false);
  });
});

describe('FORMAT_OPTIONS', () => {
  it('leads with a None (null token) choice and offers the brief §6 format presets', () => {
    expect(FORMAT_OPTIONS[0]).toEqual({ token: null, label: 'None' });
    const tokens = FORMAT_OPTIONS.map((o) => o.token);
    expect(tokens).toContain('currency:USD');
    expect(tokens).toContain('percent');
    expect(tokens).toContain('date:medium');
  });
});

describe('collectFieldPaths', () => {
  const sample = {
    invoice: {
      customer: { name: 'Acme', address: '1 Road' },
      total: 100,
      lineItems: [{ description: 'A', amount: 10 }],
    },
  };
  const root = introspect(sample).root;

  it('flattens every reachable field path in document order', () => {
    const paths = collectFieldPaths(root);
    expect(paths).toContain('invoice');
    expect(paths).toContain('invoice.customer.name');
    expect(paths).toContain('invoice.total');
    expect(paths).toContain('invoice.lineItems');
    // Array-element fields are reachable by their array-mapping path.
    expect(paths).toContain('invoice.lineItems.amount');
  });

  it('skips the synthetic root and the array-element placeholder (no duplicate paths)', () => {
    const paths = collectFieldPaths(root);
    expect(paths).not.toContain('');
    // The "[]" element node repeats its array's path; it must not appear twice.
    const arrayHits = paths.filter((p) => p === 'invoice.lineItems');
    expect(arrayHits).toHaveLength(1);
  });

  it('returns an empty list for a scalar root', () => {
    expect(collectFieldPaths(introspect(42).root)).toEqual([]);
  });
});

describe('buildBinding', () => {
  it('trims the expression and omits a blank format/fallback', () => {
    expect(buildBinding('  invoice.total  ', null, null)).toEqual({ expr: 'invoice.total' });
  });

  it('returns null for a blank expression (the signal to clear the binding)', () => {
    expect(buildBinding('', 'currency:USD', 'n/a')).toBeNull();
    expect(buildBinding('   ', null, null)).toBeNull();
  });

  it('includes a non-blank format token and fallback', () => {
    expect(buildBinding('invoice.total', 'currency:USD', '0.00')).toEqual({
      expr: 'invoice.total',
      format: 'currency:USD',
      fallback: '0.00',
    });
  });

  it('treats an empty-string format/fallback as absent', () => {
    expect(buildBinding('x', '', '')).toEqual({ expr: 'x' });
  });
});

describe('withExpr', () => {
  it('sets the expression on a fresh binding', () => {
    expect(withExpr(undefined, 'invoice.total')).toEqual({ expr: 'invoice.total' });
  });

  it('preserves an existing format and fallback', () => {
    const existing = { expr: 'old', format: 'currency:USD', fallback: '—' };
    expect(withExpr(existing, 'invoice.total')).toEqual({
      expr: 'invoice.total',
      format: 'currency:USD',
      fallback: '—',
    });
  });
});

describe('bindElementToPath', () => {
  it('produces a binding patch for a text element', () => {
    expect(bindElementToPath(textEl, 'invoice.customer.name')).toEqual({
      binding: { expr: 'invoice.customer.name' },
    });
  });

  it('preserves an existing format/fallback when re-binding via drag', () => {
    const bound: TextElement = {
      ...textEl,
      binding: { expr: 'old', format: 'currency:USD', fallback: '—' },
    };
    expect(bindElementToPath(bound, 'invoice.total')).toEqual({
      binding: { expr: 'invoice.total', format: 'currency:USD', fallback: '—' },
    });
  });

  it('produces a binding patch for an image element', () => {
    expect(bindElementToPath(imageEl, 'invoice.logoUrl')).toEqual({
      binding: { expr: 'invoice.logoUrl' },
    });
  });

  it('returns null for a non-bindable element (shape)', () => {
    expect(bindElementToPath(shapeEl, 'invoice.total')).toBeNull();
  });
});

describe('expressionError', () => {
  it('is null for a blank expression (no binding, not an error)', () => {
    expect(expressionError('')).toBeNull();
    expect(expressionError('   ')).toBeNull();
  });

  it('is null for a valid JSONata expression', () => {
    expect(expressionError('invoice.customer.name')).toBeNull();
    expect(expressionError('$sum(invoice.lineItems.amount)')).toBeNull();
  });

  it('returns a message for a syntactically invalid expression', () => {
    const err = expressionError('invoice.(');
    expect(err).toBeTypeOf('string');
    expect(err).not.toBe('');
  });
});
