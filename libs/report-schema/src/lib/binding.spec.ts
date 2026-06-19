import { describe, expect, expectTypeOf, it } from 'vitest';
import type { ElementBinding } from './binding';
import { isValidBinding, validateBinding } from './binding-validation';

/** A fully-populated, valid binding touching every slot. */
const fullBinding = {
  expr: 'invoice.customer.name',
  format: 'currency:USD',
  fallback: '—',
} satisfies ElementBinding;

describe('binding fixtures validate (E1-S5 QA)', () => {
  it('a fully-populated binding is valid', () => {
    expect(validateBinding(fullBinding)).toEqual([]);
    expect(isValidBinding(fullBinding)).toBe(true);
  });

  it('an expr-only binding is valid (format/fallback are optional)', () => {
    expect(isValidBinding({ expr: '$.amount' })).toBe(true);
  });

  it('a null format token means "no formatting" and is valid', () => {
    expect(isValidBinding({ expr: '$.amount', format: null })).toBe(true);
  });

  it('a null fallback means "no fallback" and is valid', () => {
    expect(isValidBinding({ expr: '$.amount', fallback: null })).toBe(true);
  });

  it('an empty-string fallback is a legal "show nothing"', () => {
    expect(isValidBinding({ expr: 'invoice.customer.name', fallback: '' })).toBe(true);
  });

  it('an aggregate (footer/subtotal) expression is valid', () => {
    expect(isValidBinding({ expr: '$sum(invoice.lineItems.amount)', format: 'currency:USD' })).toBe(
      true,
    );
  });
});

describe('expr validation (E1-S5)', () => {
  it('rejects an empty expression', () => {
    expect(validateBinding({ expr: '' })).toContainEqual(
      expect.objectContaining({ path: 'binding.expr' }),
    );
  });

  it('rejects a non-string expression', () => {
    const bad = { expr: 42 as never } satisfies ElementBinding;
    expect(validateBinding(bad)).toContainEqual(expect.objectContaining({ path: 'binding.expr' }));
  });
});

describe('format-token validation (E1-S5)', () => {
  it('rejects an empty format token', () => {
    expect(validateBinding({ expr: '$.amount', format: '' })).toContainEqual(
      expect.objectContaining({ path: 'binding.format' }),
    );
  });

  it('rejects a non-string format token', () => {
    const bad = { expr: '$.amount', format: 42 as never } satisfies ElementBinding;
    expect(validateBinding(bad)).toContainEqual(
      expect.objectContaining({ path: 'binding.format' }),
    );
  });
});

describe('fallback validation (E1-S5)', () => {
  it('rejects a non-string fallback', () => {
    const bad = { expr: '$.amount', fallback: 0 as never } satisfies ElementBinding;
    expect(validateBinding(bad)).toContainEqual(
      expect.objectContaining({ path: 'binding.fallback' }),
    );
  });

  it('reports expr, format, and fallback problems together', () => {
    const bad = {
      expr: '',
      format: 7 as never,
      fallback: true as never,
    } satisfies ElementBinding;
    const paths = validateBinding(bad).map((error) => error.path);
    expect(paths).toContain('binding.expr');
    expect(paths).toContain('binding.format');
    expect(paths).toContain('binding.fallback');
  });
});

describe('basePath (E1-S5)', () => {
  it('defaults to "binding"', () => {
    expect(validateBinding({ expr: '' })[0]?.path).toBe('binding.expr');
  });

  it('prefixes every reported path with the supplied basePath', () => {
    expect(validateBinding({ expr: '' }, 'el_table.columns[0].cell')[0]?.path).toBe(
      'el_table.columns[0].cell.expr',
    );
  });
});

/**
 * Type-level checks: the well-typed binding is what the renderer/engine will
 * consume. The typed local is the compile-time assignability proof; it compiles
 * only while the type matches.
 */
describe('binding model types (E1-S5)', () => {
  it('accepts a well-typed binding', () => {
    const binding: ElementBinding = { expr: '$.amount', format: 'number:0.00', fallback: '' };
    expect(isValidBinding(binding)).toBe(true);
    expectTypeOf(binding).toMatchTypeOf<ElementBinding>();
    expectTypeOf<ElementBinding['expr']>().toEqualTypeOf<string>();
    expectTypeOf<ElementBinding['format']>().toEqualTypeOf<string | null | undefined>();
    expectTypeOf<ElementBinding['fallback']>().toEqualTypeOf<string | null | undefined>();
  });
});
