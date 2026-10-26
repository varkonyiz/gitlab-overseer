import {
  AnalyticsSettings,
  DEFAULT_ANALYTICS_SETTINGS,
  SettingsError,
  parseAnalyticsSettings,
} from '../analytics/analytics-settings';

/**
 * Deployment configuration, read at startup from `config/app-config.json` next to `index.html`.
 * GitLab Pages has no backend, so this file is the only server-side setting; the Pages pipeline can
 * generate it from CI/CD variables (see `.gitlab-ci.yml`).
 */
export interface AppConfig {
  /** Base URL of the GitLab instance, e.g. `https://gitlab.com` or `https://example.com/gitlab`. */
  readonly gitlabUrl: string;
  readonly oauth: OAuthConfig;
  /** Offer sign-in with a personal access token next to OAuth (useful before an OAuth app exists). */
  readonly allowPersonalAccessToken: boolean;
  readonly defaultLanguage: AppLanguage;
  /** Projects and groups a new user starts with (full paths), e.g. `{ "kind": "group", "path": "my-org" }`. */
  readonly defaultSources: readonly DefaultSource[];
  /** Defaults of the sprint/team mapping and review weighting (users can override them). */
  readonly analytics: AnalyticsSettings;
  readonly features: FeatureFlags;
}

export interface FeatureFlags {
  /**
   * Reviewer auto-assignment writes to GitLab (`PUT …/merge_requests/:iid`), which needs the `api`
   * scope. Off by default; only when it is on may `oauth.scopes` contain `api`.
   */
  readonly reviewerAssignment: boolean;
}

export interface OAuthConfig {
  /** Application ID of a non-confidential GitLab OAuth application. Empty = OAuth sign-in disabled. */
  readonly clientId: string;
  readonly scopes: readonly string[];
  /** Must match the application's callback URL exactly. Null = the app's own address (base href). */
  readonly redirectUri: string | null;
}

export interface DefaultSource {
  readonly kind: SourceKind;
  readonly path: string;
}

export type SourceKind = 'project' | 'group';
export type AppLanguage = 'en' | 'hu';
export const SUPPORTED_LANGUAGES: readonly AppLanguage[] = ['en', 'hu'];

/** Scopes GitLab knows that are read-only; without reviewer assignment the app never writes. */
export const READ_ONLY_SCOPES: readonly string[] = [
  'read_api',
  'read_user',
  'read_repository',
  'openid',
  'profile',
  'email',
];

export const DEFAULT_SCOPES: readonly string[] = ['read_api'];
/** The only write scope, allowed together with `features.reviewerAssignment`. */
export const WRITE_SCOPE = 'api';

export class ConfigError extends Error {}

/** Validates the parsed JSON file and fills defaults. Throws {@link ConfigError} with the first problem. */
export function parseAppConfig(raw: unknown): AppConfig {
  if (!isRecord(raw)) {
    throw new ConfigError('The configuration must be a JSON object.');
  }
  const gitlabUrl = normalizeGitLabUrl(requireString(raw, 'gitlabUrl'));

  const oauthRaw = raw['oauth'] ?? {};
  if (!isRecord(oauthRaw)) {
    throw new ConfigError('"oauth" must be an object.');
  }
  const clientId = optionalString(oauthRaw, 'clientId') ?? '';
  if (clientId && !/^[A-Za-z0-9_-]{1,128}$/.test(clientId)) {
    throw new ConfigError('"oauth.clientId" is not a valid application ID.');
  }
  const features = parseFeatures(raw['features']);
  const scopes = optionalStringArray(oauthRaw, 'scopes') ?? DEFAULT_SCOPES;
  const writeScope = scopes.find(
    (s) => !READ_ONLY_SCOPES.includes(s) && !(s === WRITE_SCOPE && features.reviewerAssignment),
  );
  if (writeScope !== undefined) {
    throw new ConfigError(
      `"oauth.scopes" may only contain read scopes (and "api" with features.reviewerAssignment); "${writeScope}" is not allowed.`,
    );
  }
  if (scopes.length === 0) {
    throw new ConfigError('"oauth.scopes" must not be empty.');
  }
  const redirectUri = optionalString(oauthRaw, 'redirectUri') || null;
  if (redirectUri !== null) {
    checkRedirectUri(redirectUri);
  }

  const allowPat = raw['allowPersonalAccessToken'] ?? true;
  if (typeof allowPat !== 'boolean') {
    throw new ConfigError('"allowPersonalAccessToken" must be true or false.');
  }

  const language = optionalString(raw, 'defaultLanguage') ?? 'en';
  const defaultLanguage = SUPPORTED_LANGUAGES.find((l) => l === language);
  if (!defaultLanguage) {
    throw new ConfigError(`"defaultLanguage" must be one of ${SUPPORTED_LANGUAGES.join(', ')}.`);
  }

  return {
    gitlabUrl,
    oauth: { clientId, scopes: [...new Set(scopes)], redirectUri },
    allowPersonalAccessToken: allowPat,
    defaultLanguage,
    defaultSources: parseDefaultSources(raw['defaultSources']),
    analytics: parseAnalyticsConfig(raw['analytics']),
    features,
  };
}

function parseFeatures(value: unknown): FeatureFlags {
  if (value === undefined || value === null) {
    return { reviewerAssignment: false };
  }
  if (!isRecord(value)) {
    throw new ConfigError('"features" must be an object.');
  }
  const reviewerAssignment = value['reviewerAssignment'] ?? false;
  if (typeof reviewerAssignment !== 'boolean') {
    throw new ConfigError('"features.reviewerAssignment" must be true or false.');
  }
  return { reviewerAssignment };
}

function parseAnalyticsConfig(value: unknown): AnalyticsSettings {
  try {
    return parseAnalyticsSettings(value, DEFAULT_ANALYTICS_SETTINGS);
  } catch (error) {
    const detail =
      error instanceof SettingsError
        ? `${error.key}${Object.keys(error.params).length ? ` ${JSON.stringify(error.params)}` : ''}`
        : 'invalid';
    throw new ConfigError(`"analytics" is invalid (${detail}); see README, "Configuration".`);
  }
}

/**
 * Accepts `https://host[:port][/path]` (plain http only for localhost) and returns it without a
 * trailing slash. Credentials, query strings and fragments are refused.
 */
export function normalizeGitLabUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new ConfigError('"gitlabUrl" is not a valid URL.');
  }
  if (!isAllowedScheme(url)) {
    throw new ConfigError('"gitlabUrl" must use https (http is allowed for localhost only).');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ConfigError('"gitlabUrl" must not contain credentials, a query or a fragment.');
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

function checkRedirectUri(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError('"oauth.redirectUri" is not a valid URL.');
  }
  if (!isAllowedScheme(url) || url.hash || url.username || url.password) {
    throw new ConfigError(
      '"oauth.redirectUri" must be an https URL (http for localhost) without a fragment.',
    );
  }
}

function isAllowedScheme(url: URL): boolean {
  if (url.protocol === 'https:') {
    return true;
  }
  return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

const MAX_DEFAULT_SOURCES = 100;
/** A GitLab full path (`group/sub/project`); segments made only of dots are refused. */
export const FULL_PATH_PATTERN = /^(?!(?:.*\/)?\.+(?:\/|$))[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/;

function parseDefaultSources(value: unknown): DefaultSource[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value) || value.length > MAX_DEFAULT_SOURCES) {
    throw new ConfigError(
      `"defaultSources" must be an array of at most ${MAX_DEFAULT_SOURCES} entries.`,
    );
  }
  return value.map((entry, index) => {
    if (
      !isRecord(entry) ||
      (entry['kind'] !== 'project' && entry['kind'] !== 'group') ||
      typeof entry['path'] !== 'string' ||
      entry['path'].length > 255 ||
      !FULL_PATH_PATTERN.test(entry['path'])
    ) {
      throw new ConfigError(
        `"defaultSources[${index}]" must be { "kind": "project" | "group", "path": "full/path" }.`,
      );
    }
    return { kind: entry['kind'], path: entry['path'] };
  });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(obj: Record<string, unknown>, key: string): string {
  const value = obj[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ConfigError(`"${key}" is required.`);
  }
  return value;
}

function optionalString(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new ConfigError(`"${key}" must be a string.`);
  }
  return value.trim();
}

function optionalStringArray(obj: Record<string, unknown>, key: string): string[] | undefined {
  const value = obj[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
    throw new ConfigError(`"${key}" must be an array of strings.`);
  }
  return value.map((v: string) => v.trim()).filter((v) => v !== '');
}
