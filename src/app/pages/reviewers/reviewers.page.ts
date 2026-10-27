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

import { AnalyticsSettingsService } from '../../core/analytics/analytics-settings.service';
import { MergeRequestDataService } from '../../core/analytics/merge-request-data.service';
import { ReviewerRank } from '../../core/analytics/reviewers';
import { toHours } from '../../core/analytics/statistics';
import { CsvColumn, toCsv } from '../../core/export/csv';
import { PreferencesService } from '../../core/preferences.service';
import { datedFileName, downloadFile } from '../../core/storage/files';
import { AnalysisFilter } from '../../shared/analysis-filter/analysis-filter';
import { Chart } from '../../shared/chart/chart';
import { reviewerScores } from '../../shared/chart/chart-options';
import { DurationPipe } from '../../shared/duration.pipe';
import { translated } from '../../shared/phase-labels';

export const RANKING_CSV_COLUMNS: readonly CsvColumn<ReviewerRank & { rank: number }>[] = [
  { header: 'rank', value: (r) => r.rank },
  { header: 'username', value: (r) => r.user.username },
  { header: 'name', value: (r) => r.user.name },
  { header: 'score', value: (r) => r.score },
  { header: 'reviews', value: (r) => r.reviews },
  { header: 'big_reviews', value: (r) => r.bigReviews },
  { header: 'approvals', value: (r) => r.approvals },
  { header: 'changes_requested', value: (r) => r.changesRequested },
  { header: 'open_assigned', value: (r) => r.openAssigned },
  { header: 'median_response_hours', value: (r) => toHours(r.medianResponse) },
];

/** Ranking board: reviews done, weighted by merge request size. */
@Component({
  selector: 'app-reviewers-page',
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
  templateUrl: './reviewers.page.html',
  styleUrl: './reviewers.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewersPage {
  protected readonly data = inject(MergeRequestDataService);
  protected readonly settings = inject(AnalyticsSettingsService).settings;
  protected readonly preferences = inject(PreferencesService);
  private readonly scoreLabel = translated('reviewers.score');

  protected readonly ranked = computed(() =>
    this.data.ranking().map((r, i) => ({ ...r, rank: i + 1 })),
  );
  protected readonly chart = computed(() =>
    reviewerScores(this.data.ranking(), this.scoreLabel(), this.preferences.colorScheme()),
  );

  protected downloadCsv(): void {
    downloadFile(
      datedFileName('gitlab-overseer-reviewers', 'csv'),
      toCsv(this.ranked(), RANKING_CSV_COLUMNS, { delimiter: this.preferences.csvDelimiter() }),
      'text/csv;charset=utf-8',
    );
  }
}
