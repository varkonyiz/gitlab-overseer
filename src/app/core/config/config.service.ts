import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AppConfig, ConfigError, parseAppConfig } from './app-config';

export const CONFIG_PATH = 'config/app-config.json';

/** Holds the deployment configuration. `load()` runs once as an app initializer. */
@Injectable({ providedIn: 'root' })
export class ConfigService {
  private readonly http = inject(HttpClient);
  private readonly current = signal<AppConfig | null>(null);

  /** Why the configuration could not be used; the shell shows it instead of the pages. */
  readonly error = signal<string | null>(null);
  readonly loaded = this.current.asReadonly();

  /** The configuration; only call after a successful `load()` (guarded by the shell). */
  get config(): AppConfig {
    const config = this.current();
    if (!config) {
      throw new ConfigError('The configuration is not loaded.');
    }
    return config;
  }

  async load(): Promise<void> {
    try {
      // Relative to <base href>, so the app works under a GitLab Pages project path.
      const raw = await firstValueFrom(
        this.http.get<unknown>(CONFIG_PATH, { headers: { 'Cache-Control': 'no-cache' } }),
      );
      this.current.set(parseAppConfig(raw));
      this.error.set(null);
    } catch (error) {
      this.current.set(null);
      this.error.set(
        error instanceof ConfigError ? error.message : `${CONFIG_PATH} could not be loaded.`,
      );
    }
  }

  /** Test helper and the single place that may replace the configuration at runtime. */
  set(config: AppConfig): void {
    this.current.set(config);
    this.error.set(null);
  }
}
