import { TestBed } from '@angular/core/testing';

import { provideTestApp, testConfig } from '../../../testing/test-config';
import { DEFAULT_ANALYTICS_SETTINGS } from './analytics-settings';
import { AnalyticsSettingsService } from './analytics-settings.service';

describe('AnalyticsSettingsService', () => {
  function setup(): AnalyticsSettingsService {
    TestBed.configureTestingModule({
      providers: provideTestApp(
        testConfig({ analytics: { ...DEFAULT_ANALYTICS_SETTINGS, bigMergeRequestFiles: 40 } }),
      ),
    });
    const service = TestBed.inject(AnalyticsSettingsService);
    service.init();
    return service;
  }

  beforeEach(() => localStorage.clear());

  it('settings_NothingStored_DeploymentDefaults', () => {
    const service = setup();

    expect(service.settings().bigMergeRequestFiles).toBe(40);
    expect(service.isCustomised()).toBe(false);
  });

  it('save_Valid_StoredAndRestored', () => {
    setup().save({ ...DEFAULT_ANALYTICS_SETTINGS, bigMergeRequestWeight: 3 });
    TestBed.resetTestingModule();

    const service = setup();

    expect(service.settings().bigMergeRequestWeight).toBe(3);
    expect(service.isCustomised()).toBe(true);
  });

  it('save_InvalidPattern_ThrowsAndKeepsSettings', () => {
    const service = setup();

    expect(() => service.save({ ...DEFAULT_ANALYTICS_SETTINGS, branchPattern: '(' })).toThrow();
    expect(service.isCustomised()).toBe(false);
  });

  it('importJson_ExportedFile_Applied', () => {
    const service = setup();
    service.save({ ...DEFAULT_ANALYTICS_SETTINGS, bigMergeRequestFiles: 77 });
    const file = service.exportJson();
    service.resetToDefaults();

    service.importJson(file);

    expect(service.settings().bigMergeRequestFiles).toBe(77);
  });

  it('importJson_WrongFormat_Throws', () => {
    expect(() => setup().importJson('{"format":"x"}')).toThrow(
      expect.objectContaining({ key: 'wrongFormat' }),
    );
  });
});
