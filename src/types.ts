import { DataSourceJsonData } from '@grafana/data';
import { DataLinkConfig } from './components/DataLinks';
import { DataQuery } from '@grafana/schema';

export interface LogScaleOptions extends DataSourceJsonData {
  baseUrl?: string;
  oauthPassThru?: boolean;
  authenticateWithToken: boolean;
  oauth2?: boolean;
  oauth2ClientId?: string;
  dataLinks?: DataLinkConfig[];
  defaultRepository?: string;
  basicAuthUser?: string;
  enableSecureSocksProxy?: boolean;
}

export interface SecretLogScaleOptions extends DataSourceJsonData {
  accessToken?: string;
  basicAuthPassword?: string;
  oauth2ClientSecret?: string;
}

export interface LogScaleQuery extends DataQuery {
  repository: string;
  lsql: string;
  live?: boolean;
  queryType: LogScaleQueryType;
  formatAs: FormatAs;
  version: string;
}

export enum LogScaleQueryType {
  Repositories = 'Repositories',
  LQL = 'LQL',
}

export enum FormatAs {
  Logs = 'logs',
  Metrics = 'metrics',
  Variable = 'variable',
}
