import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { AR_MESSAGES, DE_MESSAGES, provideI18n } from '@rendara/ui-kit';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Designer i18n (E10-S2): English is the built-in source/fallback; German and
    // Arabic demonstrate translatable chrome (and, for Arabic, RTL). The default
    // locale stays English, so the designer is unchanged until a locale is set.
    provideI18n({ catalogs: { de: DE_MESSAGES, ar: AR_MESSAGES } }),
  ],
};
