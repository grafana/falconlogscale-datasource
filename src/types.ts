import { DataQuery, DataSourceJsonData } from '@grafana/data';

export interface HumioOptions extends DataSourceJsonData {
  baseUrl?: string;
  authenticateWithToken: boolean;
}

export interface SecretHumioOptions extends DataSourceJsonData {
  accessToken?: string;
}

export interface VariableQueryData {
  query: string;
  repo: string;
  repositories: any;
  dataField: string;
}

export interface HumioQuery extends DataQuery {
  repository: string;
  queryString: string;
  live?: boolean;
}
