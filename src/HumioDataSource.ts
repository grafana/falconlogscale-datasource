import {
  DataFrame,
  DataQueryRequest,
  DataSourceInstanceSettings,
  MetricFindValue,
  ScopedVar,
  vectorator,
} from '@grafana/data';
import { DataSourceWithBackend, getTemplateSrv, TemplateSrv } from '@grafana/runtime';
import { HumioQuery, HumioOptions } from './types';
//import { lastValueFrom } from 'rxjs'

export class HumioDataSource extends DataSourceWithBackend<HumioQuery, HumioOptions> {
  // This enables default annotation support for 7.2+
  annotations = {};

  constructor(
    instanceSettings: DataSourceInstanceSettings<HumioOptions>,
    readonly templateSrv: TemplateSrv = getTemplateSrv()
  ) {
    super(instanceSettings);
  }

  async metricFindQuery(q: HumioQuery, options: any): Promise<MetricFindValue[]> {
    const request = {
      targets: [{ ...q, refId: 'A' }],
    } as DataQueryRequest<HumioQuery>;
    const results = await this.query(request).toPromise();

    if (!results || !results.data || results.data.length === 0) {
      return [];
    }
    const frame: DataFrame = results!.data[0];
    return vectorator(frame.fields[0].values).map((v) => ({ text: v }));
  }

  applyTemplateVariables(query: HumioQuery, scopedVars: ScopedVar): Record<string, any> {
    return {
      ...query,
      queryString: getTemplateSrv().replace(query.queryString, scopedVars),
    };
  }

  // Formats $var strings in queries. Uses regexes when using multiple selected vars, which right now only works for some kind of filtering, such as host=$hostname
  formatting(vars: any) {
    if (/*_.isString(vars)*/true) {
      // Regular variables are input as strings, while the input is an array when Multi-value variables are used.
      return vars;
    } else if (vars.length === 1) {
      return vars[0];
    } else {
      return '/^' + vars.join('|') + '$/';
    }
  }
}
