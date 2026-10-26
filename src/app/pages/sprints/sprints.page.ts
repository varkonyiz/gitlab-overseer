import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import {
  IxButton,
  IxCard,
  IxCardContent,
  IxContentHeader,
  IxEmptyState,
  IxTypography,
} from '@siemens/ix-angular/standalone';

import { AnalyzedMr, NO_VALUE } from '../../core/analytics/analysis';
import { MergeRequestDataService } from '../../core/analytics/merge-request-data.service';
import { summarize, toHours } from '../../core/analytics/statistics';
import { CsvColumn, toCsv } from '../../core/export/csv';
import { PreferencesService } from '../../core/preferences.service';
import { datedFileName, downloadFile } from '../../core/storage/files';
import { AnalysisFilter } from '../../shared/analysis-filter/analysis-filter';
import { Chart } from '../../shared/chart/chart';
import { colouredTeams, mergeRequestsBySprint } from '../../shared/chart/chart-options';
import { DurationPipe } from '../../shared/duration.pipe';
import { translated } from '../../shared/phase-labels';

/** Merge requests of one sprint and team. */
export interface SprintTeamRow {
  readonly sprint: string;
  readonly team: string;
  readonly mergeRequests: number;
  readonly merged: number;
  readonly opened: number;
  readonly fromCalendar: number;
  readonly medianTotal: number | null;
}

export function sprintTeamRows(
  rows: readonly AnalyzedMr[],
  sprints: readonly string[],
): SprintTeamRow[] {
  const groups = new Map<string, AnalyzedMr[]>();
  for (const r of rows) {
    const key = `${r.classification.sprint ?? NO_VALUE}\u0000${r.classification.team ?? NO_VALUE}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.entries()]
    .map(([key, items]) => {
      const [sprint, team] = key.split('\u0000');
      return {
        sprint,
        team,
        mergeRequests: items.length,
        merged: items.filter((r) => r.mr.state === 'merged').length,
        opened: items.filter((r) => r.mr.state === 'opened').length,
        fromCalendar: items.filter((r) => r.classification.sprintSource === 'calendar').length,
        medianTotal: summarize(items.map((r) => r.timeline.phases.total)).median,
      };
    })
    .sort(
      (a, b) =>
        sprints.indexOf(a.sprint) - sprints.indexOf(b.sprint) || a.team.localeCompare(b.team),
    );
}

export const SPRINT_CSV_COLUMNS: readonly CsvColumn<SprintTeamRow>[] = [
  { header: 'sprint', value: (r) => (r.sprint === NO_VALUE ? '' : r.sprint) },
  { header: 'team', value: (r) => (r.team === NO_VALUE ? '' : r.team) },
  { header: 'merge_requests', value: (r) => r.mergeRequests },
  { header: 'merged', value: (r) => r.merged },
  { header: 'open', value: (r) => r.opened },
  { header: 'sprint_from_calendar', value: (r) => r.fromCalendar },
  { header: 'median_total_hours', value: (r) => toHours(r.medianTotal) },
];

/** Agile view: number of merge requests per sprint and team. */
@Component({
  selector: 'app-sprints-page',
  imports: [
    RouterLink,
    TranslatePipe,
    IxButton,
    IxCard,
    IxCardContent,
    IxContentHeader,
    IxEmptyState,
    IxTypography,
    AnalysisFilter,
    Chart,
    DurationPipe,
  ],
  templateUrl: './sprints.page.html',
  styleUrl: './sprints.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SprintsPage {
  protected readonly data = inject(MergeRequestDataService);
  protected readonly preferences = inject(PreferencesService);
  protected readonly noValue = NO_VALUE;
  private readonly otherLabel = translated('charts.other');
  private readonly noneLabel = translated('filter.none');

  protected readonly rows = computed(() =>
    sprintTeamRows(this.data.filtered(), this.data.sprints()),
  );
  private readonly sprints = computed(() => {
    const present = new Set(this.rows().map((r) => r.sprint));
    return this.data.sprints().filter((s) => present.has(s));
  });
  protected readonly chart = computed(() =>
    mergeRequestsBySprint(
      this.data.filtered(),
      this.sprints(),
      colouredTeams(this.data.all()),
      this.otherLabel(),
      this.preferences.colorScheme(),
      this.noneLabel(),
    ),
  );

  protected downloadCsv(): void {
    downloadFile(
      datedFileName('gitlab-overseer-sprints', 'csv'),
      toCsv(this.rows(), SPRINT_CSV_COLUMNS, { delimiter: this.preferences.csvDelimiter() }),
      'text/csv;charset=utf-8',
    );
  }
}
