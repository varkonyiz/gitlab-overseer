import { GITLAB } from '../../../testing/test-config';
import {
  DataSource,
  SOURCES_FILE_FORMAT,
  SourcesFileError,
  parseSourcesFile,
  toSourcesFile,
} from './data-sources';

const project: DataSource = {
  kind: 'project',
  id: 1,
  fullPath: 'org/app',
  name: 'Org / App',
  webUrl: `${GITLAB}/org/app`,
};

function file(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...toSourcesFile(GITLAB, [project]), ...overrides });
}

describe('data sources file', () => {
  it('parseSourcesFile_RoundTrip_SameSources', () => {
    expect(parseSourcesFile(file(), GITLAB)).toEqual([project]);
  });

  it('parseSourcesFile_Duplicates_Merged', () => {
    expect(parseSourcesFile(file({ sources: [project, project] }), GITLAB)).toHaveLength(1);
  });

  it.each([
    ['not json', 'notJson'],
    [JSON.stringify({ format: 'other', version: 1 }), 'wrongFormat'],
    [file({ gitlabUrl: 'https://other.example.com' }), 'otherInstance'],
    [file({ sources: [{ ...project, id: -1 }] }), 'invalidEntry'],
    [file({ sources: [{ ...project, kind: 'user' }] }), 'invalidEntry'],
    [file({ sources: [{ ...project, webUrl: 'javascript:alert(1)' }] }), 'invalidEntry'],
    [
      file({ sources: [{ ...project, webUrl: 'https://gitlab.example.com.evil.test/x' }] }),
      'invalidEntry',
    ],
    [file({ sources: 'x' }), 'wrongFormat'],
  ])('parseSourcesFile_Invalid_Throws %#', (text, reason) => {
    expect(() => parseSourcesFile(text, GITLAB)).toThrow(new SourcesFileError(reason));
  });

  it('toSourcesFile_Sources_HasFormatHeader', () => {
    const result = toSourcesFile(GITLAB, [project], new Date(Date.UTC(2026, 0, 1)));

    expect(result).toEqual({
      format: SOURCES_FILE_FORMAT,
      version: 1,
      gitlabUrl: GITLAB,
      exportedAt: '2026-01-01T00:00:00.000Z',
      sources: [project],
    });
  });
});
