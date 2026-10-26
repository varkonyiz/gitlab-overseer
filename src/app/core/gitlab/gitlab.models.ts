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
