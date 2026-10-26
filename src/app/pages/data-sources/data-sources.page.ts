import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import {
  IxBooleanValueAccessorDirective,
  IxButton,
  IxCard,
  IxCardContent,
  IxCheckbox,
  IxContentHeader,
  IxEmptyState,
  IxIconButton,
  IxInput,
  IxMessageBar,
  IxPill,
  IxSelect,
  IxSelectItem,
  IxSelectValueAccessorDirective,
  IxTextValueAccessorDirective,
  IxTypography,
} from '@siemens/ix-angular/standalone';

import { FULL_PATH_PATTERN, SourceKind } from '../../core/config/app-config';
import { ConfigService } from '../../core/config/config.service';
import { CsvColumn, toCsv } from '../../core/export/csv';
import { GitLabApiService, httpStatus } from '../../core/gitlab/gitlab-api.service';
import { PreferencesService } from '../../core/preferences.service';
import {
  DataSource,
  SourcesFileError,
  fromGroup,
  fromProject,
  sourceKey,
} from '../../core/sources/data-sources';
import { DataSourcesService } from '../../core/sources/data-sources.service';
import {
  FileTooLargeError,
  datedFileName,
  downloadFile,
  readTextFile,
} from '../../core/storage/files';

/** Look-back window of the access check. */
export const CHECK_DAYS = 30;

export type CheckState =
  | { readonly status: 'loading' }
  | { readonly status: 'ok'; readonly count: number | null }
  | { readonly status: 'error'; readonly httpStatus: number | null };

interface Notice {
  readonly type: 'success' | 'warning' | 'danger';
  readonly key: string;
  readonly params?: object;
}

export const SOURCE_CSV_COLUMNS: readonly CsvColumn<DataSource>[] = [
  { header: 'kind', value: (s) => s.kind },
  { header: 'id', value: (s) => s.id },
  { header: 'full_path', value: (s) => s.fullPath },
  { header: 'name', value: (s) => s.name },
  { header: 'web_url', value: (s) => s.webUrl },
];

@Component({
  selector: 'app-data-sources-page',
  imports: [
    ReactiveFormsModule,
    TranslatePipe,
    IxBooleanValueAccessorDirective,
    IxButton,
    IxCard,
    IxCardContent,
    IxCheckbox,
    IxContentHeader,
    IxEmptyState,
    IxIconButton,
    IxInput,
    IxMessageBar,
    IxPill,
    IxSelect,
    IxSelectItem,
    IxSelectValueAccessorDirective,
    IxTextValueAccessorDirective,
    IxTypography,
  ],
  templateUrl: './data-sources.page.html',
  styleUrl: './data-sources.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataSourcesPage implements OnInit {
  protected readonly sources = inject(DataSourcesService);
  private readonly api = inject(GitLabApiService);
  private readonly preferences = inject(PreferencesService);
  private readonly config = inject(ConfigService).config;
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly checkDays = CHECK_DAYS;

  protected readonly searchForm = this.fb.group({
    kind: this.fb.control<SourceKind>('project'),
    term: ['', [Validators.maxLength(100)]],
    membershipOnly: [true],
  });
  protected readonly pathForm = this.fb.group({
    kind: this.fb.control<SourceKind>('project'),
    path: [
      '',
      [Validators.required, Validators.maxLength(255), Validators.pattern(FULL_PATH_PATTERN)],
    ],
  });

  protected readonly searching = signal(false);
  protected readonly results = signal<readonly DataSource[] | null>(null);
  protected readonly resolving = signal(false);
  protected readonly notice = signal<Notice | null>(null);
  protected readonly checks = signal<ReadonlyMap<string, CheckState>>(new Map());
  protected readonly checkingAll = computed(() =>
    [...this.checks().values()].some((c) => c.status === 'loading'),
  );
  protected readonly sourceKey = sourceKey;

  async ngOnInit(): Promise<void> {
    if (this.sources.sources().length === 0 && this.sources.shouldApplyDefaults()) {
      const result = await this.sources.applyDefaults();
      this.notice.set(
        result.missing.length > 0
          ? {
              type: 'warning',
              key: 'sources.defaultsMissing',
              params: { paths: result.missing.join(', ') },
            }
          : { type: 'success', key: 'sources.defaultsAdded', params: { count: result.added } },
      );
    }
  }

  protected async search(): Promise<void> {
    if (this.searchForm.invalid || this.searching()) {
      return;
    }
    const { kind, term, membershipOnly } = this.searchForm.getRawValue();
    this.searching.set(true);
    this.notice.set(null);
    try {
      this.results.set(
        kind === 'project'
          ? (await this.api.searchProjects(term, membershipOnly)).map(fromProject)
          : (await this.api.searchGroups(term, membershipOnly)).map(fromGroup),
      );
    } catch (error) {
      this.results.set(null);
      this.notice.set(apiErrorNotice(error));
    } finally {
      this.searching.set(false);
    }
  }

  protected async addByPath(): Promise<void> {
    if (this.pathForm.invalid || this.resolving()) {
      this.pathForm.markAllAsTouched();
      return;
    }
    const { kind, path } = this.pathForm.getRawValue();
    this.resolving.set(true);
    this.notice.set(null);
    try {
      const source =
        kind === 'project'
          ? fromProject(await this.api.project(path.trim()))
          : fromGroup(await this.api.group(path.trim()));
      this.add(source);
      this.pathForm.controls.path.reset();
    } catch (error) {
      this.notice.set(
        httpStatus(error) === 404
          ? { type: 'warning', key: 'sources.notFound', params: { path } }
          : apiErrorNotice(error),
      );
    } finally {
      this.resolving.set(false);
    }
  }

  protected add(source: DataSource): void {
    if (!this.sources.add(source)) {
      this.notice.set({ type: 'warning', key: 'sources.limit' });
    }
  }

  protected remove(source: DataSource): void {
    this.sources.remove(source);
    this.updateCheck(sourceKey(source), null);
  }

  protected clear(): void {
    this.sources.clear();
    this.checks.set(new Map());
  }

  /** Proves read access: counts merge requests of the last {@link CHECK_DAYS} days per source. */
  protected async checkAccess(): Promise<void> {
    const since = new Date(Date.now() - CHECK_DAYS * 24 * 60 * 60 * 1000);
    await Promise.all(
      this.sources.sources().map(async (source) => {
        const key = sourceKey(source);
        this.updateCheck(key, { status: 'loading' });
        try {
          const count = await this.api.countMergeRequests(source.kind, source.id, since);
          this.updateCheck(key, { status: 'ok', count });
        } catch (error) {
          this.updateCheck(key, { status: 'error', httpStatus: httpStatus(error) });
        }
      }),
    );
  }

  protected downloadJson(): void {
    downloadFile(
      datedFileName('gitlab-overseer', 'sources.json'),
      this.sources.exportJson(),
      'application/json',
    );
  }

  protected downloadCsv(): void {
    downloadFile(
      datedFileName('gitlab-overseer-sources', 'csv'),
      toCsv(this.sources.sources(), SOURCE_CSV_COLUMNS, {
        delimiter: this.preferences.csvDelimiter(),
      }),
      'text/csv;charset=utf-8',
    );
  }

  protected async openFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow opening the same file again
    if (!file) {
      return;
    }
    try {
      const count = this.sources.importJson(await readTextFile(file));
      this.checks.set(new Map());
      this.notice.set({ type: 'success', key: 'sources.imported', params: { count } });
    } catch (error) {
      const reason =
        error instanceof FileTooLargeError
          ? 'tooLarge'
          : error instanceof SourcesFileError
            ? error.message
            : 'unreadable';
      this.notice.set({
        type: 'danger',
        key: `sources.importErrors.${reason}`,
        params: { url: this.config.gitlabUrl },
      });
    }
  }

  private updateCheck(key: string, state: CheckState | null): void {
    this.checks.update((current) => {
      const next = new Map(current);
      if (state) {
        next.set(key, state);
      } else {
        next.delete(key);
      }
      return next;
    });
  }
}

function apiErrorNotice(error: unknown): Notice {
  const status = httpStatus(error);
  return status === 0
    ? { type: 'danger', key: 'errors.network' }
    : { type: 'danger', key: 'errors.api', params: { status: status ?? '?' } };
}
