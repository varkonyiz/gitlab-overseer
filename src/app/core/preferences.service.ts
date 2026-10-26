import { Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { themeSwitcher } from '@siemens/ix';

import { AppLanguage, SUPPORTED_LANGUAGES } from './config/app-config';
import { ConfigService } from './config/config.service';
import { CsvDelimiter } from './export/csv';
import { STORAGE_PREFIX, readItem, writeItem } from './storage/browser-storage';

export type ColorScheme = 'light' | 'dark';

const LANGUAGE_KEY = `${STORAGE_PREFIX}lang`;
const SCHEME_KEY = `${STORAGE_PREFIX}scheme`;
const DELIMITER_KEY = `${STORAGE_PREFIX}csv-delimiter`;
const DELIMITERS: readonly CsvDelimiter[] = [',', ';', '\t'];

/** Per-viewer UI preferences, remembered in localStorage when available. */
@Injectable({ providedIn: 'root' })
export class PreferencesService {
  private readonly translate = inject(TranslateService);
  private readonly configService = inject(ConfigService);

  readonly language = signal<AppLanguage>('en');
  readonly colorScheme = signal<ColorScheme>('light');
  readonly csvDelimiter = signal<CsvDelimiter>(',');

  init(): void {
    const fallback = this.configService.loaded()?.defaultLanguage ?? 'en';
    this.setLanguage(parseLanguage(readItem('local', LANGUAGE_KEY)) ?? fallback);
    this.setColorScheme(readItem('local', SCHEME_KEY) === 'dark' ? 'dark' : 'light');
    const delimiter = DELIMITERS.find((d) => d === readItem('local', DELIMITER_KEY));
    this.csvDelimiter.set(delimiter ?? (this.language() === 'hu' ? ';' : ','));
  }

  setLanguage(language: AppLanguage): void {
    this.language.set(language);
    this.translate.use(language);
    document.documentElement.lang = language;
    writeItem('local', LANGUAGE_KEY, language);
  }

  toggleLanguage(): void {
    this.setLanguage(this.language() === 'en' ? 'hu' : 'en');
  }

  setColorScheme(scheme: ColorScheme): void {
    this.colorScheme.set(scheme);
    themeSwitcher.setTheme('classic', scheme);
    writeItem('local', SCHEME_KEY, scheme);
  }

  toggleColorScheme(): void {
    this.setColorScheme(this.colorScheme() === 'light' ? 'dark' : 'light');
  }

  setCsvDelimiter(delimiter: CsvDelimiter): void {
    this.csvDelimiter.set(delimiter);
    writeItem('local', DELIMITER_KEY, delimiter);
  }
}

export function parseLanguage(value: string | null): AppLanguage | null {
  return SUPPORTED_LANGUAGES.find((l) => l === value) ?? null;
}
