export { Button } from './lib/button/button';
export type { ButtonVariant } from './lib/button/button';

// Designer i18n (E10-S2): the signal-native translation service + message catalog
// so the designer chrome strings are translatable (brief §9). English is the source
// of truth and fallback; direction is derived by the shell, not here.
export {
  I18nService,
  provideI18n,
  I18N_CONFIG,
  DEFAULT_DESIGNER_LOCALE,
} from './lib/i18n/i18n.service';
export type { I18nConfig } from './lib/i18n/i18n.service';
export { EN_MESSAGES, interpolate } from './lib/i18n/messages';
export type { MessageCatalog, MessageKey, MessageParams } from './lib/i18n/messages';
export { DE_MESSAGES } from './lib/i18n/catalogs/de';
export { AR_MESSAGES } from './lib/i18n/catalogs/ar';
