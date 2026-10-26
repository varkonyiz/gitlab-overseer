import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import {
  IxButton,
  IxCard,
  IxCardContent,
  IxContentHeader,
  IxMessageBar,
  IxSelect,
  IxSelectItem,
  IxTypography,
} from '@siemens/ix-angular/standalone';

import { AuthService } from '../../core/auth/auth.service';
import { ConfigService } from '../../core/config/config.service';
import { CsvDelimiter } from '../../core/export/csv';
import { GitLabVersion } from '../../core/gitlab/gitlab.models';
import { GitLabApiService, httpStatus } from '../../core/gitlab/gitlab-api.service';
import { PreferencesService } from '../../core/preferences.service';

export type ConnectionTest =
  | { readonly status: 'idle' | 'running' }
  | { readonly status: 'ok'; readonly version: GitLabVersion | null; readonly checkedAt: Date }
  | { readonly status: 'failed'; readonly httpStatus: number | null };

@Component({
  selector: 'app-connection-page',
  imports: [
    DatePipe,
    TranslatePipe,
    IxButton,
    IxCard,
    IxCardContent,
    IxContentHeader,
    IxMessageBar,
    IxSelect,
    IxSelectItem,
    IxTypography,
  ],
  templateUrl: './connection.page.html',
  styleUrl: './connection.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectionPage implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly config = inject(ConfigService).config;
  protected readonly preferences = inject(PreferencesService);
  private readonly api = inject(GitLabApiService);

  protected readonly test = signal<ConnectionTest>({ status: 'idle' });
  protected readonly redirectUri = this.auth.redirectUri();
  protected readonly delimiters: readonly { value: CsvDelimiter; key: string }[] = [
    { value: ',', key: 'connection.delimiters.comma' },
    { value: ';', key: 'connection.delimiters.semicolon' },
    { value: '\t', key: 'connection.delimiters.tab' },
  ];

  ngOnInit(): void {
    void this.runTest();
  }

  /** Calls `/user` (token valid) and `/version` (API reachable with the granted scopes). */
  protected async runTest(): Promise<void> {
    this.test.set({ status: 'running' });
    try {
      const user = await this.api.currentUser();
      this.auth.user.set(user);
      let version: GitLabVersion | null = null;
      try {
        version = await this.api.version();
      } catch {
        version = null; // some instances restrict /version; the connection itself works
      }
      this.test.set({ status: 'ok', version, checkedAt: new Date() });
    } catch (error) {
      this.test.set({ status: 'failed', httpStatus: httpStatus(error) });
    }
  }

  protected setDelimiter(value: string | string[]): void {
    const delimiter = this.delimiters.find((d) => d.value === value)?.value;
    if (delimiter) {
      this.preferences.setCsvDelimiter(delimiter);
    }
  }
}
