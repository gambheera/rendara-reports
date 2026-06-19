import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  DataTableElement,
  ElementType,
  ImageElement,
  ShapeElement,
  TemplateElement,
  TextElement,
} from './element';
import {
  COLUMN_ALIGNS,
  IMAGE_FITS,
  SHAPE_KINDS,
  assertNever,
  isDataTableElement,
  isImageElement,
  isShapeElement,
  isTextElement,
  isValidElement,
  validateElement,
} from './element-validation';

import type { Frame } from './frame';

const frame: Frame = { xMm: 15, yMm: 30, wMm: 80, hMm: 8 };

const text: TextElement = {
  id: 'el_title',
  type: 'text',
  frame,
  z: 1,
  text: 'INVOICE',
};

const boundText: TextElement = {
  id: 'el_customer',
  type: 'text',
  frame,
  z: 1,
  binding: { expr: 'invoice.customer.name' },
};

const shape: ShapeElement = {
  id: 'el_rule',
  type: 'shape',
  shape: 'line',
  frame: { xMm: 15, yMm: 40, wMm: 180, hMm: 0 },
  z: 0,
};

const image: ImageElement = {
  id: 'el_logo',
  type: 'image',
  frame: { xMm: 15, yMm: 10, wMm: 40, hMm: 12 },
  src: 'https://example.com/acme-logo.png',
  fit: 'contain',
  z: 1,
};

const table: DataTableElement = {
  id: 'el_table',
  type: 'dataTable',
  frame: { xMm: 15, yMm: 60, wMm: 180, hMm: null },
  z: 1,
  source: { arrayExpr: 'invoice.lineItems' },
  columns: [
    { key: 'desc', header: 'Description', cell: { expr: '$.description' }, widthMm: 140 },
    {
      key: 'amt',
      header: 'Amount',
      cell: { expr: '$.amount' },
      footer: { expr: '$sum(invoice.lineItems.amount)' },
      widthMm: 40,
      align: 'right',
    },
  ],
  repeatHeaderOnEachPage: true,
  keepTogether: false,
};

const groupedTable: DataTableElement = { ...table, groups: [{ groupBy: '$.category' }] };

describe('element fixtures validate (E1-S3 QA)', () => {
  it.each<readonly [string, TemplateElement]>([
    ['text (static)', text],
    ['text (bound)', boundText],
    ['shape', shape],
    ['image', image],
    ['dataTable', table],
    ['dataTable (grouped)', groupedTable],
  ])('%s fixture is valid', (_label, element) => {
    expect(validateElement(element)).toEqual([]);
    expect(isValidElement(element)).toBe(true);
  });

  it('exercises all four element types in one suite', () => {
    const present = new Set([text, shape, image, table].map((element) => element.type));
    expect(present).toEqual(new Set<ElementType>(['text', 'shape', 'image', 'dataTable']));
  });
});

describe('element type guards (E1-S3)', () => {
  it('narrow each variant at runtime', () => {
    expect(isTextElement(text)).toBe(true);
    expect(isShapeElement(text)).toBe(false);
    expect(isShapeElement(shape)).toBe(true);
    expect(isImageElement(image)).toBe(true);
    expect(isDataTableElement(table)).toBe(true);
  });

  it('narrow the static type', () => {
    const element: TemplateElement = table;
    if (isDataTableElement(element)) {
      expectTypeOf(element).toEqualTypeOf<DataTableElement>();
      expect(element.columns.length).toBe(2);
    }
    if (isImageElement(image)) {
      expectTypeOf(image.fit).toEqualTypeOf<ImageElement['fit']>();
    }
  });
});

/**
 * Exhaustive over the `TemplateElement` union: this only compiles while every
 * variant is handled — adding a member without a `case` makes `element` non-`never`
 * at the `assertNever` call and fails `tsc` (the QA's "exhaustive discriminated-union
 * handling enforced by type tests").
 */
function describeElement(element: TemplateElement): string {
  switch (element.type) {
    case 'text':
      return element.text ?? element.binding?.expr ?? '';
    case 'shape':
      return element.shape;
    case 'image':
      return element.fit;
    case 'dataTable':
      return `${element.columns.length} columns`;
    default:
      return assertNever(element);
  }
}

/** Exhaustive over the discriminant strings: omitting a key fails to compile. */
const ELEMENT_LABELS = {
  text: 'Text',
  shape: 'Shape',
  image: 'Image',
  dataTable: 'Data table',
} satisfies Record<ElementType, string>;

describe('exhaustive union handling (E1-S3)', () => {
  it('describes every variant through the exhaustive switch', () => {
    expect(describeElement(text)).toBe('INVOICE');
    expect(describeElement(boundText)).toBe('invoice.customer.name');
    expect(describeElement(shape)).toBe('line');
    expect(describeElement(image)).toBe('contain');
    expect(describeElement(table)).toBe('2 columns');
  });

  it('labels every discriminant', () => {
    for (const type of Object.keys(ELEMENT_LABELS) as ElementType[]) {
      expect(ELEMENT_LABELS[type]).toEqual(expect.any(String));
    }
  });

  it('assertNever throws when an unknown variant reaches it', () => {
    const bogus = { ...text, type: 'bogus' } as unknown as TemplateElement;
    expect(() => describeElement(bogus)).toThrow(/Unhandled element variant/);
    expect(() => validateElement(bogus)).toThrow(/Unhandled element variant/);
  });

  it('publishes runtime mirrors of each literal union', () => {
    expect(SHAPE_KINDS).toEqual(['line', 'rect', 'ellipse']);
    expect(IMAGE_FITS).toEqual(['contain', 'cover', 'fill', 'none', 'scale-down']);
    expect(COLUMN_ALIGNS).toEqual(['left', 'center', 'right']);
  });
});

describe('common-field validation (E1-S3)', () => {
  it('rejects an empty id', () => {
    expect(validateElement({ ...text, id: '' })).toContainEqual(
      expect.objectContaining({ path: '<element>.id' }),
    );
  });

  it('rejects a non-finite z', () => {
    expect(validateElement({ ...text, z: Number.NaN })).toContainEqual(
      expect.objectContaining({ path: 'el_title.z' }),
    );
  });

  it('rejects a non-finite frame origin', () => {
    const paths = validateElement({
      ...text,
      frame: { ...frame, xMm: Number.NaN, yMm: Number.POSITIVE_INFINITY },
    }).map((error) => error.path);
    expect(paths).toContain('el_title.frame.xMm');
    expect(paths).toContain('el_title.frame.yMm');
  });

  it('rejects a non-positive frame width', () => {
    expect(validateElement({ ...text, frame: { ...frame, wMm: 0 } })).toContainEqual(
      expect.objectContaining({ path: 'el_title.frame.wMm' }),
    );
  });

  it('accepts a null (auto) height but rejects a negative one', () => {
    expect(isValidElement({ ...table, frame: { ...table.frame, hMm: null } })).toBe(true);
    expect(validateElement({ ...text, frame: { ...frame, hMm: -1 } })).toContainEqual(
      expect.objectContaining({ path: 'el_title.frame.hMm' }),
    );
  });
});

describe('text element validation (E1-S3)', () => {
  it('rejects a text element with neither text nor binding', () => {
    const blank: TextElement = { id: 'el_title', type: 'text', frame, z: 1 };
    expect(validateElement(blank)).toContainEqual(
      expect.objectContaining({ path: 'el_title.(text|binding)' }),
    );
  });

  it('accepts an empty string as static text', () => {
    expect(isValidElement({ ...text, text: '' })).toBe(true);
  });

  it('rejects a binding with an empty expression', () => {
    expect(validateElement({ ...boundText, binding: { expr: '' } })).toContainEqual(
      expect.objectContaining({ path: 'el_customer.binding.expr' }),
    );
  });
});

describe('shape element validation (E1-S3)', () => {
  it('accepts every shape kind', () => {
    for (const kind of SHAPE_KINDS) {
      expect(isValidElement({ ...shape, shape: kind })).toBe(true);
    }
  });

  it('rejects an unknown shape kind', () => {
    const bad = { ...shape, shape: 'triangle' } as unknown as ShapeElement;
    expect(validateElement(bad)).toContainEqual(expect.objectContaining({ path: 'el_rule.shape' }));
  });
});

describe('image element validation (E1-S3)', () => {
  it('accepts a binding source instead of src', () => {
    const bound: ImageElement = {
      id: 'el_logo',
      type: 'image',
      frame: image.frame,
      fit: 'contain',
      z: 1,
      binding: { expr: 'invoice.logoUrl' },
    };
    expect(isValidElement(bound)).toBe(true);
  });

  it('rejects an image with neither src nor binding', () => {
    const sourceless: ImageElement = {
      id: 'el_logo',
      type: 'image',
      frame: image.frame,
      fit: 'contain',
      z: 1,
    };
    expect(validateElement(sourceless)).toContainEqual(
      expect.objectContaining({ path: 'el_logo.(src|binding)' }),
    );
  });

  it('rejects an unknown fit mode', () => {
    const bad = { ...image, fit: 'stretch' } as unknown as ImageElement;
    expect(validateElement(bad)).toContainEqual(expect.objectContaining({ path: 'el_logo.fit' }));
  });
});

describe('dataTable element validation (E1-S3)', () => {
  it('rejects an empty source expression', () => {
    expect(validateElement({ ...table, source: { arrayExpr: '' } })).toContainEqual(
      expect.objectContaining({ path: 'el_table.source.arrayExpr' }),
    );
  });

  it('rejects a table with no columns', () => {
    expect(validateElement({ ...table, columns: [] })).toContainEqual(
      expect.objectContaining({ path: 'el_table.columns' }),
    );
  });

  it('reports column problems with indexed paths', () => {
    const broken: DataTableElement = {
      ...table,
      columns: [
        { key: '', header: 'Description', cell: { expr: '$.description' }, widthMm: 140 },
        {
          key: 'amt',
          header: 'Amount',
          cell: { expr: '' },
          footer: { expr: '' },
          widthMm: 0,
          align: 'middle' as never,
        },
      ],
    };
    const paths = validateElement(broken).map((error) => error.path);
    expect(paths).toContain('el_table.columns[0].key');
    expect(paths).toContain('el_table.columns[1].cell.expr');
    expect(paths).toContain('el_table.columns[1].footer.expr');
    expect(paths).toContain('el_table.columns[1].widthMm');
    expect(paths).toContain('el_table.columns[1].align');
  });

  it('rejects a non-string column header', () => {
    const broken: DataTableElement = {
      ...table,
      columns: [
        { key: 'desc', header: 42 as never, cell: { expr: '$.description' }, widthMm: 140 },
      ],
    };
    expect(validateElement(broken)).toContainEqual(
      expect.objectContaining({ path: 'el_table.columns[0].header' }),
    );
  });

  it('rejects a group with an empty groupBy', () => {
    expect(validateElement({ ...table, groups: [{ groupBy: '' }] })).toContainEqual(
      expect.objectContaining({ path: 'el_table.groups[0].groupBy' }),
    );
  });

  it('accepts a table with no groups', () => {
    expect(table.groups).toBeUndefined();
    expect(isValidElement(table)).toBe(true);
  });
});
