import { ConfigError, normalizeGitLabUrl, parseAppConfig } from './app-config';

describe('parseAppConfig', () => {
  it('parseAppConfig_MinimalFile_FillsDefaults', () => {
    const config = parseAppConfig({ gitlabUrl: 'https://gitlab.com/' });

    expect(config).toEqual({
      gitlabUrl: 'https://gitlab.com',
      oauth: { clientId: '', scopes: ['read_api'], redirectUri: null },
      allowPersonalAccessToken: true,
      defaultLanguage: 'en',
      defaultSources: [],
    });
  });

  it('parseAppConfig_FullFile_KeepsValues', () => {
    const config = parseAppConfig({
      gitlabUrl: 'https://example.com/gitlab',
      oauth: {
        clientId: 'abc_123',
        scopes: ['read_api', 'read_user', 'read_api'],
        redirectUri: 'https://pages.example.com/app/',
      },
      allowPersonalAccessToken: false,
      defaultLanguage: 'hu',
      defaultSources: [{ kind: 'group', path: 'org/team' }],
    });

    expect(config.gitlabUrl).toBe('https://example.com/gitlab');
    expect(config.oauth).toEqual({
      clientId: 'abc_123',
      scopes: ['read_api', 'read_user'],
      redirectUri: 'https://pages.example.com/app/',
    });
    expect(config.allowPersonalAccessToken).toBe(false);
    expect(config.defaultLanguage).toBe('hu');
    expect(config.defaultSources).toEqual([{ kind: 'group', path: 'org/team' }]);
  });

  it.each([
    [{}, /gitlabUrl/],
    [{ gitlabUrl: 'http://gitlab.example.com' }, /https/],
    [{ gitlabUrl: 'https://u:p@gitlab.example.com' }, /credentials/],
    [{ gitlabUrl: 'https://gitlab.com', oauth: { scopes: ['api'] } }, /read scopes/],
    [{ gitlabUrl: 'https://gitlab.com', oauth: { scopes: [] } }, /empty/],
    [{ gitlabUrl: 'https://gitlab.com', oauth: { clientId: 'a b' } }, /clientId/],
    [{ gitlabUrl: 'https://gitlab.com', oauth: { redirectUri: 'https://x/#cb' } }, /redirectUri/],
    [{ gitlabUrl: 'https://gitlab.com', defaultLanguage: 'de' }, /defaultLanguage/],
    [{ gitlabUrl: 'https://gitlab.com', allowPersonalAccessToken: 'yes' }, /true or false/],
    [
      { gitlabUrl: 'https://gitlab.com', defaultSources: [{ kind: 'user', path: 'x' }] },
      /defaultSources\[0\]/,
    ],
    [
      { gitlabUrl: 'https://gitlab.com', defaultSources: [{ kind: 'group', path: '../x' }] },
      /defaultSources\[0\]/,
    ],
  ])('parseAppConfig_InvalidFile_Throws %#', (raw, message) => {
    expect(() => parseAppConfig(raw)).toThrow(message);
  });

  it('parseAppConfig_NotAnObject_Throws', () => {
    expect(() => parseAppConfig([])).toThrow(ConfigError);
  });
});

describe('normalizeGitLabUrl', () => {
  it('normalizeGitLabUrl_LocalhostHttp_Allowed', () => {
    expect(normalizeGitLabUrl('http://localhost:8929/')).toBe('http://localhost:8929');
  });

  it('normalizeGitLabUrl_QueryString_Refused', () => {
    expect(() => normalizeGitLabUrl('https://gitlab.com/?a=1')).toThrow(ConfigError);
  });
});
