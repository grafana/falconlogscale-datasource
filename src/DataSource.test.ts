import { DataQueryResponse, dateTime, FieldType } from '@grafana/data';
import { DataSourceWithBackend } from '@grafana/runtime';
import * as grafanaRuntime from '@grafana/runtime';
import { expect } from '@jest/globals';
import { mockDataSourceInstanceSettings, mockQuery } from 'components/__fixtures__/datasource';
import { from, of } from 'rxjs';
import { pluginVersion } from 'utils/version';
import { DataSource } from './DataSource';
import { FormatAs, LogScaleQuery, LogScaleQueryType } from './types';

const getDataSource = () => {
  return new DataSource({
    ...mockDataSourceInstanceSettings(),
    readOnly: true,
    jsonData: {
      baseUrl: 'https://test-datasource.com',
      authenticateWithToken: false,
    },
  });
};

describe('DataSource', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should create data source', () => {
    expect(getDataSource()).toBeTruthy();
  });

  it('should return correct `metricFindQuery` result', () => {
    const ds = getDataSource();
    const queryResponse: DataQueryResponse = {
      data: [
        {
          fields: [
            {
              values: ['test_one', 'test_two', 'test_three'],
              type: FieldType.string,
              name: 'name',
              config: {},
            },
          ],
          length: 3,
        },
      ],
    };
    ds.query = () => from([queryResponse]);

    expect(
      ds.metricFindQuery(
        {
          ...mockQuery(),
          repository: '',
          lsql: '',
        },
        {}
      )
    ).resolves.toStrictEqual([{ text: 'test_one' }, { text: 'test_two' }, { text: 'test_three' }]);
  });

  it('should return correct `applyTemplateVariables` result', () => {
    jest.spyOn(grafanaRuntime, 'getTemplateSrv').mockImplementation(() => ({
      replace: (target: string) => {
        if (target === '$lql') {
          return 'result string after replace';
        }
        if (target === '$repository') {
          return 'repository after replace';
        }

        return 'result string after replace';
      },
      getVariables: jest.fn(),
      updateTimeRange: jest.fn(),
      containsTemplate: jest.fn(),
    }));

    const ds = getDataSource();
    const query = {
      ...mockQuery(),
      repository: '$repository',
      lsql: '$lql',
    };

    expect(ds.applyTemplateVariables(query, { var: { text: '', value: '' } })).toStrictEqual({
      ...query,
      lsql: 'result string after replace',
      repository: 'repository after replace',
    });
  });

  describe('Default repository', () => {
    const ds = getDataSource();
    let targets: LogScaleQuery[] = [];

    beforeEach(() => {
      targets = [
        {
          repository: '',
          lsql: '',
          refId: '',
          queryType: LogScaleQueryType.LQL,
          formatAs: FormatAs.Logs,
          version: pluginVersion,
        },
      ];
    });

    it('If a default repository is defined, use it in place of empty repository property', () => {
      ds.defaultRepository = 'foo';
      ds.ensureRepositories(targets);

      expect(targets[0].repository).toBe('foo');
    });

    it('If there is no default repository defined and repository is empty, leave it empty.', () => {
      ds.defaultRepository = '';
      ds.ensureRepositories(targets);

      expect(targets[0].repository).toBe('');
    });

    it('Replace string $defaultRepo with defaultRepository', () => {
      ds.defaultRepository = 'foo';
      targets[0].repository = '$defaultRepo';
      ds.ensureRepositories(targets);

      expect(targets[0].repository).toBe('foo');
    });
  });

  describe('Incremental querying', () => {
    const NOW = 1_700_000_000_000;

    const makeRequest = () => ({
      targets: [
        {
          ...mockQuery(),
          queryType: LogScaleQueryType.LQL,
          formatAs: FormatAs.Logs,
          repository: 'repo',
          lsql: 'error',
        },
      ],
      range: { from: dateTime(NOW - 3_600_000), to: dateTime(NOW), raw: {} },
      rangeRaw: { from: 'now-1h', to: 'now' },
      intervalMs: 1000,
      requestId: 'test',
      timezone: 'browser',
      app: 'panel-editor',
      startTime: NOW,
    } as any);

    const makeFrame = (refId = 'A') => ({
      refId,
      name: 'events',
      fields: [
        { name: '@timestamp', type: FieldType.time, values: [new Date(NOW - 60_000)], config: {} },
        { name: '@rawstring', type: FieldType.string, values: ['msg'], config: {} },
      ],
      length: 1,
    });

    const mockQueryResponse = (refId = 'A'): DataQueryResponse => ({
      data: [makeFrame(refId)],
    });

    const getIncrementalDs = (overrides = {}) =>
      new DataSource({
        ...mockDataSourceInstanceSettings(),
        jsonData: {
          authenticateWithToken: false,
          incrementalQuerying: true,
          incrementalQueryOverlapWindow: '10m',
          ...overrides,
        },
      });

    it('skips runIncrementalQuery when incrementalQuerying is disabled', () => {
      const ds = new DataSource({
        ...mockDataSourceInstanceSettings(),
        jsonData: { authenticateWithToken: false },
      });
      const backendSpy = jest
        .spyOn(DataSourceWithBackend.prototype, 'query')
        .mockReturnValue(of(mockQueryResponse()));
      const runIncrSpy = jest.spyOn(ds as any, 'runIncrementalQuery');
      ds.query(makeRequest());
      expect(runIncrSpy).not.toHaveBeenCalled();
      backendSpy.mockRestore();
    });

    it('does not cache results for absolute time ranges', (done) => {
      const ds = getIncrementalDs();
      const request = {
        ...makeRequest(),
        rangeRaw: { from: dateTime(NOW - 3_600_000), to: dateTime(NOW) }, // absolute
      };
      const runQuerySpy = jest.spyOn(ds as any, 'runQuery').mockReturnValue(of(mockQueryResponse()));

      ds.query(request).subscribe(() => {
        // shouldCache=false for absolute ranges → cache stays empty.
        const cache: any = (ds as any).incrementalCache;
        expect(cache.cache.size).toBe(0);
        runQuerySpy.mockRestore();
        done();
      });
    });

    it('populates cache on first query (no cache hit)', (done) => {
      const ds = getIncrementalDs();
      const runQuerySpy = jest.spyOn(ds as any, 'runQuery').mockReturnValue(of(mockQueryResponse()));
      const request = makeRequest();

      ds.query(request).subscribe(() => {
        const cache: any = (ds as any).incrementalCache;
        // Identity: dashboardUID|panelId|refId — all undefined in test request.
        const ident = '||A';
        expect(cache.cache.get(ident)).toBeDefined();
        expect(cache.cache.get(ident).signature).toBe('error|repo|logs');
        runQuerySpy.mockRestore();
        done();
      });
    });

    it('uses adjusted range on cache hit', (done) => {
      const ds = getIncrementalDs();
      const cachedTo = NOW - 60_000;
      const overlapMs = 10 * 60_000;
      const expectedCutoff = cachedTo - overlapMs;

      const cache: any = (ds as any).incrementalCache;
      // Identity: dashboardUID|panelId|refId — all undefined in test request.
      const ident = '||A';
      cache.cache.set(ident, {
        signature: 'error|repo|logs',
        prevTo: cachedTo,
        frames: [makeFrame('A')],
      });

      const runQuerySpy = jest.spyOn(ds as any, 'runQuery').mockReturnValue(of(mockQueryResponse()));
      const request = makeRequest();

      ds.query(request).subscribe(() => {
        expect(runQuerySpy).toHaveBeenCalledTimes(1);
        const calledRequest = runQuerySpy.mock.calls[0][0] as any;
        expect(calledRequest.range.from.valueOf()).toBe(expectedCutoff);
        runQuerySpy.mockRestore();
        done();
      });
    });

    it('invalidates stale cache when lsql changes', (done) => {
      const ds = getIncrementalDs();
      const cache: any = (ds as any).incrementalCache;
      const ident = '||A';

      // Seed cache with a DIFFERENT lsql signature — should be invalidated.
      cache.cache.set(ident, {
        signature: 'old query|repo|logs',
        prevTo: NOW - 60_000,
        frames: [makeFrame('A')],
      });

      const runQuerySpy = jest.spyOn(ds as any, 'runQuery').mockReturnValue(of(mockQueryResponse()));
      const request = makeRequest();

      ds.query(request).subscribe(() => {
        const calledRequest = runQuerySpy.mock.calls[0][0] as any;
        // Must use the full original range since cache was stale.
        expect(calledRequest.range.from.valueOf()).toBe(request.range.from.valueOf());
        runQuerySpy.mockRestore();
        done();
      });
    });
  });

  describe('Annotation creation', () => {
    const ds = getDataSource();

    it('should set queryType to LQL when queryType is not LQL', () => {
      const annotation = {
        name: 'Test Annotation',
        target: {
          queryType: 'other query type',
          refId: 'test-ref-id',
        },
        enable: true,
        iconColor: 'red',
      };

      const result = ds.annotations.prepareAnnotation?.(annotation as any);

      expect(result).toEqual({
        ...annotation,
        target: {
          queryType: LogScaleQueryType.LQL,
          formatAs: FormatAs.Logs,
          version: pluginVersion,
          refId: annotation.target.refId,
          lsql: '',
          repository: '',
        },
      });
    });

    it('will not modify annotation when queryType is already LQL', () => {
      const annotation = {
        name: 'Test Annotation',
        target: {
          queryType: LogScaleQueryType.LQL,
          formatAs: FormatAs.Logs,
          version: pluginVersion,
          refId: 'test-ref-id',
          lsql: 'test query',
          repository: 'test repository',
        },
        enable: true,
        iconColor: 'red',
      };

      const result = ds.annotations.prepareAnnotation?.(annotation as any);

      expect(result).toEqual({
        ...annotation,
        target: {
          queryType: LogScaleQueryType.LQL,
          formatAs: FormatAs.Logs,
          version: pluginVersion,
          refId: annotation.target.refId,
          lsql: 'test query',
          repository: 'test repository',
        },
      });
    });
  });
});
