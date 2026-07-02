import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';

import { I18nService, provideI18n } from './i18n.service';
import { EN_MESSAGES, interpolate } from './messages';
import { DE_MESSAGES } from './catalogs/de';
import { AR_MESSAGES } from './catalogs/ar';

/**
 * i18n service tests (E10-S2). Cover the English-source default, catalog lookup by
 * primary subtag, English fallback for missing keys/locales, `{name}` interpolation
 * and the reactive locale signal.
 */
describe('I18nService (E10-S2)', () => {
  function make(config?: Parameters<typeof provideI18n>[0]): I18nService {
    TestBed.configureTestingModule({
      providers: config ? [provideI18n(config)] : [],
    });
    return TestBed.inject(I18nService);
  }

  it('defaults to the English source strings', () => {
    const i18n = make();
    expect(i18n.locale()).toBe('en-US');
    expect(i18n.t('topBar.new')).toBe('New');
    expect(i18n.t('preview.badge')).toBe(EN_MESSAGES['preview.badge']);
  });

  it('resolves a registered catalog by the locale primary subtag', () => {
    const i18n = make({ locale: 'de-DE', catalogs: { de: DE_MESSAGES } });
    expect(i18n.t('topBar.new')).toBe('Neu');
    expect(i18n.t('topBar.preview')).toBe('Vorschau');
  });

  it('serves Arabic strings for an ar locale', () => {
    const i18n = make({ locale: 'ar-EG', catalogs: { ar: AR_MESSAGES } });
    expect(i18n.t('topBar.export')).toBe('تصدير');
  });

  it('falls back to English for a locale with no catalog', () => {
    const i18n = make({ locale: 'fr-FR' });
    expect(i18n.t('topBar.new')).toBe('New');
  });

  it('falls back to English for a key a catalog omits', () => {
    const i18n = make({ locale: 'de', catalogs: { de: { 'topBar.new': 'Neu' } } });
    // Only `topBar.new` is translated; the rest fall back to English.
    expect(i18n.t('topBar.new')).toBe('Neu');
    expect(i18n.t('topBar.export')).toBe('Export');
  });

  it('interpolates {name} placeholders', () => {
    const i18n = make();
    expect(i18n.t('preview.renderedWith', { fileName: 'invoice.json' })).toBe(
      'Rendered with invoice.json',
    );
    expect(i18n.t('statusBar.pageSetupAria', { summary: 'A4 · Portrait' })).toBe(
      'Page setup: A4 · Portrait',
    );
  });

  it('reacts to a locale switch at runtime', () => {
    const i18n = make({ catalogs: { de: DE_MESSAGES } });
    expect(i18n.t('topBar.export')).toBe('Export');
    i18n.setLocale('de-DE');
    expect(i18n.locale()).toBe('de-DE');
    expect(i18n.t('topBar.export')).toBe('Exportieren');
  });
});

describe('interpolate (E10-S2)', () => {
  it('leaves an unknown placeholder verbatim', () => {
    expect(interpolate('Hi {who}, {extra}', { who: 'Ada' })).toBe('Hi Ada, {extra}');
  });

  it('stringifies non-string params', () => {
    expect(interpolate('Page {n}', { n: 3 })).toBe('Page 3');
  });
});
