import { AnalyzedMr } from './analysis';
import { UserRef } from './merge-request';
import { ReviewerRank } from './reviewers';

export interface PlannedAssignment {
  readonly row: AnalyzedMr;
  readonly reviewer: UserRef;
  /** The reviewer's weighted score when chosen (ranking plus earlier picks of this plan). */
  readonly scoreAtPick: number;
}

/** Open merge requests of the team and sprint that have no reviewer yet. */
export function unassignedMergeRequests(
  rows: readonly AnalyzedMr[],
  team: string,
  sprint: string,
  includeDrafts: boolean,
): AnalyzedMr[] {
  return rows.filter(
    (r) =>
      r.mr.state === 'opened' &&
      r.mr.reviewers.length === 0 &&
      (includeDrafts || !r.mr.draft) &&
      r.classification.team === team &&
      r.classification.sprint === sprint,
  );
}

/**
 * Gives each merge request to the developer of the pool who is lowest on the ranking board
 * (weighted score, then fewer open reviews, then name), never to its author. Every pick adds the
 * merge request's weight to that developer, so the next one goes to whoever is lowest then.
 * Bigger merge requests are planned first so they land on the least loaded reviewers.
 */
export function planAssignments(
  mergeRequests: readonly AnalyzedMr[],
  pool: readonly UserRef[],
  ranking: readonly ReviewerRank[],
): PlannedAssignment[] {
  const load = new Map(
    pool.map((user) => {
      const rank = ranking.find((r) => r.user.id === user.id);
      return [user.id, { user, score: rank?.score ?? 0, open: rank?.openAssigned ?? 0 }];
    }),
  );
  const ordered = [...mergeRequests].sort(
    (a, b) => b.weight - a.weight || a.mr.createdAt.localeCompare(b.mr.createdAt),
  );

  const plan: PlannedAssignment[] = [];
  for (const row of ordered) {
    const candidates = [...load.values()]
      .filter((c) => c.user.id !== row.mr.author.id)
      .sort(
        (a, b) => a.score - b.score || a.open - b.open || a.user.name.localeCompare(b.user.name),
      );
    const pick = candidates[0];
    if (!pick) {
      continue; // the pool holds only the author
    }
    plan.push({ row, reviewer: pick.user, scoreAtPick: pick.score });
    pick.score += row.weight;
    pick.open += 1;
  }
  return plan;
}
