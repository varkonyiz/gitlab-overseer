import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { API, GITLAB, provideTestApp, testConfig } from '../../../testing/test-config';
import { ALICE, BOB, CAROL, at, event, record } from '../../../testing/merge-requests';
import { AnalyticsSettingsService } from '../../core/analytics/analytics-settings.service';
import { MergeRequestDataService } from '../../core/analytics/merge-request-data.service';
import { AppConfig } from '../../core/config/app-config';
import { DataSourcesService } from '../../core/sources/data-sources.service';
import { AssignPage } from './assign.page';

interface PageApi {
  selectTeam(v: string): void;
  selectSprint(v: string): void;
  selectPool(v: string[]): void;
  apply(): Promise<void>;
  plan(): { row: { mr: { iid: number } }; reviewer: { username: string } }[];
}

const tick = () => new Promise((r) => setTimeout(r));

describe('AssignPage', () => {
  async function render(config: AppConfig) {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      imports: [AssignPage],
      providers: [...provideTestApp(config), provideRouter([])],
    });
    TestBed.inject(DataSourcesService).init();
    TestBed.inject(AnalyticsSettingsService).init();
    TestBed.inject(MergeRequestDataService).set({
      gitlabUrl: GITLAB,
      collectedAt: at(10),
      range: { from: at(1), to: null },
      sources: [],
      mergeRequests: [
        // Bob already reviewed twice, Carol never: Carol is at the bottom of the ranking.
        record({ iid: 1, events: [event('approved', at(2), BOB)] }),
        record({ iid: 2, events: [event('approved', at(2), BOB)] }),
        record({ iid: 3, state: 'closed', author: CAROL, sourceBranch: '399_mng_x' }),
        record({ iid: 7, state: 'opened', author: ALICE, sourceBranch: '400_mng_login' }),
      ],
    });
    const fixture = TestBed.createComponent(AssignPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const page = fixture.componentInstance as unknown as PageApi;
    page.selectTeam('mng');
    page.selectSprint('400');
    page.selectPool([String(BOB.id), String(CAROL.id)]);
    fixture.detectChanges();
    return {
      fixture,
      page,
      http: TestBed.inject(HttpTestingController),
      element: fixture.nativeElement as HTMLElement,
    };
  }

  it('plan_TeamSprintPool_LowestRankedGetsTheMergeRequest', async () => {
    const { page, element } = await render(testConfig());

    expect(page.plan().map((p) => [p.row.mr.iid, p.reviewer.username])).toEqual([[7, 'carol']]);
    expect(element.querySelector('[data-testid="assign-disabled"]')).not.toBeNull();
  });

  it('apply_Enabled_RechecksAndSetsReviewer', async () => {
    const { fixture, page, http } = await render(
      testConfig({ features: { reviewerAssignment: true } }),
    );

    const done = page.apply();
    await tick();
    http
      .expectOne(`${API}/projects/10/merge_requests/7`)
      .flush({ iid: 7, state: 'opened', reviewers: [] });
    await tick();
    const put = http.expectOne((r) => r.method === 'PUT');
    expect(put.request.url).toBe(`${API}/projects/10/merge_requests/7`);
    expect(put.request.body).toEqual({ reviewer_ids: [CAROL.id] });
    put.flush({ iid: 7 });
    await done;
    fixture.detectChanges();

    const data = TestBed.inject(MergeRequestDataService);
    expect(data.all().find((r) => r.mr.iid === 7)?.mr.reviewers).toEqual([CAROL]);
    expect(page.plan()).toEqual([]);
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[data-testid="plan-result"]')?.textContent?.trim()).toBe(
      'assign.outcomes.assigned',
    );
    http.verify();
  });

  it('apply_ReviewerAddedMeanwhile_Skipped', async () => {
    const { page, http } = await render(testConfig({ features: { reviewerAssignment: true } }));

    const done = page.apply();
    await tick();
    http
      .expectOne(`${API}/projects/10/merge_requests/7`)
      .flush({ iid: 7, state: 'opened', reviewers: [{ id: 9, username: 'zed', name: 'Zed' }] });
    await done;

    http.expectNone((r) => r.method === 'PUT');
  });
});
