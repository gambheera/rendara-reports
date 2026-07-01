import { describe, expect, it } from 'vitest';
import { GOLDEN_FIXTURES, type RendaraTemplate } from '@rendara/report-schema';

import { serializeTemplateSource, sourceFilename } from './viewer-source';

/**
 * Tests for the Download-source helpers (E8-S5): the template serialises to
 * canonical, re-parseable JSON (schema round-trip) and the filename slugs/falls
 * back/ends in `.json` as the action expects.
 */
const golden = GOLDEN_FIXTURES[0];

describe('serializeTemplateSource', () => {
  it('pretty-prints the template (2-space indent)', () => {
    const json = serializeTemplateSource(golden.template as RendaraTemplate);
    expect(json).toContain('\n  "schemaVersion"');
  });

  it('round-trips: re-parsing yields an equivalent template', () => {
    const json = serializeTemplateSource(golden.template as RendaraTemplate);
    expect(JSON.parse(json)).toEqual(golden.template);
  });
});

describe('sourceFilename', () => {
  it('slugs the document title and appends .json', () => {
    expect(sourceFilename('Invoice — Acme Corp', undefined)).toBe('invoice-acme-corp.json');
  });

  it('honours a configured filename, ensuring a .json suffix', () => {
    expect(sourceFilename('Invoice', 'my-template')).toBe('my-template.json');
    expect(sourceFilename('Invoice', 'my-template.json')).toBe('my-template.json');
  });

  it('falls back to report.json when the title yields no slug', () => {
    expect(sourceFilename('—', undefined)).toBe('report.json');
    expect(sourceFilename('', undefined)).toBe('report.json');
  });
});
