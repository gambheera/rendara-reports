import { describe, expect, it } from 'vitest';

import { formatValue, formatValueDetailed, parseNumberPattern } from './format';

/**
 * Normalizes the non-breaking / narrow-no-break spaces ICU inserts (e.g. between
 * a number and a currency sign in many locales) to a plain space, so literal
 * assertions don't hinge on which space codepoint the runtime's ICU emits.
 */
const norm = (s: string): string => s.replace(new RegExp(`[${String.fromCharCode(0x00a0, 0x202f)}]`, "g"), " ");

describe('formatValue — null/undefined → fallback', () => {
  it('null returns the default empty fallback', () => {
    expect(formatValue(null, 'number:0.00')).toBe('');
  });

  it('undefined returns the default empty fallback', () => {
    expect(formatValue(undefined, 'currency:USD')).toBe('');
  });

  it('null returns a custom fallback when provided', () => {
    expect(formatValue(null, 'currency:USD', { fallback: '—' })).toBe('—');
  });

  it('undefined with no token still returns the fallback', () => {
    expect(formatValue(undefined, null, { fallback: 'n/a' })).toBe('n/a');
  });
});

describe('formatValue — raw fallback (absent / unknown token)', () => {
  it('renders a string value as-is when no token is given', () => {
    expect(formatValue('Acme Corp', null)).toBe('Acme Corp');
  });

  it('renders a string value as-is for an empty token', () => {
    expect(formatValue('Acme Corp', '')).toBe('Acme Corp');
  });

  it('stringifies a number for an unknown token type', () => {
    expect(formatValue(42, 'frobnicate')).toBe('42');
  });

  it('stringifies a boolean raw', () => {
    expect(formatValue(true, null)).toBe('true');
  });

  it('stringifies an object raw', () => {
    expect(formatValue({ a: 1 }, 'frobnicate')).toBe('[object Object]');
  });
});

describe('formatValue — currency', () => {
  it.each([
    { locale: 'en-US', value: 1234.5, expected: '$1,234.50' },
    { locale: 'de-DE', value: 1234.5, token: 'currency:EUR', expected: '1.234,50 €' },
  ])('formats $value in $locale', ({ locale, value, token, expected }) => {
    expect(norm(formatValue(value, token ?? 'currency:USD', { locale }))).toBe(expected);
  });

  it('threads the locale through for ar-EG (oracle comparison)', () => {
    const value = 1234.5;
    const oracle = new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' }).format(
      value,
    );
    expect(formatValue(value, 'currency:EGP', { locale: 'ar-EG' })).toBe(oracle);
  });

  it('accepts a lowercase currency code', () => {
    expect(norm(formatValue(10, 'currency:usd', { locale: 'en-US' }))).toBe('$10.00');
  });

  it('coerces a numeric string', () => {
    expect(norm(formatValue('1234.5', 'currency:USD', { locale: 'en-US' }))).toBe('$1,234.50');
  });

  it('falls back on an invalid currency code', () => {
    expect(formatValue(10, 'currency:DOLLARS', { fallback: '?' })).toBe('?');
  });

  it('falls back on a non-numeric value', () => {
    expect(formatValue('abc', 'currency:USD', { fallback: '?' })).toBe('?');
  });
});

describe('formatValue — number', () => {
  it.each([
    { locale: 'en-US', token: 'number:0.00', value: 1234.567, expected: '1234.57' },
    { locale: 'de-DE', token: 'number:0.00', value: 1234.567, expected: '1234,57' },
    { locale: 'en-US', token: 'number:#,##0.00', value: 1234567.891, expected: '1,234,567.89' },
    { locale: 'de-DE', token: 'number:#,##0.00', value: 1234567.891, expected: '1.234.567,89' },
  ])('formats $value with "$token" in $locale', ({ locale, token, value, expected }) => {
    expect(formatValue(value, token, { locale })).toBe(expected);
  });

  it('threads the locale through for ar-EG (oracle comparison)', () => {
    const value = 1234.5;
    const oracle = new Intl.NumberFormat('ar-EG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: false,
    }).format(value);
    expect(formatValue(value, 'number:0.00', { locale: 'ar-EG' })).toBe(oracle);
  });

  it('applies minimum integer digits from the pattern', () => {
    expect(formatValue(5, 'number:00.0', { locale: 'en-US' })).toBe('05.0');
  });

  it('renders an integer with no decimals for a bare "number" token', () => {
    expect(formatValue(1234, 'number', { locale: 'en-US' })).toBe('1234');
  });

  it('falls back on Infinity', () => {
    expect(formatValue(Infinity, 'number:0.00', { fallback: '?' })).toBe('?');
  });

  it('falls back on an empty string', () => {
    expect(formatValue('', 'number:0.00', { fallback: '?' })).toBe('?');
  });

  it('falls back on a boolean (not a number)', () => {
    expect(formatValue(true, 'number:0.00', { fallback: '?' })).toBe('?');
  });
});

describe('formatValue — percent', () => {
  it('formats a ratio with no fraction pattern', () => {
    expect(formatValue(0.1538, 'percent', { locale: 'en-US' })).toBe('15%');
  });

  it('formats a ratio with a fraction pattern', () => {
    expect(formatValue(0.1538, 'percent:0.0', { locale: 'en-US' })).toBe('15.4%');
  });

  it('threads the locale through for de-DE', () => {
    expect(norm(formatValue(0.1538, 'percent:0.0', { locale: 'de-DE' }))).toBe('15,4 %');
  });

  it('falls back on a non-numeric value', () => {
    expect(formatValue('x', 'percent', { fallback: '?' })).toBe('?');
  });
});

describe('formatValue — date styles', () => {
  const iso = '2026-06-17T13:05:09Z';

  it.each([
    { locale: 'en-US', token: 'date:medium', expected: 'Jun 17, 2026' },
    { locale: 'de-DE', token: 'date:medium', expected: '17.06.2026' },
    { locale: 'en-US', token: 'date', expected: 'Jun 17, 2026' }, // default style = medium
  ])('formats with "$token" in $locale', ({ locale, token, expected }) => {
    expect(formatValue(iso, token, { locale })).toBe(expected);
  });

  it('threads the locale through for ar-EG (oracle comparison)', () => {
    const oracle = new Intl.DateTimeFormat('ar-EG', {
      dateStyle: 'long',
      timeZone: 'UTC',
    }).format(new Date(iso));
    expect(formatValue(iso, 'date:long', { locale: 'ar-EG' })).toBe(oracle);
  });

  it('accepts an epoch-millis number', () => {
    const epoch = Date.parse(iso);
    expect(formatValue(epoch, 'date:medium', { locale: 'en-US' })).toBe('Jun 17, 2026');
  });

  it('accepts a Date instance', () => {
    expect(formatValue(new Date(iso), 'date:medium', { locale: 'en-US' })).toBe('Jun 17, 2026');
  });

  it('falls back on an unknown date style', () => {
    expect(formatValue(iso, 'date:fancy', { fallback: '?' })).toBe('?');
  });

  it('falls back on an unparseable date string', () => {
    expect(formatValue('not a date', 'date:medium', { fallback: '?' })).toBe('?');
  });

  it('falls back on an empty date string', () => {
    expect(formatValue('   ', 'date:medium', { fallback: '?' })).toBe('?');
  });

  it('falls back on an invalid Date instance', () => {
    expect(formatValue(new Date('nope'), 'date:medium', { fallback: '?' })).toBe('?');
  });

  it('falls back on a non-date value type', () => {
    expect(formatValue(true, 'date:medium', { fallback: '?' })).toBe('?');
  });
});

describe('formatValue — custom date patterns', () => {
  it('formats a zero-padded date/time pattern (UTC)', () => {
    expect(formatValue('2026-06-17T13:05:09Z', 'date:custom:yyyy-MM-dd HH:mm:ss')).toBe(
      '2026-06-17 13:05:09',
    );
  });

  it('formats single-digit (non-padded) tokens', () => {
    expect(formatValue('2026-06-07T03:05:09Z', 'date:custom:yyyy-M-d H:m:s')).toBe('2026-6-7 3:5:9');
  });

  it('renders the two-digit year token', () => {
    expect(formatValue('2026-06-17T00:00:00Z', 'date:custom:yy')).toBe('26');
  });

  it('renders locale-aware long and short month names', () => {
    const d = '2026-06-17T00:00:00Z';
    expect(formatValue(d, 'date:custom:MMMM', { locale: 'en-US' })).toBe('June');
    expect(formatValue(d, 'date:custom:MMM', { locale: 'en-US' })).toBe('Jun');
    expect(formatValue(d, 'date:custom:MMMM', { locale: 'de-DE' })).toBe('Juni');
  });

  it('respects a non-UTC time zone (day rolls back)', () => {
    expect(
      formatValue('2026-06-17T02:30:00Z', 'date:custom:yyyy-MM-dd HH', {
        timeZone: 'America/New_York',
      }),
    ).toBe('2026-06-16 22');
  });

  it('falls back on an unparseable value', () => {
    expect(formatValue('nope', 'date:custom:yyyy', { fallback: '?' })).toBe('?');
  });
});

describe('parseNumberPattern', () => {
  it('defaults to integer-only, no grouping for an empty pattern', () => {
    expect(parseNumberPattern('')).toEqual({
      minimumIntegerDigits: 1,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      useGrouping: false,
    });
  });

  it('defaults the same for an undefined pattern', () => {
    expect(parseNumberPattern(undefined)).toEqual({
      minimumIntegerDigits: 1,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      useGrouping: false,
    });
  });

  it('reads required vs optional fraction placeholders', () => {
    expect(parseNumberPattern('0.0#')).toEqual({
      minimumIntegerDigits: 1,
      minimumFractionDigits: 1,
      maximumFractionDigits: 2,
      useGrouping: false,
    });
  });

  it('enables grouping and reads minimum integer digits', () => {
    expect(parseNumberPattern('#,##00.000')).toEqual({
      minimumIntegerDigits: 2,
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
      useGrouping: true,
    });
  });
});

describe('formatValue — default locale', () => {
  it('uses en-US when no locale is supplied', () => {
    expect(formatValue(1234.5, 'number:#,##0.0')).toBe('1,234.5');
  });
});

describe('formatValueDetailed — status (E2-S6)', () => {
  it('reports ok for a clean format', () => {
    const r = formatValueDetailed(1234.5, 'currency:USD');
    expect(r.formatted).toBe('$1,234.50');
    expect(r.status).toBe('ok');
  });

  it('reports ok for the raw-stringify path (absent / unknown token)', () => {
    expect(formatValueDetailed('Acme', null).status).toBe('ok');
    expect(formatValueDetailed(42, 'frobnicate').status).toBe('ok');
  });

  it('reports empty for a null/undefined value (a missing value, not a format fault)', () => {
    expect(formatValueDetailed(null, 'number:0.00', { fallback: '—' })).toEqual({
      formatted: '—',
      status: 'empty',
    });
    expect(formatValueDetailed(undefined, null).status).toBe('empty');
  });

  it('reports mismatch when a present value cannot be coerced to the format type', () => {
    expect(formatValueDetailed('abc', 'currency:USD').status).toBe('mismatch');
    expect(formatValueDetailed('abc', 'number:0.00').status).toBe('mismatch');
    expect(formatValueDetailed('abc', 'percent').status).toBe('mismatch');
    expect(formatValueDetailed('not-a-date', 'date:medium').status).toBe('mismatch');
    expect(formatValueDetailed({}, 'currency:USD').status).toBe('mismatch');
  });

  it('reports bad-token for a known type with an invalid argument', () => {
    expect(formatValueDetailed(10, 'currency:US').status).toBe('bad-token');
    expect(formatValueDetailed('2026-06-17T00:00:00Z', 'date:bogus').status).toBe('bad-token');
  });

  it('keeps formatValue behaviour identical (delegates and drops status)', () => {
    expect(formatValue(10, 'currency:US', { fallback: 'X' })).toBe('X');
    expect(formatValueDetailed(10, 'currency:US', { fallback: 'X' }).formatted).toBe('X');
  });
});

/**
 * Story QA (E10-S2): "Arabic/German locale fixtures render correctly". An
 * invoice-shaped set of values — currency, number, percent, date — formatted in
 * `ar-EG` and `de-DE` and checked against a same-`Intl` oracle, so the assertions
 * hold across ICU versions while proving the locale is threaded through every
 * formatter (not just currency). This exercises the *engine* end of the
 * "locale-aware formatting end-to-end" acceptance; the viewer/designer wiring is
 * covered by their own specs.
 */
describe('formatValue — locale fixtures (E10-S2 i18n)', () => {
  const iso = '2026-06-17T13:05:09Z';

  it.each(['ar-EG', 'de-DE'])('formats an invoice value set in %s like Intl does', (locale) => {
    // currency
    expect(formatValue(1234.5, 'currency:EUR', { locale })).toBe(
      new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(1234.5),
    );
    // grouped number
    expect(formatValue(1234567.891, 'number:#,##0.00', { locale })).toBe(
      new Intl.NumberFormat(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        useGrouping: true,
      }).format(1234567.891),
    );
    // percent
    expect(formatValue(0.1538, 'percent:0.0', { locale })).toBe(
      new Intl.NumberFormat(locale, {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(0.1538),
    );
    // date
    expect(formatValue(iso, 'date:long', { locale })).toBe(
      new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(iso)),
    );
  });
});
