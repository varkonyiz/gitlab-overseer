import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import {
  IxButton,
  IxCard,
  IxCardContent,
  IxContentHeader,
  IxEmptyState,
  IxKpi,
  IxTypography,
} from '@siemens/ix-angular/standalone';

import { MergeRequestDataService } from '../../core/analytics/merge-request-data.service';
import { Summary, summarize, toHours } from '../../core/analytics/statistics';
import { PHASES, Phase } from '../../core/analytics/timeline';
import { AuthService } from '../../core/auth/auth.service';
import { CsvColumn, toCsv } from '../../core/export/csv';
import { PreferencesService } from '../../core/preferences.service';
import { datedFileName, downloadFile } from '../../core/storage/files';
import { AnalysisFilter } from '../../shared/analysis-filter/analysis-filter';
import { Chart } from '../../shared/chart/chart';
import {
  colouredTeams,
  mergeRequestsBySprint,
  phaseMediansBySprint,
} from '../../shared/chart/chart-options';
import { CollectPanel } from '../../shared/collect-panel/collect-panel';
import { DURATION_UNITS, DurationPipe } from '../../shared/duration.pipe';
import { phaseLabels, translated } from '../../shared/phase-labels';

export interface PhaseStatistics {
  readonly phase: Phase;
  readonly summary: Summary;
}

export const STATISTICS_CSV_COLUMNS: readonly CsvColumn<PhaseStatistics>[] = [
  { header: 'phase', value: (s) => s.phase },
  { header: 'count', value: (s) => s.summary.count },
  { header: 'median_hours', value: (s) => toHours(s.summary.median) },
  { header: 'mean_hours', value: (s) => toHours(s.summary.mean) },
  { header: 'p90_hours', value: (s) => toHours(s.summary.p90) },
  { header: 'min_hours', value: (s) => toHours(s.summary.min) },
  { header: 'max_hours', value: (s) => toHours(s.summary.max) },
];

/** Merge request times like GitLab's analytics (median, average), per phase and per sprint. */
@Component({
  selector: 'app-dashboard-page',
  imports: [
    RouterLink,
    TranslatePipe,
    IxButton,
    IxCard,
    IxCardContent,
    IxContentHeader,
    IxEmptyState,
    IxKpi,
    IxTypography,
    AnalysisFilter,
    Chart,
    CollectPanel,
    DurationPipe,
  ],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPage {
  protected readonly auth = inject(AuthService);
  protected readonly data = inject(MergeRequestDataService);
  protected readonly preferences = inject(PreferencesService);
  private readonly labels = phaseLabels();
  private readonly otherLabel = translated('charts.other');
  private readonly noneLabel = translated('filter.none');

  protected readonly statistics = computed<PhaseStatistics[]>(() => {
    const rows = this.data.filtered();
    return PHASES.map((phase) => ({
      phase,
      summary: summarize(rows.map((r) => r.timeline.phases[phase])),
    }));
  });

  protected readonly counts = computed(() => {
    const rows = this.data.filtered();
    return {
      total: rows.length,
      merged: rows.filter((r) => r.mr.state === 'merged').length,
      opened: rows.filter((r) => r.mr.state === 'opened').length,
      closed: rows.filter((r) => r.mr.state === 'closed').length,
    };
  });

  private readonly chartSprints = computed(() => {
    const present = new Set(this.data.filtered().map((r) => r.classification.sprint ?? '∅'));
    return this.data.sprints().filter((s) => present.has(s));
  });

  protected readonly phaseChart = computed(() =>
    phaseMediansBySprint(
      this.data.filtered(),
      this.chartSprints(),
      this.labels(),
      this.preferences.colorScheme(),
      DURATION_UNITS[this.preferences.language()],
      this.noneLabel(),
    ),
  );

  protected readonly countChart = computed(() =>
    mergeRequestsBySprint(
      this.data.filtered(),
      this.chartSprints(),
      colouredTeams(this.data.all()),
      this.otherLabel(),
      this.preferences.colorScheme(),
      this.noneLabel(),
    ),
  );

  protected downloadStatistics(): void {
    downloadFile(
      datedFileName('gitlab-overseer-mr-times', 'csv'),
      toCsv(this.statistics(), STATISTICS_CSV_COLUMNS, {
        delimiter: this.preferences.csvDelimiter(),
      }),
      'text/csv;charset=utf-8',
    );
  }
}
