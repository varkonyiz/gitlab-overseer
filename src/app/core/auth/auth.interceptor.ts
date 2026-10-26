import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';

import { ConfigService } from '../config/config.service';
import { AuthService } from './auth.service';

/**
 * Adds `Authorization: Bearer …` to requests for the configured GitLab API only, so the token
 * never reaches another origin. A 401 on an OAuth session triggers one refresh and one retry;
 * a second 401 ends the session.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const configService = inject(ConfigService);
  const auth = inject(AuthService);
  const config = configService.loaded();

  if (!config || req.headers.has('Authorization') || !isGitLabApi(req.url, config.gitlabUrl)) {
    return next(req);
  }

  const send = (token: string | null) => next(token ? withToken(req, token) : req);

  return from(auth.accessToken()).pipe(
    switchMap((token) =>
      send(token).pipe(
        catchError((error: unknown) => {
          if (!(error instanceof HttpErrorResponse) || error.status !== 401 || !token) {
            return throwError(() => error);
          }
          if (auth.session()?.method !== 'oauth') {
            auth.sessionRejected();
            return throwError(() => error);
          }
          return from(auth.refresh()).pipe(
            switchMap((session) => {
              if (!session) {
                return throwError(() => error);
              }
              return send(session.accessToken).pipe(
                catchError((retryError: unknown) => {
                  if (retryError instanceof HttpErrorResponse && retryError.status === 401) {
                    auth.sessionRejected();
                  }
                  return throwError(() => retryError);
                }),
              );
            }),
          );
        }),
      ),
    ),
  );
};

/** True for `<gitlabUrl>/api/…` on the same origin and path prefix (no look-alike hosts). */
export function isGitLabApi(requestUrl: string, gitlabUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return false; // relative URLs are the app's own files
  }
  const base = new URL(`${gitlabUrl}/api/`);
  return url.origin === base.origin && url.pathname.startsWith(base.pathname);
}

function withToken(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}
