/**
 * Locale-aware formatting layer (E2-S2) — turns a resolved value plus a
 * **format token** into a display string, built entirely on the platform
 * `Intl` APIs (brief §6). This is the consumer of the `binding.format` /
 * `style.format` slot that `report-schema` validates as "a non-empty string"
 * but deliberately leaves un-grammared; the token *grammar* lives here.
 *
 * Pure, synchronous, framework-agnostic, and **total** (never throws): a value
 * that can't be coerced for the requested format, an unparseable token, or a
 * `null`/`undefined` value all resolve to the caller's `fallback` (or a raw
 * stringification), never an exception.
 *
 * ## Token grammar
 * A token is `type` optionally followed by `:arg` (split on the *first* colon,
 * so `date:custom:yyyy-MM-dd` has `type = "date"`, `arg = "custom:yyyy-MM-dd"`):
 *
 * | Token                     | Renders via                                   |
 * |---------------------------|-----------------------------------------------|
 * | `currency:USD`            | `Intl.NumberFormat` `{ style:'currency' }`    |
 * | `number:0.00` / `#,##0.0` | `Intl.NumberFormat` (pattern → digit options) |
 * | `percent` / `percent:0.0` | `Intl.NumberFormat` `{ style:'percent' }`     |
 * | `date:short\|medium\|long\|full` | `Intl.DateTimeFormat` `{ dateStyle }`  |
 * | `date:custom:<pattern>`   | token formatter (`yyyy MMMM dd HH …`)         |
 * | _absent / unknown_        | **raw** — `String(value)`                     |
 *
 * ## Conventions
 * - **Locale** is parameterized ({@link FormatOptions.locale}); defaults to
 *   `en-US` (the brief's default template locale).
 * - **Determinism:** date formatting defaults to `timeZone: 'UTC'` so output
 *   does not depend on the host's time zone. Override via
 *   {@link FormatOptions.timeZone}.
 * - **Percent** values are ratios — `0.15 → "15%"` (standard `Intl` behaviour).
 * - **Fail-soft:** a missing value (`null`/`undefined`) or one that can't be
 *   coerced to the format's expected type yields `fallback`. Richer
 *   missing-data warnings are E2-S6's job; here the rule is simply "never crash".
 */

/** Caller-facing options for {@link formatValue}. All optional. */
export interface FormatOptions {
  /** BCP-47 locale tag passed to `Intl`. Default `'en-US'`. */
  readonly locale?: string;
  /**
   * String substituted when the value is `null`/`undefined` or can't be coerced
   * for the requested format. Default `''`.
   */
  readonly fallback?: string;
  /** IANA time zone for date formatting. Default `'UTC'` (for determinism). */
  readonly timeZone?: string;
}

const DEFAULT_LOCALE = 'en-US';
const DEFAULT_FALLBACK = '';
const DEFAULT_TIME_ZONE = 'UTC';

/** Internal: options after defaults have been applied. */
interface ResolvedOptions {
  readonly locale: string;
  readonly fallback: string;
  readonly timeZone: string;
}

/**
 * Formats `value` according to `token` in the given locale, returning a display
 * string. Total — see the module doc for the token grammar and fail-soft rules.
 *
 * @param value   The resolved value (typically the output of `evaluate`).
 * @param token   A format token (e.g. `currency:USD`), or `null`/`undefined`/`''`
 *                for raw stringification.
 * @param options Locale / fallback / time-zone overrides.
 */
export function formatValue(
  value: unknown,
  token?: string | null,
  options?: FormatOptions,
): string {
  const ctx: ResolvedOptions = {
    locale: options?.locale ?? DEFAULT_LOCALE,
    fallback: options?.fallback ?? DEFAULT_FALLBACK,
    timeZone: options?.timeZone ?? DEFAULT_TIME_ZONE,
  };

  if (value === null || value === undefined) {
    return ctx.fallback;
  }

  const { type, arg } = splitToken(token);
  const resolver = type === '' ? undefined : registry[type];
  if (resolver === undefined) {
    return rawFormat(value);
  }
  return resolver(value, arg, ctx);
}

// --- token parsing -----------------------------------------------------------

/**
 * Splits a token into `type` and `arg` on the **first** colon (so a custom date
 * pattern's own colons are preserved in `arg`). A `null`/`undefined`/blank token
 * yields an empty `type`, which routes to the raw formatter.
 */
function splitToken(token?: string | null): { type: string; arg: string } {
  if (token === null || token === undefined) {
    return { type: '', arg: '' };
  }
  const trimmed = token.trim();
  if (trimmed === '') {
    return { type: '', arg: '' };
  }
  const idx = trimmed.indexOf(':');
  if (idx === -1) {
    return { type: trimmed, arg: '' };
  }
  return { type: trimmed.slice(0, idx), arg: trimmed.slice(idx + 1) };
}

// --- value coercion ----------------------------------------------------------

/** Coerces a value to a finite number, or `undefined` if it isn't one. */
function coerceNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return undefined;
    }
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/**
 * Coerces a value to a valid {@link Date} (accepting `Date`, an epoch-millis
 * number, or a parseable string), or `undefined` if it isn't one.
 */
function coerceDate(value: unknown): Date | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }
  if (typeof value === 'number' || typeof value === 'string') {
    const trimmed = typeof value === 'string' ? value.trim() : value;
    if (trimmed === '') {
      return undefined;
    }
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

// --- number pattern ----------------------------------------------------------

/** Parsed digit/decimal options derived from a `number`/`percent` pattern. */
export interface NumberPattern {
  readonly minimumIntegerDigits: number;
  readonly minimumFractionDigits: number;
  readonly maximumFractionDigits: number;
  readonly useGrouping: boolean;
}

/**
 * Parses a numeric pattern (e.g. `0.00`, `#,##0.0`, `00`) into `Intl`
 * fraction/integer-digit options.
 *
 * - Characters after the `.` are fraction placeholders: each `0` is *required*
 *   (min fraction), `0` and `#` together set the *maximum*.
 * - Leading `0`s in the integer part set the minimum integer digits.
 * - A `,` anywhere in the integer part enables grouping.
 *
 * An empty/absent pattern means "integers only, no grouping".
 */
export function parseNumberPattern(pattern: string | undefined): NumberPattern {
  if (pattern === undefined || pattern.trim() === '') {
    return {
      minimumIntegerDigits: 1,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      useGrouping: false,
    };
  }
  const dot = pattern.indexOf('.');
  const intPart = dot === -1 ? pattern : pattern.slice(0, dot);
  const fracPart = dot === -1 ? '' : pattern.slice(dot + 1);

  const useGrouping = intPart.includes(',');
  const intDigits = intPart.replace(/,/g, '');
  const minimumIntegerDigits = Math.max(1, countChar(intDigits, '0'));
  const minimumFractionDigits = countChar(fracPart, '0');
  const maximumFractionDigits = Math.max(minimumFractionDigits, fracPart.length);

  return { minimumIntegerDigits, minimumFractionDigits, maximumFractionDigits, useGrouping };
}

function countChar(s: string, ch: string): number {
  let n = 0;
  for (const c of s) {
    if (c === ch) {
      n += 1;
    }
  }
  return n;
}

// --- formatters (the registry) ----------------------------------------------

type Resolver = (value: unknown, arg: string, ctx: ResolvedOptions) => string;

function formatCurrency(value: unknown, arg: string, ctx: ResolvedOptions): string {
  const n = coerceNumber(value);
  if (n === undefined) {
    return ctx.fallback;
  }
  const code = arg.trim().toUpperCase();
  // ISO 4217 codes are three letters; guard so an invalid token fails soft.
  if (!/^[A-Z]{3}$/.test(code)) {
    return ctx.fallback;
  }
  return new Intl.NumberFormat(ctx.locale, { style: 'currency', currency: code }).format(n);
}

function formatNumber(value: unknown, arg: string, ctx: ResolvedOptions): string {
  const n = coerceNumber(value);
  if (n === undefined) {
    return ctx.fallback;
  }
  const p = parseNumberPattern(arg);
  return new Intl.NumberFormat(ctx.locale, {
    minimumIntegerDigits: p.minimumIntegerDigits,
    minimumFractionDigits: p.minimumFractionDigits,
    maximumFractionDigits: p.maximumFractionDigits,
    useGrouping: p.useGrouping,
  }).format(n);
}

function formatPercent(value: unknown, arg: string, ctx: ResolvedOptions): string {
  const n = coerceNumber(value);
  if (n === undefined) {
    return ctx.fallback;
  }
  const p = parseNumberPattern(arg);
  return new Intl.NumberFormat(ctx.locale, {
    style: 'percent',
    minimumFractionDigits: p.minimumFractionDigits,
    maximumFractionDigits: p.maximumFractionDigits,
    useGrouping: p.useGrouping,
  }).format(n);
}

const DATE_STYLES = new Set(['short', 'medium', 'long', 'full']);
const CUSTOM_PREFIX = 'custom:';

function formatDate(value: unknown, arg: string, ctx: ResolvedOptions): string {
  const d = coerceDate(value);
  if (d === undefined) {
    return ctx.fallback;
  }
  if (arg.startsWith(CUSTOM_PREFIX)) {
    return formatCustomDate(d, arg.slice(CUSTOM_PREFIX.length), ctx);
  }
  const style = arg === '' ? 'medium' : arg;
  if (!DATE_STYLES.has(style)) {
    return ctx.fallback;
  }
  return new Intl.DateTimeFormat(ctx.locale, {
    dateStyle: style as 'short' | 'medium' | 'long' | 'full',
    timeZone: ctx.timeZone,
  }).format(d);
}

const registry: Record<string, Resolver> = {
  currency: formatCurrency,
  number: formatNumber,
  percent: formatPercent,
  date: formatDate,
};

/** Raw fallback formatter for an absent or unknown token: stringify the value. */
function rawFormat(value: unknown): string {
  return typeof value === 'string' ? value : String(value);
}

// --- custom date pattern -----------------------------------------------------

/**
 * Formats a date against a token pattern. Supported tokens (longest match wins):
 * `yyyy yy`, `MMMM MMM MM M`, `dd d`, `HH H`, `mm m`, `ss s`. Month-name tokens
 * (`MMM`/`MMMM`) are locale-aware; numeric tokens are locale-neutral. All
 * components are read in `ctx.timeZone`. Any other characters pass through
 * literally — note that stray pattern letters in literal text are still
 * substituted, as with any token-based date formatter.
 */
function formatCustomDate(date: Date, pattern: string, ctx: ResolvedOptions): string {
  const parts = getDateParts(date, ctx.timeZone);
  const tokens: Record<string, () => string> = {
    yyyy: () => parts.year.padStart(4, '0'),
    yy: () => parts.year.slice(-2),
    MMMM: () => intlMonth(date, 'long', ctx),
    MMM: () => intlMonth(date, 'short', ctx),
    MM: () => parts.month,
    M: () => String(Number(parts.month)),
    dd: () => parts.day,
    d: () => String(Number(parts.day)),
    HH: () => parts.hour,
    H: () => String(Number(parts.hour)),
    mm: () => parts.minute,
    m: () => String(Number(parts.minute)),
    ss: () => parts.second,
    s: () => String(Number(parts.second)),
  };
  return pattern.replace(
    /yyyy|yy|MMMM|MMM|MM|M|dd|d|HH|H|mm|m|ss|s/g,
    (match) => tokens[match](),
  );
}

interface DateParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
}

/** Reads zero-padded date components in the given time zone via `Intl`. */
function getDateParts(date: Date, timeZone: string): DateParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  return {
    year: map['year'] ?? '',
    month: map['month'] ?? '',
    day: map['day'] ?? '',
    hour: map['hour'] ?? '',
    minute: map['minute'] ?? '',
    second: map['second'] ?? '',
  };
}

function intlMonth(date: Date, style: 'long' | 'short', ctx: ResolvedOptions): string {
  return new Intl.DateTimeFormat(ctx.locale, { month: style, timeZone: ctx.timeZone }).format(date);
}
