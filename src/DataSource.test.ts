import { DataQueryResponse, FieldType } from '@grafana/data';
import * as grafanaRuntime from '@grafana/runtime';
import { expect } from '@jest/globals';
import { mockDataSourceInstanceSettings, mockQuery } from 'components/__fixtures__/datasource';
import { from } from 'rxjs';
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
