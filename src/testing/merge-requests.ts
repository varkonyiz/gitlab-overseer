import {
  DEFAULT_ANALYTICS_SETTINGS,
  compileBranchPattern,
} from '../app/core/analytics/analytics-settings';
import { AnalyzedMr, analyze } from '../app/core/analytics/analysis';
import {
  MergeRequestRecord,
  MrEvent,
  MrEventKind,
  UserRef,
} from '../app/core/analytics/merge-request';
import { GITLAB } from './test-config';

export const ALICE: UserRef = { id: 1, username: 'alice', name: 'Alice' };
export const BOB: UserRef = { id: 2, username: 'bob', name: 'Bob' };
export const CAROL: UserRef = { id: 3, username: 'carol', name: 'Carol' };
export const DAVE: UserRef = { id: 4, username: 'dave', name: 'Dave' };

/** `2026-10-01T<hh>:00:00.000Z` plus whole days, for readable timelines. */
export function at(day: number, hour = 0): string {
  return new Date(Date.UTC(2026, 9, day, hour)).toISOString();
}

export function event(
  kind: MrEventKind,
  when: string,
  actor: UserRef,
  targets?: string[],
): MrEvent {
  return { kind, at: when, actor, ...(targets ? { targets } : {}) };
}

let nextIid = 1;

export function record(overrides: Partial<MergeRequestRecord> = {}): MergeRequestRecord {
  const iid = overrides.iid ?? nextIid++;
  return {
    projectId: 10,
    projectPath: 'acme/web',
    iid,
    title: `MR ${iid}`,
    webUrl: `${GITLAB}/acme/web/-/merge_requests/${iid}`,
    state: 'merged',
    draft: false,
    author: ALICE,
    reviewers: [],
    sourceBranch: '400_mng_feature',
    targetBranch: 'main',
    labels: [],
    createdAt: at(1),
    updatedAt: at(5),
    mergedAt: null,
    closedAt: null,
    changesCount: 3,
    events: [],
    ...overrides,
  };
}

export function analyzed(
  records: MergeRequestRecord[],
  settings = DEFAULT_ANALYTICS_SETTINGS,
): AnalyzedMr[] {
  return analyze(records, settings, compileBranchPattern(settings.branchPattern));
}
