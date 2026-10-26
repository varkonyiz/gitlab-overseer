import { EnvironmentProviders, Provider, inject, provideAppInitializer } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';

import { AppConfig } from '../app/core/config/app-config';
import { ConfigService } from '../app/core/config/config.service';
import { BROWSER_LOCATION, BrowserLocation } from '../app/core/auth/browser-location';
import { authInterceptor } from '../app/core/auth/auth.interceptor';

export const GITLAB = 'https://gitlab.example.com';
export const API = `${GITLAB}/api/v4`;
export const APP_BASE = 'https://pages.example.com/overseer/';

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    gitlabUrl: GITLAB,
    oauth: { clientId: 'client-123', scopes: ['read_api'], redirectUri: null },
    allowPersonalAccessToken: true,
    defaultLanguage: 'en',
    defaultSources: [],
    ...overrides,
  };
}

/** A fake page address that records redirects. */
export class FakeLocation implements BrowserLocation {
  assigned: string[] = [];
  constructor(public current = APP_BASE) {}
  href(): string {
    return this.current;
  }
  baseUri(): string {
    return APP_BASE;
  }
  assign(url: string): void {
    this.assigned.push(url);
  }
  replace(url: string): void {
    this.current = url;
  }
}

/** HttpClient (with the auth interceptor) on the testing backend, translations and a config. */
export function provideTestApp(
  config: AppConfig = testConfig(),
  location = new FakeLocation(),
): (Provider | EnvironmentProviders)[] {
  return [
    provideHttpClient(withInterceptors([authInterceptor])),
    provideHttpClientTesting(),
    provideTranslateService({ fallbackLang: 'en', lang: 'en' }),
    { provide: BROWSER_LOCATION, useValue: location },
    provideAppInitializer(() => inject(ConfigService).set(config)),
  ];
}
