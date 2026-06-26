import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  goldenInvoiceTemplate,
  type RendaraTemplate,
} from '@rendara/report-schema';
import { importTemplate, serializeTemplate, suggestExportFileName } from './template-io';

describe('serializeTemplate', () => {
  it('pretty-prints with two-space indentation', () => {
    const json = serializeTemplate(goldenInvoiceTemplate, { prettyPrint: true });
    expect(json).toContain('\n  "schemaVersion"');
    expect(JSON.parse(json)).toEqual(goldenInvoiceTemplate);
  });

  it('emits a compact single line when pretty-print is off', () => {
    const json = serializeTemplate(goldenInvoiceTemplate, { prettyPrint: false });
    expect(json).not.toContain('\n');
    expect(JSON.parse(json)).toEqual(goldenInvoiceTemplate);
  });
});

describe('importTemplate', () => {
  it('imports a current, valid template and reports no migration', () => {
    const json = serializeTemplate(goldenInvoiceTemplate, { prettyPrint: true });
    const result = importTemplate(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.template).toEqual(goldenInvoiceTemplate);
    expect(result.migrated).toBe(false);
    expect(result.fromVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('migrates an older (0.9.0) template forward, then validates it', () => {
    // A 0.9.0 document: no header/footer bands (added in 1.0.0).
    const legacy = {
      ...structuredClone(goldenInvoiceTemplate),
      schemaVersion: '0.9.0',
    } as Record<string, unknown>;
    delete legacy['header'];
    delete legacy['footer'];

    const result = importTemplate(JSON.stringify(legacy));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.migrated).toBe(true);
    expect(result.fromVersion).toBe('0.9.0');
    expect(result.template.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.template.header).toEqual({ elements: [] });
    expect(result.template.footer).toEqual({ elements: [] });
  });

  it('rejects malformed JSON with a friendly parse error', () => {
    const result = importTemplate('{ not json ]');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/isn't valid JSON/);
  });

  it('rejects a JSON object with no schemaVersion (cannot migrate)', () => {
    const result = importTemplate(JSON.stringify({ body: { elements: [] } }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(' ')).toMatch(/schemaVersion/i);
  });

  it('rejects a current-version template that fails schema validation', () => {
    const broken = {
      ...structuredClone(goldenInvoiceTemplate),
    } as Record<string, unknown>;
    delete broken['page'];

    const result = importTemplate(JSON.stringify(broken));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(' ')).toMatch(/page/i);
  });

  it('round-trips: export → import → export yields equivalent JSON (story QA)', () => {
    const first = serializeTemplate(goldenInvoiceTemplate, { prettyPrint: true });
    const imported = importTemplate(first);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    const second = serializeTemplate(imported.template, { prettyPrint: true });
    expect(second).toBe(first);
  });
});

describe('suggestExportFileName', () => {
  it('slugifies the template name and appends .json', () => {
    const named = {
      ...goldenInvoiceTemplate,
      metadata: { ...goldenInvoiceTemplate.metadata, name: 'Invoice — Acme Corp' },
    } satisfies RendaraTemplate;
    expect(suggestExportFileName(named)).toBe('invoice-acme-corp.json');
  });

  it('falls back to template.json when the name has no usable characters', () => {
    const blank = {
      ...goldenInvoiceTemplate,
      metadata: { ...goldenInvoiceTemplate.metadata, name: '—' },
    } satisfies RendaraTemplate;
    expect(suggestExportFileName(blank)).toBe('template.json');
  });
});
