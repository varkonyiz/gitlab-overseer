import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  WritableSignal,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import {
  IxButton,
  IxCard,
  IxCardContent,
  IxDateInput,
  IxMessageBar,
  IxProgressIndicator,
  IxTypography,
} from '@siemens/ix-angular/standalone';

import { formatDay, parseDay } from '../../core/analytics/analytics-settings';
import { CollectProgress, MergeRequestCollector } from '../../core/analytics/collector.service';
import { DatasetError } from '../../core/analytics/dataset';
import { MergeRequestDataService } from '../../core/analytics/merge-request-data.service';
import { ConfigService } from '../../core/config/config.service';
import { httpStatus } from '../../core/gitlab/gitlab-api.service';
import { DataSourcesService } from '../../core/sources/data-sources.service';
import { dateInputValue } from '../date-input';
import {
  FileTooLargeError,
  datedFileName,
  downloadFile,
  readTextFile,
} from '../../core/storage/files';

export const DEFAULT_LOOKBACK_DAYS = 90;
/** Dataset files hold many merge requests with their timelines. */
const MAX_DATASET_BYTES = 50 * 1024 * 1024;

interface Notice {
  readonly type: 'success' | 'warning' | 'danger' | 'info';
  readonly key: string;
  readonly params?: object;
}

/** Loads merge requests of the data sources (or a dataset file) into {@link MergeRequestDataService}. */
@Component({
  selector: 'app-collect-panel',
  imports: [
    DatePipe,
    RouterLink,
    TranslatePipe,
    IxButton,
    IxCard,
    IxCardContent,
    IxDateInput,
    IxMessageBar,
    IxProgressIndicator,
    IxTypography,
  ],
  templateUrl: './collect-panel.html',
  styleUrl: './collect-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectPanel implements OnInit {
  protected readonly data = inject(MergeRequestDataService);
  protected readonly sources = inject(DataSourcesService);
  private readonly collector = inject(MergeRequestCollector);
  private readonly gitlabUrl = inject(ConfigService).config.gitlabUrl;

  protected readonly from = signal(
    formatDay(new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)),
  );
  protected readonly to = signal('');
  protected readonly progress = signal<CollectProgress | null>(null);
  protected readonly notice = signal<Notice | null>(null);
  private controller: AbortController | null = null;

  /** A new user lands here first: give them the deployment's default sources right away. */
  async ngOnInit(): Promise<void> {
    if (this.sources.sources().length === 0 && this.sources.shouldApplyDefaults()) {
      await this.sources.applyDefaults();
    }
  }

  protected setDate(target: WritableSignal<string>, event: Event): void {
    const value = dateInputValue(event);
    if (value !== null) {
      target.set(value);
    }
  }

  protected percent(p: CollectProgress): number {
    return p.total === 0 ? 0 : Math.round((p.done / p.total) * 100);
  }

  protected async collect(): Promise<void> {
    if (this.progress() || this.sources.sources().length === 0) {
      return;
    }
    const from = this.from() ? parseDay(this.from()) : null;
    // "to" is inclusive: collect until the end of that day.
    const to = this.to() ? new Date(parseDay(this.to()).getTime() + 24 * 60 * 60 * 1000) : null;
    if (!from || Number.isNaN(from.getTime()) || (to && to <= from)) {
      this.notice.set({ type: 'warning', key: 'collect.invalidRange' });
      return;
    }
    this.controller = new AbortController();
    this.notice.set(null);
    this.progress.set({ phase: 'list', done: 0, total: this.sources.sources().length });
    try {
      const result = await this.collector.collect({
        sources: this.sources.sources(),
        from,
        to,
        signal: this.controller.signal,
        onProgress: (p) => this.progress.set(p),
      });
      this.data.set({
        gitlabUrl: this.gitlabUrl,
        collectedAt: new Date().toISOString(),
        range: { from: from.toISOString(), to: to?.toISOString() ?? null },
        sources: this.sources.sources().map((s) => s.fullPath),
        mergeRequests: result.mergeRequests,
      });
      this.notice.set(
        result.failed > 0 || result.truncated
          ? {
              type: 'warning',
              key: result.truncated ? 'collect.truncated' : 'collect.partial',
              params: { count: result.mergeRequests.length, failed: result.failed },
            }
          : {
              type: 'success',
              key: 'collect.done',
              params: { count: result.mergeRequests.length },
            },
      );
    } catch (error) {
      if (this.controller?.signal.aborted) {
        this.notice.set({ type: 'info', key: 'collect.cancelled' });
      } else {
        const status = httpStatus(error);
        this.notice.set(
          status === 0
            ? { type: 'danger', key: 'errors.network' }
            : { type: 'danger', key: 'errors.api', params: { status: status ?? '?' } },
        );
      }
    } finally {
      this.progress.set(null);
      this.controller = null;
    }
  }

  protected cancel(): void {
    this.controller?.abort();
  }

  protected download(): void {
    const json = this.data.exportJson();
    if (json) {
      downloadFile(
        datedFileName('gitlab-overseer', 'merge-requests.json'),
        json,
        'application/json',
      );
    }
  }

  protected async open(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    try {
      const dataset = this.data.importJson(await readTextFile(file, MAX_DATASET_BYTES));
      this.notice.set({
        type: 'success',
        key: 'collect.opened',
        params: { count: dataset.mergeRequests.length },
      });
    } catch (error) {
      const reason =
        error instanceof FileTooLargeError
          ? 'tooLarge'
          : error instanceof DatasetError
            ? error.message
            : 'unreadable';
      this.notice.set({
        type: 'danger',
        key: `collect.importErrors.${reason}`,
        params: { url: this.gitlabUrl },
      });
    }
  }
}
