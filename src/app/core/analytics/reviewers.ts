import { AnalyzedMr } from './analysis';
import { UserRef } from './merge-request';
import { summarize } from './statistics';

/** One row of the reviewer ranking board. */
export interface ReviewerRank {
  readonly user: UserRef;
  /** Weighted review count: a big merge request counts `bigMergeRequestWeight`, others 1. */
  readonly score: number;
  /** Merge requests this person reviewed (approved or requested changes), each counted once. */
  readonly reviews: number;
  readonly bigReviews: number;
  readonly approvals: number;
  readonly changesRequested: number;
  /** Open merge requests that list this person as a reviewer right now. */
  readonly openAssigned: number;
  /** Median time from the review request (to this person) to their first decision. */
  readonly medianResponse: number | null;
}

interface Tally {
  user: UserRef;
  score: number;
  reviews: number;
  bigReviews: number;
  approvals: number;
  changesRequested: number;
  openAssigned: number;
  responses: number[];
}

/** Ranking, best first (score, then reviews, then name). Authors never review their own MR. */
export function rankReviewers(rows: readonly AnalyzedMr[]): ReviewerRank[] {
  const tallies = new Map<number, Tally>();
  const tally = (user: UserRef): Tally => {
    let t = tallies.get(user.id);
    if (!t) {
      t = {
        user,
        score: 0,
        reviews: 0,
        bigReviews: 0,
        approvals: 0,
        changesRequested: 0,
        openAssigned: 0,
        responses: [],
      };
      tallies.set(user.id, t);
    }
    return t;
  };

  for (const row of rows) {
    const { mr } = row;
    const reviewed = new Set<number>();
    for (const event of mr.events) {
      if (event.actor.id === mr.author.id) {
        continue;
      }
      if (event.kind !== 'approved' && event.kind !== 'changesRequested') {
        continue;
      }
      const t = tally(event.actor);
      if (event.kind === 'approved') {
        t.approvals++;
      } else {
        t.changesRequested++;
      }
      if (!reviewed.has(event.actor.id)) {
        reviewed.add(event.actor.id);
        t.reviews++;
        t.score += row.weight;
        if (row.big) {
          t.bigReviews++;
        }
        const requested = mr.events.find(
          (e) =>
            e.kind === 'reviewRequested' &&
            e.at <= event.at &&
            (e.targets ?? []).includes(event.actor.username),
        );
        if (requested) {
          t.responses.push(Date.parse(event.at) - Date.parse(requested.at));
        }
      }
    }
    if (mr.state === 'opened') {
      for (const reviewer of mr.reviewers) {
        tally(reviewer).openAssigned++;
      }
    }
  }

  return [...tallies.values()]
    .map(({ responses, ...t }) => ({ ...t, medianResponse: summarize(responses).median }))
    .sort(
      (a, b) =>
        b.score - a.score || b.reviews - a.reviews || a.user.name.localeCompare(b.user.name),
    );
}
