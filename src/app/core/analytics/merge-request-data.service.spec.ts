import { TestBed } from '@angular/core/testing';

import { GITLAB, provideTestApp } from '../../../testing/test-config';
import { BOB, at, event, record } from '../../../testing/merge-requests';
import { AnalyticsSettingsService } from './analytics-settings.service';
import { DEFAULT_ANALYTICS_SETTINGS } from './analytics-settings';
import { Dataset } from './dataset';
import { MergeRequestDataService } from './merge-request-data.service';

const dataset: Dataset = {
  gitlabUrl: GITLAB,
  collectedAt: at(10),
  range: { from: at(1), to: null },
  sources: ['acme'],
  mergeRequests: [
    record({ sourceBranch: '400_mng_a', events: [event('approved', at(2), BOB)] }),
    record({ sourceBranch: '401_web_b', state: 'opened' }),
  ],
};

describe('MergeRequestDataService', () => {
  function setup(): MergeRequestDataService {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    TestBed.inject(AnalyticsSettingsService).init();
    const service = TestBed.inject(MergeRequestDataService);
    service.init();
    return service;
  }

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('set_Dataset_DerivesTeamsSprintsAndRanking', () => {
    const service = setup();

    service.set(dataset);

    expect(service.teams()).toEqual(['mng', 'web']);
    expect(service.sprints()).toEqual(['400', '401']);
    expect(service.ranking().map((r) => r.user.username)).toEqual(['bob']);
  });

  it('filter_Team_FiltersRowsButNotOverallRanking', () => {
    const service = setup();
    service.set(dataset);

    service.filter.set({ teams: ['web'], sprints: [], projects: [], states: [] });

    expect(service.filtered()).toHaveLength(1);
    expect(service.ranking()).toEqual([]);
    expect(service.overallRanking()).toHaveLength(1);
  });

  it('init_StoredInSession_Restored', () => {
    setup().set(dataset);
    TestBed.resetTestingModule();

    expect(setup().all()).toHaveLength(2);
  });

  it('settings_PatternChanged_Reclassified', () => {
    const service = setup();
    service.set(dataset);

    TestBed.inject(AnalyticsSettingsService).save({
      ...DEFAULT_ANALYTICS_SETTINGS,
      branchPattern: '^\\d+_(?<team>[a-z]+)_',
    });

    expect(service.sprints()).toEqual(['∅']);
    expect(service.teams()).toEqual(['mng', 'web']);
  });
});
