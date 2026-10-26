import { isRecord } from '../config/app-config';
import { GitLabMergeRequest } from '../gitlab/gitlab.models';
import {
  MergeRequestRecord,
  MergeRequestState,
  MrEvent,
  MrEventKind,
  UserRef,
  parseChangesCount,
} from './merge-request';

/** Collected merge requests as a file: work offline, share a snapshot, or feed other tools. */
export interface Dataset {
  readonly gitlabUrl: string;
  readonly collectedAt: string;
  /** Creation-date window of the collection (`to` null = until the collection time). */
  readonly range: { readonly from: string; readonly to: string | null };
  /** Full paths of the sources it was collected from. */
  readonly sources: readonly string[];
  readonly mergeRequests: readonly MergeRequestRecord[];
}

export const DATASET_FILE_FORMAT = 'gitlab-overseer/merge-requests';
export const MAX_DATASET_MERGE_REQUESTS = 20_000;
const MAX_EVENTS = 2_000;
const MAX_TEXT = 1_000;

export class DatasetError extends Error {}

export function toDatasetFile(dataset: Dataset): string {
  return JSON.stringify({ format: DATASET_FILE_FORMAT, version: 1, ...dataset });
}

/** Validates a dataset file; every record is checked, links must point into `gitlabUrl`. */
export function parseDatasetFile(text: string, gitlabUrl: string): Dataset {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new DatasetError('notJson');
  }
  if (!isRecord(raw) || raw['format'] !== DATASET_FILE_FORMAT || raw['version'] !== 1) {
    throw new DatasetError('wrongFormat');
  }
  return parseDataset(raw, gitlabUrl);
}

export function parseDataset(raw: Record<string, unknown>, gitlabUrl: string): Dataset {
  if (raw['gitlabUrl'] !== gitlabUrl) {
    throw new DatasetError('otherInstance');
  }
  const range = raw['range'];
  const list = raw['mergeRequests'];
  const sources = raw['sources'];
  if (
    !isTimestamp(raw['collectedAt']) ||
    !isRecord(range) ||
    !isTimestamp(range['from']) ||
    !(range['to'] === null || isTimestamp(range['to'])) ||
    !Array.isArray(sources) ||
    !sources.every(isText) ||
    !Array.isArray(list) ||
    list.length > MAX_DATASET_MERGE_REQUESTS
  ) {
    throw new DatasetError('wrongFormat');
  }
  const mergeRequests = list.map((entry) => {
    const record = parseRecord(entry, gitlabUrl);
    if (!record) {
      throw new DatasetError('invalidEntry');
    }
    return record;
  });
  return {
    gitlabUrl,
    collectedAt: raw['collectedAt'] as string,
    range: { from: range['from'] as string, to: (range['to'] as string | null) ?? null },
    sources: sources as string[],
    mergeRequests,
  };
}

const STATES: readonly MergeRequestState[] = ['opened', 'merged', 'closed', 'locked'];
const EVENT_KINDS: readonly MrEventKind[] = [
  'draft',
  'ready',
  'reviewRequested',
  'reviewRequestRemoved',
  'approved',
  'unapproved',
  'changesRequested',
];

function parseRecord(value: unknown, gitlabUrl: string): MergeRequestRecord | null {
  if (!isRecord(value)) {
    return null;
  }
  const v = value;
  const author = parseUser(v['author']);
  const reviewers = Array.isArray(v['reviewers']) ? v['reviewers'].map(parseUser) : null;
  const events =
    Array.isArray(v['events']) && v['events'].length <= MAX_EVENTS
      ? v['events'].map(parseEvent)
      : null;
  const labels = v['labels'];
  const ok =
    isId(v['projectId']) &&
    isText(v['projectPath']) &&
    isId(v['iid']) &&
    isText(v['title']) &&
    typeof v['webUrl'] === 'string' &&
    v['webUrl'].startsWith(`${gitlabUrl}/`) &&
    STATES.includes(v['state'] as MergeRequestState) &&
    typeof v['draft'] === 'boolean' &&
    author !== null &&
    reviewers !== null &&
    reviewers.every((r) => r !== null) &&
    isText(v['sourceBranch']) &&
    isText(v['targetBranch']) &&
    Array.isArray(labels) &&
    labels.every(isText) &&
    isTimestamp(v['createdAt']) &&
    isTimestamp(v['updatedAt']) &&
    (v['mergedAt'] === null || isTimestamp(v['mergedAt'])) &&
    (v['closedAt'] === null || isTimestamp(v['closedAt'])) &&
    (v['changesCount'] === null ||
      (Number.isInteger(v['changesCount']) && (v['changesCount'] as number) >= 0)) &&
    events !== null &&
    events.every((e) => e !== null);
  if (!ok) {
    return null;
  }
  return {
    projectId: v['projectId'] as number,
    projectPath: v['projectPath'] as string,
    iid: v['iid'] as number,
    title: v['title'] as string,
    webUrl: v['webUrl'] as string,
    state: v['state'] as MergeRequestState,
    draft: v['draft'] as boolean,
    author,
    reviewers: reviewers as UserRef[],
    sourceBranch: v['sourceBranch'] as string,
    targetBranch: v['targetBranch'] as string,
    labels: labels as string[],
    createdAt: v['createdAt'] as string,
    updatedAt: v['updatedAt'] as string,
    mergedAt: (v['mergedAt'] as string | null) ?? null,
    closedAt: (v['closedAt'] as string | null) ?? null,
    changesCount: (v['changesCount'] as number | null) ?? null,
    events: events as MrEvent[],
  };
}

function parseUser(value: unknown): UserRef | null {
  if (
    !isRecord(value) ||
    !isId(value['id']) ||
    !isText(value['username']) ||
    !isText(value['name'])
  ) {
    return null;
  }
  return {
    id: value['id'] as number,
    username: value['username'] as string,
    name: value['name'] as string,
  };
}

function parseEvent(value: unknown): MrEvent | null {
  if (
    !isRecord(value) ||
    !EVENT_KINDS.includes(value['kind'] as MrEventKind) ||
    !isTimestamp(value['at'])
  ) {
    return null;
  }
  const actor = parseUser(value['actor']);
  const targets = value['targets'];
  if (!actor || (targets !== undefined && (!Array.isArray(targets) || !targets.every(isText)))) {
    return null;
  }
  return {
    kind: value['kind'] as MrEventKind,
    at: value['at'] as string,
    actor,
    ...(targets ? { targets: targets as string[] } : {}),
  };
}

/** Maps a GitLab list item plus its timeline to a record. */
export function toRecord(
  mr: GitLabMergeRequest,
  events: readonly MrEvent[],
  changesCount: number | null,
): MergeRequestRecord {
  const user = (u: { id: number; username: string; name: string }): UserRef => ({
    id: u.id,
    username: u.username,
    name: u.name,
  });
  const full = mr.references?.full ?? '';
  return {
    projectId: mr.project_id,
    projectPath: full.includes('!')
      ? full.slice(0, full.lastIndexOf('!'))
      : projectPathFromUrl(mr.web_url),
    iid: mr.iid,
    title: mr.title,
    webUrl: mr.web_url,
    state: mr.state,
    draft: mr.draft ?? mr.work_in_progress ?? false,
    author: user(mr.author),
    reviewers: (mr.reviewers ?? []).map(user),
    sourceBranch: mr.source_branch,
    targetBranch: mr.target_branch,
    labels: [...(mr.labels ?? [])],
    createdAt: mr.created_at,
    updatedAt: mr.updated_at,
    mergedAt: mr.merged_at ?? null,
    closedAt: mr.closed_at ?? null,
    changesCount: changesCount ?? parseChangesCount(mr.changes_count),
    events: [...events],
  };
}

/** `https://gitlab/group/project/-/merge_requests/1` → `group/project`. */
function projectPathFromUrl(webUrl: string): string {
  try {
    const path = new URL(webUrl).pathname;
    const cut = path.indexOf('/-/');
    return (cut >= 0 ? path.slice(0, cut) : path).replace(/^\/+/, '');
  } catch {
    return '';
  }
}

function isId(value: unknown): boolean {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_TEXT;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value));
}
