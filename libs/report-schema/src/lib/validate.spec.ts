import { describe, expect, expectTypeOf, it } from 'vitest';

import type { DataTableElement, TextElement } from './element';
import type { RendaraTemplate } from './template';
import { isValidTemplate, parse, validate, type RendaraValidationError } from './validate';

/**
 * E1-S6 QA: golden valid templates pass; a suite of intentionally-broken
 * templates each produce the *expected specific error* (path + failing keyword).
 *
 * `goldenTemplate()` returns a fresh, fully-populated valid template touching
 * every interesting location — both `text` flavours, a shape, an image, and a
 * grouped data table with a column footer — across all three bands. Each broken
 * case deep-clones it and mutates one thing, so every assertion is isolated.
 */
function goldenTemplate(): RendaraTemplate {
  return {
    schemaVersion: '1.0.0',
    metadata: {
      name: 'Invoice — Acme Corp',
      id: '00000000-0000-4000-8000-000000000000',
      createdAt: '2026-06-17T00:00:00.000Z',
      locale: 'en-US',
    },
    page: {
      size: 'A4',
      orientation: 'portrait',
      marginsMm: { top: 20, right: 15, bottom: 20, left: 15 },
      units: 'mm',
      defaultFont: { family: 'Inter', sizePt: 10 },
      background: null,
    },
    header: {
      elements: [
        {
          id: 'el_logo',
          type: 'image',
          frame: { xMm: 15, yMm: 10, wMm: 40, hMm: 12 },
          src: 'https://example.com/acme-logo.png',
          fit: 'contain',
          z: 1,
        },
      ],
    },
    body: {
      elements: [
        {
          id: 'el_title',
          type: 'text',
          frame: { xMm: 15, yMm: 30, wMm: 80, hMm: 8 },
          text: 'INVOICE',
          style: {
            font: { family: 'Inter', sizePt: 18, weight: 'bold', style: 'normal' },
            color: '#4F46E5',
            align: { horizontal: 'left', vertical: 'middle' },
            format: null,
          },
          z: 1,
          visibleWhen: null,
        },
        {
          id: 'el_customer',
          type: 'text',
          frame: { xMm: 15, yMm: 40, wMm: 80, hMm: 6 },
          binding: { expr: 'invoice.customer.name', format: null, fallback: '' },
          z: 1,
        },
        {
          id: 'el_rule',
          type: 'shape',
          shape: 'line',
          frame: { xMm: 15, yMm: 50, wMm: 180, hMm: 0 },
          style: { stroke: { color: '#000000', widthMm: 0.2, style: 'solid' } },
          z: 0,
        },
        {
          id: 'el_table',
          type: 'dataTable',
          frame: { xMm: 15, yMm: 60, wMm: 180, hMm: null },
          source: { arrayExpr: 'invoice.lineItems' },
          columns: [
            { key: 'desc', header: 'Description', cell: { expr: '$.description' }, widthMm: 140 },
            {
              key: 'amt',
              header: 'Amount',
              cell: { expr: '$.amount', format: 'currency:USD' },
              footer: { expr: '$sum(invoice.lineItems.amount)', format: 'currency:USD' },
              widthMm: 40,
              align: 'right',
            },
          ],
          groups: [
            {
              groupBy: '$.category',
              header: { label: { expr: '"Category: " & $.category' } },
              footer: {
                aggregates: [{ columnKey: 'amt', binding: { expr: '$sum($.amount)' } }],
              },
            },
          ],
          repeatHeaderOnEachPage: true,
          keepTogether: false,
          z: 1,
        },
      ],
    },
    footer: {
      elements: [
        {
          id: 'el_page_no',
          type: 'text',
          frame: { xMm: 15, yMm: 282, wMm: 180, hMm: 6 },
          text: 'Page {{pageNumber}} of {{pageCount}}',
          z: 1,
        },
      ],
    },
  };
}

/** A minimal but complete valid template: empty bands, named page, no elements. */
function minimalTemplate(): RendaraTemplate {
  return {
    schemaVersion: '1.0.0',
    metadata: {
      name: 'Blank',
      id: 'id-1',
      createdAt: '2026-06-19T00:00:00.000Z',
      locale: 'en-US',
    },
    page: {
      size: { widthMm: 200, heightMm: 300 },
      orientation: 'landscape',
      marginsMm: { top: 0, right: 0, bottom: 0, left: 0 },
      units: 'pt',
      defaultFont: { family: 'Arial', sizePt: 12 },
    },
    header: { elements: [] },
    body: { elements: [] },
    footer: { elements: [] },
  };
}

/** The first error's `[path, keyword]` — convenient for single-fault cases. */
function firstFault(errors: readonly RendaraValidationError[]): [string, string] {
  return [errors[0]?.path ?? '<none>', errors[0]?.keyword ?? '<none>'];
}

/** Recursively strips `readonly` so a cloned template can be mutated in tests. */
type Mutable<T> = T extends readonly (infer U)[]
  ? Mutable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: Mutable<T[K]> }
    : T;

/** A deeply-mutable clone of the golden template, for single-fault mutation. */
function clone(): Mutable<RendaraTemplate> {
  return structuredClone(goldenTemplate()) as Mutable<RendaraTemplate>;
}

/** Deletes a required key (the broken-input cases test missing properties). */
function omit<T extends object>(obj: T, key: keyof T): void {
  delete (obj as Partial<T>)[key];
}

describe('validate — golden valid templates pass (E1-S6 QA)', () => {
  it('accepts the fully-populated golden template', () => {
    const result = validate(goldenTemplate());
    expect(result.ok).toBe(true);
    if (result.ok) {
      // On success the input is narrowed and returned verbatim.
      expect(result.value.metadata.name).toBe('Invoice — Acme Corp');
    }
  });

  it('accepts a minimal template (empty bands, custom page size)', () => {
    expect(validate(minimalTemplate()).ok).toBe(true);
  });

  it('isValidTemplate narrows the type for valid input', () => {
    const candidate: unknown = goldenTemplate();
    expect(isValidTemplate(candidate)).toBe(true);
    if (isValidTemplate(candidate)) {
      expectTypeOf(candidate).toEqualTypeOf<RendaraTemplate>();
    }
  });
});

describe('validate — structural (ajv) errors are specific and path-pointed (E1-S6 QA)', () => {
  it('reports a missing required property with its parent path', () => {
    const t = clone();
    omit(t.page, 'size');
    const result = validate(t);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(firstFault(result.errors)).toEqual(['page.size', 'required']);
      expect(result.errors[0]?.message).toContain("Missing required property 'size'");
    }
  });

  it('reports an out-of-enum value with the allowed list', () => {
    const t = clone();
    t.page.orientation = 'sideways' as never;
    const result = validate(t);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(firstFault(result.errors)).toEqual(['page.orientation', 'enum']);
      expect(result.errors[0]?.message).toContain('portrait');
    }
  });

  it('rejects an unknown/typo property (additionalProperties: false)', () => {
    const t = clone() as unknown as Record<string, unknown>;
    t['bogus'] = 1;
    const result = validate(t);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(firstFault(result.errors)).toEqual(['bogus', 'additionalProperties']);
    }
  });

  it('rejects a non-positive width with an indexed path into a band', () => {
    const t = clone();
    t.body.elements[0].frame.wMm = 0;
    const result = validate(t);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.path).toBe('body.elements[0].frame.wMm');
    }
  });

  it('rejects an invalid/unknown element type discriminant', () => {
    const t = clone();
    t.body.elements[0].type = 'chart' as never;
    const result = validate(t);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(firstFault(result.errors)).toEqual(['body.elements[0].type', 'discriminator']);
    }
  });

  it('rejects a subtype-specific missing field (dataTable.columns)', () => {
    const t = clone();
    omit(t.body.elements[3] as Mutable<DataTableElement>, 'columns');
    const result = validate(t);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(firstFault(result.errors)).toEqual(['body.elements[3].columns', 'required']);
    }
  });

  it('rejects an empty cell expression deep inside a column binding', () => {
    const t = clone();
    (t.body.elements[3] as Mutable<DataTableElement>).columns[0].cell.expr = '';
    const result = validate(t);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.path).toBe('body.elements[3].columns[0].cell.expr');
      expect(result.errors[0]?.keyword).toBe('minLength');
    }
  });

  it('rejects a malformed schemaVersion', () => {
    const t = clone();
    t.schemaVersion = 'v1';
    const result = validate(t);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(firstFault(result.errors)).toEqual(['schemaVersion', 'pattern']);
    }
  });

  it('rejects a non-date-time createdAt', () => {
    const t = clone();
    t.metadata.createdAt = 'yesterday';
    const result = validate(t);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(firstFault(result.errors)).toEqual(['metadata.createdAt', 'format']);
    }
  });

  it('collects multiple structural faults at once (allErrors)', () => {
    const t = clone();
    t.page.orientation = 'sideways' as never;
    t.page.units = 'leagues' as never;
    const result = validate(t);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const paths = result.errors.map((e) => e.path);
      expect(paths).toContain('page.orientation');
      expect(paths).toContain('page.units');
    }
  });

  it('rejects a non-object input at the root', () => {
    expect(validate(42).ok).toBe(false);
    expect(validate(null).ok).toBe(false);
    expect(validate([]).ok).toBe(false);
  });
});

describe('validate — semantic (cross-field) errors layer on a sound structure (E1-S6)', () => {
  it('flags a text element with neither literal text nor a binding', () => {
    const t = clone();
    omit(t.body.elements[0] as Mutable<TextElement>, 'text');
    const result = validate(t);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.keyword).toBe('semantic');
      expect(result.errors[0]?.path).toContain('body.elements[0]');
      expect(result.errors[0]?.message).toContain('either');
    }
  });

  it('flags margins that leave no horizontal content area', () => {
    const t = clone();
    t.page.marginsMm = { top: 20, right: 150, bottom: 20, left: 150 };
    const result = validate(t);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(firstFault(result.errors)).toEqual(['page.marginsMm', 'semantic']);
    }
  });

  it('flags a group aggregate referencing an unknown column', () => {
    const t = clone();
    const table = t.body.elements[3] as Mutable<DataTableElement>;
    // Replace the grouping wholesale so the aggregate points at a missing column.
    table.groups = [
      {
        groupBy: '$.category',
        footer: { aggregates: [{ columnKey: 'nope', binding: { expr: '$sum($.amount)' } }] },
      },
    ];
    const result = validate(t);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.keyword).toBe('semantic');
      expect(result.errors[0]?.path).toBe(
        'body.elements[3].el_table.groups[0].footer.aggregates[0].columnKey',
      );
    }
  });

  it('flags a data table with zero columns', () => {
    const t = clone();
    (t.body.elements[3] as Mutable<DataTableElement>).columns = [];
    const result = validate(t);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]?.keyword).toBe('semantic');
      expect(result.errors[0]?.message).toContain('at least one column');
    }
  });

  it('skips the semantic pass when the structure is broken (no mixed errors)', () => {
    const t = clone();
    // Break structure (bad enum) AND a semantic rule (margins). Only structural
    // (ajv) errors should come back; the semantic pass is short-circuited.
    t.page.orientation = 'sideways' as never;
    t.page.marginsMm = { top: 20, right: 150, bottom: 20, left: 150 };
    const result = validate(t);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.every((e) => e.keyword !== 'semantic')).toBe(true);
    }
  });
});

describe('parse — strings and objects (E1-S6)', () => {
  it('parses and validates a JSON string', () => {
    const json = JSON.stringify(goldenTemplate());
    const result = parse(json);
    expect(result.ok).toBe(true);
  });

  it('returns a single parse error for malformed JSON (never throws)', () => {
    const result = parse('{ not json');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(1);
      expect(firstFault(result.errors)).toEqual(['(root)', 'parse']);
      expect(result.errors[0]?.message).toContain('not valid JSON');
    }
  });

  it('validates an object passed directly (no parsing)', () => {
    expect(parse(goldenTemplate()).ok).toBe(true);
  });

  it('surfaces structural errors from a valid-JSON-but-invalid-template string', () => {
    const broken = JSON.stringify({ schemaVersion: '1.0.0' });
    const result = parse(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.keyword === 'required')).toBe(true);
    }
  });
});

describe('Result type (E1-S6)', () => {
  it('narrows to value on ok and errors on failure', () => {
    const ok = validate(goldenTemplate());
    if (ok.ok) {
      expectTypeOf(ok.value).toEqualTypeOf<RendaraTemplate>();
    }
    const bad = validate({});
    if (!bad.ok) {
      expectTypeOf(bad.errors).toEqualTypeOf<RendaraValidationError[]>();
    }
  });
});
