# GitLab Overseer – guide for Claude sessions

Angular 22 + Siemens iX SPA hosted on GitLab Pages (no backend, no database). It signs in to GitLab with
OAuth PKCE and visualises SDLC metrics from the GitLab REST API (merge request phase times, sprints/teams,
reviewer ranking, reviewer assignment). Read `README.md` first (configuration,
deployment, code layout, security).

## Commands

Node.js ≥ 22.22.3 (in Claude Code on the web: `export NVM_DIR=/opt/nvm; . /opt/nvm/nvm.sh; nvm install 24`).

```bash
npm ci
npm test               # Vitest via @angular/build:unit-test (jsdom); setup file src/test-setup.ts
npm run test:coverage
npm run lint           # angular-eslint + no [innerHTML]/[outerHTML]
npm run format:check   # prettier (src/**, public/**/*.json)
npm run build
```

## Conventions

- Standalone components, signals, `OnPush`, `inject()`. Pages: `src/app/pages/<name>/<name>.page.ts`;
  services and pure logic: `src/app/core/<area>/`. Shared page styles: `@use '../../shared/page'`.
- iX components from `@siemens/ix-angular/standalone`; register every icon used in templates with
  `addIcons` in `shell/shell.ts` (a missing one only shows up as a console 404).
- Every UI string goes through ngx-translate: add keys to **both** `public/i18n/en.json` and `hu.json`.
- `data-testid` on elements tests interact with.
- Tests are Vitest with `describe`/`it` (`Method_Condition_Result` names). `src/testing/test-config.ts`
  has `provideTestApp()` (HttpClient + auth interceptor on the testing backend, translations, a
  `FakeLocation`, config). Await a tick (`setTimeout`) before `expectOne`, because API calls go through async
  token checks.
- Angular serialises `URLSearchParams` bodies as JSON: send form bodies as strings with an explicit
  `Content-Type: application/x-www-form-urlencoded`.
- Browser storage only through `core/storage/browser-storage.ts` (keys prefixed `gitlab-overseer.`).
  Anything users keep beyond the browser is a file they download/open; validate opened files fully.
- Analytics logic is pure and lives in `core/analytics` (timeline, classification, statistics, reviewers,
  assignment); pages only compose it. `MergeRequestDataService` holds the dataset and the derived signals
  (`all`, `filtered`, `ranking`, `overallRanking`); settings changes re-derive everything.
- Phase definitions are documented in `timeline.ts` and the README "Metrics" table: keep both in sync.
- Test data: `src/testing/merge-requests.ts` (`record()`, `event()`, `analyzed()`, `at(day, hour)`).
- Charts: `shared/chart` (ECharts, iX theme). Colours come from `chart-palette.ts` in fixed order
  (validated with the dataviz palette validator); colour follows the entity (`colouredTeams` from all
  loaded rows, not the filtered ones). Series must stay plain data (`SURFACE`/`TEXT` placeholders are
  replaced at render time); formatters go into `tooltip`/axes.
- `ix-date-input` emits an empty `valueChange` while it initialises: handle it with
  `shared/date-input.ts` `dateInputValue()`.
- A new deployment setting needs: `AppConfig` + `parseAppConfig` (validation, tests), the default in
  `public/config/app-config.json`, a variable in `scripts/configure-deployment.mjs`, and the README tables.

## Security checklist

- [ ] Tokens only go to `<gitlabUrl>/api/` (`isGitLabApi`); never log or export them.
- [ ] Only read scopes, except `api` behind `features.reviewerAssignment`; the reviewer `PUT` is the only
      write; no client secret anywhere.
- [ ] GitLab data is untrusted: render as text, no `innerHTML`/`bypassSecurityTrust*`; CSV via `toCsv`
      (formula neutralisation).
- [ ] CSP meta tag in `src/index.html` keeps the `connect-src 'self' https:` marker the deploy script narrows.
- [ ] GitHub Actions pinned by commit SHA, minimal `permissions`, `persist-credentials: false`.
