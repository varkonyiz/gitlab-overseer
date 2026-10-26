import { Pipe, PipeTransform } from '@angular/core';

import { DurationUnits, formatDuration } from '../core/analytics/statistics';
import { AppLanguage } from '../core/config/app-config';

/** Unit letters per language; durations are too dense for full words. */
export const DURATION_UNITS: Readonly<Record<AppLanguage, DurationUnits>> = {
  en: { day: 'd', hour: 'h', minute: 'm' },
  hu: { day: 'n', hour: 'ó', minute: 'p' },
};

/** `{{ ms | duration: preferences.language() }}` → `3d 4h` (pure: the language is an argument). */
@Pipe({ name: 'duration' })
export class DurationPipe implements PipeTransform {
  transform(ms: number | null | undefined, language: AppLanguage): string {
    return formatDuration(ms ?? null, DURATION_UNITS[language]);
  }
}
