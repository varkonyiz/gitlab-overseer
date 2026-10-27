import { GITLAB } from '../../../testing/test-config';
import { ALICE, BOB, at, event, record } from '../../../testing/merge-requests';
import { Dataset, DatasetError, parseDatasetFile, toDatasetFile, toRecord } from './dataset';
import { GitLabMergeRequest } from '../gitlab/gitlab.models';

const dataset: Dataset = {
  gitlabUrl: GITLAB,
  collectedAt: at(10),
  range: { from: at(1), to: null },
  sources: ['acme'],
  mergeRequests: [
    record({
      iid: 1,
      events: [event('reviewRequested', at(1), ALICE, ['bob']), event('approved', at(2), BOB)],
    }),
  ],
};

describe('dataset file', () => {
  it('parseDatasetFile_RoundTrip_Same', () => {
    expect(parseDatasetFile(toDatasetFile(dataset), GITLAB)).toEqual(dataset);
  });

  function withRecord(patch: Record<string, unknown>): string {
    const raw = JSON.parse(toDatasetFile(dataset));
    raw.mergeRequests[0] = { ...raw.mergeRequests[0], ...patch };
    return JSON.stringify(raw);
  }

  it.each([
    [withRecord({ webUrl: 'https://evil.example.com/x' }), 'invalidEntry'],
    [withRecord({ state: 'deleted' }), 'invalidEntry'],
    [withRecord({ events: [{ kind: 'hacked', at: at(1), actor: ALICE }] }), 'invalidEntry'],
    [withRecord({ changesCount: -1 }), 'invalidEntry'],
    [withRecord({ author: { id: 'x' } }), 'invalidEntry'],
    ['{', 'notJson'],
    [JSON.stringify({ format: 'x', version: 1 }), 'wrongFormat'],
  ])('parseDatasetFile_Invalid_Throws %#', (text, reason) => {
    expect(() => parseDatasetFile(text, GITLAB)).toThrow(new DatasetError(reason));
  });

  it('parseDatasetFile_OtherInstance_Throws', () => {
    expect(() => parseDatasetFile(toDatasetFile(dataset), 'https://other.example.com')).toThrow(
      new DatasetError('otherInstance'),
    );
  });

  it('toRecord_GitLabItem_Mapped', () => {
    const item: GitLabMergeRequest = {
      id: 99,
      iid: 7,
      project_id: 10,
      title: 'Add login',
      state: 'opened',
      work_in_progress: true,
      created_at: at(1),
      updated_at: at(2),
      merged_at: null,
      closed_at: null,
      source_branch: '400_mng_login',
      target_branch: 'main',
      author: { id: 1, username: 'alice', name: 'Alice', state: 'active' },
      reviewers: [{ id: 2, username: 'bob', name: 'Bob' }],
      labels: ['backend'],
      web_url: `${GITLAB}/acme/web/-/merge_requests/7`,
      references: { full: 'acme/web!7' },
    };

    expect(toRecord(item, [], 12)).toEqual(
      expect.objectContaining({
        projectPath: 'acme/web',
        draft: true,
        author: ALICE,
        reviewers: [BOB],
        changesCount: 12,
      }),
    );
  });
});
