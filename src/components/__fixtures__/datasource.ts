import { mockDatasource } from 'grafana-plugin-ui';
import { DataSource } from '../../DataSource';

export const getMockDatasource = (): DataSource => {
  return {
    ...mockDatasource(),
    getResource: async () => [],
  } as unknown as DataSource;
};
