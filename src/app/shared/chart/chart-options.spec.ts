import { analyzed, at, event, record, ALICE, BOB } from '../../../testing/merge-requests';
import { SERIES_COLORS } from './chart-palette';
import {
  colouredTeams,
  mergeRequestsBySprint,
  phaseMediansBySprint,
  reviewerScores,
} from './chart-options';
import { rankReviewers } from '../../core/analytics/reviewers';

const units = { day: 'd', hour: 'h', minute: 'm' };
const labels = { total: 'T', draft: 'D', reviewAssignment: 'A', review: 'R', merge: 'M' };

interface BarSeries {
  name: string;
  data: (number | null)[];
  itemStyle: { color: string };
}

describe('chart options', () => {
  const rows = analyzed([
    record({ sourceBranch: '400_mng_a' }),
    record({ sourceBranch: '400_mng_b' }),
    record({ sourceBranch: '400_web_c' }),
    record({ sourceBranch: '401_web_d' }),
  ]);

  it('mergeRequestsBySprint_Teams_StackedCountsPerSprint', () => {
    const option = mergeRequestsBySprint(
      rows,
      ['400', '401'],
      colouredTeams(rows),
      'Other',
      'light',
    );
    const series = option['series'] as BarSeries[];

    expect(series.map((s) => [s.name, s.data])).toEqual([
      ['mng', [2, 0]],
      ['web', [1, 1]],
    ]);
  });

  it('mergeRequestsBySprint_FilteredTeam_KeepsItsColour', () => {
    const teams = colouredTeams(rows);
    const webOnly = rows.filter((r) => r.classification.team === 'web');

    const series = mergeRequestsBySprint(webOnly, ['400', '401'], teams, 'Other', 'light')[
      'series'
    ] as BarSeries[];

    expect(series).toHaveLength(1);
    expect(series[0].itemStyle.color).toBe(SERIES_COLORS.light[1]);
  });

  it('colouredTeams_ManyTeams_BusiestKeepColoursRestOther', () => {
    const many = analyzed(
      ['aa', 'bb', 'cc', 'dd', 'ee', 'ff', 'gg'].flatMap((team, i) =>
        Array.from({ length: i + 1 }, () => record({ sourceBranch: `400_${team}_x` })),
      ),
    );

    expect(colouredTeams(many)).toEqual(['cc', 'dd', 'ee', 'ff', 'gg']);
  });

  it('phaseMediansBySprint_MergedMr_MedianHours', () => {
    const merged = analyzed([
      record({
        sourceBranch: '400_mng_a',
        createdAt: at(1, 0),
        mergedAt: at(1, 6),
        events: [
          event('reviewRequested', at(1, 1), ALICE, ['bob']),
          event('approved', at(1, 3), BOB),
        ],
      }),
    ]);

    const series = phaseMediansBySprint(merged, ['400'], labels, 'dark', units)[
      'series'
    ] as BarSeries[];

    expect(series.map((s) => [s.name, s.data[0]])).toEqual([
      ['D', null],
      ['A', 1],
      ['R', 2],
      ['M', 3],
    ]);
  });

  it('reviewerScores_Ranking_BestOnTop', () => {
    const ranked = rankReviewers(analyzed([record({ events: [event('approved', at(1), BOB)] })]));

    const option = reviewerScores(ranked, 'Score', 'light');

    expect((option['yAxis'] as { data: string[] }).data).toEqual(['Bob']);
  });
});
