import { DataQueryResponse, ArrayVector, FieldType } from '@grafana/data';
import * as grafanaRuntime from '@grafana/runtime';
import { from } from 'rxjs';
import { DataSource } from './DataSource';
import { expect } from '@jest/globals';
import { mockDataSourceInstanceSettings, mockQuery } from 'components/__fixtures__/datasource';

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
      replace: () => 'result string after replace',
      getVariables: jest.fn(),
      updateTimeRange: jest.fn(),
      containsTemplate: jest.fn(),
    }));

    const ds = getDataSource();
    const query = {
      ...mockQuery(),
      repository: '',
      lsql: '',
    };

    expect(ds.applyTemplateVariables(query, { var: { text: '', value: '' } })).toStrictEqual({
      ...query,
      lsql: 'result string after replace',
    });
  });
});
