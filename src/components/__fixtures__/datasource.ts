import { DataSourceInstanceSettings } from '@grafana/data';
import { mockDatasourceInstanceSettings } from 'grafana-plugin-ui';
import { LogScaleOptions } from 'types';
import { DataSource } from '../../DataSource';

export const getMockDatasource = (): DataSource => {
  const ds = new DataSource({
    ...mockDatasourceInstanceSettings(),
    jsonData: {
      baseUrl: 'https://mock-default.mock',
      authenticateWithToken: false,
      dataLinks: [],
    },
  } as DataSourceInstanceSettings<LogScaleOptions>);

  ds.getResource = async () => [];

  return ds;
};
