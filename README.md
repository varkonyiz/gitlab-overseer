# GitLab Overseer

Angular application built with the [Siemens iX](https://ix.siemens.io) design system. It signs in to a
GitLab instance with OAuth and shows customisable SDLC metrics computed from GitLab API data: merge
request phase times, merge requests per sprint and team, and a reviewer ranking board that can also
assign reviewers. It runs on **GitLab Pages**: no backend and no database. Settings are files
(deployment configuration, downloadable data source, settings and dataset files) plus the browser's
own storage. Everything can be exported to CSV.

| Area | What exists |
|---|---|
| Sign-in | OAuth 2.0 authorization code + PKCE (non-confidential app, no client secret), token refresh and revoke; optional personal access token |
| GitLab API | Typed REST v4 client with pagination (`Link` / `X-Next-Page`), item caps, abort support |
| Data sources | Search or add projects/groups by path, access check, saved per instance in the browser, download/open as a JSON file, CSV export |
| Data collection | Merge requests of the sources for a period, with their review timeline (system notes) and size (changed files); progress, cancel, cache; download/open as a dataset file |
| Dashboard | Merge request times (total, draft, review assignment, review, merge): median, average, 90th percentile, min, max; charts per sprint; filters by team, sprint, project, state |
| Merge requests | Every merge request with sprint, team, size and phase times; CSV with all fields |
| Sprints | Merge requests per sprint and team (sprint from the branch name, else the sprint calendar) |
| Reviewers | Ranking board: reviews done, weighted by size (50+ files = 2 small ones, configurable) |
| Reviewer assignment | Team + sprint → developer pool → open MRs without reviewer go to the lowest-ranked developer (optional, needs the `api` scope) |
| Settings | Branch name pattern (regular expression), sprint calendar with generator, big-MR threshold and weight; file download/open |
| UI | iX application shell, English/Hungarian (ngx-translate), light/dark theme |

## Commands

Requires Node.js ≥ 22.22.3 (Angular CLI 22); CI uses Node 24.

```bash
npm ci
npm start               # dev server on http://localhost:4200
npm test                # Vitest (Angular unit-test builder, jsdom), single run
npm run test:coverage   # + coverage (text summary, Cobertura, HTML in coverage/)
npm run lint            # angular-eslint + security grep (no [innerHTML]/[outerHTML])
npm run format:check    # prettier (npm run format to fix)
npm run build           # -> dist/gitlab-overseer
```

For local development, edit `public/config/app-config.json` to point at your GitLab instance. Use a
personal access token, or an OAuth application whose callback URL is `http://localhost:4200/`.

## Configuration

`config/app-config.json` (next to `index.html`) is read at startup. If it is invalid, the app shows the
first problem it finds instead of the pages.

```json
{
  "gitlabUrl": "https://gitlab.example.com",
  "oauth": { "clientId": "<application id>", "scopes": ["read_api"], "redirectUri": null },
  "allowPersonalAccessToken": true,
  "defaultLanguage": "en",
  "defaultSources": [{ "kind": "group", "path": "my-org/team" }],
  "analytics": {
    "branchPattern": "^(?<sprint>\\d{3})_(?<team>[A-Za-z]{2,3})_",
    "sprints": [{ "sprint": "400", "start": "2026-10-05", "end": "2026-10-18" }],
    "bigMergeRequestFiles": 50,
    "bigMergeRequestWeight": 2
  },
  "features": { "reviewerAssignment": false }
}
```

| Key | Meaning |
|---|---|
| `gitlabUrl` | GitLab base URL; https only (http only for `localhost`); a relative URL root such as `https://example.com/gitlab` works |
| `oauth.clientId` | Application ID of the OAuth application; empty turns OAuth sign-in off |
| `oauth.scopes` | Read scopes (`read_api`, `read_user`, `read_repository`, `openid`, `profile`, `email`); `api` only together with `features.reviewerAssignment` |
| `oauth.redirectUri` | `null` = the app's own address (base href). Must match the application's callback URL exactly |
| `allowPersonalAccessToken` | Offer sign-in with a personal access token (`read_api`) |
| `defaultLanguage` | `en` or `hu` (users can switch; their choice is remembered) |
| `defaultSources` | Projects/groups (full paths) added once for a new user |
| `analytics.branchPattern` | Regular expression on the source branch; named groups `sprint` and `team` (default: `400_mng_web_feature_name` → sprint 400, team mng) |
| `analytics.sprints` | Sprint calendar used when the branch name has no sprint: `{ sprint, start, end }` (local days, inclusive, no overlaps) |
| `analytics.bigMergeRequestFiles` / `bigMergeRequestWeight` | A merge request with at least this many changed files counts with this weight in the reviewer ranking |
| `features.reviewerAssignment` | Allow writing reviewers to GitLab (needs the `api` scope in `oauth.scopes`, or a token with `api`) |

The `analytics` values are defaults: each user can change them on the *Settings* page (kept in their
browser, downloadable as a `*.settings.json` file).

## Deploy to GitLab Pages

1. Push the repository to a GitLab project. `.gitlab-ci.yml` runs the checks on every pipeline and
   deploys the `pages` job from the default branch.
2. Create an OAuth application: *User settings → Applications* (or a group's / the instance's
   *Applications* page):
   - **Redirect URI**: the Pages URL with a trailing slash, e.g. `https://my-group.gitlab.io/gitlab-overseer/`
     (the *Connection* page shows the exact value);
   - **Confidential**: unchecked (the browser cannot keep a secret; PKCE protects the code);
   - **Scopes**: `read_api` (`api` instead when reviewer assignment is enabled).
3. Set CI/CD variables (*Settings → CI/CD → Variables*). None of them is secret:

   | Variable | Default |
   |---|---|
   | `OAUTH_CLIENT_ID` | from the bundled config (empty) |
   | `GITLAB_URL` | `$CI_SERVER_URL` (the instance running the pipeline) |
   | `OAUTH_SCOPES` | `read_api` |
   | `OAUTH_REDIRECT_URI` | the app's address |
   | `ALLOW_PERSONAL_ACCESS_TOKEN` | `true` |
   | `DEFAULT_LANGUAGE` | `en` |
   | `DEFAULT_SOURCES` | none; e.g. `group:my-org,project:my-org/app` |
   | `BRANCH_PATTERN` | `^(?<sprint>\d{3})_(?<team>[A-Za-z]{2,3})_` |
   | `SPRINTS` | none; JSON, e.g. `[{"sprint":"400","start":"2026-10-05","end":"2026-10-18"}]` |
   | `BIG_MR_FILES` / `BIG_MR_WEIGHT` | `50` / `2` |
   | `REVIEWER_ASSIGNMENT` | `false`; with `true` also set `OAUTH_SCOPES=api` and give the OAuth application the `api` scope |

4. Run the pipeline. `scripts/configure-deployment.mjs` writes `config/app-config.json`, narrows the CSP
   `connect-src` to the GitLab origin and copies `index.html` to `404.html`.

Consider *Pages access control* (*Settings → General → Visibility*) when only project members should
reach the app. The data is protected by GitLab either way: users only see what their own token can read.

## Metrics

Collecting reads, per data source, the merge requests created in the chosen period
(`GET /projects|groups/:id/merge_requests`), then for each one its notes (`…/notes`; the system notes
are the timeline) and its size (`changes_count` of `GET …/merge_requests/:iid`). Six requests run in
parallel; a second collection only refetches merge requests whose `updated_at` changed.

| Phase | From → to |
|---|---|
| Total time | created → merged |
| Draft time | created as draft → first "marked as ready" (only merge requests created as draft) |
| Review assignment time | ready → first "requested review from" someone other than the author (0 when the reviewer was set earlier; reviewers set at creation count from the creation) |
| Review time | first reviewer requested → first "approved" or "requested changes" by someone other than the author (the way to ready is the draft time, so it does not delay the start) |
| Merge time | last approval before the merge → merged |

Draft, assignment, review and merge do not add up to the total when there was rework between a change
request and the final approval. Statistics count only finished phases (a still-open review has no review
time yet), like GitLab's analytics.

**Sprints and teams.** The `sprint` and `team` groups of the branch pattern; the team moniker is lower-cased.
Without a sprint in the branch name, the sprint calendar decides by the creation day.

**Reviewer ranking.** A review is an approval or a change request; each merge request counts once per
reviewer, never for its author. Score = number of reviews, where a big merge request counts
`bigMergeRequestWeight` (default: 50+ changed files = 2).

**Reviewer assignment** (*Reviewer assignment* page):
1. choose the team and the sprint;
2. choose developers (members of the data sources with Developer role or higher, plus people seen in the data);
3. the plan gives every open merge request of that team and sprint without a reviewer to the developer
   lowest on the ranking board (over all loaded data; ties: fewer open reviews, then name), never to its
   author. Each pick adds that merge request's weight, so work spreads out; big merge requests are planned
   first. *Assign* re-reads every merge request and skips it if someone assigned a reviewer meanwhile.

## How it works

- **No backend.** GitLab's `/oauth/token`, `/oauth/revoke` and `/api/v4` allow cross-origin requests,
  so the browser talks to GitLab directly. Routes use the URL hash (`#/sources`), so GitLab Pages never has
  to rewrite deep links. The OAuth callback lands on the app root (`?code=…&state=…`) and is removed
  from the address bar right away.
- **Sessions** live in `sessionStorage` (they end with the tab). The OAuth token is refreshed shortly
  before it expires, and after a 401 one refresh and retry is attempted. Signing out revokes the OAuth token.
- **File-level storage.** Data sources and settings are kept per instance in `localStorage`; the collected
  dataset in `sessionStorage` (when it fits). All three download as files (`*.sources.json`,
  `*.settings.json`, `*.merge-requests.json`) that can be opened again or shared. An opened file is fully
  validated: it must belong to the same GitLab instance, and its links must point into it.
- **CSV export** (`core/export/csv.ts`): merge requests (every field and phase in hours), phase statistics,
  sprints, reviewer ranking and data sources. RFC 4180 quoting, UTF-8 BOM for Excel, `,`/`;`/tab delimiter
  (*Connection* page; `;` also writes decimal commas). Cells that start with `=`, `+`, `-` or `@` are
  neutralised, because GitLab data is user-controlled (CSV injection).

### Code layout

| Path | What |
|---|---|
| `src/app/core/config` | `AppConfig` model + validation, `ConfigService` (loads the file) |
| `src/app/core/auth` | `AuthService` (PKCE, token, refresh, revoke), `authInterceptor`, guards, `pkce.ts` |
| `src/app/core/gitlab` | `GitLabApiService` (typed REST v4 calls), `pagination.ts`, response models |
| `src/app/core/sources` | Data sources model, file format and validation, `DataSourcesService` |
| `src/app/core/analytics` | Settings (+ service), system note parser, timeline/phases, sprint/team classification, statistics, reviewer ranking, assignment planner, dataset file, collector, `MergeRequestDataService` |
| `src/app/core/export` | CSV writer |
| `src/app/core/storage` | Safe Web Storage wrappers, file download/open helpers |
| `src/app/pages` | `login`, `dashboard`, `merge-requests`, `sprints`, `reviewers`, `assign`, `settings`, `data-sources`, `connection`, `not-found` |
| `src/app/shared` | Chart (ECharts + iX theme, validated palette), filter bar, collect panel, duration pipe |
| `src/app/shell` | iX application frame, menu, language/theme switch |
| `public/config`, `public/i18n` | Default deployment config, translations (`en.json`, `hu.json`) |
| `scripts/configure-deployment.mjs` | Pages deployment step (config file, CSP, 404 page) |

### Extending the metrics

- A new phase: add it to `Phase`/`PHASES` and compute it in `timeline.ts` (pure, unit-tested); the
  dashboard, CSV and charts pick it up (add `phases.*`/`phaseHints.*` translations).
- New GitLab state changes: add a rule to `system-notes.ts` and a kind to `MrEventKind` (and to the dataset
  validation in `dataset.ts`).
- More data per merge request: add a typed method to `GitLabApiService` (built on `getAll()`) and fetch it in
  `MergeRequestCollector.detail()`; store it on `MergeRequestRecord`.
- A new customisation: add it to `AnalyticsSettings` (validation in `parseAnalyticsSettings`, defaults in the
  config, a field on the settings page).

## Security

- Read-only scopes by default; `api` is accepted only when the deployment enables reviewer assignment, which
  is the only write (`PUT …/merge_requests/:iid` with `reviewer_ids`). The client ID is not a secret; no
  client secret exists.
- The token is attached only to requests under `<gitlabUrl>/api/` (same origin and path). Pagination links
  that point elsewhere are not followed.
- OAuth `state` is single use, compared in constant time and valid for 10 minutes. `returnTo` accepts
  in-app paths only.
- Content Security Policy as a meta tag (`script-src 'self'`, `connect-src` limited to the GitLab origin in
  deployments, `object-src 'none'`). GitLab data is rendered as text only: lint forbids `[innerHTML]` and
  `bypassSecurityTrust*`.
