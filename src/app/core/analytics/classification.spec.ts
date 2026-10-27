import { DEFAULT_BRANCH_PATTERN, compileBranchPattern } from './analytics-settings';
import { classify, compareSprints } from './classification';

const pattern = compileBranchPattern(DEFAULT_BRANCH_PATTERN);
const sprints = [{ sprint: '400', start: '2026-10-01', end: '2026-10-14' }];

describe('classify', () => {
  it('classify_DefaultBranchName_SprintAndTeamFromBranch', () => {
    expect(classify('400_mng_web_feature_name', '2026-12-01T10:00:00Z', pattern, sprints)).toEqual({
      sprint: '400',
      sprintSource: 'branch',
      team: 'mng',
    });
  });

  it('classify_UpperCaseTeam_LowerCased', () => {
    expect(classify('401_QA_fix', '2026-10-02T10:00:00Z', pattern, []).team).toBe('qa');
  });

  it('classify_NoMatch_SprintFromCalendar', () => {
    expect(classify('feature/login', '2026-10-05T10:00:00', pattern, sprints)).toEqual({
      sprint: '400',
      sprintSource: 'calendar',
      team: null,
    });
  });

  it('classify_FourLetterTeam_NoMatch', () => {
    expect(classify('400_abcd_x', '2026-11-05T10:00:00', pattern, sprints)).toEqual({
      sprint: null,
      sprintSource: null,
      team: null,
    });
  });

  it('classify_TeamOnlyPattern_TeamWithCalendarSprint', () => {
    const teamOnly = compileBranchPattern('^(?<team>[a-z]+)/');

    expect(classify('web/login', '2026-10-05T10:00:00', teamOnly, sprints)).toEqual({
      sprint: '400',
      sprintSource: 'calendar',
      team: 'web',
    });
  });

  it('compareSprints_Mixed_NumbersFirst', () => {
    expect(['10', 'b', '9', 'a'].sort(compareSprints)).toEqual(['9', '10', 'a', 'b']);
  });
});
