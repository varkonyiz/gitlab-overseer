import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import {
  IxButton,
  IxCard,
  IxCardContent,
  IxContentHeader,
  IxDateInput,
  IxIconButton,
  IxInput,
  IxMessageBar,
  IxNumberInput,
  IxPill,
  IxTypography,
} from '@siemens/ix-angular/standalone';

import {
  AnalyticsSettings,
  DEFAULT_BRANCH_PATTERN,
  SettingsError,
  SprintDefinition,
  compileBranchPattern,
  formatDay,
  generateSprints,
  parseAnalyticsSettings,
} from '../../core/analytics/analytics-settings';
import { AnalyticsSettingsService } from '../../core/analytics/analytics-settings.service';
import { classify } from '../../core/analytics/classification';
import { dateInputValue } from '../../shared/date-input';
import {
  FileTooLargeError,
  datedFileName,
  downloadFile,
  readTextFile,
} from '../../core/storage/files';

interface Notice {
  readonly type: 'success' | 'warning' | 'danger';
  readonly key: string;
  readonly params?: object;
}

/** Customisation of the sprint/team mapping and of the review weighting. */
@Component({
  selector: 'app-settings-page',
  imports: [
    TranslatePipe,
    IxButton,
    IxCard,
    IxCardContent,
    IxContentHeader,
    IxDateInput,
    IxIconButton,
    IxInput,
    IxMessageBar,
    IxNumberInput,
    IxPill,
    IxTypography,
  ],
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPage {
  protected readonly service = inject(AnalyticsSettingsService);
  protected readonly defaultPattern = DEFAULT_BRANCH_PATTERN;

  protected readonly pattern = signal('');
  protected readonly bigFiles = signal(50);
  protected readonly bigWeight = signal(2);
  protected readonly sprints = signal<SprintDefinition[]>([]);
  protected readonly sample = signal('400_mng_web_feature_name');
  protected readonly notice = signal<Notice | null>(null);

  protected readonly genFirst = signal(400);
  protected readonly genStart = signal(formatDay(new Date()));
  protected readonly genLength = signal(14);
  protected readonly genCount = signal(6);

  /** Live check of the pattern against the sample branch name. */
  protected readonly sampleResult = computed(() => {
    try {
      const regex = compileBranchPattern(this.pattern());
      const result = classify(this.sample(), new Date().toISOString(), regex, []);
      return { ok: true as const, sprint: result.sprint, team: result.team };
    } catch (error) {
      return {
        ok: false as const,
        key: error instanceof SettingsError ? error.key : 'patternInvalid',
      };
    }
  });

  constructor() {
    this.load(this.service.settings());
  }

  protected setSprint(
    index: number,
    field: keyof SprintDefinition,
    value: string | undefined,
  ): void {
    this.sprints.update((list) =>
      list.map((s, i) => (i === index ? { ...s, [field]: (value ?? '').trim() } : s)),
    );
  }

  protected setSprintDate(index: number, field: 'start' | 'end', event: Event): void {
    const value = dateInputValue(event);
    if (value !== null) {
      this.setSprint(index, field, value);
    }
  }

  protected setGenStart(event: Event): void {
    const value = dateInputValue(event);
    if (value !== null) {
      this.genStart.set(value);
    }
  }

  protected addSprint(): void {
    this.sprints.update((list) => [...list, { sprint: '', start: '', end: '' }]);
  }

  protected removeSprint(index: number): void {
    this.sprints.update((list) => list.filter((_, i) => i !== index));
  }

  protected generate(): void {
    try {
      const generated = generateSprints(
        this.genFirst(),
        this.genStart(),
        this.genLength(),
        this.genCount(),
      );
      const names = new Set(generated.map((s) => s.sprint));
      this.sprints.update((list) => [...list.filter((s) => !names.has(s.sprint)), ...generated]);
      this.notice.set(null);
    } catch (error) {
      this.showError(error);
    }
  }

  protected save(): void {
    try {
      this.service.save(this.draft());
      this.load(this.service.settings());
      this.notice.set({ type: 'success', key: 'settings.saved' });
    } catch (error) {
      this.showError(error);
    }
  }

  protected reset(): void {
    this.service.resetToDefaults();
    this.load(this.service.settings());
    this.notice.set({ type: 'success', key: 'settings.resetDone' });
  }

  protected download(): void {
    downloadFile(
      datedFileName('gitlab-overseer', 'settings.json'),
      this.service.exportJson(),
      'application/json',
    );
  }

  protected async open(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    try {
      this.service.importJson(await readTextFile(file));
      this.load(this.service.settings());
      this.notice.set({ type: 'success', key: 'settings.opened' });
    } catch (error) {
      if (error instanceof FileTooLargeError) {
        this.notice.set({ type: 'danger', key: 'settings.errors.tooLarge' });
      } else {
        this.showError(error);
      }
    }
  }

  private draft(): AnalyticsSettings {
    return parseAnalyticsSettings({
      branchPattern: this.pattern(),
      bigMergeRequestFiles: this.bigFiles(),
      bigMergeRequestWeight: this.bigWeight(),
      sprints: this.sprints(),
    });
  }

  private load(settings: AnalyticsSettings): void {
    this.pattern.set(settings.branchPattern);
    this.bigFiles.set(settings.bigMergeRequestFiles);
    this.bigWeight.set(settings.bigMergeRequestWeight);
    this.sprints.set([...settings.sprints]);
  }

  private showError(error: unknown): void {
    this.notice.set(
      error instanceof SettingsError
        ? { type: 'danger', key: `settings.errors.${error.key}`, params: error.params }
        : { type: 'danger', key: 'settings.errors.unreadable' },
    );
  }
}
