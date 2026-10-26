import { InjectionToken } from '@angular/core';

/** The page address, behind a token so the OAuth redirects can be tested. */
export interface BrowserLocation {
  /** Current absolute URL. */
  href(): string;
  /** `document.baseURI`: the app's root under GitLab Pages (the default OAuth redirect URI). */
  baseUri(): string;
  /** Leaves the app (OAuth authorize page). */
  assign(url: string): void;
  /** Replaces the current history entry without reloading (strips `?code=&state=`). */
  replace(url: string): void;
}

export const BROWSER_LOCATION = new InjectionToken<BrowserLocation>('BROWSER_LOCATION', {
  providedIn: 'root',
  factory: () => ({
    href: () => window.location.href,
    baseUri: () => document.baseURI,
    assign: (url) => window.location.assign(url),
    replace: (url) => window.history.replaceState(window.history.state, '', url),
  }),
});
