import { HttpHeaders } from '@angular/common/http';

import { nextPageUrl, parseLinkHeader, parseTotal } from './pagination';

const API = 'https://gitlab.example.com/api/v4';

describe('pagination', () => {
  it('nextPageUrl_LinkHeader_FollowsRelNext', () => {
    const headers = new HttpHeaders({
      Link: `<${API}/projects?page=1>; rel="first", <${API}/projects?id_after=42&per_page=100>; rel="next"`,
    });

    expect(nextPageUrl(`${API}/projects`, headers, 100, 100, API)).toBe(
      `${API}/projects?id_after=42&per_page=100`,
    );
  });

  it('nextPageUrl_LinkToOtherOrigin_Ignored', () => {
    const headers = new HttpHeaders({ Link: '<https://evil.example.com/api/v4/x>; rel="next"' });

    expect(nextPageUrl(`${API}/projects`, headers, 100, 100, API)).toBeNull();
  });

  it('nextPageUrl_XNextPage_SetsPage', () => {
    const headers = new HttpHeaders({ 'X-Next-Page': '3' });

    expect(nextPageUrl(`${API}/projects?page=2&per_page=20`, headers, 20, 20, API)).toBe(
      `${API}/projects?page=3&per_page=20`,
    );
  });

  it('nextPageUrl_EmptyXNextPage_LastPage', () => {
    const headers = new HttpHeaders({ 'X-Next-Page': '' });

    expect(nextPageUrl(`${API}/projects?page=2`, headers, 20, 20, API)).toBeNull();
  });

  it('nextPageUrl_NoHeadersFullPage_GuessesNextPage', () => {
    expect(nextPageUrl(`${API}/projects?per_page=2`, new HttpHeaders(), 2, 2, API)).toBe(
      `${API}/projects?per_page=2&page=2`,
    );
    expect(nextPageUrl(`${API}/projects?per_page=2`, new HttpHeaders(), 1, 2, API)).toBeNull();
  });

  it('parseTotal_Values_ParsedOrNull', () => {
    expect(parseTotal(new HttpHeaders({ 'X-Total': '17' }))).toBe(17);
    expect(parseTotal(new HttpHeaders({ 'X-Total': '' }))).toBeNull();
    expect(parseTotal(new HttpHeaders())).toBeNull();
  });

  it('parseLinkHeader_SeveralRels_AllReturned', () => {
    expect(parseLinkHeader('<a>; rel="prev next", <b>; rel=last')).toEqual({
      prev: 'a',
      next: 'a',
      last: 'b',
    });
  });
});
