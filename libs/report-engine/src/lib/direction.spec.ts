import { describe, expect, it } from 'vitest';

import { textDirection } from './direction';

describe('textDirection (E10-S2)', () => {
  it('resolves LTR for common Latin-script locales', () => {
    expect(textDirection('en-US')).toBe('ltr');
    expect(textDirection('de-DE')).toBe('ltr');
    expect(textDirection('fr')).toBe('ltr');
    expect(textDirection('zh-Hant')).toBe('ltr');
  });

  it('resolves RTL by primary language subtag', () => {
    expect(textDirection('ar')).toBe('rtl');
    expect(textDirection('ar-EG')).toBe('rtl');
    expect(textDirection('he')).toBe('rtl');
    expect(textDirection('fa-IR')).toBe('rtl');
    expect(textDirection('ur-PK')).toBe('rtl');
    expect(textDirection('ckb')).toBe('rtl');
  });

  it('accepts legacy language codes (iw/ji) as RTL', () => {
    expect(textDirection('iw')).toBe('rtl');
    expect(textDirection('ji')).toBe('rtl');
  });

  it('lets an explicit RTL script override an LTR language', () => {
    expect(textDirection('az-Arab')).toBe('rtl');
    expect(textDirection('pa-Arab')).toBe('rtl');
    expect(textDirection('ku-Arab')).toBe('rtl');
  });

  it('lets an explicit LTR script keep an otherwise-RTL language LTR', () => {
    expect(textDirection('ku-Latn')).toBe('ltr');
    // Kurmanji Kurdish in Latin script (ku is not in the RTL language set).
    expect(textDirection('ku')).toBe('ltr');
  });

  it('is case- and separator-insensitive', () => {
    expect(textDirection('AR-eg')).toBe('rtl');
    expect(textDirection('ar_EG')).toBe('rtl');
    expect(textDirection('az-arab')).toBe('rtl');
  });

  it('defaults to LTR for blank / nullish / unknown tags', () => {
    expect(textDirection('')).toBe('ltr');
    expect(textDirection('   ')).toBe('ltr');
    expect(textDirection(null)).toBe('ltr');
    expect(textDirection(undefined)).toBe('ltr');
    expect(textDirection('xx-YY')).toBe('ltr');
  });
});
