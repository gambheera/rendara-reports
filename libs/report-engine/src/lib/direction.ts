/**
 * Locale → base text direction (E10-S2) — the pure, framework-agnostic rule that
 * turns a template's BCP-47 `metadata.locale` into the `ltr`/`rtl` **base
 * direction** the shared renderer paints with. It is the direction analogue of the
 * {@link formatValue Intl formatting layer}: the same locale that localises
 * numbers, currency and dates also decides whether the report reads left-to-right
 * or right-to-left, so RTL is derived — never a new template-schema field (the
 * schema is a frozen versioned contract; brief §5 hard rule).
 *
 * ## The rule (deterministic, no `Intl.Locale` dependency)
 * A tag is split into its `-`/`_` separated subtags and classified in order:
 *
 *  1. **Explicit RTL script subtag wins.** A 4-letter ISO-15924 script such as
 *     `Arab`/`Hebr` pins the direction regardless of the language — so
 *     `az-Arab` (Azerbaijani in Arabic script) and `pa-Arab` (Shahmukhi Punjabi)
 *     are RTL, while `ku-Latn` stays LTR. This is checked first because a script
 *     is a stronger direction signal than the language alone.
 *  2. **Otherwise the primary language subtag.** The well-known RTL languages
 *     (Arabic, Hebrew, Persian, Urdu, …) map to `rtl`.
 *  3. **Otherwise `ltr`** — the safe default, also for a blank/absent tag.
 *
 * This mirrors CLDR's common cases without shipping the full CLDR table or relying
 * on a host `Intl.Locale().textInfo`, whose availability varies across runtimes.
 * Total and pure — never throws, no I/O, deterministic.
 */

/** Base text direction of a locale: left-to-right or right-to-left. */
export type TextDirection = 'ltr' | 'rtl';

/**
 * ISO-15924 script subtags written right-to-left (lower-cased for matching). An
 * explicit RTL script pins the direction even when the language is normally LTR
 * (e.g. `az-Arab`, `pa-Arab`, `ku-Arab`).
 */
const RTL_SCRIPTS = new Set([
  'arab', // Arabic
  'aran', // Nastaliq (Arabic variant)
  'hebr', // Hebrew
  'syrc', // Syriac
  'thaa', // Thaana (Divehi)
  'nkoo', // N'Ko
  'samr', // Samaritan
  'mand', // Mandaic
  'mend', // Mende Kikakui
  'adlm', // Adlam
  'rohg', // Hanifi Rohingya
  'yezi', // Yezidi
]);

/**
 * Primary language subtags whose default script is written right-to-left
 * (lower-cased). Covers the widely-used RTL languages; an unlisted language with
 * an explicit RTL script is still caught by {@link RTL_SCRIPTS}.
 */
const RTL_LANGUAGES = new Set([
  'ar', // Arabic
  'he', // Hebrew
  'iw', // Hebrew (legacy code)
  'fa', // Persian / Farsi
  'prs', // Dari
  'ur', // Urdu
  'ps', // Pashto
  'sd', // Sindhi
  'ug', // Uyghur
  'yi', // Yiddish
  'ji', // Yiddish (legacy code)
  'dv', // Divehi / Maldivian
  'ckb', // Central Kurdish (Sorani)
  'pnb', // Western Punjabi (Shahmukhi)
  'nqo', // N'Ko
  'syr', // Syriac
  'arc', // Aramaic
]);

/**
 * Resolves the base {@link TextDirection} for a BCP-47 `locale` tag. See the module
 * doc for the (script-first, then language) rule. A blank, `null` or `undefined`
 * tag — or any tag not recognised as RTL — resolves to `'ltr'`. Total.
 *
 * @param locale A BCP-47 locale tag (e.g. `'ar-EG'`, `'he'`, `'az-Arab'`).
 */
export function textDirection(locale: string | null | undefined): TextDirection {
  if (typeof locale !== 'string') {
    return 'ltr';
  }
  const trimmed = locale.trim();
  if (trimmed === '') {
    return 'ltr';
  }

  const subtags = trimmed.split(/[-_]/);

  // 1. An explicit RTL script subtag (positionally a 4-letter tag) wins.
  for (const subtag of subtags) {
    if (subtag.length === 4 && RTL_SCRIPTS.has(subtag.toLowerCase())) {
      return 'rtl';
    }
  }

  // 2. Otherwise fall back to the primary language subtag.
  const primary = subtags[0]?.toLowerCase() ?? '';
  return RTL_LANGUAGES.has(primary) ? 'rtl' : 'ltr';
}
