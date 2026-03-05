import {
  AbstractQuery,
  AnnotationQuery,
  DataFrame,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceInstanceSettings,
  DataSourceWithQueryImportSupport,
  dateTime,
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
import { map, tap } from 'rxjs/operators';
import { getLiveStreamKey } from 'streaming';
import { pluginVersion } from 'utils/version';
import { transformBackendResult } from './logs';
import {
  CacheEntry,
  IncrementalQueryCache,
  isCacheValid,
  isEligibleForIncremental,
  mergeWithCache,
  parseDuration,
  schemasMatch,
} from './incrementalQuery';
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
  private incrementalCache = new IncrementalQueryCache();

  constructor(
    readonly instanceSettings: DataSourceInstanceSettings<LogScaleOptions>,
    private readonly templateSrv: TemplateSrv = getTemplateSrv()
  ) {
    super(instanceSettings);
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
      typeof request.rangeRaw?.from === 'string' &&
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
    const overlapMs = parseDuration(this.instanceSettings.jsonData.incrementalQueryOverlapWindow ?? '10m');
    const requestFromMs = request.range.from.valueOf();
    const requestToMs = request.range.to.valueOf();

    type CacheHit = { target: LogScaleQuery; entry: CacheEntry; key: string };
    const cacheHits: CacheHit[] = [];
    const cacheMisses: LogScaleQuery[] = [];

    for (const target of request.targets) {
      if (!isEligibleForIncremental(target)) {
        cacheMisses.push(target);
        continue;
      }
      const key = this.incrementalCache.buildKey(target);
      const entry = this.incrementalCache.get(key);
      if (entry && isCacheValid(entry, target, requestFromMs)) {
        cacheHits.push({ target, entry, key });
      } else {
        this.incrementalCache.delete(key);
        cacheMisses.push(target);
      }
    }

    const observables: Array<Observable<DataQueryResponse>> = [];

    if (cacheMisses.length > 0) {
      observables.push(
        this.runQuery({ ...request, targets: cacheMisses }).pipe(
          tap((response) => {
            for (const target of cacheMisses) {
              if (!isEligibleForIncremental(target)) {
                continue;
              }
              const frames = response.data.filter(
                (f) => (f as DataFrame).refId === target.refId
              ) as DataFrame[];
              if (frames.length > 0) {
                this.incrementalCache.set(this.incrementalCache.buildKey(target), {
                  frames,
                  cachedFrom: requestFromMs,
                  cachedTo: requestToMs,
                  lsql: target.lsql,
                  repository: target.repository,
                });
              }
            }
          })
        )
      );
    }

    if (cacheHits.length > 0) {
      const cutoffMs = Math.min(...cacheHits.map(({ entry }) => entry.cachedTo - overlapMs));
      const adjustedRequest = {
        ...request,
        targets: cacheHits.map(({ target }) => target),
        range: { ...request.range, from: dateTime(cutoffMs) },
      };

      console.log("from: " + adjustedRequest.range.from.toDate() + " to: " + adjustedRequest.range.to.toDate() + " range: " + adjustedRequest.range.to.diff(adjustedRequest.range.from, 's'));
      observables.push(
        this.runQuery(adjustedRequest).pipe(
          map((response) => {
            const mergedData = response.data.map((frame) => {
              const hit = cacheHits.find((c) => c.target.refId === (frame as DataFrame).refId);
              if (!hit) {
                return frame;
              }
              const cachedFrame = hit.entry.frames.find((f) => f.refId === (frame as DataFrame).refId);
              if (cachedFrame && !schemasMatch(cachedFrame, frame as DataFrame)) {
                // Schema changed: invalidate cache so next refresh is a full re-query.
                this.incrementalCache.delete(hit.key);
                return frame;
              }
              console.log("merged data length  fields: " + frame.fields.length + " values: " +  frame.fields[0].values.length)
              console.log("merged data length  fields: " + hit.entry.frames[0].fields.length + " values: " +  hit.entry.frames[0].fields[0].values.length)
              const merged = mergeWithCache(hit.entry, [frame as DataFrame], cutoffMs, requestFromMs);
              return merged[0] ?? frame;
            });
            return { ...response, data: mergedData };
          }),
          tap((response) => {
            for (const { target, entry, key } of cacheHits) {
              if (!this.incrementalCache.get(key)) {
                // Entry was deleted in map due to schema change; skip re-caching.
                continue;
              }
              const frames = response.data.filter(
                (f) => (f as DataFrame).refId === target.refId
              ) as DataFrame[];
              if (frames.length > 0) {
                console.log("frames length fields: " + frames[0].fields.length + " values: " +  frames[0].fields[0].values.length);
                this.incrementalCache.set(key, {
                  frames,
                  cachedFrom: entry.cachedFrom,
                  cachedTo: requestToMs,
                  lsql: target.lsql,
                  repository: target.repository,
                });
              }
            }
          })
        )
      );
    }

    return merge(...observables);
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
