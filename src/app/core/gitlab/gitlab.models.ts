/** Subsets of GitLab REST API v4 responses that the app reads (snake_case as returned by GitLab). */

export interface GitLabUser {
  readonly id: number;
  readonly username: string;
  readonly name: string;
  readonly avatar_url: string | null;
  readonly web_url: string;
  readonly state?: string;
  readonly bot?: boolean;
}

export interface GitLabVersion {
  readonly version: string;
  readonly revision: string;
}

export interface GitLabNamespace {
  readonly id: number;
  readonly name: string;
  readonly path: string;
  readonly kind: 'user' | 'group';
  readonly full_path: string;
}

export interface GitLabProject {
  readonly id: number;
  readonly name: string;
  readonly name_with_namespace: string;
  readonly path_with_namespace: string;
  readonly web_url: string;
  readonly avatar_url?: string | null;
  readonly last_activity_at?: string;
  readonly archived?: boolean;
  readonly namespace?: GitLabNamespace;
}

export interface GitLabGroup {
  readonly id: number;
  readonly name: string;
  readonly full_name: string;
  readonly full_path: string;
  readonly web_url: string;
  readonly avatar_url?: string | null;
  readonly parent_id?: number | null;
}

/** OAuth token endpoint response (`POST /oauth/token`). */
export interface GitLabTokenResponse {
  readonly access_token: string;
  readonly token_type: string;
  readonly expires_in?: number | null;
  readonly refresh_token?: string | null;
  readonly scope?: string;
  readonly created_at?: number;
}

export interface GitLabUserBasic {
  readonly id: number;
  readonly username: string;
  readonly name: string;
  readonly state?: string;
}

/** Item of `GET /projects/:id/merge_requests` and `GET /groups/:id/merge_requests`. */
export interface GitLabMergeRequest {
  readonly id: number;
  readonly iid: number;
  readonly project_id: number;
  readonly title: string;
  readonly state: 'opened' | 'merged' | 'closed' | 'locked';
  readonly draft?: boolean;
  readonly work_in_progress?: boolean;
  readonly created_at: string;
  readonly updated_at: string;
  readonly merged_at: string | null;
  readonly closed_at: string | null;
  readonly source_branch: string;
  readonly target_branch: string;
  readonly author: GitLabUserBasic;
  readonly reviewers?: readonly GitLabUserBasic[];
  readonly labels?: readonly string[];
  readonly web_url: string;
  readonly references?: { readonly full?: string };
  /** Only in the single merge request response; a string such as "12" or "1000+". */
  readonly changes_count?: string | null;
}

/** Item of `GET /projects/:id/members/all` and `GET /groups/:id/members/all`. */
export interface GitLabMember extends GitLabUserBasic {
  readonly access_level: number;
}

/** The fields of `GET /projects/:id/merge_requests/:iid/notes` items the parser reads. */
export interface GitLabNote {
  readonly id: number;
  readonly body: string;
  readonly system: boolean;
  readonly created_at: string;
  readonly author: { readonly id: number; readonly username: string; readonly name: string };
}
