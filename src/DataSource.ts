import {
  AbstractQuery,
  AnnotationQuery,
  DataFrame,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceInstanceSettings,
  DataSourceWithQueryImportSupport,
  LiveChannelScope,
  MetricFindValue,
  ScopedVars,
  VariableSupportType,
} from '@grafana/data';
import { config, DataSourceWithBackend, getGrafanaLiveSrv, getTemplateSrv, TemplateSrv } from '@grafana/runtime';
import VariableQueryEditor from 'components/VariableEditor/VariableQueryEditor';
import LanguageProvider from 'LanguageProvider';
import { uniqueId } from 'lodash';
import { migrateQuery } from 'migrations';
import { defer, lastValueFrom, merge, mergeMap, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { getLiveStreamKey } from 'streaming';
import { pluginVersion } from 'utils/version';
import { transformBackendResult } from './logs';
import { DEFAULT_OVERLAP_WINDOW, isEligibleForIncremental, QueryCache } from './incrementalQuery';
import { DataSourceMode, FormatAs, LogScaleOptions, LogScaleQuery, LogScaleQueryType, NGSIEMRepos } from './types';

export class DataSource
  extends DataSourceWithBackend<LogScaleQuery, LogScaleOptions>
  implements DataSourceWithQueryImportSupport<LogScaleQuery>
{
  // This enables default annotation support for 7.2+
  annotations = {
    prepareAnnotation: (annotation: AnnotationQuery<LogScaleQuery>) => {
      if (annotation.target?.queryType !== LogScaleQueryType.LQL) {
        return {
          ...annotation,
          target: {
            repository: '',
            lsql: '',
            queryType: LogScaleQueryType.LQL,
            formatAs: FormatAs.Logs,
            version: pluginVersion,
            refId: annotation.target?.refId || 'LogscaleDS-Annotation',
          },
        };
      }

      return annotation;
    },
  };
  defaultRepository: string | undefined = undefined;
  private incrementalCache: QueryCache;

  constructor(
    private readonly instanceSettings: DataSourceInstanceSettings<LogScaleOptions>,
    private readonly templateSrv: TemplateSrv = getTemplateSrv()
  ) {
    super(instanceSettings);
    this.incrementalCache = new QueryCache(
      instanceSettings.jsonData.incrementalQueryOverlapWindow ?? DEFAULT_OVERLAP_WINDOW
    );
    this.defaultRepository = instanceSettings.jsonData.defaultRepository;
    this.languageProvider = new LanguageProvider(this);
    this.variables = {
      getType: () => VariableSupportType.Custom,
      editor: VariableQueryEditor as any,
      query: (request: DataQueryRequest<LogScaleQuery>) => {
        // Make sure that every query has a refId
        const queries = request.targets.map((query) => {
          return { ...query, refId: query.refId || uniqueId('tempVar') };
        });
        return this.query({ ...request, targets: queries });
      },
    };
  }

  isIncrementalQueryingEnabled(): boolean {
    return this.instanceSettings.jsonData.incrementalQuerying ?? false;
  }

  query(request: DataQueryRequest<LogScaleQuery>): Observable<DataQueryResponse> {
    if (request.targets[0].live) {
      request.liveStreaming = true;
    }
    if (request.liveStreaming) {
      return this.runLiveQuery(request);
    }

    const { targets } = request;
    if (targets && targets.length > 0) {
      this.ensureRepositories(targets);
    }

    request.targets = request.targets.map((t) => ({
      ...migrateQuery(t),
      intervalMs: request.intervalMs,
    }));

    const useIncremental =
      this.instanceSettings.jsonData.incrementalQuerying &&
      !config.publicDashboardAccessToken;

    if (useIncremental) {
      return this.runIncrementalQuery(request);
    }

    return super
      .query(request)
      .pipe(
        map((response) => transformBackendResult(response, this.instanceSettings.jsonData.dataLinks ?? [], request))
      );
  }

  private runQuery(request: DataQueryRequest<LogScaleQuery>): Observable<DataQueryResponse> {
    return super
      .query(request)
      .pipe(
        map((response) => transformBackendResult(response, this.instanceSettings.jsonData.dataLinks ?? [], request))
      );
  }

  private runIncrementalQuery(request: DataQueryRequest<LogScaleQuery>): Observable<DataQueryResponse> {
    const ineligible = request.targets.filter((t) => !isEligibleForIncremental(t));
    const eligible = request.targets.filter((t) => isEligibleForIncremental(t));

    const requestInfo = this.incrementalCache.requestInfo({ ...request, targets: eligible });
    const incrementalResponse = this.runQuery({ ...requestInfo.request, targets: eligible }).pipe(
      map((response) => ({
        ...response,
        data: this.incrementalCache.procFrames(request, requestInfo, response.data),
      }))
    );

    if (ineligible.length === 0) {
      return incrementalResponse;
    }

    const fullRangeResponse = this.runQuery({ ...request, targets: ineligible });
    return merge(incrementalResponse, fullRangeResponse);
  }

  runLiveQuery(request: DataQueryRequest<LogScaleQuery>): Observable<DataQueryResponse> {
    const ds = this;

    const observables = request.targets.map((query, index) => {
      return defer(() => getLiveStreamKey(query)).pipe(
        mergeMap((key) => {
          return getGrafanaLiveSrv().getDataStream({
            addr: {
              scope: LiveChannelScope.DataSource,
              namespace: ds.uid,
              path: `tail/${key}`,
              data: {
                ...query,
              },
            },
          });
        })
      );
    });

    return merge(...observables);
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

  async getRepositories(): Promise<string[]> {
    if (this.instanceSettings.jsonData.mode === DataSourceMode.NGSIEM) {
      return NGSIEMRepos;
    }

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
      repository: this.templateSrv.replace(query.repository, scopedVars),
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

  getVariables() {
    return this.templateSrv.getVariables().map((v) => `$${v.name}`);
  }
}
