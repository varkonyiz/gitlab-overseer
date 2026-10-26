#!/usr/bin/env node
// Prepares a built app for GitLab Pages (no backend, so settings are files):
//  - writes config/app-config.json from environment variables (CI/CD variables),
//  - narrows the CSP connect-src in index.html to the configured GitLab origin,
//  - copies index.html to 404.html so unknown paths still load the app.
//
// Usage: node scripts/configure-deployment.mjs <build dir>
// Variables (all optional; unset ones keep the value of the bundled config file):
//   GITLAB_URL (default: CI_SERVER_URL), OAUTH_CLIENT_ID, OAUTH_SCOPES (space separated),
//   OAUTH_REDIRECT_URI, ALLOW_PERSONAL_ACCESS_TOKEN (true|false), DEFAULT_LANGUAGE (en|hu),
//   DEFAULT_SOURCES (comma separated, e.g. "group:my-org,project:my-org/app").
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) {
  fail('Usage: node scripts/configure-deployment.mjs <build dir>');
}

const configPath = join(dir, 'config', 'app-config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const env = process.env;

const gitlabUrl = env.GITLAB_URL || env.CI_SERVER_URL;
if (gitlabUrl) {
  config.gitlabUrl = gitlabUrl.replace(/\/+$/, '');
}
config.oauth ??= {};
if (env.OAUTH_CLIENT_ID !== undefined) {
  config.oauth.clientId = env.OAUTH_CLIENT_ID.trim();
}
if (env.OAUTH_SCOPES) {
  config.oauth.scopes = env.OAUTH_SCOPES.split(/\s+/).filter(Boolean);
}
if (env.OAUTH_REDIRECT_URI !== undefined) {
  config.oauth.redirectUri = env.OAUTH_REDIRECT_URI.trim() || null;
}
if (env.ALLOW_PERSONAL_ACCESS_TOKEN !== undefined) {
  if (!['true', 'false'].includes(env.ALLOW_PERSONAL_ACCESS_TOKEN)) {
    fail('ALLOW_PERSONAL_ACCESS_TOKEN must be true or false.');
  }
  config.allowPersonalAccessToken = env.ALLOW_PERSONAL_ACCESS_TOKEN === 'true';
}
if (env.DEFAULT_LANGUAGE) {
  config.defaultLanguage = env.DEFAULT_LANGUAGE;
}
if (env.DEFAULT_SOURCES !== undefined) {
  config.defaultSources = env.DEFAULT_SOURCES.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [kind, ...rest] = entry.split(':');
      if ((kind !== 'group' && kind !== 'project') || rest.length === 0) {
        fail(`DEFAULT_SOURCES entry "${entry}" must look like group:path or project:path.`);
      }
      return { kind, path: rest.join(':') };
    });
}

let origin;
try {
  const url = new URL(config.gitlabUrl);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error();
  }
  origin = url.origin;
} catch {
  fail(`gitlabUrl "${config.gitlabUrl}" must be an https URL.`);
}

writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

const indexPath = join(dir, 'index.html');
const html = readFileSync(indexPath, 'utf8');
const marker = "connect-src 'self' https:";
if (!html.includes(marker)) {
  fail(`index.html has no "${marker}" in its Content-Security-Policy.`);
}
writeFileSync(indexPath, html.replace(marker, `connect-src 'self' ${origin}`));
copyFileSync(indexPath, join(dir, '404.html'));

console.log(`Configured ${dir} for ${config.gitlabUrl} (OAuth ${config.oauth.clientId ? 'on' : 'off'}).`);

function fail(message) {
  console.error(message);
  process.exit(1);
}
