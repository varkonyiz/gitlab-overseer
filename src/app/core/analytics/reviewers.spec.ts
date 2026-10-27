import {
  ALICE,
  BOB,
  CAROL,
  DAVE,
  analyzed,
  at,
  event,
  record,
} from '../../../testing/merge-requests';
import { rankReviewers } from './reviewers';

describe('rankReviewers', () => {
  it('rankReviewers_BigMergeRequest_CountsDouble', () => {
    const rows = analyzed([
      record({ changesCount: 60, events: [event('approved', at(1, 2), BOB)] }),
      record({ changesCount: 2, events: [event('approved', at(1, 2), CAROL)] }),
      record({ changesCount: 3, events: [event('approved', at(1, 2), CAROL)] }),
      record({ changesCount: 4, events: [event('approved', at(1, 2), DAVE)] }),
    ]);

    const ranking = rankReviewers(rows);

    // Bob's one big review equals Carol's two small ones; Carol wins the tie on review count.
    expect(ranking.map((r) => [r.user.username, r.score, r.reviews, r.bigReviews])).toEqual([
      ['carol', 2, 2, 0],
      ['bob', 2, 1, 1],
      ['dave', 1, 1, 0],
    ]);
  });

  it('rankReviewers_SeveralDecisionsOnOneMr_CountedOnce', () => {
    const rows = analyzed([
      record({
        events: [
          event('reviewRequested', at(1, 0), ALICE, ['bob']),
          event('changesRequested', at(1, 2), BOB),
          event('approved', at(1, 6), BOB),
        ],
      }),
    ]);

    const [bob] = rankReviewers(rows);

    expect(bob).toEqual(
      expect.objectContaining({ score: 1, reviews: 1, approvals: 1, changesRequested: 1 }),
    );
    expect(bob.medianResponse).toBe(2 * 3_600_000);
  });

  it('rankReviewers_AuthorApproval_NotCounted', () => {
    const rows = analyzed([record({ author: ALICE, events: [event('approved', at(1), ALICE)] })]);

    expect(rankReviewers(rows)).toEqual([]);
  });

  it('rankReviewers_OpenMergeRequest_CountsOpenAssignment', () => {
    const rows = analyzed([record({ state: 'opened', reviewers: [DAVE] })]);

    expect(rankReviewers(rows)).toEqual([
      expect.objectContaining({ user: DAVE, score: 0, openAssigned: 1 }),
    ]);
  });
});
