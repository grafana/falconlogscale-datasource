import {
  AbstractQuery,
  DataFrame,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceInstanceSettings,
  DataSourceWithQueryImportSupport,
  MetricFindValue,
  ScopedVars,
} from '@grafana/data';
import { DataSourceWithBackend, getTemplateSrv, TemplateSrv } from '@grafana/runtime';
import { lastValueFrom, Observable } from 'rxjs';
import { LogScaleQuery, LogScaleOptions } from './types';
import { map } from 'rxjs/operators';
import LanguageProvider from 'LanguageProvider';
import { transformBackendResult } from './logs';

export class DataSource
  extends DataSourceWithBackend<LogScaleQuery, LogScaleOptions>
  implements DataSourceWithQueryImportSupport<LogScaleQuery>
{
  // This enables default annotation support for 7.2+
  annotations = {};
  defaultRepository: string | undefined = undefined;

  constructor(
    private instanceSettings: DataSourceInstanceSettings<LogScaleOptions>,
    private readonly templateSrv: TemplateSrv = getTemplateSrv()
  ) {
    super(instanceSettings);
    this.defaultRepository = instanceSettings.jsonData.defaultRepository;
    this.languageProvider = new LanguageProvider(this);
  }

  query(request: DataQueryRequest<LogScaleQuery>): Observable<DataQueryResponse> {
    const { targets } = request;
    if (targets && targets.length > 0) {
      this.ensureRepositories(targets);
    }

    return super
      .query(request)
      .pipe(
        map((response) => transformBackendResult(response, this.instanceSettings.jsonData.dataLinks ?? [], request))
      );
  }

  ensureRepositories(targets: LogScaleQuery[]): void {
    for (const target of targets) {
      if (!target.repository) {
        target.repository = this.defaultRepository ?? '';
      } else if (target.repository === '$defaultRepo' && this.defaultRepository) {
        target.repository = this.defaultRepository;
      }
    }
  }

  getRepositories(): Promise<string[]> {
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
    return frame.fields[0].values.map((v) => ({ text: v }));
  }

  applyTemplateVariables(query: LogScaleQuery, scopedVars: ScopedVars): LogScaleQuery {
    return {
      ...query,
      lsql: this.templateSrv.replace(query.lsql, scopedVars),
    };
  }

  async importFromAbstractQueries(abstractQueries: AbstractQuery[]): Promise<LogScaleQuery[]> {
    return abstractQueries.map((abstractQuery) => this.languageProvider.importFromAbstractQuery(abstractQuery));
  }

  modifyQuery(
    query: LogScaleQuery,
    action: { type: 'ADD_FILTER' | 'ADD_FILTER_OUT'; options: { key: string; value: any } }
  ): LogScaleQuery {
    if (!action.options) {
      return query;
    }
    let expression = query.lsql ?? '';
    switch (action.type) {
      case 'ADD_FILTER': {
        if (expression.length > 0) {
          expression += ' AND ';
        }
        expression += `${action.options.key}="${action.options.value}"`;
        break;
      }
      case 'ADD_FILTER_OUT': {
        if (expression.length > 0) {
          expression += ' AND ';
        }
        expression += `${action.options.key}!="${action.options.value}"`;
        break;
      }
    }
    return { ...query, lsql: expression };
  }
}
