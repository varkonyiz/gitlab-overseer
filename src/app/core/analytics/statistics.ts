/** Summary statistics as GitLab's analytics show them (median and average), plus spread. */
export interface Summary {
  readonly count: number;
  readonly mean: number | null;
  readonly median: number | null;
  readonly p90: number | null;
  readonly min: number | null;
  readonly max: number | null;
}

export function summarize(values: readonly (number | null)[]): Summary {
  const sorted = values
    .filter((v): v is number => v !== null && Number.isFinite(v))
    .sort((a, b) => a - b);
  if (sorted.length === 0) {
    return { count: 0, mean: null, median: null, p90: null, min: null, max: null };
  }
  return {
    count: sorted.length,
    mean: sorted.reduce((sum, v) => sum + v, 0) / sorted.length,
    median: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

/** Linear interpolation between closest ranks (the spreadsheet PERCENTILE.INC definition). */
export function percentile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) {
    return null;
  }
  const rank = (p / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  return sorted[low] + (sorted[high] - sorted[low]) * (rank - low);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export interface DurationUnits {
  readonly day: string;
  readonly hour: string;
  readonly minute: string;
}

/** `3d 4h`, `5h 12m`, `42m`, `<1m` (two most significant units). */
export function formatDuration(ms: number | null, units: DurationUnits): string {
  if (ms === null || !Number.isFinite(ms)) {
    return '–';
  }
  if (ms === 0) {
    return `0${units.minute}`;
  }
  if (ms < MINUTE) {
    return `<1${units.minute}`;
  }
  const days = Math.floor(ms / DAY);
  const hours = Math.floor((ms % DAY) / HOUR);
  const minutes = Math.floor((ms % HOUR) / MINUTE);
  if (days > 0) {
    return hours > 0 ? `${days}${units.day} ${hours}${units.hour}` : `${days}${units.day}`;
  }
  if (hours > 0) {
    return minutes > 0
      ? `${hours}${units.hour} ${minutes}${units.minute}`
      : `${hours}${units.hour}`;
  }
  return `${minutes}${units.minute}`;
}

/** Milliseconds → hours with two decimals, for CSV and chart axes. */
export function toHours(ms: number | null): number | null {
  return ms === null ? null : Math.round((ms / HOUR) * 100) / 100;
}
