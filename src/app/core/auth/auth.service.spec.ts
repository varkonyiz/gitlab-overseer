import { TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';

import {
  API,
  APP_BASE,
  FakeLocation,
  GITLAB,
  provideTestApp,
  testConfig,
} from '../../../testing/test-config';
import { AppConfig } from '../config/app-config';
import { AuthService, PENDING_KEY, PENDING_MAX_AGE_MS, SESSION_KEY } from './auth.service';

const USER = { id: 7, username: 'dev', name: 'Dev', avatar_url: null, web_url: `${GITLAB}/dev` };

describe('AuthService', () => {
  let location: FakeLocation;
  let http: HttpTestingController;

  function setup(config: AppConfig = testConfig(), href = APP_BASE): AuthService {
    location = new FakeLocation(href);
    TestBed.configureTestingModule({ providers: provideTestApp(config, location) });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(AuthService);
  }

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => http.verify());

  it('startOAuthLogin_Configured_RedirectsWithPkceAndStoresPending', async () => {
    const auth = setup();

    await auth.startOAuthLogin('/sources');

    const url = new URL(location.assigned[0]);
    const pending = JSON.parse(sessionStorage.getItem(PENDING_KEY)!);
    expect(url.origin + url.pathname).toBe(`${GITLAB}/oauth/authorize`);
    expect(Object.fromEntries(url.searchParams)).toEqual(
      expect.objectContaining({
        client_id: 'client-123',
        redirect_uri: APP_BASE,
        response_type: 'code',
        scope: 'read_api',
        code_challenge_method: 'S256',
        state: pending.state,
      }),
    );
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(pending.returnTo).toBe('/sources');
  });

  it('startOAuthLogin_NoClientId_SetsErrorWithoutRedirect', async () => {
    const auth = setup(
      testConfig({ oauth: { clientId: '', scopes: ['read_api'], redirectUri: null } }),
    );

    await auth.startOAuthLogin();

    expect(location.assigned).toEqual([]);
    expect(auth.error()?.code).toBe('oauthNotConfigured');
  });

  it('init_ValidCallback_ExchangesCodeAndLoadsUser', async () => {
    sessionStorage.setItem(
      PENDING_KEY,
      JSON.stringify({
        state: 'st',
        verifier: 'ver',
        redirectUri: APP_BASE,
        returnTo: '/sources',
        createdAt: Date.now(),
      }),
    );
    const auth = setup(testConfig(), `${APP_BASE}?code=abc&state=st`);

    const done = auth.init();
    const token = http.expectOne(`${GITLAB}/oauth/token`);
    expect(token.request.method).toBe('POST');
    expect(token.request.headers.get('Content-Type')).toBe('application/x-www-form-urlencoded');
    expect(token.request.body.toString()).toBe(
      `grant_type=authorization_code&client_id=client-123&code=abc&redirect_uri=${encodeURIComponent(APP_BASE)}&code_verifier=ver`,
    );
    token.flush({
      access_token: 'at',
      token_type: 'Bearer',
      expires_in: 7200,
      refresh_token: 'rt',
    });
    await Promise.resolve();
    await new Promise((r) => setTimeout(r));
    const user = http.expectOne(`${API}/user`);
    expect(user.request.headers.get('Authorization')).toBe('Bearer at');
    user.flush(USER);
    await done;

    expect(location.current).toBe(APP_BASE);
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.returnTo()).toBe('/sources');
    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
    expect(JSON.parse(sessionStorage.getItem(SESSION_KEY)!).refreshToken).toBe('rt');
  });

  it('init_StateMismatch_RefusesWithoutTokenRequest', async () => {
    sessionStorage.setItem(
      PENDING_KEY,
      JSON.stringify({
        state: 'expected',
        verifier: 'v',
        redirectUri: APP_BASE,
        returnTo: '/',
        createdAt: Date.now(),
      }),
    );
    const auth = setup(testConfig(), `${APP_BASE}?code=abc&state=forged`);

    await auth.init();

    expect(auth.error()?.code).toBe('stateMismatch');
    expect(auth.session()).toBeNull();
    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it('init_CallbackWithoutPendingLogin_Refused', async () => {
    const auth = setup(testConfig(), `${APP_BASE}?code=abc&state=st`);

    await auth.init();

    expect(auth.error()?.code).toBe('stateMismatch');
  });

  it('init_OldPendingLogin_Expired', async () => {
    sessionStorage.setItem(
      PENDING_KEY,
      JSON.stringify({
        state: 'st',
        verifier: 'v',
        redirectUri: APP_BASE,
        returnTo: '/',
        createdAt: Date.now() - PENDING_MAX_AGE_MS - 1,
      }),
    );
    const auth = setup(testConfig(), `${APP_BASE}?code=abc&state=st`);

    await auth.init();

    expect(auth.error()?.code).toBe('expired');
  });

  it('init_AccessDenied_ShowsGitLabDescription', async () => {
    const auth = setup(
      testConfig(),
      `${APP_BASE}?error=access_denied&error_description=The+user+denied`,
    );

    await auth.init();

    expect(auth.error()).toEqual({ code: 'denied', detail: 'The user denied' });
    expect(location.current).toBe(APP_BASE);
  });

  it('init_SessionForOtherInstance_Discarded', async () => {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        method: 'token',
        gitlabUrl: 'https://other.example.com',
        accessToken: 'x',
        refreshToken: null,
        expiresAt: null,
      }),
    );
    const auth = setup();

    await auth.init();

    expect(auth.session()).toBeNull();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('loginWithToken_ValidToken_StoresSession', async () => {
    const auth = setup();

    const result = auth.loginWithToken('  glpat-1234567890  ');
    const req = http.expectOne(`${API}/user`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer glpat-1234567890');
    req.flush(USER);

    expect(await result).toBe(true);
    expect(auth.user()?.username).toBe('dev');
    expect(auth.session()?.method).toBe('token');
  });

  it('loginWithToken_Rejected_InvalidTokenError', async () => {
    const auth = setup();

    const result = auth.loginWithToken('glpat-wrong-token');
    http.expectOne(`${API}/user`).flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(await result).toBe(false);
    expect(auth.error()?.code).toBe('invalidToken');
    expect(auth.session()).toBeNull();
  });

  it('loginWithToken_NotAllowed_NoRequest', async () => {
    const auth = setup(testConfig({ allowPersonalAccessToken: false }));

    expect(await auth.loginWithToken('glpat-1234567890')).toBe(false);
  });

  it('refresh_ConcurrentCallers_OneTokenRequest', async () => {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        method: 'oauth',
        gitlabUrl: GITLAB,
        accessToken: 'old',
        refreshToken: 'rt',
        expiresAt: Date.now() + 1000,
      }),
    );
    const auth = setup();
    const init = auth.init();
    // The stored token expires within the refresh margin, so /user waits for a refresh first.
    await new Promise((r) => setTimeout(r));
    const second = auth.refresh();

    const req = http.expectOne(`${GITLAB}/oauth/token`);
    expect(new URLSearchParams(req.request.body).get('grant_type')).toBe('refresh_token');
    expect(new URLSearchParams(req.request.body).get('refresh_token')).toBe('rt');
    req.flush({
      access_token: 'new',
      token_type: 'Bearer',
      expires_in: 7200,
      refresh_token: 'rt2',
    });
    expect((await second)?.accessToken).toBe('new');
    await new Promise((r) => setTimeout(r));
    const user = http.expectOne(`${API}/user`);
    expect(user.request.headers.get('Authorization')).toBe('Bearer new');
    user.flush(USER);
    await init;

    expect(auth.session()?.refreshToken).toBe('rt2');
  });

  it('logout_OAuthSession_RevokesAndClears', async () => {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        method: 'oauth',
        gitlabUrl: GITLAB,
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: Date.now() + 3600_000,
      }),
    );
    const auth = setup();
    const init = auth.init();
    await new Promise((r) => setTimeout(r));
    http.expectOne(`${API}/user`).flush(USER);
    await init;

    const done = auth.logout();
    const revoke = http.expectOne(`${GITLAB}/oauth/revoke`);
    expect(new URLSearchParams(revoke.request.body).get('token')).toBe('at');
    revoke.flush({});
    await done;

    expect(auth.session()).toBeNull();
    expect(auth.user()).toBeNull();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('redirectUri_Configured_UsesConfiguredValue', () => {
    const auth = setup(
      testConfig({
        oauth: { clientId: 'c', scopes: ['read_api'], redirectUri: 'https://app.example.com/cb' },
      }),
    );

    expect(auth.redirectUri()).toBe('https://app.example.com/cb');
  });
});
