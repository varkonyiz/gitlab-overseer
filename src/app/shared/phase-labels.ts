import { Signal, computed, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { toSignal } from '@angular/core/rxjs-interop';

import { PHASES, Phase } from '../core/analytics/timeline';

/** Translated phase names, updated when the language changes (for charts, which take plain text). */
export function phaseLabels(): Signal<Record<Phase, string>> {
  const translate = inject(TranslateService);
  const change = toSignal(translate.onLangChange, { initialValue: null });
  return computed(() => {
    change();
    return Object.fromEntries(
      PHASES.map((p) => [p, translate.instant(`phases.${p}`) as string]),
    ) as Record<Phase, string>;
  });
}

/** One translated string as a signal (for chart labels). */
export function translated(key: string): Signal<string> {
  const translate = inject(TranslateService);
  const change = toSignal(translate.onLangChange, { initialValue: null });
  return computed(() => {
    change();
    return translate.instant(key) as string;
  });
}
