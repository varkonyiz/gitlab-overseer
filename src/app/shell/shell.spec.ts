import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { provideTestApp } from '../../testing/test-config';
import { ConfigService } from '../core/config/config.service';
import { Shell } from './shell';

describe('Shell', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Shell],
      providers: [...provideTestApp(), provideRouter([])],
    });
  });

  it('render_ConfigError_ShowsErrorInsteadOfApp', () => {
    TestBed.inject(ConfigService).error.set('"gitlabUrl" is required.');
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[data-testid="config-error"]')?.textContent).toContain(
      '"gitlabUrl" is required.',
    );
    expect(element.querySelector('ix-application')).toBeNull();
  });

  it('render_SignedOut_ShowsSignInMenuOnly', () => {
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[data-testid="menu-login"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="menu-sources"]')).toBeNull();
  });
});
