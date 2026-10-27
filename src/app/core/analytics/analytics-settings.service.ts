import { Injectable, computed, inject, signal } from '@angular/core';

import { isRecord } from '../config/app-config';
import { ConfigService } from '../config/config.service';
import { STORAGE_PREFIX, readJson, removeItem, writeJson } from '../storage/browser-storage';
import {
  AnalyticsSettings,
  DEFAULT_ANALYTICS_SETTINGS,
  SettingsError,
  compileBranchPattern,
  parseAnalyticsSettings,
} from './analytics-settings';

export const SETTINGS_FILE_FORMAT = 'gitlab-overseer/analytics-settings';

/**
 * The analytics settings in effect: the user's own (localStorage, per instance) or the deployment
 * defaults from `app-config.json`. Portable as a JSON file like the data sources.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsSettingsService {
  private readonly configService = inject(ConfigService);
  private readonly own = signal<AnalyticsSettings | null>(null);

  readonly settings = computed(() => this.own() ?? this.defaults());
  readonly isCustomised = computed(() => this.own() !== null);
  readonly branchPattern = computed(() => compileBranchPattern(this.settings().branchPattern));

  /** App initializer (after the configuration). A damaged stored entry falls back to the defaults. */
  init(): void {
    if (!this.configService.loaded()) {
      return;
    }
    try {
      const stored = readJson('local', this.storageKey());
      this.own.set(stored === null ? null : parseAnalyticsSettings(stored, this.defaults()));
    } catch {
      this.own.set(null);
    }
  }

  /** Validates and stores; throws {@link SettingsError}. */
  save(settings: AnalyticsSettings): void {
    const parsed = parseAnalyticsSettings(settings, this.defaults());
    this.own.set(parsed);
    writeJson('local', this.storageKey(), parsed);
  }

  resetToDefaults(): void {
    this.own.set(null);
    removeItem('local', this.storageKey());
  }

  exportJson(now = new Date()): string {
    return JSON.stringify(
      {
        format: SETTINGS_FILE_FORMAT,
        version: 1,
        exportedAt: now.toISOString(),
        settings: this.settings(),
      },
      null,
      2,
    );
  }

  /** Opens a settings file; throws {@link SettingsError} for an unusable file. */
  importJson(text: string): void {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new SettingsError('notJson');
    }
    if (!isRecord(raw) || raw['format'] !== SETTINGS_FILE_FORMAT || raw['version'] !== 1) {
      throw new SettingsError('wrongFormat');
    }
    this.save(parseAnalyticsSettings(raw['settings'], this.defaults()));
  }

  private defaults(): AnalyticsSettings {
    return this.configService.loaded()?.analytics ?? DEFAULT_ANALYTICS_SETTINGS;
  }

  private storageKey(): string {
    return `${STORAGE_PREFIX}analytics:${this.configService.loaded()?.gitlabUrl ?? ''}`;
  }
}
