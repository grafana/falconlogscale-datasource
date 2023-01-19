import { mockDatasourceInstanceSettings } from 'plugin-ui';
import { DataSource } from '../../DataSource';

export const getMockDatasource = (): DataSource => {
  const ds = new DataSource({
    ...mockDatasourceInstanceSettings(),
    jsonData: {
      baseUrl: 'https://mock-default.mock',
      authenticateWithToken: false,
    },
  });

  ds.getResource = async () => [];

  return ds;
};
