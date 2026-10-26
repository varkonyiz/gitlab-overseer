import { HttpClient } from '@angular/common/http';
import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { API, GITLAB, provideTestApp } from '../../../testing/test-config';
import { isGitLabApi } from './auth.interceptor';
import { AuthService, SESSION_KEY } from './auth.service';

describe('authInterceptor', () => {
  let http: HttpTestingController;
  let client: HttpClient;
  let auth: AuthService;

  function signIn(method: 'oauth' | 'token', refreshToken: string | null = null): void {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        method,
        gitlabUrl: GITLAB,
        accessToken: 'at',
        refreshToken,
        expiresAt: method === 'oauth' ? Date.now() + 3600_000 : null,
      }),
    );
  }

  async function init(): Promise<void> {
    const done = auth.init();
    await new Promise((r) => setTimeout(r));
    http
      .expectOne(`${API}/user`)
      .flush({ id: 1, username: 'u', name: 'U', avatar_url: null, web_url: '' });
    await done;
  }

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: provideTestApp() });
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => http.verify());

  it('intercept_GitLabApi_AddsBearer', async () => {
    signIn('token');
    await init();

    const result = firstValueFrom(client.get(`${API}/projects`));
    await new Promise((r) => setTimeout(r));
    const req = http.expectOne(`${API}/projects`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer at');
    req.flush([]);
    await result;
  });

  it('intercept_OtherOrigin_NoToken', async () => {
    signIn('token');
    await init();

    const result = firstValueFrom(client.get('https://gitlab.example.com.evil.test/api/v4/user'));
    await new Promise((r) => setTimeout(r));
    const req = http.expectOne('https://gitlab.example.com.evil.test/api/v4/user');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
    await result;
  });

  it('intercept_OAuth401_RefreshesAndRetriesOnce', async () => {
    signIn('oauth', 'rt');
    await init();

    const result = firstValueFrom(client.get(`${API}/projects`));
    await new Promise((r) => setTimeout(r));
    http.expectOne(`${API}/projects`).flush({}, { status: 401, statusText: 'Unauthorized' });
    await new Promise((r) => setTimeout(r));
    http.expectOne(`${GITLAB}/oauth/token`).flush({
      access_token: 'fresh',
      token_type: 'Bearer',
      expires_in: 7200,
      refresh_token: 'rt2',
    });
    await new Promise((r) => setTimeout(r));
    const retry = http.expectOne(`${API}/projects`);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer fresh');
    retry.flush(['ok']);

    expect(await result).toEqual(['ok']);
  });

  it('intercept_Token401_EndsSession', async () => {
    signIn('token');
    await init();

    const result = firstValueFrom(client.get(`${API}/projects`));
    await new Promise((r) => setTimeout(r));
    http.expectOne(`${API}/projects`).flush({}, { status: 401, statusText: 'Unauthorized' });

    await expect(result).rejects.toBeTruthy();
    expect(auth.session()).toBeNull();
    expect(auth.error()?.code).toBe('sessionExpired');
  });
});

describe('isGitLabApi', () => {
  it.each([
    [`${API}/user`, true],
    [`${GITLAB}/oauth/token`, false],
    ['https://gitlab.example.com:8443/api/v4/user', false],
    ['config/app-config.json', false],
  ])('isGitLabApi_%s_%s', (url, expected) => {
    expect(isGitLabApi(url, GITLAB)).toBe(expected);
  });

  it('isGitLabApi_RelativeRoot_ChecksPathPrefix', () => {
    expect(
      isGitLabApi('https://example.com/gitlab/api/v4/user', 'https://example.com/gitlab'),
    ).toBe(true);
    expect(isGitLabApi('https://example.com/other/api/v4/user', 'https://example.com/gitlab')).toBe(
      false,
    );
  });
});
