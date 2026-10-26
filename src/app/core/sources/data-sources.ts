import { SourceKind, isRecord } from '../config/app-config';
import { GitLabGroup, GitLabProject } from '../gitlab/gitlab.models';

/** A project or group whose GitLab data the metrics are computed from. */
export interface DataSource {
  readonly kind: SourceKind;
  readonly id: number;
  readonly fullPath: string;
  readonly name: string;
  readonly webUrl: string;
}

/** The data sources file (`*.sources.json`) a user downloads, shares and opens again. */
export interface DataSourcesFile {
  readonly format: typeof SOURCES_FILE_FORMAT;
  readonly version: 1;
  readonly gitlabUrl: string;
  readonly exportedAt: string;
  readonly sources: readonly DataSource[];
}

export const SOURCES_FILE_FORMAT = 'gitlab-overseer/data-sources';
export const MAX_SOURCES = 200;

export class SourcesFileError extends Error {}

export function fromProject(project: GitLabProject): DataSource {
  return {
    kind: 'project',
    id: project.id,
    fullPath: project.path_with_namespace,
    name: project.name_with_namespace,
    webUrl: project.web_url,
  };
}

export function fromGroup(group: GitLabGroup): DataSource {
  return {
    kind: 'group',
    id: group.id,
    fullPath: group.full_path,
    name: group.full_name,
    webUrl: group.web_url,
  };
}

export function sourceKey(source: Pick<DataSource, 'kind' | 'id'>): string {
  return `${source.kind}:${source.id}`;
}

export function toSourcesFile(
  gitlabUrl: string,
  sources: readonly DataSource[],
  now = new Date(),
): DataSourcesFile {
  return {
    format: SOURCES_FILE_FORMAT,
    version: 1,
    gitlabUrl,
    exportedAt: now.toISOString(),
    sources,
  };
}

/**
 * Validates an opened data sources file. The file may come from anyone, so every field is checked
 * and links must point into the configured GitLab instance.
 */
export function parseSourcesFile(text: string, gitlabUrl: string): DataSource[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SourcesFileError('notJson');
  }
  if (!isRecord(raw) || raw['format'] !== SOURCES_FILE_FORMAT || raw['version'] !== 1) {
    throw new SourcesFileError('wrongFormat');
  }
  if (raw['gitlabUrl'] !== gitlabUrl) {
    throw new SourcesFileError('otherInstance');
  }
  const list = raw['sources'];
  if (!Array.isArray(list) || list.length > MAX_SOURCES) {
    throw new SourcesFileError('wrongFormat');
  }
  const result = new Map<string, DataSource>();
  for (const entry of list) {
    const source = parseSource(entry, gitlabUrl);
    if (!source) {
      throw new SourcesFileError('invalidEntry');
    }
    result.set(sourceKey(source), source);
  }
  return [...result.values()];
}

function parseSource(value: unknown, gitlabUrl: string): DataSource | null {
  if (!isRecord(value)) {
    return null;
  }
  const { kind, id, fullPath, name, webUrl } = value;
  const valid =
    (kind === 'project' || kind === 'group') &&
    typeof id === 'number' &&
    Number.isSafeInteger(id) &&
    id > 0 &&
    isShortString(fullPath) &&
    isShortString(name) &&
    typeof webUrl === 'string' &&
    webUrl.startsWith(`${gitlabUrl}/`);
  return valid ? { kind, id, fullPath, name, webUrl } : null;
}

function isShortString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 512;
}
