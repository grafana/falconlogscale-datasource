import { DataFrame, DataLink, DataQueryResponse, isDataFrame } from '@grafana/data';
import { getDataSourceSrv } from '@grafana/runtime';
import { DataLinkConfig } from 'plugin-ui';

export function transformBackendResult(
  response: DataQueryResponse,
  derivedFieldConfigs: DataLinkConfig[]
): DataQueryResponse {
  const { data } = response;

  const dataFrames = data.map((d) => {
    if (!isDataFrame(d)) {
      throw new Error('transformation only supports dataframe responses');
    }
    return d;
  });

  return {
    ...response,
    //error: improveError(error, queryMap),
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
