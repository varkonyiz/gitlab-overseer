import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding, withHashLocation } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';

import { routes } from './app.routes';
import { AnalyticsSettingsService } from './core/analytics/analytics-settings.service';
import { MergeRequestDataService } from './core/analytics/merge-request-data.service';
import { authInterceptor } from './core/auth/auth.interceptor';
import { AuthService } from './core/auth/auth.service';
import { ConfigService } from './core/config/config.service';
import { PreferencesService } from './core/preferences.service';
import { DataSourcesService } from './core/sources/data-sources.service';

/**
 * Startup order matters: configuration → preferences → stored sources, settings and dataset →
 * session/OAuth callback.
 */
export async function initializeApp(): Promise<void> {
  const config = inject(ConfigService);
  const preferences = inject(PreferencesService);
  const sources = inject(DataSourcesService);
  const settings = inject(AnalyticsSettingsService);
  const data = inject(MergeRequestDataService);
  const auth = inject(AuthService);
  await config.load();
  preferences.init();
  sources.init();
  settings.init();
  data.init();
  await auth.init();
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Hash routes: GitLab Pages serves only real files, so deep links must not need a server rewrite.
    provideRouter(routes, withHashLocation(), withComponentInputBinding()),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    provideTranslateService({
      loader: provideTranslateHttpLoader({ prefix: './i18n/', suffix: '.json' }),
      fallbackLang: 'en',
      lang: 'en',
    }),
    provideAppInitializer(initializeApp),
  ],
};
