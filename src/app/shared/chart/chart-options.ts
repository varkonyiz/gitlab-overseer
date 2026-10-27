import type { EChartsCoreOption } from 'echarts/core';

import { AnalyzedMr, NO_VALUE } from '../../core/analytics/analysis';
import { ReviewerRank } from '../../core/analytics/reviewers';
import { DurationUnits, formatDuration, summarize, toHours } from '../../core/analytics/statistics';
import { Phase } from '../../core/analytics/timeline';
import { ColorScheme } from '../../core/preferences.service';
import { MAX_SERIES, OTHER_COLOR, SERIES_COLORS } from './chart-palette';
import { SURFACE, TEXT } from './chart';

const HOUR = 3_600_000;
const BAR = { barMaxWidth: 28, itemStyle: { borderRadius: [4, 4, 0, 0] } };
const GRID = { left: 8, right: 16, top: 48, bottom: 8, containLabel: true };
const LEGEND = { top: 0, left: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 12 };
const RECESSIVE_GRID = { splitLine: { lineStyle: { opacity: 0.4 } } };

/** Phases plotted per sprint (the total is the KPI; it would dwarf the parts). */
export const CHART_PHASES: readonly Phase[] = ['draft', 'reviewAssignment', 'review', 'merge'];

/** Sprints on the x axis, one bar per phase: the median duration (hours) of that sprint's MRs. */
export function phaseMediansBySprint(
  rows: readonly AnalyzedMr[],
  sprints: readonly string[],
  phaseLabels: Readonly<Record<Phase, string>>,
  scheme: ColorScheme,
  units: DurationUnits,
  noneLabel = NO_VALUE,
): EChartsCoreOption {
  const bySprint = groupBy(rows, (r) => r.classification.sprint ?? NO_VALUE);
  return {
    color: [...SERIES_COLORS[scheme]],
    legend: LEGEND,
    grid: GRID,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v: unknown) =>
        typeof v === 'number' ? formatDuration(v * HOUR, units) : '–',
    },
    xAxis: { type: 'category', data: sprints.map((s) => (s === NO_VALUE ? noneLabel : s)) },
    yAxis: { type: 'value', name: units.hour, ...RECESSIVE_GRID },
    series: CHART_PHASES.map((phase) => ({
      name: phaseLabels[phase],
      type: 'bar',
      ...BAR,
      data: sprints.map((s) =>
        toHours(summarize((bySprint.get(s) ?? []).map((r) => r.timeline.phases[phase])).median),
      ),
    })),
  };
}

/**
 * Teams that get their own colour, in colour order: all teams when they fit, otherwise the busiest
 * ones (one slot is kept for "Other"). Pass every loaded merge request, not the filtered ones, so a
 * filter never repaints a team.
 */
export function colouredTeams(allRows: readonly AnalyzedMr[]): string[] {
  const counts = countBy(allRows, (r) => r.classification.team ?? NO_VALUE);
  const teams = [...counts.keys()];
  if (teams.length <= MAX_SERIES) {
    return teams.sort();
  }
  return teams
    .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b))
    .slice(0, MAX_SERIES - 1)
    .sort();
}

/** Merge requests per sprint, stacked by team; teams without a colour of their own form "Other". */
export function mergeRequestsBySprint(
  rows: readonly AnalyzedMr[],
  sprints: readonly string[],
  teams: readonly string[],
  otherLabel: string,
  scheme: ColorScheme,
  noneLabel = NO_VALUE,
): EChartsCoreOption {
  const teamOf = (r: AnalyzedMr) => {
    const team = r.classification.team ?? NO_VALUE;
    return teams.includes(team) ? team : otherLabel;
  };
  const counts = countBy(rows, (r) => `${r.classification.sprint ?? NO_VALUE}\u0000${teamOf(r)}`);
  const present = new Set(rows.map(teamOf));
  const series = [...teams, otherLabel]
    .filter((team) => present.has(team))
    .map((team) => {
      const slot = teams.indexOf(team);
      return {
        name: team === NO_VALUE ? noneLabel : team,
        type: 'bar',
        stack: 'teams',
        barMaxWidth: 28,
        itemStyle: {
          color: slot >= 0 ? SERIES_COLORS[scheme][slot] : OTHER_COLOR[scheme],
          borderColor: SURFACE,
          borderWidth: 2,
          borderRadius: 4,
        },
        data: sprints.map((s) => counts.get(`${s}\u0000${team}`) ?? 0),
      };
    });
  return {
    legend: { ...LEGEND, show: series.length > 1 },
    grid: GRID,
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: { type: 'category', data: sprints.map((s) => (s === NO_VALUE ? noneLabel : s)) },
    yAxis: { type: 'value', minInterval: 1, ...RECESSIVE_GRID },
    series,
  };
}

/** Horizontal bars of the weighted review score, best reviewer on top. */
export function reviewerScores(
  ranking: readonly ReviewerRank[],
  seriesLabel: string,
  scheme: ColorScheme,
  limit = 15,
): EChartsCoreOption {
  const top = ranking.slice(0, limit).reverse();
  return {
    grid: { ...GRID, top: 8, right: 40 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: { type: 'value', minInterval: 1, ...RECESSIVE_GRID },
    yAxis: { type: 'category', data: top.map((r) => r.user.name) },
    series: [
      {
        name: seriesLabel,
        type: 'bar',
        barMaxWidth: 20,
        itemStyle: { color: SERIES_COLORS[scheme][0], borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', color: TEXT, textBorderWidth: 0 },
        data: top.map((r) => r.score),
      },
    ],
  };
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    map.set(k, [...(map.get(k) ?? []), item]);
  }
  return map;
}

function countBy<T>(items: readonly T[], key: (item: T) => string): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return map;
}
