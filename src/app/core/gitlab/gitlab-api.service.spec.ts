import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API, provideTestApp } from '../../../testing/test-config';
import { GitLabApiService, encodeId } from './gitlab-api.service';

describe('GitLabApiService', () => {
  let api: GitLabApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: provideTestApp() });
    api = TestBed.inject(GitLabApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const tick = () => new Promise((r) => setTimeout(r));

  it('getAll_ThreePages_FollowsXNextPage', async () => {
    const pages: number[] = [];
    const result = api.getAll<number>(
      '/projects',
      { membership: true },
      {
        perPage: 2,
        onPage: (loaded) => pages.push(loaded),
      },
    );

    await tick();
    http
      .expectOne(`${API}/projects?membership=true&per_page=2`)
      .flush([1, 2], { headers: { 'X-Next-Page': '2', 'X-Total': '5' } });
    await tick();
    http
      .expectOne(`${API}/projects?membership=true&per_page=2&page=2`)
      .flush([3, 4], { headers: { 'X-Next-Page': '3' } });
    await tick();
    http
      .expectOne(`${API}/projects?membership=true&per_page=2&page=3`)
      .flush([5], { headers: { 'X-Next-Page': '' } });

    expect(await result).toEqual([1, 2, 3, 4, 5]);
    expect(pages).toEqual([2, 4, 5]);
  });

  it('getAll_MaxItems_StopsEarly', async () => {
    const result = api.getAll<number>('/projects', {}, { perPage: 2, maxItems: 3 });

    await tick();
    http.expectOne(`${API}/projects?per_page=2`).flush([1, 2], { headers: { 'X-Next-Page': '2' } });
    await tick();
    http
      .expectOne(`${API}/projects?per_page=2&page=2`)
      .flush([3, 4], { headers: { 'X-Next-Page': '3' } });

    expect(await result).toEqual([1, 2, 3]);
  });

  it('getAll_Aborted_Throws', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(api.getAll('/projects', {}, { signal: controller.signal })).rejects.toBeTruthy();
  });

  it('project_FullPath_IsEncoded', async () => {
    const result = api.project('group/sub/app');

    await tick();
    http.expectOne(`${API}/projects/group%2Fsub%2Fapp`).flush({ id: 1 });

    expect((await result).id).toBe(1);
  });

  it('countMergeRequests_Group_ReadsXTotal', async () => {
    const since = new Date(Date.UTC(2026, 9, 1));
    const result = api.countMergeRequests('group', 9, since);

    await tick();
    const req = http.expectOne((r) => r.url.startsWith(`${API}/groups/9/merge_requests`));
    expect(req.request.urlWithParams).toContain('created_after=2026-10-01T00:00:00.000Z');
    expect(req.request.urlWithParams).toContain('per_page=1');
    req.flush([{}], { headers: { 'X-Total': '42', 'X-Next-Page': '2' } });

    expect(await result).toBe(42);
  });

  it('countMergeRequests_NoTotalHeader_NullWhenMorePages', async () => {
    const result = api.countMergeRequests('project', 3, new Date());

    await tick();
    http
      .expectOne((r) => r.url.startsWith(`${API}/projects/3/merge_requests`))
      .flush([{}], { headers: { 'X-Next-Page': '2' } });

    expect(await result).toBeNull();
  });

  it('encodeId_NumberAndPath_Encoded', () => {
    expect(encodeId(5)).toBe('5');
    expect(encodeId('a/b')).toBe('a%2Fb');
  });
});
