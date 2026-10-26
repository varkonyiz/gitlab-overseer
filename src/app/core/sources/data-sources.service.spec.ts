import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { API, GITLAB, provideTestApp, testConfig } from '../../../testing/test-config';
import { STORAGE_PREFIX } from '../storage/browser-storage';
import { DataSource, MAX_SOURCES } from './data-sources';
import { DataSourcesService } from './data-sources.service';

const source = (id: number, kind: 'project' | 'group' = 'project'): DataSource => ({
  kind,
  id,
  fullPath: `org/p${id}`,
  name: `P${id}`,
  webUrl: `${GITLAB}/org/p${id}`,
});

describe('DataSourcesService', () => {
  function setup(config = testConfig()): DataSourcesService {
    TestBed.configureTestingModule({ providers: provideTestApp(config) });
    const service = TestBed.inject(DataSourcesService);
    service.init();
    return service;
  }

  beforeEach(() => localStorage.clear());

  it('add_Sources_PersistedPerInstanceAndSorted', () => {
    const service = setup();

    service.add(source(2), source(1, 'group'));

    expect(service.sources().map((s) => s.kind)).toEqual(['group', 'project']);
    const stored = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}sources:${GITLAB}`)!);
    expect(stored.sources).toHaveLength(2);
  });

  it('init_StoredList_Restored', () => {
    setup().add(source(1));
    TestBed.resetTestingModule();

    const service = setup();

    expect(service.sources()).toEqual([source(1)]);
  });

  it('add_OverLimit_Refused', () => {
    const service = setup();

    const ok = service.add(...Array.from({ length: MAX_SOURCES + 1 }, (_, i) => source(i + 1)));

    expect(ok).toBe(false);
    expect(service.sources()).toEqual([]);
  });

  it('remove_Source_Removed', () => {
    const service = setup();
    service.add(source(1), source(2));

    service.remove({ kind: 'project', id: 1 });

    expect(service.sources()).toEqual([source(2)]);
  });

  it('importJson_ExportedFile_ReplacesList', () => {
    const service = setup();
    service.add(source(1));
    const exported = service.exportJson();
    service.clear();

    expect(service.importJson(exported)).toBe(1);
    expect(service.sources()).toEqual([source(1)]);
  });

  it('applyDefaults_ConfiguredPaths_ResolvedOnce', async () => {
    const service = setup(
      testConfig({
        defaultSources: [
          { kind: 'group', path: 'org' },
          { kind: 'project', path: 'org/missing' },
        ],
      }),
    );
    const http = TestBed.inject(HttpTestingController);
    expect(service.shouldApplyDefaults()).toBe(true);

    const done = service.applyDefaults();
    await new Promise((r) => setTimeout(r));
    http
      .expectOne((r) => r.url === `${API}/groups/org`)
      .flush({
        id: 5,
        name: 'Org',
        full_name: 'Org',
        full_path: 'org',
        web_url: `${GITLAB}/groups/org`,
      });
    await new Promise((r) => setTimeout(r));
    http
      .expectOne(`${API}/projects/org%2Fmissing`)
      .flush({}, { status: 404, statusText: 'Not Found' });
    const result = await done;

    expect(result).toEqual({ added: 1, missing: ['org/missing'] });
    expect(service.groups()).toHaveLength(1);
    expect(service.shouldApplyDefaults()).toBe(false);
    http.verify();
  });
});
