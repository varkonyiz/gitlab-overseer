/** Merge requests as the analytics use them: list data plus the review timeline from system notes. */

export interface UserRef {
  readonly id: number;
  readonly username: string;
  readonly name: string;
}

export type MergeRequestState = 'opened' | 'merged' | 'closed' | 'locked';

export type MrEventKind =
  | 'draft'
  | 'ready'
  | 'reviewRequested'
  | 'reviewRequestRemoved'
  | 'approved'
  | 'unapproved'
  | 'changesRequested';

/** One state change on the merge request, read from a GitLab system note. */
export interface MrEvent {
  readonly kind: MrEventKind;
  /** ISO timestamp. */
  readonly at: string;
  /** Who made the change (the approver, the one who requested a review, …). */
  readonly actor: UserRef;
  /** Usernames the change is about (the requested reviewers). */
  readonly targets?: readonly string[];
}

export interface MergeRequestRecord {
  readonly projectId: number;
  readonly projectPath: string;
  readonly iid: number;
  readonly title: string;
  readonly webUrl: string;
  readonly state: MergeRequestState;
  /** Draft right now. */
  readonly draft: boolean;
  readonly author: UserRef;
  /** Reviewers right now. */
  readonly reviewers: readonly UserRef[];
  readonly sourceBranch: string;
  readonly targetBranch: string;
  readonly labels: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly mergedAt: string | null;
  readonly closedAt: string | null;
  /** Number of changed files; GitLab caps it (e.g. "1000+" → 1000). Null = unknown. */
  readonly changesCount: number | null;
  /** Oldest first. */
  readonly events: readonly MrEvent[];
}

/** `"12"` → 12, `"1000+"` → 1000, anything else → null. */
export function parseChangesCount(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const match = /^(\d+)\+?$/.exec(value.trim());
  return match ? Number(match[1]) : null;
}

export function mergeRequestKey(mr: Pick<MergeRequestRecord, 'projectId' | 'iid'>): string {
  return `${mr.projectId}!${mr.iid}`;
}
