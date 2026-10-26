import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { IxButton, IxSelect, IxSelectItem } from '@siemens/ix-angular/standalone';

import { EMPTY_FILTER, NO_VALUE } from '../../core/analytics/analysis';
import { MergeRequestDataService } from '../../core/analytics/merge-request-data.service';

/** Team, sprint, project and state filter shared by the analytics pages (one row above the content). */
@Component({
  selector: 'app-analysis-filter',
  imports: [TranslatePipe, IxButton, IxSelect, IxSelectItem],
  templateUrl: './analysis-filter.html',
  styleUrl: './analysis-filter.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalysisFilter {
  protected readonly data = inject(MergeRequestDataService);
  protected readonly noValue = NO_VALUE;
  protected readonly states = ['opened', 'merged', 'closed'];

  protected setTeams(value: string | string[]): void {
    this.data.filter.update((f) => ({ ...f, teams: toList(value) }));
  }

  protected setSprints(value: string | string[]): void {
    this.data.filter.update((f) => ({ ...f, sprints: toList(value) }));
  }

  protected setProjects(value: string | string[]): void {
    this.data.filter.update((f) => ({ ...f, projects: toList(value).map(Number) }));
  }

  protected setStates(value: string | string[]): void {
    this.data.filter.update((f) => ({ ...f, states: toList(value) }));
  }

  protected reset(): void {
    this.data.filter.set(EMPTY_FILTER);
  }

  protected projectValues(): string[] {
    return this.data.filter().projects.map(String);
  }
}

function toList(value: string | string[]): string[] {
  return (Array.isArray(value) ? value : value ? [value] : []).filter((v) => v !== '');
}
