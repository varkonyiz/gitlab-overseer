import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { API, provideTestApp, testConfig } from '../../../testing/test-config';
import { AppConfig } from '../../core/config/app-config';
import { LoginPage } from './login.page';

describe('LoginPage', () => {
  function render(config: AppConfig = testConfig()) {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [...provideTestApp(config), provideRouter([])],
    });
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('render_OAuthAndTokenAllowed_ShowsBoth', () => {
    const { element } = render();

    expect(element.querySelector('[data-testid="login-oauth"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="login-token"]')).not.toBeNull();
  });

  it('render_NoClientIdNoTokens_ExplainsMissingOAuth', () => {
    const { element } = render(
      testConfig({
        oauth: { clientId: '', scopes: ['read_api'], redirectUri: null },
        allowPersonalAccessToken: false,
      }),
    );

    expect(element.querySelector('[data-testid="login-oauth"]')).toBeNull();
    expect(element.querySelector('[data-testid="oauth-not-configured"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="login-token"]')).toBeNull();
  });

  it('signInWithToken_Valid_NavigatesToReturnTo', async () => {
    const { fixture } = render();
    fixture.componentRef.setInput('returnTo', '/sources');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const page = fixture.componentInstance as unknown as {
      tokenForm: { setValue(v: { token: string }): void };
      signInWithToken(): Promise<void>;
    };

    page.tokenForm.setValue({ token: 'glpat-1234567890' });
    const done = page.signInWithToken();
    TestBed.inject(HttpTestingController)
      .expectOne(`${API}/user`)
      .flush({ id: 1, username: 'u', name: 'U', avatar_url: null, web_url: '' });
    await done;

    expect(navigate).toHaveBeenCalledWith('/sources');
  });

  it('signInWithToken_ExternalReturnTo_GoesHome', async () => {
    const { fixture } = render();
    fixture.componentRef.setInput('returnTo', '//evil.example.com');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const page = fixture.componentInstance as unknown as {
      tokenForm: { setValue(v: { token: string }): void };
      signInWithToken(): Promise<void>;
    };

    page.tokenForm.setValue({ token: 'glpat-1234567890' });
    const done = page.signInWithToken();
    TestBed.inject(HttpTestingController)
      .expectOne(`${API}/user`)
      .flush({ id: 1, username: 'u', name: 'U', avatar_url: null, web_url: '' });
    await done;

    expect(navigate).toHaveBeenCalledWith('/');
  });
});
