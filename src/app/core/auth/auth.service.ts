import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ConfigService } from '../config/config.service';
import { GitLabTokenResponse, GitLabUser } from '../gitlab/gitlab.models';
import { httpStatus } from '../gitlab/gitlab-api.service';
import { STORAGE_PREFIX, readJson, removeItem, writeJson } from '../storage/browser-storage';
import { BROWSER_LOCATION } from './browser-location';
import { codeChallengeS256, createCodeVerifier, createState, safeEqual } from './pkce';

export type AuthMethod = 'oauth' | 'token';

/** The signed-in session. Kept in sessionStorage: it ends with the browser tab. */
export interface AuthSession {
  readonly method: AuthMethod;
  /** The instance the token belongs to; a session for another URL is discarded. */
  readonly gitlabUrl: string;
  readonly accessToken: string;
  readonly refreshToken: string | null;
  /** Epoch milliseconds, null = no known expiry (personal access tokens). */
  readonly expiresAt: number | null;
}

interface PendingLogin {
  readonly state: string;
  readonly verifier: string;
  readonly redirectUri: string;
  readonly returnTo: string;
  readonly createdAt: number;
}

export type AuthErrorCode =
  | 'denied'
  | 'stateMismatch'
  | 'expired'
  | 'tokenExchange'
  | 'invalidToken'
  | 'network'
  | 'sessionExpired'
  | 'oauthNotConfigured';

export interface AuthError {
  readonly code: AuthErrorCode;
  /** Text from GitLab (error_description); untrusted, shown as plain text only. */
  readonly detail?: string;
}

export const SESSION_KEY = `${STORAGE_PREFIX}session`;
export const PENDING_KEY = `${STORAGE_PREFIX}oauth-pending`;
/** A sign-in that does not come back within this time is refused. */
export const PENDING_MAX_AGE_MS = 10 * 60 * 1000;
/** Refresh the OAuth token this long before it expires. */
export const REFRESH_MARGIN_MS = 60 * 1000;
const MAX_DETAIL_LENGTH = 300;
/** Angular would send URLSearchParams as JSON; OAuth endpoints expect a form body. */
const FORM_HEADERS = { 'Content-Type': 'application/x-www-form-urlencoded' };

/**
 * Sign-in to GitLab without a backend: OAuth 2.0 authorization code flow with PKCE for a
 * non-confidential application (no client secret), or a personal access token when the
 * deployment allows it. Tokens are only ever sent to the configured GitLab instance.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly configService = inject(ConfigService);
  private readonly location = inject(BROWSER_LOCATION);

  private readonly sessionState = signal<AuthSession | null>(null);
  private refreshing: Promise<AuthSession | null> | null = null;

  readonly session = this.sessionState.asReadonly();
  readonly user = signal<GitLabUser | null>(null);
  readonly error = signal<AuthError | null>(null);
  readonly isAuthenticated = computed(() => this.sessionState() !== null && this.user() !== null);
  /** Route to open after the OAuth callback (set by `init()`). */
  readonly returnTo = signal<string | null>(null);

  get oauthEnabled(): boolean {
    return this.configService.config.oauth.clientId !== '';
  }

  /** App initializer: finishes an OAuth callback or restores the stored session. */
  async init(): Promise<void> {
    if (!this.configService.loaded()) {
      return;
    }
    const url = new URL(this.location.href());
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const oauthError = url.searchParams.get('error');

    if (code !== null || oauthError !== null) {
      const description = url.searchParams.get('error_description');
      this.stripCallbackParameters(url);
      if (oauthError !== null) {
        removeItem('session', PENDING_KEY);
        this.error.set({ code: 'denied', detail: shorten(description ?? oauthError) });
        return;
      }
      await this.completeOAuthLogin(code ?? '', state ?? '');
    } else {
      this.sessionState.set(this.restoreSession());
    }

    if (this.sessionState()) {
      await this.loadUser();
    }
  }

  /** Redirects to GitLab's authorize page. `returnTo` is the route to open afterwards. */
  async startOAuthLogin(returnTo = '/'): Promise<void> {
    const { gitlabUrl, oauth } = this.configService.config;
    if (!oauth.clientId) {
      this.error.set({ code: 'oauthNotConfigured' });
      return;
    }
    const verifier = createCodeVerifier();
    const pending: PendingLogin = {
      state: createState(),
      verifier,
      redirectUri: this.redirectUri(),
      returnTo: safeReturnTo(returnTo),
      createdAt: Date.now(),
    };
    writeJson('session', PENDING_KEY, pending);

    const params = new URLSearchParams({
      client_id: oauth.clientId,
      redirect_uri: pending.redirectUri,
      response_type: 'code',
      state: pending.state,
      scope: oauth.scopes.join(' '),
      code_challenge: await codeChallengeS256(verifier),
      code_challenge_method: 'S256',
    });
    this.location.assign(`${gitlabUrl}/oauth/authorize?${params.toString()}`);
  }

  /** Signs in with a personal access token after checking it against `GET /user`. */
  async loginWithToken(token: string): Promise<boolean> {
    const { gitlabUrl, allowPersonalAccessToken } = this.configService.config;
    const trimmed = token.trim();
    if (!allowPersonalAccessToken || !/^[\x21-\x7e]{8,512}$/.test(trimmed)) {
      this.error.set({ code: 'invalidToken' });
      return false;
    }
    try {
      const user = await firstValueFrom(
        this.http.get<GitLabUser>(`${gitlabUrl}/api/v4/user`, {
          headers: { Authorization: `Bearer ${trimmed}` },
        }),
      );
      this.setSession({
        method: 'token',
        gitlabUrl,
        accessToken: trimmed,
        refreshToken: null,
        expiresAt: null,
      });
      this.user.set(user);
      this.error.set(null);
      return true;
    } catch (error) {
      this.error.set({ code: httpStatus(error) === 0 ? 'network' : 'invalidToken' });
      return false;
    }
  }

  async logout(): Promise<void> {
    const session = this.sessionState();
    this.clearSession();
    this.error.set(null);
    if (session?.method === 'oauth') {
      // Best effort: the token is gone locally either way.
      try {
        await firstValueFrom(
          this.http.post(
            `${session.gitlabUrl}/oauth/revoke`,
            new URLSearchParams({
              client_id: this.configService.config.oauth.clientId,
              token: session.accessToken,
            }).toString(),
            { headers: FORM_HEADERS },
          ),
        );
      } catch {
        // Revocation failed (offline, CORS); the token expires on its own.
      }
    }
  }

  /**
   * The access token to send, refreshed first when it is about to expire. Null = not signed in
   * (or the refresh failed and the session ended).
   */
  async accessToken(now = Date.now()): Promise<string | null> {
    const session = this.sessionState();
    if (!session) {
      return null;
    }
    if (session.expiresAt !== null && session.expiresAt - REFRESH_MARGIN_MS <= now) {
      return (await this.refresh())?.accessToken ?? null;
    }
    return session.accessToken;
  }

  /**
   * Exchanges the refresh token for a new token pair; concurrent callers share one request
   * (GitLab invalidates the old refresh token, so a second exchange would fail).
   */
  refresh(): Promise<AuthSession | null> {
    this.refreshing ??= this.doRefresh().finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  /** Ends the session after GitLab refused the token (called by the interceptor). */
  sessionRejected(): void {
    if (this.sessionState()) {
      this.clearSession();
      this.error.set({ code: 'sessionExpired' });
    }
  }

  /** The callback URL registered for the OAuth application. */
  redirectUri(): string {
    const configured = this.configService.config.oauth.redirectUri;
    if (configured) {
      return configured;
    }
    const base = new URL(this.location.baseUri());
    base.search = '';
    base.hash = '';
    return base.toString();
  }

  private async doRefresh(): Promise<AuthSession | null> {
    const session = this.sessionState();
    if (!session?.refreshToken) {
      this.sessionRejected();
      return null;
    }
    try {
      const response = await this.tokenRequest(
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: session.refreshToken,
          client_id: this.configService.config.oauth.clientId,
          redirect_uri: this.redirectUri(),
        }),
      );
      const refreshed = toSession(response, session.gitlabUrl);
      this.setSession(refreshed);
      return refreshed;
    } catch {
      this.sessionRejected();
      return null;
    }
  }

  private async completeOAuthLogin(code: string, state: string): Promise<void> {
    const pending = parsePending(readJson('session', PENDING_KEY));
    removeItem('session', PENDING_KEY); // single use, whatever happens next
    if (!pending || !state || !safeEqual(pending.state, state)) {
      this.error.set({ code: 'stateMismatch' });
      return;
    }
    if (Date.now() - pending.createdAt > PENDING_MAX_AGE_MS) {
      this.error.set({ code: 'expired' });
      return;
    }
    const { gitlabUrl, oauth } = this.configService.config;
    try {
      const response = await this.tokenRequest(
        new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: oauth.clientId,
          code,
          redirect_uri: pending.redirectUri,
          code_verifier: pending.verifier,
        }),
      );
      this.setSession(toSession(response, gitlabUrl));
      this.returnTo.set(pending.returnTo);
      this.error.set(null);
    } catch (error) {
      this.error.set({
        code: httpStatus(error) === 0 ? 'network' : 'tokenExchange',
        detail: oauthErrorDetail(error),
      });
    }
  }

  private tokenRequest(body: URLSearchParams): Promise<GitLabTokenResponse> {
    // A form-encoded POST is a "simple" CORS request; GitLab also answers preflights for /oauth/token.
    return firstValueFrom(
      this.http.post<GitLabTokenResponse>(
        `${this.configService.config.gitlabUrl}/oauth/token`,
        body.toString(),
        { headers: FORM_HEADERS },
      ),
    );
  }

  private async loadUser(): Promise<void> {
    try {
      this.user.set(await firstValueFrom(this.http.get<GitLabUser>(this.apiUser())));
    } catch (error) {
      if (httpStatus(error) === 401) {
        this.sessionRejected();
      } else {
        // Keep the session (GitLab may be briefly unreachable); pages show the connection state.
        this.error.set({ code: 'network' });
      }
    }
  }

  private apiUser(): string {
    return `${this.configService.config.gitlabUrl}/api/v4/user`;
  }

  private restoreSession(): AuthSession | null {
    const session = parseSession(readJson('session', SESSION_KEY));
    if (!session || session.gitlabUrl !== this.configService.config.gitlabUrl) {
      removeItem('session', SESSION_KEY);
      return null;
    }
    return session;
  }

  private setSession(session: AuthSession): void {
    this.sessionState.set(session);
    writeJson('session', SESSION_KEY, session);
  }

  private clearSession(): void {
    this.sessionState.set(null);
    this.user.set(null);
    removeItem('session', SESSION_KEY);
  }

  private stripCallbackParameters(url: URL): void {
    for (const key of ['code', 'state', 'error', 'error_description', 'error_uri']) {
      url.searchParams.delete(key);
    }
    this.location.replace(url.toString());
  }
}

function toSession(response: GitLabTokenResponse, gitlabUrl: string): AuthSession {
  if (typeof response?.access_token !== 'string' || response.access_token === '') {
    throw new Error('The token response has no access_token.');
  }
  const expiresIn = typeof response.expires_in === 'number' ? response.expires_in : null;
  return {
    method: 'oauth',
    gitlabUrl,
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? null,
    expiresAt: expiresIn !== null ? Date.now() + expiresIn * 1000 : null,
  };
}

function parseSession(value: unknown): AuthSession | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const s = value as Partial<AuthSession>;
  const ok =
    (s.method === 'oauth' || s.method === 'token') &&
    typeof s.gitlabUrl === 'string' &&
    typeof s.accessToken === 'string' &&
    s.accessToken !== '' &&
    (s.refreshToken === null || typeof s.refreshToken === 'string') &&
    (s.expiresAt === null || typeof s.expiresAt === 'number');
  return ok ? (s as AuthSession) : null;
}

function parsePending(value: unknown): PendingLogin | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const p = value as Partial<PendingLogin>;
  const ok =
    typeof p.state === 'string' &&
    typeof p.verifier === 'string' &&
    typeof p.redirectUri === 'string' &&
    typeof p.returnTo === 'string' &&
    typeof p.createdAt === 'number';
  return ok ? (p as PendingLogin) : null;
}

/** Only in-app routes: `/path`, never `//host` or an absolute URL. */
export function safeReturnTo(value: string): string {
  return /^\/(?![/\\])[\w\-./?=&%]*$/.test(value) ? value : '/';
}

function oauthErrorDetail(error: unknown): string | undefined {
  const body = (error as { error?: unknown } | null)?.error;
  if (typeof body === 'object' && body !== null) {
    const description = (body as Record<string, unknown>)['error_description'];
    const code = (body as Record<string, unknown>)['error'];
    const text = typeof description === 'string' ? description : code;
    return typeof text === 'string' ? shorten(text) : undefined;
  }
  return undefined;
}

function shorten(text: string): string {
  const single = text.replace(/\s+/g, ' ').trim();
  return single.length > MAX_DETAIL_LENGTH ? `${single.slice(0, MAX_DETAIL_LENGTH)}…` : single;
}
