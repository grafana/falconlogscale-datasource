import { FormatAs, LogScaleOptions, LogScaleQuery, LogScaleQueryType, SecretLogScaleOptions } from 'types';
import { DataSource } from '../../DataSource';
import { DataSourceInstanceSettings, DataSourceSettings, PluginType } from '@grafana/data';

export function mockDataSourceOptions(): DataSourceSettings<LogScaleOptions, SecretLogScaleOptions> {
  return {
    id: 1,
    uid: 'logscale-id',
    orgId: 1,
    name: 'LogScale Data source',
    typeLogoUrl: '',
    type: '',
    typeName: '',
    access: '',
    url: '',
    user: '',
    basicAuth: false,
    basicAuthUser: '',
    database: '',
    isDefault: false,
    jsonData: {
      authenticateWithToken: true,
      basicAuthUser: '',
      baseUrl: '',
    },
    secureJsonData: {},
    secureJsonFields: {},
    readOnly: false,
    withCredentials: false,
  };
}

export function mockDataSourceInstanceSettings(): DataSourceInstanceSettings<LogScaleOptions> {
  return {
    id: 1,
    uid: 'logscale-id',
    name: 'Falcon logscale Data source',
    type: '',
    access: 'direct',
    url: '',
    basicAuth: 'auth',
    isDefault: false,
    jsonData: {
      authenticateWithToken: true,
      basicAuthUser: '',
      baseUrl: '',
    },
    readOnly: false,
    withCredentials: false,
    meta: {
      id: 'grafana-falconlogscale-datasource',
      type: PluginType.datasource,
      name: 'logscale',
      baseUrl: '',
      info: {
        author: {
          name: '',
          url: undefined,
        },
        description: '',
        links: [],
        logos: {
          large: '',
          small: '',
        },
        screenshots: [],
        updated: '',
        version: '',
      },
      module: '',
    },
  };
}

export const mockDatasource = () => {
  const instanceSettings = mockDataSourceInstanceSettings();
  const ds = new DataSource(instanceSettings);
  ds.getResource = jest.fn().mockResolvedValue([]);
  ds.getVariables = jest.fn().mockReturnValue([]);
  ds.getRepositories = jest.fn().mockResolvedValue([]);
  return ds;
};

export const mockQuery = (): LogScaleQuery => ({
  refId: 'A',
  hide: false,
  key: 'fake-query',
  queryType: LogScaleQueryType.LQL,
  formatAs: FormatAs.Logs,
  datasource: {},
  lsql: '',
  repository: '',
});
