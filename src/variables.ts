import { CustomVariableSupport, DataQueryRequest, DataQueryResponse, toDataFrame } from '@grafana/data';
import { getTemplateSrv } from '@grafana/runtime';
import VariableQueryEditor from './components/VariableEditor/VariableQueryEditor';
import { DataSource, includeTimeRange } from 'DataSource';
import { Observable, from, lastValueFrom } from 'rxjs';
import { LogScaleQuery, LogScaleQueryType } from 'types';

export class VariableSupport extends CustomVariableSupport<DataSource, LogScaleQuery> {
  templateSrv = getTemplateSrv();

  constructor(private readonly datasource: DataSource) {
    super();
    this.datasource = datasource;
    this.query = this.query.bind(this);
    this.templateSrv = getTemplateSrv();
  }

  editor = VariableQueryEditor;

  query(request: DataQueryRequest<LogScaleQuery>): Observable<DataQueryResponse> {
    const promisedResults = async () => {
      let query = request.targets[0];

      try {
        switch (query.queryType) {
          case LogScaleQueryType.Repositories:
            const repositories = await this.datasource.getRepositories();
            return {
              data: repositories.length ? [toDataFrame(repositories)] : [],
            };
          default:
            const queryRes = await lastValueFrom(
              this.datasource.query(includeTimeRange({ ...request, targets: [query] })),
              {
                defaultValue: null,
              }
            );
            let queryError: undefined | string = undefined;
            if (queryRes?.data && queryRes.data.length) {
              if (queryRes.errors) {
                const errorForRef = queryRes.errors.find((error) => error.refId === query.refId);
                queryError = errorForRef ? errorForRef.message : undefined;
              }
              return {
                data: queryRes.data[0],
                error: queryError ? new Error(queryError) : undefined,
              };
            }

            return {
              data: [],
              error: queryError ? new Error(queryError) : undefined,
            };
        }
      } catch (err) {
        return { data: [], error: new Error(err as string) };
      }
    };

    return from(promisedResults());
  }
}
