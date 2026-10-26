import { ALICE, BOB, CAROL, at, event, record } from '../../../testing/merge-requests';
import { computeTimeline } from './timeline';

const HOUR = 3_600_000;

describe('computeTimeline', () => {
  it('computeTimeline_FullDraftLifecycle_AllPhases', () => {
    const t = computeTimeline(
      record({
        draft: false,
        createdAt: at(1, 0),
        mergedAt: at(1, 20),
        events: [
          event('ready', at(1, 4), ALICE),
          event('reviewRequested', at(1, 6), ALICE, ['bob']),
          event('approved', at(1, 9), BOB),
        ],
      }),
    );

    expect(t.createdAsDraft).toBe(true);
    expect(t.phases).toEqual({
      total: 20 * HOUR,
      draft: 4 * HOUR,
      reviewAssignment: 2 * HOUR,
      review: 3 * HOUR,
      merge: 11 * HOUR,
    });
    expect(t.firstDecision).toBe('approved');
  });

  it('computeTimeline_NeverDraft_NoDraftTimeAssignmentFromCreation', () => {
    const t = computeTimeline(
      record({
        createdAt: at(1, 0),
        mergedAt: at(1, 10),
        events: [
          event('reviewRequested', at(1, 1), ALICE, ['bob']),
          event('approved', at(1, 5), BOB),
        ],
      }),
    );

    expect(t.createdAsDraft).toBe(false);
    expect(t.phases.draft).toBeNull();
    expect(t.phases.reviewAssignment).toBe(1 * HOUR);
  });

  it('computeTimeline_ReviewerBeforeReady_AssignmentZeroReviewFromReady', () => {
    const t = computeTimeline(
      record({
        createdAt: at(1, 0),
        events: [
          event('reviewRequested', at(1, 1), ALICE, ['bob']),
          event('ready', at(1, 3), ALICE),
          event('changesRequested', at(1, 7), BOB),
        ],
        state: 'opened',
      }),
    );

    expect(t.phases.reviewAssignment).toBe(0);
    expect(t.phases.review).toBe(4 * HOUR);
    expect(t.firstDecision).toBe('changesRequested');
    expect(t.phases.total).toBeNull();
  });

  it('computeTimeline_ChangesThenApproval_MergeFromLastApproval', () => {
    const t = computeTimeline(
      record({
        createdAt: at(1, 0),
        mergedAt: at(3, 0),
        events: [
          event('reviewRequested', at(1, 0), ALICE, ['bob', 'carol']),
          event('changesRequested', at(1, 2), BOB),
          event('approved', at(2, 0), CAROL),
          event('approved', at(2, 12), BOB),
        ],
      }),
    );

    expect(t.phases.review).toBe(2 * HOUR);
    expect(t.phases.merge).toBe(12 * HOUR);
  });

  it('computeTimeline_ReviewersSetAtCreationWithoutNote_CountedFromCreation', () => {
    const t = computeTimeline(
      record({ createdAt: at(1, 0), reviewers: [BOB], events: [event('approved', at(1, 2), BOB)] }),
    );

    expect(t.phases.reviewAssignment).toBe(0);
    expect(t.phases.review).toBe(2 * HOUR);
  });

  it('computeTimeline_StillDraft_PhasesOpen', () => {
    const t = computeTimeline(record({ draft: true, state: 'opened', events: [] }));

    expect(t.createdAsDraft).toBe(true);
    expect(t.phases).toEqual({
      total: null,
      draft: null,
      reviewAssignment: null,
      review: null,
      merge: null,
    });
  });

  it('computeTimeline_AuthorSelfApproval_Ignored', () => {
    const t = computeTimeline(
      record({
        createdAt: at(1, 0),
        mergedAt: at(1, 5),
        events: [
          event('reviewRequested', at(1, 0), ALICE, ['alice']),
          event('approved', at(1, 1), ALICE),
        ],
      }),
    );

    expect(t.firstReviewerAt).toBeNull();
    expect(t.phases.review).toBeNull();
    expect(t.phases.merge).toBeNull();
  });

  it('computeTimeline_DraftAgainLater_FirstReadyCounts', () => {
    const t = computeTimeline(
      record({
        createdAt: at(1, 0),
        events: [event('draft', at(1, 1), ALICE), event('ready', at(1, 2), ALICE)],
      }),
    );

    expect(t.createdAsDraft).toBe(false);
    expect(t.phases.draft).toBeNull();
  });
});
