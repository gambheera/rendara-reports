/**
 * Designer i18n service (E10-S2) — the runtime translation layer the designer
 * chrome reads its strings through, so the UI is **translatable** (brief §9). It is
 * deliberately signal-native and dependency-light (no `@angular/localize`, no build
 * step): the current {@link locale} is a signal, and {@link t} reads it, so a
 * template binding `{{ i18n.t('key') }}` re-renders when the locale changes. That
 * signal-read reactivity is why the chrome calls {@link t} directly rather than
 * going through a (pure-pipe-memoised, non-reactive) translation pipe.
 *
 * English is the source of truth and the fallback: an unregistered locale, or a
 * locale whose catalog omits a key, resolves to {@link EN_MESSAGES}. So the default
 * (English) designer is byte-for-byte unchanged, and a partial translation never
 * blanks a label.
 *
 * Base **direction** (LTR/RTL) is intentionally *not* derived here: `scope:ui-kit`
 * may not depend on the engine (Nx boundaries), so the designer shell owns the
 * `locale → dir` mapping via the engine's `textDirection`. This service only holds
 * the locale + resolves messages.
 */

import {
  Injectable,
  InjectionToken,
  makeEnvironmentProviders,
  signal,
  type EnvironmentProviders,
  inject,
} from '@angular/core';

import {
  EN_MESSAGES,
  interpolate,
  type MessageCatalog,
  type MessageKey,
  type MessageParams,
} from './messages';

/** The default designer locale — English, matching the untranslated source strings. */
export const DEFAULT_DESIGNER_LOCALE = 'en-US';

/** Bootstrap configuration for {@link provideI18n}. */
export interface I18nConfig {
  /** Initial BCP-47 locale. Defaults to {@link DEFAULT_DESIGNER_LOCALE}. */
  readonly locale?: string;
  /** Translation catalogs keyed by BCP-47 locale (matched on the primary subtag). */
  readonly catalogs?: Readonly<Record<string, MessageCatalog>>;
}

/** DI token carrying the optional {@link I18nConfig} to {@link I18nService}. */
export const I18N_CONFIG = new InjectionToken<I18nConfig>('rdr-i18n-config');

/** The primary (language) subtag of a BCP-47 tag, lower-cased — the catalog key. */
function primarySubtag(locale: string): string {
  // `split` on a non-empty separator always yields index 0 (a string), so no guard.
  return locale.split(/[-_]/)[0].toLowerCase();
}

@Injectable({ providedIn: 'root' })
export class I18nService {
  /** Registered catalogs, keyed by primary language subtag (e.g. `de`, `ar`). */
  private readonly catalogs = new Map<string, MessageCatalog>();

  private readonly currentLocale = signal<string>(DEFAULT_DESIGNER_LOCALE);

  /** The active BCP-47 locale. A template that reads it re-renders on a locale change. */
  readonly locale = this.currentLocale.asReadonly();

  constructor() {
    const config = inject(I18N_CONFIG, { optional: true });
    if (config?.catalogs) {
      for (const [loc, catalog] of Object.entries(config.catalogs)) {
        this.registerCatalog(loc, catalog);
      }
    }
    if (config?.locale) {
      this.currentLocale.set(config.locale);
    }
  }

  /** Switches the active locale (drives every {@link t} read + the shell direction). */
  setLocale(locale: string): void {
    this.currentLocale.set(locale);
  }

  /** Registers (or replaces) a locale's catalog, matched later on its primary subtag. */
  registerCatalog(locale: string, catalog: MessageCatalog): void {
    this.catalogs.set(primarySubtag(locale), catalog);
  }

  /**
   * Resolves a {@link MessageKey} to its display string in the active locale, filling
   * any `{name}` placeholders from `params`. Falls back to the English source when
   * the active locale has no catalog or omits the key. Reads the {@link locale}
   * signal, so a template binding to this is reactive to locale changes.
   */
  t(key: MessageKey, params?: MessageParams): string {
    const catalog = this.catalogs.get(primarySubtag(this.currentLocale()));
    const template = catalog?.[key] ?? EN_MESSAGES[key];
    return params ? interpolate(template, params) : template;
  }
}

/**
 * Registers the designer i18n configuration (initial locale + translation
 * catalogs). Add to the app's `providers`; English needs no catalog (it is the
 * built-in source/fallback).
 */
export function provideI18n(config: I18nConfig): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: I18N_CONFIG, useValue: config }]);
}
