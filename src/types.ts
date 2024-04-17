import { DataSourceJsonData } from '@grafana/data';
import { DataLinkConfig } from './components/DataLinks';
import { DataQuery } from '@grafana/schema';

export interface LogScaleOptions extends DataSourceJsonData {
  baseUrl?: string;
  oauthPassThru?: boolean;
  authenticateWithToken: boolean;
  dataLinks?: DataLinkConfig[];
  defaultRepository?: string;
  basicAuthUser?: string;
}

export interface SecretLogScaleOptions extends DataSourceJsonData {
  accessToken?: string;
  basicAuthPassword?: string;
}

export interface LogScaleQuery extends DataQuery {
  repository: string;
  lsql: string;
  live?: boolean;
  queryType: LogScaleQueryType;
  formatAs: FormatAs;
}

export enum LogScaleQueryType {
  Repositories = 'Repositories',
  LQL = 'LQL',
}

export enum FormatAs {
  Logs = 'logs',
  Metrics = 'metrics',
}
