import { DataQuery, DataSourceJsonData } from '@grafana/data';
import { DataLinkConfig } from 'plugin-ui';

export interface LogScaleOptions extends DataSourceJsonData {
  baseUrl?: string;
  authenticateWithToken: boolean;
  dataLinks?: DataLinkConfig[];
}

export interface SecretLogScaleOptions extends DataSourceJsonData {
  accessToken?: string;
}

export interface LogScaleQuery extends DataQuery {
  repository: string;
  lsql: string;
  live?: boolean;
}
