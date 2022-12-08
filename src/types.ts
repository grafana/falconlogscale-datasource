import { DataQuery, DataSourceJsonData } from '@grafana/data';

export interface LogScaleOptions extends DataSourceJsonData {
  baseUrl?: string;
  authenticateWithToken: boolean;
}

export interface SecretLogScaleOptions extends DataSourceJsonData {
  accessToken?: string;
}

export interface LogScaleQuery extends DataQuery {
  repository: string;
  lsql: string;
  live?: boolean;
}
