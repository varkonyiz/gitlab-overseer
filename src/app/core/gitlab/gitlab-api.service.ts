import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ConfigService } from '../config/config.service';
import { SourceKind } from '../config/app-config';
import {
  GitLabGroup,
  GitLabMember,
  GitLabMergeRequest,
  GitLabNote,
  GitLabProject,
  GitLabUser,
  GitLabVersion,
} from './gitlab.models';
import { Page, nextPageUrl, parseTotal } from './pagination';

export type QueryParams = Record<string, string | number | boolean | undefined | null>;

export interface ListOptions {
  readonly perPage?: number;
  /** Stops after this many items (default 10 000) so a mistyped scope cannot run away. */
  readonly maxItems?: number;
  readonly signal?: AbortSignal;
  readonly onPage?: (loaded: number, total: number | null) => void;
}

export const MAX_PER_PAGE = 100;
const DEFAULT_MAX_ITEMS = 10_000;
const SEARCH_PAGE_SIZE = 20;

/**
 * Typed access to the GitLab REST API v4 of the configured instance. Authentication is added by
 * `authInterceptor` (only for requests under {@link apiBase}). New data needs for metrics should
 * be added here as small typed methods built on {@link getPage} / {@link getAll}.
 */
@Injectable({ providedIn: 'root' })
export class GitLabApiService {
  private readonly http = inject(HttpClient);
  private readonly configService = inject(ConfigService);

  get apiBase(): string {
    return `${this.configService.config.gitlabUrl}/api/v4`;
  }

  url(path: string): string {
    return `${this.apiBase}${path.startsWith('/') ? path : `/${path}`}`;
  }

  get<T>(path: string, params: QueryParams = {}): Promise<T> {
    return firstValueFrom(this.http.get<T>(this.url(path), { params: toParams(params) }));
  }

  /** Fetches one page; `pageUrl` (from a previous `next`) takes precedence over `path`/`params`. */
  async getPage<T>(
    path: string,
    params: QueryParams = {},
    perPage: number = MAX_PER_PAGE,
    pageUrl?: string,
  ): Promise<Page<T>> {
    const requestUrl = pageUrl ?? withQuery(this.url(path), { ...params, per_page: perPage });
    const response = await firstValueFrom(this.http.get<T[]>(requestUrl, { observe: 'response' }));
    const items = response.body ?? [];
    return {
      items,
      next: nextPageUrl(requestUrl, response.headers, items.length, perPage, this.apiBase),
      total: parseTotal(response.headers),
    };
  }

  /** Follows pagination until the last page, `maxItems` or an abort. */
  async getAll<T>(path: string, params: QueryParams = {}, options: ListOptions = {}): Promise<T[]> {
    const perPage = Math.min(options.perPage ?? MAX_PER_PAGE, MAX_PER_PAGE);
    const maxItems = options.maxItems ?? DEFAULT_MAX_ITEMS;
    const all: T[] = [];
    let next: string | undefined;
    do {
      options.signal?.throwIfAborted();
      const page: Page<T> = await this.getPage<T>(path, params, perPage, next);
      all.push(...page.items);
      options.onPage?.(all.length, page.total);
      next = page.next ?? undefined;
    } while (next !== undefined && all.length < maxItems);
    return all.slice(0, maxItems);
  }

  currentUser(): Promise<GitLabUser> {
    return this.get<GitLabUser>('/user');
  }

  version(): Promise<GitLabVersion> {
    return this.get<GitLabVersion>('/version');
  }

  async searchProjects(term: string, membershipOnly: boolean): Promise<readonly GitLabProject[]> {
    const page = await this.getPage<GitLabProject>(
      '/projects',
      {
        search: term.trim() || undefined,
        search_namespaces: true,
        membership: membershipOnly || undefined,
        archived: false,
        simple: true,
        order_by: 'last_activity_at',
        sort: 'desc',
      },
      SEARCH_PAGE_SIZE,
    );
    return page.items;
  }

  async searchGroups(term: string, membershipOnly: boolean): Promise<readonly GitLabGroup[]> {
    const page = await this.getPage<GitLabGroup>(
      '/groups',
      {
        search: term.trim() || undefined,
        min_access_level: membershipOnly ? 10 : undefined,
        order_by: 'name',
        sort: 'asc',
      },
      SEARCH_PAGE_SIZE,
    );
    return page.items;
  }

  project(idOrPath: number | string): Promise<GitLabProject> {
    return this.get<GitLabProject>(`/projects/${encodeId(idOrPath)}`);
  }

  group(idOrPath: number | string): Promise<GitLabGroup> {
    return this.get<GitLabGroup>(`/groups/${encodeId(idOrPath)}`, { with_projects: false });
  }

  /** Merge requests of a project or group (incl. subgroups) created in `[createdAfter, createdBefore)`. */
  listMergeRequests(
    kind: SourceKind,
    id: number,
    createdAfter: Date,
    createdBefore: Date | null,
    options: ListOptions = {},
  ): Promise<GitLabMergeRequest[]> {
    return this.getAll<GitLabMergeRequest>(
      `/${kind === 'project' ? 'projects' : 'groups'}/${id}/merge_requests`,
      {
        state: 'all',
        scope: 'all',
        created_after: createdAfter.toISOString(),
        created_before: createdBefore?.toISOString(),
        order_by: 'created_at',
        sort: 'desc',
      },
      options,
    );
  }

  mergeRequest(projectId: number, iid: number): Promise<GitLabMergeRequest> {
    return this.get<GitLabMergeRequest>(`/projects/${projectId}/merge_requests/${iid}`);
  }

  mergeRequestNotes(
    projectId: number,
    iid: number,
    options: ListOptions = {},
  ): Promise<GitLabNote[]> {
    return this.getAll<GitLabNote>(
      `/projects/${projectId}/merge_requests/${iid}/notes`,
      { sort: 'asc', order_by: 'created_at' },
      options,
    );
  }

  /** Direct and inherited members of a project or group. */
  members(kind: SourceKind, id: number, options: ListOptions = {}): Promise<GitLabMember[]> {
    return this.getAll<GitLabMember>(
      `/${kind === 'project' ? 'projects' : 'groups'}/${id}/members/all`,
      {},
      options,
    );
  }

  /** Replaces the reviewers of a merge request (needs the `api` scope). */
  setReviewers(
    projectId: number,
    iid: number,
    reviewerIds: readonly number[],
  ): Promise<GitLabMergeRequest> {
    return firstValueFrom(
      this.http.put<GitLabMergeRequest>(this.url(`/projects/${projectId}/merge_requests/${iid}`), {
        reviewer_ids: reviewerIds,
      }),
    );
  }

  /**
   * Number of merge requests created since `createdAfter` in a project or group (incl. subgroups),
   * from `X-Total` of a one-item page. Null when GitLab does not report a total (over 10 000).
   */
  async countMergeRequests(
    kind: SourceKind,
    id: number,
    createdAfter: Date,
  ): Promise<number | null> {
    const page = await this.getPage<unknown>(
      `/${kind === 'project' ? 'projects' : 'groups'}/${id}/merge_requests`,
      { state: 'all', scope: 'all', created_after: createdAfter.toISOString() },
      1,
    );
    return page.total ?? (page.next === null ? page.items.length : null);
  }
}

/** GitLab's Developer role; reviewers are picked from members with at least this level. */
export const DEVELOPER_ACCESS = 30;

/** Numeric IDs as is, full paths URL-encoded (`group/sub/project` → `group%2Fsub%2Fproject`). */
export function encodeId(idOrPath: number | string): string {
  return typeof idOrPath === 'number' ? String(idOrPath) : encodeURIComponent(idOrPath);
}

function toParams(params: QueryParams): HttpParams {
  let result = new HttpParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      result = result.set(key, String(value));
    }
  }
  return result;
}

function withQuery(url: string, params: QueryParams): string {
  const query = toParams(params).toString();
  return query ? `${url}?${query}` : url;
}

/** HTTP status of a failed API call (0 = network/CORS error), or null for other errors. */
export function httpStatus(error: unknown): number | null {
  return error instanceof HttpErrorResponse ? error.status : null;
}
