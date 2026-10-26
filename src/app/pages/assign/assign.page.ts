import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import {
  IxButton,
  IxCard,
  IxCardContent,
  IxCheckbox,
  IxContentHeader,
  IxEmptyState,
  IxMessageBar,
  IxSelect,
  IxSelectItem,
  IxTypography,
} from '@siemens/ix-angular/standalone';

import { NO_VALUE, distinctUsers } from '../../core/analytics/analysis';
import {
  PlannedAssignment,
  planAssignments,
  unassignedMergeRequests,
} from '../../core/analytics/assignment';
import { MergeRequestDataService } from '../../core/analytics/merge-request-data.service';
import { UserRef, mergeRequestKey } from '../../core/analytics/merge-request';
import { AuthService } from '../../core/auth/auth.service';
import { WRITE_SCOPE } from '../../core/config/app-config';
import { ConfigService } from '../../core/config/config.service';
import {
  DEVELOPER_ACCESS,
  GitLabApiService,
  httpStatus,
} from '../../core/gitlab/gitlab-api.service';
import { DataSourcesService } from '../../core/sources/data-sources.service';
import { STORAGE_PREFIX, readJson, writeJson } from '../../core/storage/browser-storage';

export type AssignmentOutcome =
  | { readonly status: 'assigned' }
  | { readonly status: 'skipped' }
  | { readonly status: 'failed'; readonly httpStatus: number | null };

const POOL_KEY = `${STORAGE_PREFIX}reviewer-pools`;
const MAX_MEMBERS = 2_000;

/**
 * Reviewer auto-assignment: for the open merge requests of a team and sprint that have no
 * reviewer, propose the developer of the selected pool who is lowest on the ranking board, then
 * (with the `api` scope) set them as reviewer in GitLab.
 */
@Component({
  selector: 'app-assign-page',
  imports: [
    RouterLink,
    TranslatePipe,
    IxButton,
    IxCard,
    IxCardContent,
    IxCheckbox,
    IxContentHeader,
    IxEmptyState,
    IxMessageBar,
    IxSelect,
    IxSelectItem,
    IxTypography,
  ],
  templateUrl: './assign.page.html',
  styleUrl: './assign.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssignPage implements OnInit {
  protected readonly data = inject(MergeRequestDataService);
  private readonly api = inject(GitLabApiService);
  private readonly sources = inject(DataSourcesService);
  private readonly auth = inject(AuthService);
  protected readonly enabled = inject(ConfigService).config.features.reviewerAssignment;

  protected readonly team = signal<string | null>(null);
  protected readonly sprint = signal<string | null>(null);
  protected readonly poolIds = signal<readonly number[]>([]);
  protected readonly includeDrafts = signal(false);
  protected readonly members = signal<readonly UserRef[]>([]);
  protected readonly loadingMembers = signal(false);
  protected readonly membersFailed = signal(false);
  protected readonly applying = signal(false);
  protected readonly outcomes = signal<ReadonlyMap<string, AssignmentOutcome>>(new Map());
  /** The plan as it was applied; kept on screen with its results (the live plan then empties). */
  protected readonly applied = signal<readonly PlannedAssignment[] | null>(null);

  protected readonly teams = computed(() => this.data.teams().filter((t) => t !== NO_VALUE));
  protected readonly sprints = computed(() => this.data.sprints().filter((s) => s !== NO_VALUE));
  protected readonly canWrite = computed(() => this.auth.hasScope(WRITE_SCOPE));

  /** Developers of the data sources plus everyone seen in the merge requests. */
  protected readonly users = computed(() => {
    const map = new Map<number, UserRef>();
    for (const u of [...this.members(), ...distinctUsers(this.data.all())]) {
      map.set(u.id, u);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  });
  protected readonly pool = computed(() =>
    this.users().filter((u) => this.poolIds().includes(u.id)),
  );

  protected readonly unassigned = computed(() => {
    const team = this.team();
    const sprint = this.sprint();
    return team && sprint
      ? unassignedMergeRequests(this.data.all(), team, sprint, this.includeDrafts())
      : [];
  });

  /** Ranked on everything loaded, so the whole review load counts, not only this sprint. */
  protected readonly plan = computed<PlannedAssignment[]>(() =>
    planAssignments(this.unassigned(), this.pool(), this.data.overallRanking()),
  );

  protected readonly shown = computed(() => this.applied() ?? this.plan());

  /** Pool members with their score, lowest first (the order picks are made in). */
  protected readonly poolRanking = computed(() =>
    this.pool()
      .map((user) => {
        const rank = this.data.overallRanking().find((r) => r.user.id === user.id);
        return { user, score: rank?.score ?? 0, openAssigned: rank?.openAssigned ?? 0 };
      })
      .sort((a, b) => a.score - b.score || a.openAssigned - b.openAssigned),
  );

  protected readonly key = (p: PlannedAssignment) => mergeRequestKey(p.row.mr);

  async ngOnInit(): Promise<void> {
    await this.loadMembers();
  }

  protected selectTeam(value: string | string[]): void {
    const team = (Array.isArray(value) ? value[0] : value) || null;
    this.team.set(team);
    this.resetResults();
    const pools = readJson('local', POOL_KEY);
    const saved =
      team && pools && typeof pools === 'object' ? (pools as Record<string, unknown>)[team] : null;
    if (Array.isArray(saved) && saved.every((id) => Number.isSafeInteger(id))) {
      this.poolIds.set(saved as number[]);
    }
  }

  protected selectSprint(value: string | string[]): void {
    this.sprint.set((Array.isArray(value) ? value[0] : value) || null);
    this.resetResults();
  }

  protected selectPool(value: string | string[]): void {
    const ids = (Array.isArray(value) ? value : value ? [value] : []).map(Number);
    this.poolIds.set(ids);
    this.resetResults();
    const team = this.team();
    if (team) {
      // Remember the pool per team (a convenience; the plan never depends on it).
      const pools = readJson('local', POOL_KEY);
      const record = pools && typeof pools === 'object' && !Array.isArray(pools) ? pools : {};
      writeJson('local', POOL_KEY, { ...record, [team]: ids });
    }
  }

  protected setIncludeDrafts(value: boolean): void {
    this.includeDrafts.set(value);
    this.resetResults();
  }

  protected poolValue(): string[] {
    return this.poolIds().map(String);
  }

  /** Writes the plan to GitLab, re-checking each merge request first (someone may have assigned it). */
  protected async apply(): Promise<void> {
    if (!this.enabled || this.applying() || this.plan().length === 0) {
      return;
    }
    this.applying.set(true);
    const plan = this.plan();
    this.applied.set(plan);
    const outcomes = new Map<string, AssignmentOutcome>();
    const updated = new Map<string, UserRef>();
    try {
      for (const item of plan) {
        const { mr } = item.row;
        const key = mergeRequestKey(mr);
        try {
          const current = await this.api.mergeRequest(mr.projectId, mr.iid);
          if ((current.reviewers ?? []).length > 0 || current.state !== 'opened') {
            outcomes.set(key, { status: 'skipped' });
          } else {
            await this.api.setReviewers(mr.projectId, mr.iid, [item.reviewer.id]);
            outcomes.set(key, { status: 'assigned' });
            updated.set(key, item.reviewer);
          }
        } catch (error) {
          outcomes.set(key, { status: 'failed', httpStatus: httpStatus(error) });
        }
        this.outcomes.set(new Map(outcomes));
      }
    } finally {
      this.applying.set(false);
    }
    this.markAssigned(updated);
  }

  protected async loadMembers(): Promise<void> {
    this.loadingMembers.set(true);
    this.membersFailed.set(false);
    const map = new Map<number, UserRef>();
    for (const source of this.sources.sources()) {
      try {
        const members = await this.api.members(source.kind, source.id, { maxItems: MAX_MEMBERS });
        for (const m of members) {
          if (
            m.access_level >= DEVELOPER_ACCESS &&
            (m.state === undefined || m.state === 'active')
          ) {
            map.set(m.id, { id: m.id, username: m.username, name: m.name });
          }
        }
      } catch {
        this.membersFailed.set(true);
      }
    }
    this.members.set([...map.values()]);
    this.loadingMembers.set(false);
  }

  private resetResults(): void {
    this.applied.set(null);
    this.outcomes.set(new Map());
  }

  /** Reflects successful assignments in the loaded data, so the ranking and the plan update. */
  private markAssigned(updated: ReadonlyMap<string, UserRef>): void {
    const dataset = this.data.dataset();
    if (!dataset || updated.size === 0) {
      return;
    }
    this.data.set({
      ...dataset,
      mergeRequests: dataset.mergeRequests.map((mr) => {
        const reviewer = updated.get(mergeRequestKey(mr));
        return reviewer ? { ...mr, reviewers: [reviewer] } : mr;
      }),
    });
  }
}
