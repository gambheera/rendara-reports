import { describe, expect, it } from 'vitest';

import { ensureExtension, slugifyFilename } from './filename';

/** Tests for the shared filename helpers used by the viewer download actions. */
describe('slugifyFilename', () => {
  it('lowercases and collapses non-alphanumerics to single dashes', () => {
    expect(slugifyFilename('Invoice — Acme Corp')).toBe('invoice-acme-corp');
  });

  it('trims leading and trailing dashes', () => {
    expect(slugifyFilename('  *Report!*  ')).toBe('report');
  });

  it('returns null when nothing usable remains', () => {
    expect(slugifyFilename('—')).toBeNull();
    expect(slugifyFilename('')).toBeNull();
  });
});

describe('ensureExtension', () => {
  it('appends the extension when absent', () => {
    expect(ensureExtension('statement', '.pdf')).toBe('statement.pdf');
    expect(ensureExtension('invoice', '.json')).toBe('invoice.json');
  });

  it('does not double the extension (case-insensitive)', () => {
    expect(ensureExtension('report.pdf', '.pdf')).toBe('report.pdf');
    expect(ensureExtension('report.JSON', '.json')).toBe('report.JSON');
  });

  it('trims surrounding whitespace', () => {
    expect(ensureExtension('  invoice  ', '.json')).toBe('invoice.json');
  });

  it('falls back to report<ext> for a blank name', () => {
    expect(ensureExtension('   ', '.json')).toBe('report.json');
    expect(ensureExtension('', '.pdf')).toBe('report.pdf');
  });
});
