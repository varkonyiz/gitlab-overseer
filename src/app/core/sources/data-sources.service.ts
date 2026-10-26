import { Injectable, computed, inject, signal } from '@angular/core';

import { ConfigService } from '../config/config.service';
import { GitLabApiService } from '../gitlab/gitlab-api.service';
import {
  STORAGE_PREFIX,
  readItem,
  readJson,
  writeItem,
  writeJson,
} from '../storage/browser-storage';
import {
  DataSource,
  MAX_SOURCES,
  fromGroup,
  fromProject,
  parseSourcesFile,
  sourceKey,
  toSourcesFile,
} from './data-sources';

export interface DefaultsResult {
  readonly added: number;
  /** Paths from the configuration that GitLab did not return (missing or no access). */
  readonly missing: readonly string[];
}

/**
 * The projects and groups the user watches. Remembered per GitLab instance in localStorage and
 * portable as a JSON file (download / open), since GitLab Pages has no server-side storage.
 */
@Injectable({ providedIn: 'root' })
export class DataSourcesService {
  private readonly configService = inject(ConfigService);
  private readonly api = inject(GitLabApiService);
  private readonly state = signal<readonly DataSource[]>([]);

  readonly sources = this.state.asReadonly();
  readonly projects = computed(() => this.sources().filter((s) => s.kind === 'project'));
  readonly groups = computed(() => this.sources().filter((s) => s.kind === 'group'));

  /** App initializer (after the configuration): reads the stored list for this instance. */
  init(): void {
    if (!this.configService.loaded()) {
      return;
    }
    const stored = readJson('local', this.storageKey());
    let sources: DataSource[] = [];
    if (stored !== null) {
      try {
        sources = parseSourcesFile(JSON.stringify(stored), this.gitlabUrl());
      } catch {
        sources = []; // a damaged entry is dropped rather than breaking the page
      }
    }
    this.state.set(sources);
  }

  has(source: Pick<DataSource, 'kind' | 'id'>): boolean {
    const key = sourceKey(source);
    return this.sources().some((s) => sourceKey(s) === key);
  }

  /** Adds (or updates) sources; returns false when the limit would be exceeded. */
  add(...added: DataSource[]): boolean {
    const merged = new Map(this.sources().map((s) => [sourceKey(s), s]));
    for (const source of added) {
      merged.set(sourceKey(source), source);
    }
    if (merged.size > MAX_SOURCES) {
      return false;
    }
    this.save([...merged.values()]);
    return true;
  }

  remove(source: Pick<DataSource, 'kind' | 'id'>): void {
    const key = sourceKey(source);
    this.save(this.sources().filter((s) => sourceKey(s) !== key));
  }

  clear(): void {
    this.save([]);
  }

  exportJson(): string {
    return JSON.stringify(
      toSourcesFile(this.configService.config.gitlabUrl, this.sources()),
      null,
      2,
    );
  }

  /** Replaces the list with the file's sources. Throws `SourcesFileError` for an unusable file. */
  importJson(text: string): number {
    const sources = parseSourcesFile(text, this.configService.config.gitlabUrl);
    this.save(sources);
    return sources.length;
  }

  /** True once per instance and browser until the configured default sources were offered. */
  shouldApplyDefaults(): boolean {
    return (
      this.configService.config.defaultSources.length > 0 &&
      readItem('local', this.defaultsKey()) === null
    );
  }

  /** Resolves the configured default paths through the API and adds the ones that exist. */
  async applyDefaults(): Promise<DefaultsResult> {
    writeItem('local', this.defaultsKey(), new Date().toISOString());
    const found: DataSource[] = [];
    const missing: string[] = [];
    for (const entry of this.configService.config.defaultSources) {
      try {
        found.push(
          entry.kind === 'project'
            ? fromProject(await this.api.project(entry.path))
            : fromGroup(await this.api.group(entry.path)),
        );
      } catch {
        missing.push(entry.path);
      }
    }
    const before = this.sources().length;
    this.add(...found);
    return { added: this.sources().length - before, missing };
  }

  private save(sources: DataSource[]): void {
    const sorted = [...sources].sort(
      (a, b) => a.kind.localeCompare(b.kind) || a.fullPath.localeCompare(b.fullPath),
    );
    this.state.set(sorted);
    writeJson('local', this.storageKey(), toSourcesFile(this.gitlabUrl(), sorted));
  }

  private gitlabUrl(): string {
    return this.configService.loaded()?.gitlabUrl ?? '';
  }

  private storageKey(): string {
    return `${STORAGE_PREFIX}sources:${this.gitlabUrl()}`;
  }

  private defaultsKey(): string {
    return `${STORAGE_PREFIX}defaults-applied:${this.gitlabUrl()}`;
  }
}
