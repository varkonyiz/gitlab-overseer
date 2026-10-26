import {
  DEFAULT_ANALYTICS_SETTINGS,
  compileBranchPattern,
  generateSprints,
  parseAnalyticsSettings,
  parseSprints,
} from './analytics-settings';

describe('analytics settings', () => {
  it('compileBranchPattern_Default_ReadsSprintAndTeam', () => {
    const groups = compileBranchPattern(DEFAULT_ANALYTICS_SETTINGS.branchPattern).exec(
      '400_mng_web_feature_name',
    )?.groups;

    expect(groups).toEqual({ sprint: '400', team: 'mng' });
  });

  it.each([
    ['', 'patternLength'],
    ['x'.repeat(501), 'patternLength'],
    ['(?<sprint>\\d+', 'patternInvalid'],
    ['^\\d{3}_', 'patternGroups'],
  ])('compileBranchPattern_Invalid_Throws %#', (source, key) => {
    expect(() => compileBranchPattern(source)).toThrow(expect.objectContaining({ key }));
  });

  it('parseAnalyticsSettings_Missing_Defaults', () => {
    expect(parseAnalyticsSettings(undefined)).toBe(DEFAULT_ANALYTICS_SETTINGS);
    expect(parseAnalyticsSettings({})).toEqual(DEFAULT_ANALYTICS_SETTINGS);
  });

  it.each([
    [{ bigMergeRequestFiles: 0 }, 'bigFiles'],
    [{ bigMergeRequestFiles: 1.5 }, 'bigFiles'],
    [{ bigMergeRequestWeight: 0.5 }, 'bigWeight'],
    [{ branchPattern: 3 }, 'patternInvalid'],
    [[], 'notObject'],
  ])('parseAnalyticsSettings_Invalid_Throws %#', (raw, key) => {
    expect(() => parseAnalyticsSettings(raw)).toThrow(expect.objectContaining({ key }));
  });

  it('parseSprints_Unsorted_SortedByStart', () => {
    const sprints = parseSprints([
      { sprint: '401', start: '2026-10-15', end: '2026-10-28' },
      { sprint: '400', start: '2026-10-01', end: '2026-10-14' },
    ]);

    expect(sprints.map((s) => s.sprint)).toEqual(['400', '401']);
  });

  it.each([
    [
      [
        { sprint: '400', start: '2026-10-01', end: '2026-10-14' },
        { sprint: '401', start: '2026-10-14', end: '2026-10-20' },
      ],
      'sprintOverlap',
    ],
    [
      [
        { sprint: '400', start: '2026-10-01', end: '2026-10-14' },
        { sprint: '400', start: '2026-11-01', end: '2026-11-14' },
      ],
      'sprintDuplicate',
    ],
    [[{ sprint: '400', start: '2026-10-14', end: '2026-10-01' }], 'sprintDates'],
    [[{ sprint: '400', start: '2026-02-30', end: '2026-03-01' }], 'sprintDates'],
    [[{ sprint: 'a b', start: '2026-10-01', end: '2026-10-02' }], 'sprintName'],
  ])('parseSprints_Invalid_Throws %#', (list, key) => {
    expect(() => parseSprints(list)).toThrow(expect.objectContaining({ key }));
  });

  it('generateSprints_TwoWeekSprints_Consecutive', () => {
    expect(generateSprints(99, '2026-12-21', 14, 2)).toEqual([
      { sprint: '099', start: '2026-12-21', end: '2027-01-03' },
      { sprint: '100', start: '2027-01-04', end: '2027-01-17' },
    ]);
  });
});
