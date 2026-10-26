import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { API, GITLAB, provideTestApp } from '../../../testing/test-config';
import { DataSourcesService } from '../../core/sources/data-sources.service';
import { DataSourcesPage } from './data-sources.page';

interface PageApi {
  searchForm: { patchValue(v: object): void };
  search(): Promise<void>;
  openFile(event: Event): Promise<void>;
  checkAccess(): Promise<void>;
}

const tick = () => new Promise((r) => setTimeout(r));

describe('DataSourcesPage', () => {
  function render() {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [DataSourcesPage],
      providers: [...provideTestApp(), provideRouter([])],
    });
    TestBed.inject(DataSourcesService).init();
    const fixture = TestBed.createComponent(DataSourcesPage);
    fixture.detectChanges();
    return {
      fixture,
      page: fixture.componentInstance as unknown as PageApi,
      http: TestBed.inject(HttpTestingController),
      element: fixture.nativeElement as HTMLElement,
    };
  }

  it('render_NoSources_ShowsEmptyState', () => {
    const { element } = render();

    expect(element.querySelector('[data-testid="sources-empty"]')).not.toBeNull();
  });

  it('search_Projects_ResultsCanBeAdded', async () => {
    const { fixture, page, http, element } = render();

    page.searchForm.patchValue({ term: 'app' });
    const done = page.search();
    await tick();
    http
      .expectOne(
        (r) => r.url.startsWith(`${API}/projects`) && r.urlWithParams.includes('search=app'),
      )
      .flush([
        {
          id: 11,
          name: 'App',
          name_with_namespace: 'Org / App',
          path_with_namespace: 'org/app',
          web_url: `${GITLAB}/org/app`,
        },
      ]);
    await done;
    fixture.detectChanges();
    (element.querySelector('[data-testid="search-add"]') as HTMLElement).click();
    fixture.detectChanges();

    expect(TestBed.inject(DataSourcesService).sources()).toEqual([
      {
        kind: 'project',
        id: 11,
        fullPath: 'org/app',
        name: 'Org / App',
        webUrl: `${GITLAB}/org/app`,
      },
    ]);
    expect(element.querySelector('[data-testid="source-row-org/app"]')?.textContent).toContain(
      'Org / App',
    );
  });

  it('checkAccess_Sources_ShowsMergeRequestCounts', async () => {
    const { fixture, page, http, element } = render();
    TestBed.inject(DataSourcesService).add({
      kind: 'group',
      id: 4,
      fullPath: 'org',
      name: 'Org',
      webUrl: `${GITLAB}/groups/org`,
    });

    const done = page.checkAccess();
    await tick();
    http
      .expectOne((r) => r.url.startsWith(`${API}/groups/4/merge_requests`))
      .flush([{}], { headers: { 'X-Total': '12' } });
    await done;
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="source-check"]')?.textContent?.trim()).toBe('12');
  });

  it('openFile_OtherInstance_ShowsError', async () => {
    const { fixture, page, element } = render();
    const file = new File(
      [
        JSON.stringify({
          format: 'gitlab-overseer/data-sources',
          version: 1,
          gitlabUrl: 'https://x.example.com',
          sources: [],
        }),
      ],
      'x.sources.json',
    );
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [file] });

    await page.openFile({ target: input } as unknown as Event);
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="sources-notice"]')?.textContent).toContain(
      'sources.importErrors.otherInstance',
    );
  });
});
