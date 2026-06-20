import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';

import { getTemplateJsonSchema, TEMPLATE_JSON_SCHEMA, TEMPLATE_SCHEMA_ID } from './json-schema';

/** The committed artifact emitted by `tools/generate-schema.ts`. */
const committedSchemaPath = fileURLToPath(
  new URL('../../schema/rendara-template.schema.json', import.meta.url),
);

describe('Template JSON Schema (E1-S6)', () => {
  it('compiles under ajv with the discriminator keyword', () => {
    const ajv = new Ajv({ allErrors: true, discriminator: true, strict: false });
    addFormats(ajv);
    expect(() => ajv.compile(TEMPLATE_JSON_SCHEMA)).not.toThrow();
  });

  it('exposes the contract identity and draft-07 meta-schema', () => {
    expect(TEMPLATE_JSON_SCHEMA.$id).toBe(TEMPLATE_SCHEMA_ID);
    expect(TEMPLATE_JSON_SCHEMA.$schema).toContain('draft-07');
  });

  it('models the four v1 element variants via a discriminated union', () => {
    const element = TEMPLATE_JSON_SCHEMA['definitions'].element as {
      discriminator: { propertyName: string };
      oneOf: { properties: { type: { const: string } } }[];
    };
    expect(element.discriminator.propertyName).toBe('type');
    const variants = element.oneOf.map((branch) => branch.properties.type.const);
    expect(variants).toEqual(['text', 'shape', 'image', 'dataTable']);
  });

  it('locks every object against unknown properties at the root', () => {
    expect(TEMPLATE_JSON_SCHEMA['additionalProperties']).toBe(false);
  });

  it('getTemplateJsonSchema returns the same schema object', () => {
    expect(getTemplateJsonSchema()).toBe(TEMPLATE_JSON_SCHEMA);
  });
});

describe('generated schema artifact stays in sync (E1-S6)', () => {
  it('the committed JSON file matches the in-code schema', () => {
    // Deep-equal on the parsed object (not raw text) so Prettier formatting of
    // the artifact can never break this guard — only a real schema change can.
    // Re-run `pnpm schema:generate` if this fails.
    const committed = JSON.parse(readFileSync(committedSchemaPath, 'utf8'));
    expect(committed).toEqual(TEMPLATE_JSON_SCHEMA);
  });
});
