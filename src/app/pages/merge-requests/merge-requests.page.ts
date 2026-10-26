import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import {
  IxButton,
  IxCard,
  IxCardContent,
  IxContentHeader,
  IxEmptyState,
  IxPill,
} from '@siemens/ix-angular/standalone';

import { AnalyzedMr } from '../../core/analytics/analysis';
import { MergeRequestDataService } from '../../core/analytics/merge-request-data.service';
import { mergeRequestKey } from '../../core/analytics/merge-request';
import { toHours } from '../../core/analytics/statistics';
import { CsvColumn, toCsv } from '../../core/export/csv';
import { PreferencesService } from '../../core/preferences.service';
import { datedFileName, downloadFile } from '../../core/storage/files';
import { AnalysisFilter } from '../../shared/analysis-filter/analysis-filter';
import { DurationPipe } from '../../shared/duration.pipe';

const PAGE_SIZE = 100;

/** Every collected field plus the derived ones, one row per merge request. */
export const MERGE_REQUEST_CSV_COLUMNS: readonly CsvColumn<AnalyzedMr>[] = [
  { header: 'project', value: (r) => r.mr.projectPath },
  { header: 'iid', value: (r) => r.mr.iid },
  { header: 'title', value: (r) => r.mr.title },
  { header: 'web_url', value: (r) => r.mr.webUrl },
  { header: 'state', value: (r) => r.mr.state },
  { header: 'draft', value: (r) => r.mr.draft },
  { header: 'author', value: (r) => r.mr.author.username },
  { header: 'reviewers', value: (r) => r.mr.reviewers.map((u) => u.username).join(' ') },
  { header: 'source_branch', value: (r) => r.mr.sourceBranch },
  { header: 'target_branch', value: (r) => r.mr.targetBranch },
  { header: 'labels', value: (r) => r.mr.labels.join(' ') },
  { header: 'sprint', value: (r) => r.classification.sprint },
  { header: 'sprint_source', value: (r) => r.classification.sprintSource },
  { header: 'team', value: (r) => r.classification.team },
  { header: 'changed_files', value: (r) => r.mr.changesCount },
  { header: 'big', value: (r) => r.big },
  { header: 'review_weight', value: (r) => r.weight },
  { header: 'created_at', value: (r) => r.mr.createdAt },
  { header: 'ready_at', value: (r) => isoOrNull(r.timeline.readyAt) },
  { header: 'first_reviewer_at', value: (r) => isoOrNull(r.timeline.firstReviewerAt) },
  { header: 'first_decision_at', value: (r) => isoOrNull(r.timeline.firstDecisionAt) },
  { header: 'first_decision', value: (r) => r.timeline.firstDecision },
  { header: 'final_approval_at', value: (r) => isoOrNull(r.timeline.finalApprovalAt) },
  { header: 'merged_at', value: (r) => r.mr.mergedAt },
  { header: 'closed_at', value: (r) => r.mr.closedAt },
  { header: 'total_hours', value: (r) => toHours(r.timeline.phases.total) },
  { header: 'draft_hours', value: (r) => toHours(r.timeline.phases.draft) },
  { header: 'review_assignment_hours', value: (r) => toHours(r.timeline.phases.reviewAssignment) },
  { header: 'review_hours', value: (r) => toHours(r.timeline.phases.review) },
  { header: 'merge_hours', value: (r) => toHours(r.timeline.phases.merge) },
];

function isoOrNull(ms: number | null): string | null {
  return ms === null ? null : new Date(ms).toISOString();
}

@Component({
  selector: 'app-merge-requests-page',
  imports: [
    DatePipe,
    RouterLink,
    TranslatePipe,
    IxButton,
    IxCard,
    IxCardContent,
    IxContentHeader,
    IxEmptyState,
    IxPill,
    AnalysisFilter,
    DurationPipe,
  ],
  templateUrl: './merge-requests.page.html',
  styleUrl: './merge-requests.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MergeRequestsPage {
  protected readonly data = inject(MergeRequestDataService);
  protected readonly preferences = inject(PreferencesService);
  protected readonly limit = signal(PAGE_SIZE);
  protected readonly visible = computed(() => this.data.filtered().slice(0, this.limit()));
  protected readonly key = (r: AnalyzedMr) => mergeRequestKey(r.mr);
  protected readonly reviewerNames = (r: AnalyzedMr) =>
    r.mr.reviewers.map((u) => u.name).join(', ');

  protected showMore(): void {
    this.limit.update((l) => l + PAGE_SIZE);
  }

  protected downloadCsv(): void {
    downloadFile(
      datedFileName('gitlab-overseer-merge-requests', 'csv'),
      toCsv(this.data.filtered(), MERGE_REQUEST_CSV_COLUMNS, {
        delimiter: this.preferences.csvDelimiter(),
      }),
      'text/csv;charset=utf-8',
    );
  }
}
