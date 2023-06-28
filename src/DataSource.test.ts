import { DataQueryResponse, ArrayVector, FieldType, DataSourceInstanceSettings, ScopedVars } from '@grafana/data';
import * as grafanaRuntime from '@grafana/runtime';
import { mockDatasourceInstanceSettings, mockDataQuery } from '@grafana/plugin-ui';
import { from } from 'rxjs';
import { DataSource } from './DataSource';
import { LogScaleOptions } from 'types';
import { TemplateSrv } from '@grafana/runtime';

const getDataSource = () => {
  return new DataSource({
    ...mockDatasourceInstanceSettings(),
    jsonData: {
      baseUrl: 'https://test-datasource.com',
      authenticateWithToken: false,
    },
  } as DataSourceInstanceSettings<LogScaleOptions>);
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
              values: new ArrayVector(['test_one', 'test_two', 'test_three']),
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
          ...mockDataQuery(),
          repository: '',
          lsql: '',
        },
        {}
      )
    ).resolves.toStrictEqual([{ text: 'test_one' }, { text: 'test_two' }, { text: 'test_three' }]);
  });

  it('should return correct `applyTemplateVariables` result', () => {
    jest.spyOn(grafanaRuntime, 'getTemplateSrv').mockImplementation(() => ({
      replace: () => 'result string after replace',
      getVariables: jest.fn(),
      updateTimeRange: jest.fn(),
    } as unknown as TemplateSrv));

    const ds = getDataSource();
    const query = {
      ...mockDataQuery(),
      repository: '',
      lsql: '',
    };

    expect(ds.applyTemplateVariables(query, { text: '', value: '' } as unknown as ScopedVars)).toStrictEqual({
      ...query,
      lsql: 'result string after replace',
    });
  });
});
