import { describe, expect, it } from 'vitest';
import type { Page } from './page';
import {
  DEFAULT_FONT,
  DEFAULT_MARGINS_MM,
  DEFAULT_PAGE,
  NAMED_PAGE_SIZES_MM,
  isCustomPageSize,
  isNamedPageSize,
  isValidPageSettings,
  resolvePage,
  resolvePageDimensionsMm,
  validatePageSettings,
} from './page-settings';

describe('page defaults (E1-S2)', () => {
  it('DEFAULT_PAGE is A4 portrait with the documented defaults', () => {
    expect(DEFAULT_PAGE).toEqual({
      size: 'A4',
      orientation: 'portrait',
      marginsMm: { top: 20, right: 15, bottom: 20, left: 15 },
      units: 'mm',
      defaultFont: { family: 'Inter', sizePt: 10 },
      background: null,
    } satisfies Page);
  });

  it('DEFAULT_PAGE reuses the shared margin/font defaults', () => {
    expect(DEFAULT_PAGE.marginsMm).toBe(DEFAULT_MARGINS_MM);
    expect(DEFAULT_PAGE.defaultFont).toBe(DEFAULT_FONT);
  });

  it('is itself valid page settings', () => {
    expect(validatePageSettings(DEFAULT_PAGE)).toEqual([]);
    expect(isValidPageSettings(DEFAULT_PAGE)).toBe(true);
  });
});

describe('page-size guards (E1-S2)', () => {
  it('recognises named sizes', () => {
    expect(isNamedPageSize('A4')).toBe(true);
    expect(isNamedPageSize('Letter')).toBe(true);
    expect(isCustomPageSize('A4')).toBe(false);
  });

  it('recognises custom sizes', () => {
    const custom = { widthMm: 100, heightMm: 200 };
    expect(isCustomPageSize(custom)).toBe(true);
    expect(isNamedPageSize(custom)).toBe(false);
  });
});

describe('resolvePageDimensionsMm (E1-S2)', () => {
  it('resolves named sizes in portrait to their canonical mm dimensions', () => {
    expect(resolvePageDimensionsMm('A4', 'portrait')).toEqual({
      widthMm: 210,
      heightMm: 297,
    });
    expect(resolvePageDimensionsMm('Letter', 'portrait')).toEqual({
      widthMm: 215.9,
      heightMm: 279.4,
    });
  });

  it('swaps width/height for landscape named sizes', () => {
    expect(resolvePageDimensionsMm('A4', 'landscape')).toEqual({
      widthMm: 297,
      heightMm: 210,
    });
  });

  it('matches the published NAMED_PAGE_SIZES_MM table in portrait', () => {
    expect(resolvePageDimensionsMm('A4', 'portrait')).toEqual(
      NAMED_PAGE_SIZES_MM.A4
    );
  });

  it('takes custom sizes literally regardless of orientation', () => {
    const custom = { widthMm: 120, heightMm: 60 };
    expect(resolvePageDimensionsMm(custom, 'portrait')).toEqual(custom);
    expect(resolvePageDimensionsMm(custom, 'landscape')).toEqual(custom);
  });
});

describe('resolvePage default resolution (E1-S2)', () => {
  it('returns the defaults when given no input', () => {
    expect(resolvePage()).toEqual(DEFAULT_PAGE);
  });

  it('returns the defaults for an empty input object', () => {
    expect(resolvePage({})).toEqual(DEFAULT_PAGE);
  });

  it('overrides only the fields provided', () => {
    const page = resolvePage({ orientation: 'landscape', units: 'pt' });
    expect(page.orientation).toBe('landscape');
    expect(page.units).toBe('pt');
    expect(page.size).toBe('A4');
    expect(page.marginsMm).toEqual(DEFAULT_MARGINS_MM);
    expect(page.defaultFont).toEqual(DEFAULT_FONT);
  });

  it('merges partial margins field-by-field against the defaults', () => {
    const page = resolvePage({ marginsMm: { top: 5 } });
    expect(page.marginsMm).toEqual({ top: 5, right: 15, bottom: 20, left: 15 });
  });

  it('merges a partial default font field-by-field', () => {
    const page = resolvePage({ defaultFont: { sizePt: 12 } });
    expect(page.defaultFont).toEqual({ family: 'Inter', sizePt: 12 });
  });

  it('accepts a custom size', () => {
    const page = resolvePage({ size: { widthMm: 100, heightMm: 150 } });
    expect(page.size).toEqual({ widthMm: 100, heightMm: 150 });
  });

  it('honours an explicit null background and a provided background', () => {
    expect(resolvePage({ background: null }).background).toBeNull();
    expect(resolvePage({ background: '#fff' }).background).toBe('#fff');
  });

  it('does not mutate the shared default constants', () => {
    resolvePage({ marginsMm: { top: 99 }, defaultFont: { sizePt: 99 } });
    expect(DEFAULT_MARGINS_MM).toEqual({ top: 20, right: 15, bottom: 20, left: 15 });
    expect(DEFAULT_FONT).toEqual({ family: 'Inter', sizePt: 10 });
  });
});

describe('validatePageSettings custom-size validation (E1-S2)', () => {
  const base = DEFAULT_PAGE;

  it('accepts a valid custom size', () => {
    const page: Page = { ...base, size: { widthMm: 120, heightMm: 200 } };
    expect(validatePageSettings(page)).toEqual([]);
  });

  it('rejects a non-positive custom width', () => {
    const page: Page = { ...base, size: { widthMm: 0, heightMm: 200 } };
    const errors = validatePageSettings(page);
    expect(errors).toContainEqual(
      expect.objectContaining({ path: 'page.size.widthMm' })
    );
    expect(isValidPageSettings(page)).toBe(false);
  });

  it('rejects a negative custom height', () => {
    const page: Page = { ...base, size: { widthMm: 120, heightMm: -5 } };
    expect(validatePageSettings(page)).toContainEqual(
      expect.objectContaining({ path: 'page.size.heightMm' })
    );
  });

  it('rejects non-finite custom dimensions', () => {
    const page: Page = {
      ...base,
      size: { widthMm: Number.NaN, heightMm: Number.POSITIVE_INFINITY },
    };
    const paths = validatePageSettings(page).map((error) => error.path);
    expect(paths).toContain('page.size.widthMm');
    expect(paths).toContain('page.size.heightMm');
  });
});

describe('validatePageSettings margins & font (E1-S2)', () => {
  it('rejects a negative margin', () => {
    const page: Page = {
      ...DEFAULT_PAGE,
      marginsMm: { ...DEFAULT_MARGINS_MM, left: -1 },
    };
    expect(validatePageSettings(page)).toContainEqual(
      expect.objectContaining({ path: 'page.marginsMm.left' })
    );
  });

  it('rejects horizontal margins that exceed the page width', () => {
    const page: Page = {
      ...DEFAULT_PAGE,
      marginsMm: { top: 20, bottom: 20, left: 120, right: 120 },
    };
    expect(validatePageSettings(page)).toContainEqual(
      expect.objectContaining({
        path: 'page.marginsMm',
        message: expect.stringContaining('horizontal content area'),
      })
    );
  });

  it('rejects vertical margins that exceed the page height', () => {
    const page: Page = {
      ...DEFAULT_PAGE,
      marginsMm: { top: 200, bottom: 200, left: 15, right: 15 },
    };
    expect(validatePageSettings(page)).toContainEqual(
      expect.objectContaining({
        path: 'page.marginsMm',
        message: expect.stringContaining('vertical content area'),
      })
    );
  });

  it('does not raise a fit error when a margin is already flagged as invalid', () => {
    const page: Page = {
      ...DEFAULT_PAGE,
      marginsMm: { top: 20, bottom: 20, left: Number.NaN, right: 15 },
    };
    const paths = validatePageSettings(page).map((error) => error.path);
    expect(paths).toContain('page.marginsMm.left');
    expect(paths).not.toContain('page.marginsMm');
  });

  it('rejects a non-positive default font size', () => {
    const page: Page = {
      ...DEFAULT_PAGE,
      defaultFont: { family: 'Inter', sizePt: 0 },
    };
    expect(validatePageSettings(page)).toContainEqual(
      expect.objectContaining({ path: 'page.defaultFont.sizePt' })
    );
  });
});
