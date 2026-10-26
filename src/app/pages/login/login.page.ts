import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import {
  IxButton,
  IxCard,
  IxCardContent,
  IxContentHeader,
  IxDivider,
  IxInput,
  IxMessageBar,
  IxTextValueAccessorDirective,
} from '@siemens/ix-angular/standalone';

import { AuthService, safeReturnTo } from '../../core/auth/auth.service';
import { ConfigService } from '../../core/config/config.service';

@Component({
  selector: 'app-login-page',
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    IxButton,
    IxCard,
    IxCardContent,
    IxContentHeader,
    IxDivider,
    IxInput,
    IxMessageBar,
    IxTextValueAccessorDirective,
  ],
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  protected readonly auth = inject(AuthService);
  protected readonly config = inject(ConfigService).config;
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  /** Route to open after signing in (query parameter set by the guard). */
  readonly returnTo = input<string>();

  protected readonly tokenForm = this.fb.group({
    token: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(512)]],
  });
  protected readonly redirecting = signal(false);
  protected readonly checkingToken = signal(false);

  protected async signInWithGitLab(): Promise<void> {
    this.redirecting.set(true);
    await this.auth.startOAuthLogin(safeReturnTo(this.returnTo() ?? '/'));
    // Still here: the redirect was refused (e.g. OAuth not configured).
    this.redirecting.set(this.auth.error() === null);
  }

  protected async signInWithToken(): Promise<void> {
    if (this.tokenForm.invalid || this.checkingToken()) {
      this.tokenForm.markAllAsTouched();
      return;
    }
    this.checkingToken.set(true);
    try {
      if (await this.auth.loginWithToken(this.tokenForm.getRawValue().token)) {
        this.tokenForm.reset();
        await this.router.navigateByUrl(safeReturnTo(this.returnTo() ?? '/'));
      }
    } finally {
      this.checkingToken.set(false);
    }
  }
}
