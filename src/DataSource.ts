import {
  DataFrame,
  DataQueryRequest,
  DataSourceInstanceSettings,
  MetricFindValue,
  ScopedVar,
  vectorator,
} from '@grafana/data';
import { DataSourceWithBackend, getTemplateSrv, TemplateSrv } from '@grafana/runtime';
import { LogScaleQuery, LogScaleOptions } from './types';

export class DataSource extends DataSourceWithBackend<LogScaleQuery, LogScaleOptions> {
  // This enables default annotation support for 7.2+
  annotations = {};

  constructor(
    instanceSettings: DataSourceInstanceSettings<LogScaleOptions>,
    readonly templateSrv: TemplateSrv = getTemplateSrv()
  ) {
    super(instanceSettings);
  }

  async metricFindQuery(q: LogScaleQuery, options: any): Promise<MetricFindValue[]> {
    const request = {
      targets: [{ ...q, refId: 'A' }],
    } as DataQueryRequest<LogScaleQuery>;
    const results = await this.query(request).toPromise();

    if (!results || !results.data || results.data.length === 0) {
      return [];
    }
    const frame: DataFrame = results!.data[0];
    return vectorator(frame.fields[0].values).map((v) => ({ text: v }));
  }

  applyTemplateVariables(query: LogScaleQuery, scopedVars: ScopedVar): Record<string, any> {
    return {
      ...query,
      lsql: getTemplateSrv().replace(query.lsql, scopedVars),
    };
  }
}
