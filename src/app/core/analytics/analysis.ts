import { AnalyticsSettings } from './analytics-settings';
import { Classification, classify, compareSprints } from './classification';
import { MergeRequestRecord, UserRef } from './merge-request';
import { MrTimeline, computeTimeline } from './timeline';

/** A merge request with everything derived from the settings. */
export interface AnalyzedMr {
  readonly mr: MergeRequestRecord;
  readonly classification: Classification;
  readonly timeline: MrTimeline;
  /** Ranking weight of reviewing it: `bigMergeRequestWeight` for big ones, else 1. */
  readonly weight: number;
  readonly big: boolean;
}

export function analyze(
  records: readonly MergeRequestRecord[],
  settings: AnalyticsSettings,
  pattern: RegExp,
): AnalyzedMr[] {
  return records.map((mr) => {
    const big = mr.changesCount !== null && mr.changesCount >= settings.bigMergeRequestFiles;
    return {
      mr,
      classification: classify(mr.sourceBranch, mr.createdAt, pattern, settings.sprints),
      timeline: computeTimeline(mr),
      weight: big ? settings.bigMergeRequestWeight : 1,
      big,
    };
  });
}

export interface AnalysisFilter {
  readonly teams: readonly string[];
  readonly sprints: readonly string[];
  readonly projects: readonly number[];
  readonly states: readonly string[];
}

export const EMPTY_FILTER: AnalysisFilter = { teams: [], sprints: [], projects: [], states: [] };

/** An empty list means "all". `NO_VALUE` matches MRs without a team or sprint. */
export const NO_VALUE = '∅';

export function applyFilter(rows: readonly AnalyzedMr[], filter: AnalysisFilter): AnalyzedMr[] {
  const has = (list: readonly string[], value: string | null) =>
    list.length === 0 || list.includes(value ?? NO_VALUE);
  return rows.filter(
    (r) =>
      has(filter.teams, r.classification.team) &&
      has(filter.sprints, r.classification.sprint) &&
      (filter.projects.length === 0 || filter.projects.includes(r.mr.projectId)) &&
      (filter.states.length === 0 || filter.states.includes(r.mr.state)),
  );
}

export function distinctTeams(rows: readonly AnalyzedMr[]): string[] {
  return [...new Set(rows.map((r) => r.classification.team ?? NO_VALUE))].sort();
}

export function distinctSprints(rows: readonly AnalyzedMr[]): string[] {
  const values = new Set(rows.map((r) => r.classification.sprint ?? NO_VALUE));
  return [...values].sort((a, b) =>
    a === NO_VALUE ? 1 : b === NO_VALUE ? -1 : compareSprints(a, b),
  );
}

export function distinctProjects(rows: readonly AnalyzedMr[]): { id: number; path: string }[] {
  const map = new Map(rows.map((r) => [r.mr.projectId, r.mr.projectPath]));
  return [...map.entries()]
    .map(([id, path]) => ({ id, path }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** Everyone who authored or reviewed one of the merge requests. */
export function distinctUsers(rows: readonly AnalyzedMr[]): UserRef[] {
  const map = new Map<number, UserRef>();
  for (const { mr } of rows) {
    map.set(mr.author.id, mr.author);
    for (const r of mr.reviewers) {
      map.set(r.id, r);
    }
    for (const e of mr.events) {
      map.set(e.actor.id, e.actor);
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
