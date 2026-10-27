import { isRecord } from '../config/app-config';

/**
 * How merge requests are mapped to sprints and teams, and how review size is weighted. Deployment
 * defaults come from `app-config.json` (`analytics`); each user can override them on the settings
 * page, and download/open them as a file.
 */
export interface AnalyticsSettings {
  /**
   * JavaScript regular expression applied to the source branch. Named groups `sprint` and `team`
   * give the sprint number and the team moniker, e.g. `400_mng_web_feature_name` → 400, mng.
   */
  readonly branchPattern: string;
  /** Fallback when the branch name carries no sprint: the sprint whose dates contain the MR's creation day. */
  readonly sprints: readonly SprintDefinition[];
  /** A merge request with at least this many changed files counts as a big review. */
  readonly bigMergeRequestFiles: number;
  /** Ranking weight of a big review (a small one counts 1). */
  readonly bigMergeRequestWeight: number;
}

export interface SprintDefinition {
  readonly sprint: string;
  /** First day, `yyyy-mm-dd` (local date, inclusive). */
  readonly start: string;
  /** Last day, `yyyy-mm-dd` (local date, inclusive). */
  readonly end: string;
}

/** `400_mng_…`: three-digit sprint number, `_`, a 2–3 letter team moniker, `_`. */
export const DEFAULT_BRANCH_PATTERN = '^(?<sprint>\\d{3})_(?<team>[A-Za-z]{2,3})_';

export const DEFAULT_ANALYTICS_SETTINGS: AnalyticsSettings = {
  branchPattern: DEFAULT_BRANCH_PATTERN,
  sprints: [],
  bigMergeRequestFiles: 50,
  bigMergeRequestWeight: 2,
};

export const MAX_PATTERN_LENGTH = 500;
export const MAX_SPRINTS = 500;
const SPRINT_NAME = /^[A-Za-z0-9._-]{1,32}$/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Thrown with a translation key under `settings.errors.` and optional parameters. */
export class SettingsError extends Error {
  constructor(
    readonly key: string,
    readonly params: Record<string, string | number> = {},
  ) {
    super(key);
  }
}

/** Compiles the branch pattern; it must be valid and name at least a `sprint` or `team` group. */
export function compileBranchPattern(source: string): RegExp {
  if (source.length === 0 || source.length > MAX_PATTERN_LENGTH) {
    throw new SettingsError('patternLength', { max: MAX_PATTERN_LENGTH });
  }
  let pattern: RegExp;
  try {
    pattern = new RegExp(source);
  } catch {
    throw new SettingsError('patternInvalid');
  }
  if (!/\(\?<(sprint|team)>/.test(source)) {
    throw new SettingsError('patternGroups');
  }
  return pattern;
}

/** Validates settings from a file, the config or storage; missing keys take `defaults`. */
export function parseAnalyticsSettings(
  raw: unknown,
  defaults: AnalyticsSettings = DEFAULT_ANALYTICS_SETTINGS,
): AnalyticsSettings {
  if (raw === undefined || raw === null) {
    return defaults;
  }
  if (!isRecord(raw)) {
    throw new SettingsError('notObject');
  }
  const branchPattern = raw['branchPattern'] ?? defaults.branchPattern;
  if (typeof branchPattern !== 'string') {
    throw new SettingsError('patternInvalid');
  }
  compileBranchPattern(branchPattern);

  const files = raw['bigMergeRequestFiles'] ?? defaults.bigMergeRequestFiles;
  if (!Number.isInteger(files) || (files as number) < 1 || (files as number) > 100_000) {
    throw new SettingsError('bigFiles');
  }
  const weight = raw['bigMergeRequestWeight'] ?? defaults.bigMergeRequestWeight;
  if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 1 || weight > 100) {
    throw new SettingsError('bigWeight');
  }

  return {
    branchPattern,
    sprints: parseSprints(raw['sprints'] ?? defaults.sprints),
    bigMergeRequestFiles: files as number,
    bigMergeRequestWeight: weight,
  };
}

export function parseSprints(value: unknown): SprintDefinition[] {
  if (!Array.isArray(value) || value.length > MAX_SPRINTS) {
    throw new SettingsError('sprintList', { max: MAX_SPRINTS });
  }
  const seen = new Set<string>();
  const sprints = value.map((entry, index) => {
    const row = index + 1;
    if (!isRecord(entry)) {
      throw new SettingsError('sprintRow', { row });
    }
    const { sprint, start, end } = entry;
    if (typeof sprint !== 'string' || !SPRINT_NAME.test(sprint)) {
      throw new SettingsError('sprintName', { row });
    }
    if (!isDay(start) || !isDay(end) || start > end) {
      throw new SettingsError('sprintDates', { row });
    }
    if (seen.has(sprint)) {
      throw new SettingsError('sprintDuplicate', { row, sprint });
    }
    seen.add(sprint);
    return { sprint, start, end };
  });
  const sorted = [...sprints].sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start <= sorted[i - 1].end) {
      throw new SettingsError('sprintOverlap', { a: sorted[i - 1].sprint, b: sorted[i].sprint });
    }
  }
  return sorted;
}

/**
 * Consecutive sprints: `count` sprints of `lengthDays` days from `start`, numbered from
 * `firstSprint` and zero-padded to `digits` (the default branch pattern expects three).
 */
export function generateSprints(
  firstSprint: number,
  start: string,
  lengthDays: number,
  count: number,
  digits = 3,
): SprintDefinition[] {
  if (!isDay(start) || lengthDays < 1 || count < 1 || count > MAX_SPRINTS || firstSprint < 0) {
    throw new SettingsError('generator');
  }
  const result: SprintDefinition[] = [];
  let day = parseDay(start);
  for (let i = 0; i < count; i++) {
    const end = addDays(day, lengthDays - 1);
    result.push({
      sprint: String(firstSprint + i).padStart(digits, '0'),
      start: formatDay(day),
      end: formatDay(end),
    });
    day = addDays(end, 1);
  }
  return result;
}

function isDay(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DAY.test(value)) {
    return false;
  }
  return formatDay(parseDay(value)) === value; // rejects 2026-02-30
}

/** `yyyy-mm-dd` → local midnight. */
export function parseDay(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Local calendar day of a date as `yyyy-mm-dd`. */
export function formatDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}
