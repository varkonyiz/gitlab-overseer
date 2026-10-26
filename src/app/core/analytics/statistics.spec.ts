import { formatDuration, percentile, summarize, toHours } from './statistics';

const units = { day: 'd', hour: 'h', minute: 'm' };
const H = 3_600_000;

describe('statistics', () => {
  it('summarize_Values_IgnoresNullsAndComputes', () => {
    expect(summarize([4, null, 1, 3, 2])).toEqual({
      count: 4,
      mean: 2.5,
      median: 2.5,
      p90: 3.7,
      min: 1,
      max: 4,
    });
  });

  it('summarize_Empty_AllNull', () => {
    expect(summarize([null])).toEqual({
      count: 0,
      mean: null,
      median: null,
      p90: null,
      min: null,
      max: null,
    });
  });

  it('percentile_Single_ThatValue', () => {
    expect(percentile([7], 90)).toBe(7);
  });

  it.each([
    [null, '–'],
    [0, '0m'],
    [30_000, '<1m'],
    [42 * 60_000, '42m'],
    [5 * H + 12 * 60_000, '5h 12m'],
    [2 * H, '2h'],
    [3 * 24 * H + 4 * H + 59 * 60_000, '3d 4h'],
    [24 * H, '1d'],
  ])('formatDuration_%s_%s', (ms, text) => {
    expect(formatDuration(ms, units)).toBe(text);
  });

  it('toHours_Ms_TwoDecimals', () => {
    expect(toHours(5_400_000)).toBe(1.5);
    expect(toHours(null)).toBeNull();
  });
});
