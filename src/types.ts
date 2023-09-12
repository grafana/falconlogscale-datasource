import { DataSourceJsonData } from '@grafana/data';
import { DataLinkConfig } from './components/DataLinks';
import { DataQuery } from '@grafana/schema';

export interface LogScaleOptions extends DataSourceJsonData {
  baseUrl?: string;
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
}
