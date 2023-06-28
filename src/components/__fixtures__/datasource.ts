import { mockDatasourceInstanceSettings } from '@grafana/plugin-ui';
import { DataSource, } from '../../DataSource';
import { DataSourceInstanceSettings } from '@grafana/data';
import { LogScaleOptions } from '../../types';


export const getMockDatasource = (): DataSource => {
    const settings = {
        ...mockDatasourceInstanceSettings(),
        jsonData: {
          baseUrl: 'https://mock-default.mock',
          authenticateWithToken: false,
          dataLinks: [],
        } as LogScaleOptions,
      } as DataSourceInstanceSettings<LogScaleOptions>
  const ds = new DataSource(settings);

  ds.getResource = async () => [] as any;

  return ds;
};
