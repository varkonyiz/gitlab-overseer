import { SprintDefinition, formatDay } from './analytics-settings';

export type SprintSource = 'branch' | 'calendar';

export interface Classification {
  readonly sprint: string | null;
  readonly sprintSource: SprintSource | null;
  /** Team moniker in lower case, so `MNG_` and `mng_` group together. */
  readonly team: string | null;
}

/**
 * Sprint and team of a merge request: the `sprint` and `team` groups of the branch pattern first;
 * without a sprint in the branch name, the sprint whose dates contain the creation day.
 */
export function classify(
  sourceBranch: string,
  createdAt: string,
  pattern: RegExp,
  sprints: readonly SprintDefinition[],
): Classification {
  const groups = pattern.exec(sourceBranch)?.groups ?? {};
  const team = groups['team'] ? groups['team'].toLowerCase() : null;
  if (groups['sprint']) {
    return { sprint: groups['sprint'], sprintSource: 'branch', team };
  }
  const day = formatDay(new Date(createdAt));
  const fromCalendar = sprints.find((s) => s.start <= day && day <= s.end);
  return fromCalendar
    ? { sprint: fromCalendar.sprint, sprintSource: 'calendar', team }
    : { sprint: null, sprintSource: null, team };
}

/** Sprints in display order: numeric ones by number, others alphabetically after them. */
export function compareSprints(a: string, b: string): number {
  const na = /^\d+$/.test(a) ? Number(a) : NaN;
  const nb = /^\d+$/.test(b) ? Number(b) : NaN;
  if (!Number.isNaN(na) && !Number.isNaN(nb)) {
    return na - nb;
  }
  if (!Number.isNaN(na)) {
    return -1;
  }
  if (!Number.isNaN(nb)) {
    return 1;
  }
  return a.localeCompare(b);
}
