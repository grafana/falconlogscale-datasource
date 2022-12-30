import { DataQueryResponse, ArrayVector, FieldType } from '@grafana/data';
import * as grafanaRuntime from '@grafana/runtime';
import { mockDatasourceInstanceSettings, mockDataQuery } from 'grafana-plugin-ui';
import { from } from 'rxjs';
import { DataSource } from './DataSource';

const getDataSource = () => {
  return new DataSource({
    ...mockDatasourceInstanceSettings(),
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
    }));

    const ds = getDataSource();
    const query = {
      ...mockDataQuery(),
      repository: '',
      lsql: '',
    };

    expect(ds.applyTemplateVariables(query, { text: '', value: '' })).toStrictEqual({
      ...query,
      lsql: 'result string after replace',
    });
  });
});
