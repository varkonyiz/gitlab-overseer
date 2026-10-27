import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { GITLAB, provideTestApp } from '../../../testing/test-config';
import { ALICE, BOB, at, event, record } from '../../../testing/merge-requests';
import { AnalyticsSettingsService } from '../../core/analytics/analytics-settings.service';
import { MergeRequestDataService } from '../../core/analytics/merge-request-data.service';
import { DataSourcesService } from '../../core/sources/data-sources.service';
import { DashboardPage } from './dashboard.page';

describe('DashboardPage', () => {
  function render(withData: boolean) {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      imports: [DashboardPage],
      providers: [...provideTestApp(), provideRouter([])],
    });
    TestBed.inject(DataSourcesService).init();
    TestBed.inject(AnalyticsSettingsService).init();
    if (withData) {
      TestBed.inject(MergeRequestDataService).set({
        gitlabUrl: GITLAB,
        collectedAt: at(10),
        range: { from: at(1), to: null },
        sources: [],
        mergeRequests: [
          record({
            createdAt: at(1, 0),
            mergedAt: at(1, 10),
            events: [
              event('reviewRequested', at(1, 1), ALICE, ['bob']),
              event('approved', at(1, 4), BOB),
            ],
          }),
        ],
      });
    }
    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('render_NoData_EmptyState', () => {
    expect(render(false).querySelector('[data-testid="dashboard-no-data"]')).not.toBeNull();
  });

  it('render_Data_PhaseStatistics', () => {
    const element = render(true);

    const cells = (id: string) =>
      [...element.querySelectorAll(`[data-testid="stats-${id}"] td`)].map((td) =>
        td.firstChild?.textContent?.trim(),
      );
    expect(cells('total').slice(1, 3)).toEqual(['1', '10h']);
    expect(cells('review').slice(1, 3)).toEqual(['1', '3h']);
    expect(cells('merge').slice(1, 3)).toEqual(['1', '6h']);
  });
});
