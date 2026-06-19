/**
 * The generated JSON Schema for the Template JSON contract (E1-S6).
 *
 * This is the machine-readable mirror of the E1-S1…S5 TypeScript model
 * (`template.ts` / `page.ts` / `element.ts` / `style.ts` / `binding.ts`). It is
 * the structural half of validation: ajv compiles it in `./validate` to reject
 * malformed templates with path-pointed errors, and backends can consume the
 * emitted `schema/rendara-template.schema.json` artifact directly (brief §5).
 *
 * Two design notes:
 *
 * 1. **Generated, kept in sync.** `tools/generate-schema.ts` serializes this
 *    constant to `schema/rendara-template.schema.json`; `json-schema.spec.ts`
 *    fails if the committed file drifts from this source.
 *
 * 2. **Structural only.** ajv covers shape, required keys, enums, and ranges.
 *    Cross-field/referential rules that JSON Schema can't express — margins
 *    leaving a positive content area, a group aggregate referencing a real
 *    column, a text/image element having *either* a literal or a binding — stay
 *    in the focused semantic validators (`validatePageSettings`,
 *    `validateElement`) which `validate()` layers on top (see `./validate`).
 *
 * The element union is modelled with ajv's `discriminator` keyword on `type`, so
 * a wrong/missing discriminant and per-variant problems produce precise errors
 * rather than a noisy `oneOf` failure. Objects use `additionalProperties: false`
 * so unknown/typo'd keys are caught as specific errors. The base element
 * properties are composed via TypeScript spreads to keep this source DRY while
 * the emitted JSON stays fully expanded.
 */

import type { SchemaObject } from 'ajv';

/** Draft-07 (ajv's default meta-schema). */
const JSON_SCHEMA_DRAFT = 'http://json-schema.org/draft-07/schema#';

/** Stable `$id` for the template schema; lets backends/$ref it by identity. */
export const TEMPLATE_SCHEMA_ID = 'https://rendara.dev/schema/rendara-template.schema.json';

/** A `$ref` to a named definition in this schema. */
function ref(name: string): SchemaObject {
  return { $ref: `#/definitions/${name}` };
}

/** A non-empty string (the common shape for ids, keys, expressions, colours). */
const nonEmptyString: SchemaObject = { type: 'string', minLength: 1 };

/** A strictly-positive finite number (widths, font sizes). */
const positiveNumber: SchemaObject = { type: 'number', exclusiveMinimum: 0 };

/** A non-negative finite number (margins, padding, border/stroke widths). */
const nonNegativeNumber: SchemaObject = { type: 'number', minimum: 0 };

/** An optional format/fallback token slot: `null` or a non-empty string. */
const nullableToken: SchemaObject = {
  oneOf: [{ type: 'null' }, nonEmptyString],
};

/**
 * Properties shared by every element (brief §5). Spread into each element
 * variant so the discriminated subschemas can keep `additionalProperties: false`
 * while still accepting the common fields.
 */
const baseElementProperties: Record<string, SchemaObject> = {
  id: nonEmptyString,
  frame: ref('frame'),
  style: ref('style'),
  z: { type: 'number' },
  // `null`/absent = always visible; otherwise a bare boolean expression string.
  visibleWhen: { oneOf: [{ type: 'null' }, nonEmptyString] },
};

/** Required keys shared by every element. */
const baseElementRequired = ['id', 'type', 'frame', 'z'];

const textElement: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: baseElementRequired,
  properties: {
    ...baseElementProperties,
    type: { const: 'text' },
    // At-least-one-of (text|binding) is enforced semantically by validateElement.
    text: { type: 'string' },
    binding: ref('binding'),
  },
};

const shapeElement: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: [...baseElementRequired, 'shape'],
  properties: {
    ...baseElementProperties,
    type: { const: 'shape' },
    shape: { enum: ['line', 'rect', 'ellipse'] },
  },
};

const imageElement: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: [...baseElementRequired, 'fit'],
  properties: {
    ...baseElementProperties,
    type: { const: 'image' },
    // At-least-one-of (src|binding) is enforced semantically by validateElement.
    src: { type: 'string' },
    binding: ref('binding'),
    fit: { enum: ['contain', 'cover', 'fill', 'none', 'scale-down'] },
  },
};

const dataTableElement: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: [...baseElementRequired, 'source', 'columns', 'repeatHeaderOnEachPage', 'keepTogether'],
  properties: {
    ...baseElementProperties,
    type: { const: 'dataTable' },
    source: ref('tableSource'),
    // "At least one column" is enforced semantically by validateDataTable.
    columns: { type: 'array', items: ref('column') },
    groups: { type: 'array', items: ref('group') },
    repeatHeaderOnEachPage: { type: 'boolean' },
    keepTogether: { type: 'boolean' },
  },
};

/**
 * The generated JSON Schema for a {@link RendaraTemplate}. Compiled by ajv in
 * `./validate`; serialized to `schema/rendara-template.schema.json` by
 * `tools/generate-schema.ts`.
 */
export const TEMPLATE_JSON_SCHEMA: SchemaObject = {
  $schema: JSON_SCHEMA_DRAFT,
  $id: TEMPLATE_SCHEMA_ID,
  title: 'Rendara Template',
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'metadata', 'page', 'header', 'body', 'footer'],
  properties: {
    schemaVersion: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
    metadata: ref('metadata'),
    page: ref('page'),
    header: ref('band'),
    body: ref('band'),
    footer: ref('band'),
  },
  definitions: {
    metadata: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'id', 'createdAt', 'locale'],
      properties: {
        name: { type: 'string' },
        id: nonEmptyString,
        createdAt: { type: 'string', format: 'date-time' },
        locale: nonEmptyString,
      },
    },

    page: {
      type: 'object',
      additionalProperties: false,
      required: ['size', 'orientation', 'marginsMm', 'units', 'defaultFont'],
      properties: {
        size: { oneOf: [{ enum: ['A4', 'Letter'] }, ref('pageSizeMm')] },
        orientation: { enum: ['portrait', 'landscape'] },
        marginsMm: ref('margins'),
        units: { enum: ['mm', 'pt', 'in'] },
        defaultFont: ref('fontSpec'),
        // `unknown | null`: any value (or absent). Whether margins fit is checked
        // semantically by validatePageSettings.
        background: {},
      },
    },
    pageSizeMm: {
      type: 'object',
      additionalProperties: false,
      required: ['widthMm', 'heightMm'],
      properties: { widthMm: positiveNumber, heightMm: positiveNumber },
    },
    margins: {
      type: 'object',
      additionalProperties: false,
      required: ['top', 'right', 'bottom', 'left'],
      properties: {
        top: nonNegativeNumber,
        right: nonNegativeNumber,
        bottom: nonNegativeNumber,
        left: nonNegativeNumber,
      },
    },
    fontSpec: {
      type: 'object',
      additionalProperties: false,
      required: ['family', 'sizePt'],
      properties: { family: nonEmptyString, sizePt: positiveNumber },
    },

    band: {
      type: 'object',
      additionalProperties: false,
      required: ['elements'],
      properties: { elements: { type: 'array', items: ref('element') } },
    },

    frame: {
      type: 'object',
      additionalProperties: false,
      required: ['xMm', 'yMm', 'wMm', 'hMm'],
      properties: {
        xMm: { type: 'number' },
        yMm: { type: 'number' },
        wMm: positiveNumber,
        // `null` = grows (paginator computes height); otherwise a non-negative mm.
        hMm: { oneOf: [{ type: 'null' }, nonNegativeNumber] },
      },
    },

    element: {
      type: 'object',
      required: ['type'],
      discriminator: { propertyName: 'type' },
      oneOf: [textElement, shapeElement, imageElement, dataTableElement],
    },

    binding: {
      type: 'object',
      additionalProperties: false,
      required: ['expr'],
      properties: {
        expr: nonEmptyString,
        format: nullableToken,
        // `null`/absent = no fallback; `''` is a legal explicit "show nothing".
        fallback: { type: ['string', 'null'] },
      },
    },

    tableSource: {
      type: 'object',
      additionalProperties: false,
      required: ['arrayExpr'],
      properties: { arrayExpr: nonEmptyString },
    },
    column: {
      type: 'object',
      additionalProperties: false,
      required: ['key', 'header', 'cell', 'widthMm'],
      properties: {
        key: nonEmptyString,
        header: { type: 'string' },
        cell: ref('binding'),
        footer: ref('binding'),
        widthMm: positiveNumber,
        align: { enum: ['left', 'center', 'right'] },
      },
    },
    groupAggregate: {
      type: 'object',
      additionalProperties: false,
      required: ['columnKey', 'binding'],
      // Whether columnKey references a real column is checked semantically.
      properties: { columnKey: nonEmptyString, binding: ref('binding') },
    },
    groupBand: {
      type: 'object',
      additionalProperties: false,
      properties: {
        label: ref('binding'),
        aggregates: { type: 'array', items: ref('groupAggregate') },
      },
    },
    group: {
      type: 'object',
      additionalProperties: false,
      required: ['groupBy'],
      properties: {
        groupBy: nonEmptyString,
        header: ref('groupBand'),
        footer: ref('groupBand'),
      },
    },

    style: {
      type: 'object',
      additionalProperties: false,
      properties: {
        font: ref('textFont'),
        color: nonEmptyString,
        fill: nonEmptyString,
        border: ref('border'),
        align: ref('alignment'),
        padding: ref('padding'),
        stroke: ref('stroke'),
        format: nullableToken,
      },
    },
    textFont: {
      type: 'object',
      additionalProperties: false,
      properties: {
        family: nonEmptyString,
        sizePt: positiveNumber,
        weight: {
          enum: ['normal', 'bold', 100, 200, 300, 400, 500, 600, 700, 800, 900],
        },
        style: { enum: ['normal', 'italic'] },
      },
    },
    border: {
      type: 'object',
      additionalProperties: false,
      properties: {
        top: ref('borderSide'),
        right: ref('borderSide'),
        bottom: ref('borderSide'),
        left: ref('borderSide'),
      },
    },
    borderSide: {
      type: 'object',
      additionalProperties: false,
      properties: {
        widthMm: nonNegativeNumber,
        style: ref('lineStyle'),
        color: nonEmptyString,
      },
    },
    alignment: {
      type: 'object',
      additionalProperties: false,
      properties: {
        horizontal: { enum: ['left', 'center', 'right', 'justify'] },
        vertical: { enum: ['top', 'middle', 'bottom'] },
      },
    },
    padding: {
      type: 'object',
      additionalProperties: false,
      properties: {
        top: nonNegativeNumber,
        right: nonNegativeNumber,
        bottom: nonNegativeNumber,
        left: nonNegativeNumber,
      },
    },
    stroke: {
      type: 'object',
      additionalProperties: false,
      properties: {
        color: nonEmptyString,
        widthMm: nonNegativeNumber,
        style: ref('lineStyle'),
      },
    },
    lineStyle: { enum: ['solid', 'dashed', 'dotted', 'double', 'none'] },
  },
};

/** Returns the generated Template JSON Schema (brief §5). */
export function getTemplateJsonSchema(): SchemaObject {
  return TEMPLATE_JSON_SCHEMA;
}
