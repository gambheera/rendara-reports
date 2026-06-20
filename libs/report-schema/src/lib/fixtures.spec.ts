import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  GOLDEN_FIXTURES,
  goldenCertificateTemplate,
  goldenInvoiceTemplate,
  goldenTabularReportTemplate,
  type GoldenFixture,
} from './fixtures';
import { isDataTableElement } from './element-validation';
import { parse, validate } from './validate';

/**
 * E1-S8 QA: the three committed golden templates (invoice, certificate, tabular
 * report), each paired with sample data, all validate and become the basis for
 * later pagination/render/visual tests. We assert here that they (a) validate,
 * (b) round-trip stably (DoD: export → re-import yields an equivalent template),
 * and (c) stay in sync with the committed `.json` artifacts emitted by
 * `tools/generate-fixtures.ts` (mirroring the schema drift guard).
 */

/** Resolves a committed fixture artifact path next to this lib's `fixtures/` dir. */
function committedFixturePath(name: string, file: 'template' | 'data'): string {
  return fileURLToPath(new URL(`../../fixtures/${name}/${file}.json`, import.meta.url));
}

function readCommittedJson(name: string, file: 'template' | 'data'): unknown {
  return JSON.parse(readFileSync(committedFixturePath(name, file), 'utf8'));
}

describe('golden fixtures — registry shape (E1-S8)', () => {
  it('exposes the three required goldens by canonical name', () => {
    expect(GOLDEN_FIXTURES.map((f) => f.name)).toEqual([
      'invoice',
      'certificate',
      'tabular-report',
    ]);
  });

  it('every entry pairs a template with non-empty sample data', () => {
    for (const { name, template, data } of GOLDEN_FIXTURES) {
      expect(template.schemaVersion, name).toBe('1.0.0');
      expect(data, name).toBeTypeOf('object');
      expect(data, name).not.toBeNull();
      expect(Object.keys(data as object).length, name).toBeGreaterThan(0);
    }
  });

  it('uses stable, distinct template ids', () => {
    const ids = GOLDEN_FIXTURES.map((f) => f.template.metadata.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('the named exports are the registry entries', () => {
    expect(GOLDEN_FIXTURES[0]?.template).toBe(goldenInvoiceTemplate);
    expect(GOLDEN_FIXTURES[1]?.template).toBe(goldenCertificateTemplate);
    expect(GOLDEN_FIXTURES[2]?.template).toBe(goldenTabularReportTemplate);
  });
});

describe('golden fixtures — all validate (E1-S8 acceptance)', () => {
  it.each(GOLDEN_FIXTURES.map((f) => [f.name, f] as const))(
    '%s validates against the schema (structural + semantic)',
    (_name, fixture: GoldenFixture) => {
      const result = validate(fixture.template);
      // Surface the precise faults if a golden ever regresses.
      expect(result.ok ? [] : result.errors).toEqual([]);
      expect(result.ok).toBe(true);
    },
  );
});

describe('golden fixtures — schema round-trip integrity (DoD §9)', () => {
  it.each(GOLDEN_FIXTURES.map((f) => [f.name, f] as const))(
    '%s survives export → re-import unchanged',
    (_name, fixture: GoldenFixture) => {
      const reimported = parse(JSON.stringify(fixture.template));
      expect(reimported.ok).toBe(true);
      if (reimported.ok) {
        expect(reimported.value).toEqual(fixture.template);
      }
    },
  );
});

describe('golden fixtures — committed artifacts stay in sync (E1-S8)', () => {
  it.each(GOLDEN_FIXTURES.map((f) => [f.name, f] as const))(
    '%s committed template.json matches the in-code source',
    (name, fixture: GoldenFixture) => {
      // Re-run `pnpm fixtures:generate` if this fails.
      expect(readCommittedJson(name, 'template')).toEqual(fixture.template);
    },
  );

  it.each(GOLDEN_FIXTURES.map((f) => [f.name, f] as const))(
    '%s committed data.json matches the in-code source',
    (name, fixture: GoldenFixture) => {
      expect(readCommittedJson(name, 'data')).toEqual(fixture.data);
    },
  );

  it('the committed template.json files are themselves valid templates', () => {
    for (const { name } of GOLDEN_FIXTURES) {
      expect(validate(readCommittedJson(name, 'template')).ok, name).toBe(true);
    }
  });
});

describe('golden fixtures — coverage of the required shapes (E1-S8)', () => {
  it('the invoice has a data table with an `$sum` column total', () => {
    const table = goldenInvoiceTemplate.body.elements.find(isDataTableElement);
    expect(table).toBeDefined();
    expect(table?.columns.some((c) => c.footer?.expr.includes('$sum'))).toBe(true);
  });

  it('the certificate is an absolute layout with an image and shapes, no table', () => {
    const types = goldenCertificateTemplate.body.elements.map((e) => e.type);
    expect(types).toContain('image');
    expect(types).toContain('shape');
    expect(types).not.toContain('dataTable');
  });

  it('the tabular report groups a large table with subtotal aggregates', () => {
    const table = goldenTabularReportTemplate.body.elements.find(isDataTableElement);
    expect(table?.groups?.length).toBeGreaterThan(0);
    expect(table?.groups?.[0]?.footer?.aggregates?.length).toBeGreaterThan(0);
    // The sample data must carry enough rows to drive pagination/grouping tests.
    const { data } = GOLDEN_FIXTURES.find((f) => f.name === 'tabular-report') as GoldenFixture;
    const { rows } = (data as { salesReport: { rows: unknown[] } }).salesReport;
    expect(rows.length).toBeGreaterThanOrEqual(12);
  });
});
