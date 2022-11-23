import {
  DataSourceInstanceSettings,
  DataQuery,
  MetricFindValue,
} from '@grafana/data';
import { DataSourceWithBackend, getTemplateSrv, TemplateSrv } from '@grafana/runtime';
import { HumioOptions } from './types';
import _ from 'lodash';

export interface HumioQuery extends DataQuery {
  humioQuery: string;
  humioRepository?: string;
  annotationText?: string;
  annotationQuery?: string;
}

export class HumioDataSource extends DataSourceWithBackend<HumioQuery, HumioOptions> {
  // This enables default annotation support for 7.2+
  annotations = {};

  constructor(
    instanceSettings: DataSourceInstanceSettings<HumioOptions>,
    readonly templateSrv: TemplateSrv = getTemplateSrv()
  ) {
    super(instanceSettings);
  }

  async metricFindQuery(query: any, options: any): Promise<MetricFindValue[]> {
    return [];
  }

  // query(request: DataQueryRequest<HumioQuery>): Observable<DataQueryResponse> {
  //   request.targets = request.targets.filter((t) => !t.hide);
  //   if (request.targets.length <= 0) {
  //     return of({ data: [] });
  //   }
  //   //return runQuery(this)(request);
  //   return of({ data: [] });
  // }

  // Formats $var strings in queries. Uses regexes when using multiple selected vars, which right now only works for some kind of filtering, such as host=$hostname
  formatting(vars: any) {
    if (_.isString(vars)) {
      // Regular variables are input as strings, while the input is an array when Multi-value variables are used.
      return vars;
    } else if (vars.length === 1) {
      return vars[0];
    } else {
      return '/^' + vars.join('|') + '$/';
    }
  }
}
