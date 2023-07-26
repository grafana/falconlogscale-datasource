import {
  AbstractQuery,
  DataFrame,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceInstanceSettings,
  DataSourceWithQueryImportSupport,
  MetricFindValue,
  QueryFixAction,
  ScopedVar,
  vectorator,
} from '@grafana/data';
import { DataSourceWithBackend, getTemplateSrv, TemplateSrv } from '@grafana/runtime';
import { lastValueFrom, Observable } from 'rxjs';
import { LogScaleQuery, LogScaleOptions } from './types';
import { map } from 'rxjs/operators';
import LanguageProvider from 'LanguageProvider';
import { transformBackendResult } from './logs';

export class DataSource extends DataSourceWithBackend<LogScaleQuery, LogScaleOptions> implements DataSourceWithQueryImportSupport<LogScaleQuery> {
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
    if (request.targets) {
      const hasRepositories = request.targets.every((req) => req.repository);
      if (!hasRepositories) {
        for (const query of request.targets) {
          if (!query.repository) {
            query.repository = this.defaultRepository ?? '';
          }
        }
      }
    }

    return super
      .query(request)
      .pipe(map((response) => transformBackendResult(response, this.instanceSettings.jsonData.dataLinks ?? [], request)));
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
    return vectorator(frame.fields[0].values).map((v) => ({ text: v }));
  }

  applyTemplateVariables(query: LogScaleQuery, scopedVars: ScopedVar): Record<string, any> {
    return {
      ...query,
      lsql: this.templateSrv.replace(query.lsql, scopedVars),
    };
  }

  async importFromAbstractQueries(abstractQueries: AbstractQuery[]): Promise<LogScaleQuery[]> {
    return abstractQueries.map((abstractQuery) => this.languageProvider.importFromAbstractQuery(abstractQuery));
  }

  // By implementing getTagKeys and getTagValues we add ad-hoc filters functionality
  async getTagKeys() {
    return await this.labelNamesQuery();
  }

  async getTagValues(options: any = {}) {
    return await this.labelValuesQuery(options.key);
  }

  async labelNamesQuery() {
    const url = 'labels';
    const params = this.getTimeRangeParams();
    const result = await this.metadataRequest(url, params);
    return result.map((value: string) => ({ text: value }));
  }

  async labelValuesQuery(label: string) {
    const params = this.getTimeRangeParams();
    const url = `label/${label}/values`;
    const result = await this.metadataRequest(url, params);
    return result.map((value: string) => ({ text: value }));
  }

  getTimeRangeParams() {
    const timeRange = this.getTimeRange();
    return { start: timeRange.from.valueOf() * NS_IN_MS, end: timeRange.to.valueOf() * NS_IN_MS };
  }

  async metadataRequest(url: string, params?: Record<string, string | number>) {
    // url must not start with a `/`, otherwise the AJAX-request
    // going from the browser will contain `//`, which can cause problems.
    if (url.startsWith('/')) {
      throw new Error(`invalid metadata request url: ${url}`);
    }

    const res = await this.getResource(url, params);
    return res.data || [];
  }

  modifyQuery(query: LogScaleQuery, action: QueryFixAction): LogScaleQuery {
    let expression = query.expr ?? '';
    switch (action.type) {
      case 'ADD_FILTER': {
        if (action.options?.key && action.options?.value) {
          const value = escapeLabelValueInSelector(action.options.value);
          expression = addLabelToQuery(expression, action.options.key, '=', value);
        }
        break;
      }
      case 'ADD_FILTER_OUT': {
        if (action.options?.key && action.options?.value) {
          const value = escapeLabelValueInSelector(action.options.value);
          expression = addLabelToQuery(expression, action.options.key, '!=', value);
        }
        break;
      }
      case 'ADD_LOGFMT_PARSER': {
        expression = addParserToQuery(expression, 'logfmt');
        break;
      }
      case 'ADD_JSON_PARSER': {
        expression = addParserToQuery(expression, 'json');
        break;
      }
      case 'ADD_UNPACK_PARSER': {
        expression = addParserToQuery(expression, 'unpack');
        break;
      }
      case 'ADD_NO_PIPELINE_ERROR': {
        expression = addNoPipelineErrorToQuery(expression);
        break;
      }
      case 'ADD_LEVEL_LABEL_FORMAT': {
        if (action.options?.originalLabel && action.options?.renameTo) {
          expression = addLabelFormatToQuery(expression, {
            renameTo: action.options.renameTo,
            originalLabel: action.options.originalLabel,
          });
        }
        break;
      }
      case 'ADD_LABEL_FILTER': {
        const parserPositions = getParserPositions(query.expr);
        const labelFilterPositions = getLabelFilterPositions(query.expr);
        const lastPosition = findLastPosition([...parserPositions, ...labelFilterPositions]);
        const filter = toLabelFilter('', '', '=');
        expression = addFilterAsLabelFilter(expression, [lastPosition], filter);
        break;
      }
      case 'ADD_LINE_FILTER': {
        expression = addLineFilter(expression);
        break;
      }
      default:
        break;
    }
    return { ...query, expr: expression };
  }
}
