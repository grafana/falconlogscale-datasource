import { DataFrame, DataLink, DataQueryError, DataQueryResponse, isDataFrame } from '@grafana/data';
import { getDataSourceSrv } from '@grafana/runtime';
import { DataLinkConfig } from 'grafana-plugin-ui';
import { LogScaleQuery } from 'types';

export function transformBackendResult(
  response: DataQueryResponse,
  queries: LogScaleQuery[],
  derivedFieldConfigs: DataLinkConfig[]
): DataQueryResponse {
  const { data, error } = response;

  const dataFrames = data.map((d) => {
    if (!isDataFrame(d)) {
      throw new Error('transformation only supports dataframe responses');
    }
    return d;
  });

  const queryMap = new Map(queries.map((query) => [query.refId, query]));

  return {
    ...response,
    error: improveError(error, queryMap),
    data: [...processStreamsFrames(dataFrames, derivedFieldConfigs)],
  };
}

function processStreamsFrames(frames: DataFrame[], derivedFieldConfigs: DataLinkConfig[]): DataFrame[] {
  return frames.map((frame) => {
    return applyLinksToFrame(frame, derivedFieldConfigs);
  });
}

/**
 * Modifies dataframe and adds dataLinks from the config.
 */
export function applyLinksToFrame(dataFrame: DataFrame, dataLinks: DataLinkConfig[]) {
  const dataSourceSrv = getDataSourceSrv();
  if (dataLinks.length) {
    for (const dataLink of dataLinks) {
      const fieldForLink = dataFrame.fields.find((field) => dataLink.label && field.name === dataLink.label);

      if (fieldForLink) {
        let link: DataLink = {
          title: '',
          url: dataLink.url,
        };

        if (dataLink.datasourceUid) {
          const dsSettings = dataSourceSrv.getInstanceSettings(dataLink.datasourceUid);
          link = {
            title: '',
            url: '',
            internal: {
              query: { query: dataLink.url },
              datasourceName: dsSettings?.name ?? dataLink.label,
              datasourceUid: dataLink.datasourceUid,
            },
          };
        }

        fieldForLink.config = fieldForLink.config || {};
        fieldForLink.config.links = [...(fieldForLink.config.links || []), link];
      }
    }
  }
  return dataFrame;
}


function improveError(error: DataQueryError | undefined, queryMap: Map<string, LogScaleQuery>): DataQueryError | undefined {
  // many things are optional in an error-object, we need an error-message to exist,
  // and we need to find the query, based on the refId in the error-object.
  if (error === undefined) {
    return error;
  }

  const { refId, message } = error;
  if (refId === undefined || message === undefined) {
    return error;
  }

  const query = queryMap.get(refId);
  if (query === undefined) {
    return error;
  }

  return error;
}
