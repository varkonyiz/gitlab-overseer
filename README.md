# GitLab Overseer

Angular application built with the [Siemens iX](https://ix.siemens.io) design system. It signs in to a
GitLab instance with OAuth and will show customisable SDLC metrics (merge request times and more) computed
from GitLab API data. It runs on **GitLab Pages**: no backend and no database. Settings are files
(deployment configuration, downloadable data source files) plus the browser's own storage.

Status: **app shell and GitLab connection.** The metric definitions are still being worked out. The dashboard
shows a placeholder until the metric engine is added.

| Area | What exists |
|---|---|
| Sign-in | OAuth 2.0 authorization code + PKCE (non-confidential app, no client secret), token refresh and revoke; optional personal access token |
| GitLab API | Typed REST v4 client with pagination (`Link` / `X-Next-Page`), item caps, abort support |
| Data sources | Search or add projects/groups by path, access check (MR count of the last 30 days), saved per instance in the browser, download/open as a JSON file, CSV export |
| Configuration | `config/app-config.json`, written by the Pages job from CI/CD variables |
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
  "defaultSources": [{ "kind": "group", "path": "my-org/team" }]
}
```

| Key | Meaning |
|---|---|
| `gitlabUrl` | GitLab base URL; https only (http only for `localhost`); a relative URL root such as `https://example.com/gitlab` works |
| `oauth.clientId` | Application ID of the OAuth application; empty turns OAuth sign-in off |
| `oauth.scopes` | Only read scopes are accepted (`read_api`, `read_user`, `read_repository`, `openid`, `profile`, `email`) |
| `oauth.redirectUri` | `null` = the app's own address (base href). Must match the application's callback URL exactly |
| `allowPersonalAccessToken` | Offer sign-in with a personal access token (`read_api`) |
| `defaultLanguage` | `en` or `hu` (users can switch; their choice is remembered) |
| `defaultSources` | Projects/groups (full paths) added once for a new user when they open *Data sources* |

## Deploy to GitLab Pages

1. Push the repository to a GitLab project. `.gitlab-ci.yml` runs the checks on every pipeline and
   deploys the `pages` job from the default branch.
2. Create an OAuth application: *User settings → Applications* (or a group's / the instance's
   *Applications* page):
   - **Redirect URI**: the Pages URL with a trailing slash, e.g. `https://my-group.gitlab.io/gitlab-overseer/`
     (the *Connection* page shows the exact value);
   - **Confidential**: unchecked (the browser cannot keep a secret; PKCE protects the code);
   - **Scopes**: `read_api`.
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

4. Run the pipeline. `scripts/configure-deployment.mjs` writes `config/app-config.json`, narrows the CSP
   `connect-src` to the GitLab origin and copies `index.html` to `404.html`.

Consider *Pages access control* (*Settings → General → Visibility*) when only project members should
reach the app. The data is protected by GitLab either way: users only see what their own token can read.

## How it works

- **No backend.** GitLab's `/oauth/token`, `/oauth/revoke` and `/api/v4` allow cross-origin requests,
  so the browser talks to GitLab directly. Routes use the URL hash (`#/sources`), so GitLab Pages never has
  to rewrite deep links. The OAuth callback lands on the app root (`?code=…&state=…`) and is removed
  from the address bar right away.
- **Sessions** live in `sessionStorage` (they end with the tab). The OAuth token is refreshed shortly
  before it expires, and after a 401 one refresh and retry is attempted. Signing out revokes the OAuth token.
- **File-level storage.** The data sources are kept per instance in `localStorage`, and can be downloaded as a
  `*.sources.json` file and opened again (or shared). An opened file is fully validated: it must belong to the
  same GitLab instance, and its links must point into it.
- **CSV export** (`core/export/csv.ts`): RFC 4180 quoting, UTF-8 BOM for Excel, `,`/`;`/tab delimiter
  (*Connection* page). Cells that start with `=`, `+`, `-` or `@` are neutralised, because GitLab data is
  user-controlled (CSV injection).

### Code layout

| Path | What |
|---|---|
| `src/app/core/config` | `AppConfig` model + validation, `ConfigService` (loads the file) |
| `src/app/core/auth` | `AuthService` (PKCE, token, refresh, revoke), `authInterceptor`, guards, `pkce.ts` |
| `src/app/core/gitlab` | `GitLabApiService` (typed REST v4 calls), `pagination.ts`, response models |
| `src/app/core/sources` | Data sources model, file format and validation, `DataSourcesService` |
| `src/app/core/export` | CSV writer |
| `src/app/core/storage` | Safe Web Storage wrappers, file download/open helpers |
| `src/app/pages` | `login`, `dashboard` (metrics placeholder), `data-sources`, `connection`, `not-found` |
| `src/app/shell` | iX application frame, menu, language/theme switch |
| `public/config`, `public/i18n` | Default deployment config, translations (`en.json`, `hu.json`) |
| `scripts/configure-deployment.mjs` | Pages deployment step (config file, CSP, 404 page) |

### Adding the metrics (next step)

- Data access: add typed methods to `GitLabApiService` built on `getAll()` (pagination, `maxItems`,
  `AbortSignal`, progress callback), e.g. merge requests, notes and commits per data source.
- Sources: `DataSourcesService.sources()` gives the selected projects and groups (`kind`, `id`, `fullPath`).
- Export: `toCsv(rows, columns, { delimiter: preferences.csvDelimiter() })` plus `downloadFile()`.
- Customisation can follow the data sources pattern: a validated JSON definition file that users download
  and open again, plus optional deployment defaults in `app-config.json`.

## Security

- Read-only scopes only; the client ID is not a secret; no client secret exists.
- The token is attached only to requests under `<gitlabUrl>/api/` (same origin and path). Pagination links
  that point elsewhere are not followed.
- OAuth `state` is single use, compared in constant time and valid for 10 minutes. `returnTo` accepts
  in-app paths only.
- Content Security Policy as a meta tag (`script-src 'self'`, `connect-src` limited to the GitLab origin in
  deployments, `object-src 'none'`). GitLab data is rendered as text only: lint forbids `[innerHTML]` and
  `bypassSecurityTrust*`.
