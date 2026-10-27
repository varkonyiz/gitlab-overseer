import { MergeRequestRecord, MrEvent } from './merge-request';

/**
 * The merge request phases, in milliseconds (null = the phase has not finished or cannot be told):
 *
 * - `total`: created → merged.
 * - `draft`: created as draft → first marked ready (null when it was not created as a draft, so
 *   the statistics cover draft merge requests only).
 * - `reviewAssignment`: ready → first reviewer requested (0 when a reviewer was set earlier).
 * - `review`: first reviewer requested → first review decision (approved or changes requested) by
 *   someone other than the author. Only the assignment counts as the start: the way to ready is
 *   already the draft time.
 * - `merge`: last approval before the merge → merged.
 *
 * Draft, assignment, review and merge do not add up to the total when there was rework between
 * a "changes requested" and the final approval.
 */
export type Phase = 'total' | 'draft' | 'reviewAssignment' | 'review' | 'merge';
export const PHASES: readonly Phase[] = ['total', 'draft', 'reviewAssignment', 'review', 'merge'];

export type ReviewDecision = 'approved' | 'changesRequested';

export interface MrTimeline {
  readonly createdAsDraft: boolean;
  readonly readyAt: number | null;
  readonly firstReviewerAt: number | null;
  readonly firstDecisionAt: number | null;
  readonly firstDecision: ReviewDecision | null;
  readonly finalApprovalAt: number | null;
  readonly mergedAt: number | null;
  readonly phases: Readonly<Record<Phase, number | null>>;
}

export function computeTimeline(mr: MergeRequestRecord): MrTimeline {
  const createdAt = Date.parse(mr.createdAt);
  const mergedAt = mr.mergedAt ? Date.parse(mr.mergedAt) : null;
  const events = mr.events;
  const byOthers = (e: MrEvent) => e.actor.id !== mr.author.id;

  // Created as draft when the first draft/ready toggle made it ready (or it is still an untouched draft).
  const firstToggle = events.find((e) => e.kind === 'draft' || e.kind === 'ready');
  const createdAsDraft = firstToggle ? firstToggle.kind === 'ready' : mr.draft;
  const readyAt = createdAsDraft ? time(events.find((e) => e.kind === 'ready')) : createdAt;

  const requested = events.find(
    (e) => e.kind === 'reviewRequested' && (e.targets ?? []).some((t) => t !== mr.author.username),
  );
  // Reviewers chosen while creating the MR may leave no note: count them from the creation time.
  const firstReviewerAt =
    time(requested) ?? (mr.reviewers.some((r) => r.id !== mr.author.id) ? createdAt : null);

  const decision = events.find(
    (e) =>
      (e.kind === 'approved' || e.kind === 'changesRequested') &&
      byOthers(e) &&
      (firstReviewerAt === null || Date.parse(e.at) >= firstReviewerAt),
  );
  const firstDecisionAt = time(decision);

  const approvals = events.filter(
    (e) =>
      e.kind === 'approved' && byOthers(e) && (mergedAt === null || Date.parse(e.at) <= mergedAt),
  );
  const finalApprovalAt = time(approvals.at(-1));

  return {
    createdAsDraft,
    readyAt,
    firstReviewerAt,
    firstDecisionAt,
    firstDecision: decision ? (decision.kind as ReviewDecision) : null,
    finalApprovalAt,
    mergedAt,
    phases: {
      total: mergedAt !== null ? mergedAt - createdAt : null,
      draft: createdAsDraft ? span(createdAt, readyAt) : null,
      reviewAssignment:
        readyAt !== null && firstReviewerAt !== null
          ? Math.max(0, firstReviewerAt - readyAt)
          : null,
      review: span(firstReviewerAt, firstDecisionAt),
      merge: span(finalApprovalAt, mergedAt),
    },
  };
}

function time(event: MrEvent | undefined): number | null {
  return event ? Date.parse(event.at) : null;
}

function span(from: number | null, to: number | null): number | null {
  return from !== null && to !== null ? Math.max(0, to - from) : null;
}
