import { HttpHeaders } from '@angular/common/http';

/** One page of a GitLab list endpoint plus where the next page is. */
export interface Page<T> {
  readonly items: readonly T[];
  /** Absolute URL of the next page, or null on the last page. */
  readonly next: string | null;
  /** `X-Total`, when GitLab reports it (it omits it above 10 000 results). */
  readonly total: number | null;
}

/**
 * Works out the next page URL from the response. GitLab sends a `Link: <…>; rel="next"` header
 * (offset and keyset pagination) and `X-Next-Page` (offset only). Without either header (some
 * proxies strip them) a full page means there may be more.
 *
 * The next URL must stay under `apiBase`: the request carries the access token, so a Link header
 * pointing elsewhere is ignored rather than followed.
 */
export function nextPageUrl(
  requestUrl: string,
  headers: HttpHeaders,
  itemCount: number,
  perPage: number,
  apiBase: string,
): string | null {
  const link = parseLinkHeader(headers.get('Link'))['next'];
  if (link !== undefined) {
    return isUnder(link, apiBase) ? link : null;
  }

  const url = new URL(requestUrl);
  const current = Number(url.searchParams.get('page') ?? '1');
  const nextHeader = headers.get('X-Next-Page');
  if (nextHeader !== null) {
    const next = Number(nextHeader);
    if (nextHeader.trim() === '' || !Number.isInteger(next) || next <= current) {
      return null;
    }
    url.searchParams.set('page', String(next));
    return url.toString();
  }

  if (itemCount < perPage || itemCount === 0) {
    return null;
  }
  url.searchParams.set('page', String(current + 1));
  return url.toString();
}

export function parseTotal(headers: HttpHeaders): number | null {
  const raw = headers.get('X-Total');
  if (raw === null || raw.trim() === '') {
    return null;
  }
  const total = Number(raw);
  return Number.isInteger(total) && total >= 0 ? total : null;
}

/** Parses an RFC 8288 Link header into `{ rel: url }`. */
export function parseLinkHeader(value: string | null): Record<string, string> {
  const result: Record<string, string> = {};
  if (!value) {
    return result;
  }
  for (const part of value.split(',')) {
    const match = /^\s*<([^>]*)>\s*;(.*)$/.exec(part);
    if (!match) {
      continue;
    }
    const rel = /\brel="?([^";]+)"?/.exec(match[2]);
    if (rel) {
      for (const name of rel[1].trim().split(/\s+/)) {
        result[name] = match[1];
      }
    }
  }
  return result;
}

function isUnder(candidate: string, base: string): boolean {
  try {
    const url = new URL(candidate);
    const root = new URL(base.endsWith('/') ? base : `${base}/`);
    return url.origin === root.origin && url.pathname.startsWith(root.pathname);
  } catch {
    return false;
  }
}
