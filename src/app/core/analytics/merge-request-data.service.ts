import { Injectable, computed, inject, signal } from '@angular/core';

import { ConfigService } from '../config/config.service';
import { STORAGE_PREFIX, readJson, removeItem, writeItem } from '../storage/browser-storage';
import {
  AnalysisFilter,
  AnalyzedMr,
  EMPTY_FILTER,
  analyze,
  applyFilter,
  distinctProjects,
  distinctSprints,
  distinctTeams,
} from './analysis';
import { AnalyticsSettingsService } from './analytics-settings.service';
import { MergeRequestCollector } from './collector.service';
import { Dataset, parseDataset, parseDatasetFile, toDatasetFile } from './dataset';
import { rankReviewers } from './reviewers';
import { isRecord } from '../config/app-config';

/**
 * The collected merge requests and everything derived from them. Shared by the analytics pages;
 * kept in sessionStorage (when it fits) so a reload does not lose it, and portable as a file.
 */
@Injectable({ providedIn: 'root' })
export class MergeRequestDataService {
  private readonly configService = inject(ConfigService);
  private readonly settingsService = inject(AnalyticsSettingsService);
  private readonly collector = inject(MergeRequestCollector);

  readonly dataset = signal<Dataset | null>(null);
  /** Filter shared by the dashboard, merge request, sprint and reviewer pages. */
  readonly filter = signal<AnalysisFilter>(EMPTY_FILTER);

  /** Every merge request, analysed with the current settings. */
  readonly all = computed<AnalyzedMr[]>(() => {
    const dataset = this.dataset();
    if (!dataset) {
      return [];
    }
    return analyze(
      dataset.mergeRequests,
      this.settingsService.settings(),
      this.settingsService.branchPattern(),
    );
  });
  readonly filtered = computed(() => applyFilter(this.all(), this.filter()));

  readonly teams = computed(() => distinctTeams(this.all()));
  readonly sprints = computed(() => distinctSprints(this.all()));
  readonly projects = computed(() => distinctProjects(this.all()));
  /** Ranking over the filtered merge requests (the reviewers page). */
  readonly ranking = computed(() => rankReviewers(this.filtered()));
  /** Ranking over everything loaded (used for reviewer assignment). */
  readonly overallRanking = computed(() => rankReviewers(this.all()));

  /** App initializer: restores the dataset of this tab. */
  init(): void {
    const config = this.configService.loaded();
    if (!config) {
      return;
    }
    const stored = readJson('session', this.storageKey());
    if (!isRecord(stored)) {
      return;
    }
    try {
      this.set(parseDataset(stored, config.gitlabUrl), false);
    } catch {
      removeItem('session', this.storageKey());
    }
  }

  set(dataset: Dataset, persist = true): void {
    this.dataset.set(dataset);
    this.collector.remember(dataset.mergeRequests);
    this.filter.update((f) => ({
      ...f,
      teams: f.teams.filter((t) => this.teams().includes(t)),
      sprints: f.sprints.filter((s) => this.sprints().includes(s)),
      projects: f.projects.filter((p) => this.projects().some((x) => x.id === p)),
    }));
    if (persist) {
      // Large datasets may not fit; they then last for this page only (writeItem ignores quota
      // errors). Remove the old copy first so a reload never brings back an older dataset.
      removeItem('session', this.storageKey());
      writeItem('session', this.storageKey(), JSON.stringify(dataset));
    }
  }

  clear(): void {
    this.dataset.set(null);
    this.filter.set(EMPTY_FILTER);
    removeItem('session', this.storageKey());
  }

  exportJson(): string | null {
    const dataset = this.dataset();
    return dataset ? toDatasetFile(dataset) : null;
  }

  /** Throws `DatasetError`. */
  importJson(text: string): Dataset {
    const dataset = parseDatasetFile(text, this.configService.config.gitlabUrl);
    this.set(dataset);
    return dataset;
  }

  private storageKey(): string {
    return `${STORAGE_PREFIX}dataset:${this.configService.loaded()?.gitlabUrl ?? ''}`;
  }
}
