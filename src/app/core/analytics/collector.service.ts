import { Injectable, inject } from '@angular/core';

import { GitLabMergeRequest } from '../gitlab/gitlab.models';
import { GitLabApiService } from '../gitlab/gitlab-api.service';
import { DataSource } from '../sources/data-sources';
import { toRecord } from './dataset';
import { MergeRequestRecord, mergeRequestKey, parseChangesCount, MrEvent } from './merge-request';
import { eventsFromNotes } from './system-notes';

export interface CollectRequest {
  readonly sources: readonly DataSource[];
  readonly from: Date;
  readonly to: Date | null;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: CollectProgress) => void;
}

export interface CollectProgress {
  readonly phase: 'list' | 'details';
  readonly done: number;
  readonly total: number;
}

export interface CollectResult {
  readonly mergeRequests: MergeRequestRecord[];
  /** Merge requests whose notes or size could not be read (kept without a timeline). */
  readonly failed: number;
  /** True when a source hit {@link MAX_PER_SOURCE} and older merge requests were left out. */
  readonly truncated: boolean;
}

export const MAX_PER_SOURCE = 5_000;
/** Parallel detail requests; GitLab.com allows 2 000 authenticated API calls per minute. */
export const DETAIL_CONCURRENCY = 6;
const MAX_NOTES = 2_000;

interface CachedDetail {
  readonly updatedAt: string;
  readonly events: readonly MrEvent[];
  readonly changesCount: number | null;
}

/**
 * Reads merge requests with their review timeline: one list call per source, then per merge
 * request its notes (system notes → events) and its size (`changes_count`). Details are cached by
 * `updated_at`, so collecting again only fetches what changed.
 */
@Injectable({ providedIn: 'root' })
export class MergeRequestCollector {
  private readonly api = inject(GitLabApiService);
  private readonly cache = new Map<string, CachedDetail>();

  /** Seeds the cache, e.g. from an opened dataset file. */
  remember(records: readonly MergeRequestRecord[]): void {
    for (const r of records) {
      this.cache.set(mergeRequestKey(r), {
        updatedAt: r.updatedAt,
        events: r.events,
        changesCount: r.changesCount,
      });
    }
  }

  async collect(request: CollectRequest): Promise<CollectResult> {
    const { signal, onProgress } = request;
    const listed = new Map<string, GitLabMergeRequest>();
    let truncated = false;

    for (let i = 0; i < request.sources.length; i++) {
      signal?.throwIfAborted();
      onProgress?.({ phase: 'list', done: i, total: request.sources.length });
      const source = request.sources[i];
      const items = await this.api.listMergeRequests(
        source.kind,
        source.id,
        request.from,
        request.to,
        {
          maxItems: MAX_PER_SOURCE,
          signal,
        },
      );
      truncated ||= items.length >= MAX_PER_SOURCE;
      for (const item of items) {
        listed.set(mergeRequestKey({ projectId: item.project_id, iid: item.iid }), item);
      }
    }

    const items = [...listed.values()];
    const records: MergeRequestRecord[] = new Array(items.length);
    let done = 0;
    let failed = 0;
    onProgress?.({ phase: 'details', done, total: items.length });

    let next = 0;
    const worker = async () => {
      while (next < items.length) {
        const index = next++;
        signal?.throwIfAborted();
        const item = items[index];
        try {
          const detail = await this.detail(item, signal);
          records[index] = toRecord(item, detail.events, detail.changesCount);
        } catch (error) {
          if (signal?.aborted) {
            throw error;
          }
          failed++;
          records[index] = toRecord(item, [], null);
        }
        onProgress?.({ phase: 'details', done: ++done, total: items.length });
      }
    };
    await Promise.all(Array.from({ length: Math.min(DETAIL_CONCURRENCY, items.length) }, worker));

    records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { mergeRequests: records, failed, truncated };
  }

  private async detail(item: GitLabMergeRequest, signal?: AbortSignal): Promise<CachedDetail> {
    const key = mergeRequestKey({ projectId: item.project_id, iid: item.iid });
    const cached = this.cache.get(key);
    if (cached && cached.updatedAt === item.updated_at) {
      return cached;
    }
    const [notes, single] = await Promise.all([
      this.api.mergeRequestNotes(item.project_id, item.iid, { maxItems: MAX_NOTES, signal }),
      this.api.mergeRequest(item.project_id, item.iid),
    ]);
    const detail: CachedDetail = {
      updatedAt: item.updated_at,
      events: eventsFromNotes(notes),
      changesCount: parseChangesCount(single.changes_count),
    };
    this.cache.set(key, detail);
    return detail;
  }
}
