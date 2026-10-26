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
import { planAssignments, unassignedMergeRequests } from './assignment';
import { rankReviewers } from './reviewers';

describe('reviewer assignment', () => {
  const history = analyzed([
    record({ events: [event('approved', at(1), BOB)] }),
    record({ events: [event('approved', at(1), BOB)] }),
    record({ events: [event('approved', at(1), CAROL)] }),
  ]);
  const ranking = rankReviewers(history); // bob 2, carol 1, dave 0

  it('unassignedMergeRequests_TeamAndSprint_OnlyOpenWithoutReviewer', () => {
    const rows = analyzed([
      record({ iid: 101, state: 'opened', sourceBranch: '400_mng_a' }),
      record({ iid: 102, state: 'opened', sourceBranch: '400_mng_b', reviewers: [BOB] }),
      record({ iid: 103, state: 'merged', sourceBranch: '400_mng_c' }),
      record({ iid: 104, state: 'opened', sourceBranch: '401_mng_d' }),
      record({ iid: 105, state: 'opened', sourceBranch: '400_web_e' }),
      record({ iid: 106, state: 'opened', sourceBranch: '400_mng_f', draft: true }),
    ]);

    expect(unassignedMergeRequests(rows, 'mng', '400', false).map((r) => r.mr.iid)).toEqual([101]);
    expect(unassignedMergeRequests(rows, 'mng', '400', true).map((r) => r.mr.iid)).toEqual([
      101, 106,
    ]);
  });

  it('planAssignments_ThreeMergeRequests_BottomOfRankingFirstAndRebalanced', () => {
    const open = analyzed([
      record({ iid: 201, state: 'opened', createdAt: at(1) }),
      record({ iid: 202, state: 'opened', createdAt: at(2) }),
      record({ iid: 203, state: 'opened', createdAt: at(3) }),
    ]);

    const plan = planAssignments(open, [BOB, CAROL, DAVE], ranking);

    // dave (0); then carol and dave both score 1, carol has fewer open reviews; then dave (1).
    expect(plan.map((p) => [p.row.mr.iid, p.reviewer.username, p.scoreAtPick])).toEqual([
      [201, 'dave', 0],
      [202, 'carol', 1],
      [203, 'dave', 1],
    ]);
  });

  it('planAssignments_AuthorInPool_NeverOwnReviewer', () => {
    const open = analyzed([record({ state: 'opened', author: DAVE })]);

    const plan = planAssignments(open, [DAVE, BOB], ranking);

    expect(plan[0].reviewer).toEqual(BOB);
  });

  it('planAssignments_BigMergeRequest_PlannedFirst', () => {
    const open = analyzed([
      record({ iid: 301, state: 'opened', createdAt: at(1), changesCount: 1 }),
      record({ iid: 302, state: 'opened', createdAt: at(2), changesCount: 80 }),
    ]);

    const plan = planAssignments(open, [CAROL, DAVE], ranking);

    expect(plan.map((p) => [p.row.mr.iid, p.reviewer.username])).toEqual([
      [302, 'dave'],
      [301, 'carol'],
    ]);
  });

  it('planAssignments_OnlyAuthorInPool_Skipped', () => {
    const open = analyzed([record({ state: 'opened', author: ALICE })]);

    expect(planAssignments(open, [ALICE], ranking)).toEqual([]);
  });
});
