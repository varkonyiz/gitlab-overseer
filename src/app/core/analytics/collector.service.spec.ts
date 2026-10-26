import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API, GITLAB, provideTestApp } from '../../../testing/test-config';
import { MergeRequestCollector } from './collector.service';
import { DataSource } from '../sources/data-sources';

const group: DataSource = {
  kind: 'group',
  id: 5,
  fullPath: 'acme',
  name: 'ACME',
  webUrl: `${GITLAB}/groups/acme`,
};
const project: DataSource = {
  kind: 'project',
  id: 10,
  fullPath: 'acme/web',
  name: 'Web',
  webUrl: `${GITLAB}/acme/web`,
};

function item(iid: number, updated = '2026-10-02T00:00:00Z') {
  return {
    id: 1000 + iid,
    iid,
    project_id: 10,
    title: `MR ${iid}`,
    state: 'merged',
    draft: false,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: updated,
    merged_at: '2026-10-02T00:00:00Z',
    closed_at: null,
    source_branch: '400_mng_x',
    target_branch: 'main',
    author: { id: 1, username: 'alice', name: 'Alice' },
    reviewers: [],
    labels: [],
    web_url: `${GITLAB}/acme/web/-/merge_requests/${iid}`,
    references: { full: `acme/web!${iid}` },
  };
}

const tick = () => new Promise((r) => setTimeout(r));

describe('MergeRequestCollector', () => {
  let collector: MergeRequestCollector;
  let http: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: provideTestApp() });
    collector = TestBed.inject(MergeRequestCollector);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function flushDetails(
    iid: number,
    notes: unknown[],
    changes: string | null,
  ): Promise<void> {
    await tick();
    http
      .expectOne((r) => r.url.startsWith(`${API}/projects/10/merge_requests/${iid}/notes`))
      .flush(notes);
    http
      .expectOne(`${API}/projects/10/merge_requests/${iid}`)
      .flush({ ...item(iid), changes_count: changes });
  }

  it('collect_GroupAndProject_DeduplicatesAndReadsTimelines', async () => {
    const progress: string[] = [];
    const done = collector.collect({
      sources: [group, project],
      from: new Date('2026-10-01T00:00:00Z'),
      to: null,
      onProgress: (p) => progress.push(`${p.phase}:${p.done}/${p.total}`),
    });

    await tick();
    const list = http.expectOne((r) => r.url.startsWith(`${API}/groups/5/merge_requests`));
    expect(list.request.urlWithParams).toContain('created_after=2026-10-01T00:00:00.000Z');
    expect(list.request.urlWithParams).toContain('state=all');
    list.flush([item(1), item(2)]);
    await tick();
    http.expectOne((r) => r.url.startsWith(`${API}/projects/10/merge_requests`)).flush([item(2)]);

    await flushDetails(
      1,
      [
        {
          id: 1,
          body: 'approved this merge request',
          system: true,
          created_at: '2026-10-01T05:00:00Z',
          author: { id: 2, username: 'bob', name: 'Bob' },
        },
      ],
      '1000+',
    );
    await flushDetails(2, [], '4');
    const result = await done;

    expect(result.failed).toBe(0);
    expect(result.mergeRequests.map((m) => [m.iid, m.changesCount, m.events.length])).toEqual(
      expect.arrayContaining([
        [1, 1000, 1],
        [2, 4, 0],
      ]),
    );
    expect(progress).toContain('details:2/2');
  });

  it('collect_UnchangedMergeRequest_UsesCache', async () => {
    collector.remember([
      {
        projectId: 10,
        projectPath: 'acme/web',
        iid: 3,
        title: 'MR 3',
        webUrl: `${GITLAB}/acme/web/-/merge_requests/3`,
        state: 'merged',
        draft: false,
        author: { id: 1, username: 'alice', name: 'Alice' },
        reviewers: [],
        sourceBranch: 'x',
        targetBranch: 'main',
        labels: [],
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-02T00:00:00Z',
        mergedAt: null,
        closedAt: null,
        changesCount: 9,
        events: [],
      },
    ]);
    const done = collector.collect({ sources: [project], from: new Date('2026-10-01'), to: null });

    await tick();
    http.expectOne((r) => r.url.startsWith(`${API}/projects/10/merge_requests`)).flush([item(3)]);
    const result = await done;

    expect(result.mergeRequests[0].changesCount).toBe(9);
  });

  it('collect_NotesForbidden_CountedAsFailed', async () => {
    const done = collector.collect({ sources: [project], from: new Date('2026-10-01'), to: null });

    await tick();
    http.expectOne((r) => r.url.startsWith(`${API}/projects/10/merge_requests`)).flush([item(4)]);
    await tick();
    http
      .expectOne((r) => r.url.startsWith(`${API}/projects/10/merge_requests/4/notes`))
      .flush({}, { status: 403, statusText: 'Forbidden' });
    http.expectOne(`${API}/projects/10/merge_requests/4`).flush(item(4));
    const result = await done;

    expect(result.failed).toBe(1);
    expect(result.mergeRequests[0].events).toEqual([]);
  });
});
