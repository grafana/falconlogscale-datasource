import {
  DataFrame,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceInstanceSettings,
  MetricFindValue,
  ScopedVar,
  vectorator,
} from '@grafana/data';
import { DataSourceWithBackend, getTemplateSrv, TemplateSrv } from '@grafana/runtime';
import { lastValueFrom, Observable } from 'rxjs';
import { LogScaleQuery, LogScaleOptions, Repository } from './types';
import { map } from 'rxjs/operators';
import { transformBackendResult } from 'dataLink';

export class DataSource extends DataSourceWithBackend<LogScaleQuery, LogScaleOptions> {
  // This enables default annotation support for 7.2+
  annotations = {};
  defaultRepository: string | undefined = undefined;

  constructor(
    private instanceSettings: DataSourceInstanceSettings<LogScaleOptions>,
    readonly templateSrv: TemplateSrv = getTemplateSrv()
  ) {
    super(instanceSettings);
    this.defaultRepository = instanceSettings.jsonData.defaultRepository;
  }

  query(request: DataQueryRequest<LogScaleQuery>): Observable<DataQueryResponse> {
    return super
      .query(request)
      .pipe(map((response) => transformBackendResult(response, this.instanceSettings.jsonData.dataLinks ?? [])));
  }

  getRepositories(): Promise<Repository[]> {
    return this.getResource('/repositories');
  }

  async metricFindQuery(q: LogScaleQuery, options: any): Promise<MetricFindValue[]> {
    const request = {
      targets: [{ ...q, refId: 'A' }],
      range: options.range,
    } as DataQueryRequest<LogScaleQuery>;
    const results = await lastValueFrom(this.query(request), { defaultValue: null });

    if (!results || !results.data || results.data.length === 0) {
      return [];
    }
    const frame: DataFrame = results.data[0];
    return vectorator(frame.fields[0].values).map((v) => ({ text: v }));
  }

  applyTemplateVariables(query: LogScaleQuery, scopedVars: ScopedVar): Record<string, any> {
    return {
      ...query,
      lsql: getTemplateSrv().replace(query.lsql, scopedVars),
    };
  }
}
