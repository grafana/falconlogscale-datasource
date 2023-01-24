import { ArrayVector, DataFrame, DataLink, DataQueryError, DataQueryResponse, Field, FieldType, isDataFrame } from '@grafana/data';
import { getDataSourceSrv } from '@grafana/runtime';
import { DataLinkConfig } from 'grafana-plugin-ui';
import { LogScaleQuery } from 'types';
import { groupBy } from 'lodash';

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
    return {
      ...frame,
      fields: [...frame.fields, ...getDerivedFields(frame, derivedFieldConfigs)],
    }
  });
}

/**
 * Modifies dataframe and adds dataLinks from the config.
 */
export function applyLinksToFrame(dataFrame: DataFrame, dataLinks: DataLinkConfig[]): DataFrame {
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

function getDerivedFields(dataFrame: DataFrame, derivedFieldConfigs: DataLinkConfig[]): Field[] {
  if (!derivedFieldConfigs.length) {
    return [];
  }
  const derivedFieldsGrouped = groupBy(derivedFieldConfigs, 'label');

  const newFields = Object.values(derivedFieldsGrouped).map(fieldFromDerivedFieldConfig);

  // line-field is the first string-field
  // NOTE: we should create some common log-frame-extra-string-field code somewhere
  const lineField = dataFrame.fields.find((f) => f.type === FieldType.string);

  if (lineField === undefined) {
    // if this is happening, something went wrong, let's raise an error
    throw new Error('invalid logs-dataframe, string-field missing');
  }

  lineField.values.toArray().forEach((line) => {
    for (const field of newFields) {
      const logMatch = line.match(derivedFieldsGrouped[field.name][0].matcherRegex);
      field.values.add(logMatch && logMatch[0]);
    }
  });

  return newFields;
}

/**
 * Transform derivedField config into dataframe field with config that contains link.
 */
function fieldFromDerivedFieldConfig(derivedFieldConfigs: DataLinkConfig[]): Field<any, ArrayVector> {
  const dataSourceSrv = getDataSourceSrv();

  const dataLinks = derivedFieldConfigs.reduce((acc, derivedFieldConfig) => {
    // Having field.datasourceUid means it is an internal link.
    if (derivedFieldConfig.datasourceUid) {
      const dsSettings = dataSourceSrv.getInstanceSettings(derivedFieldConfig.datasourceUid);

      acc.push({
        // Will be filled out later
        title: derivedFieldConfig.field || '',
        url: '',
        // This is hardcoded for Jaeger or Zipkin not way right now to specify datasource specific query object
        internal: {
          query: { query: derivedFieldConfig.url },
          datasourceUid: derivedFieldConfig.datasourceUid,
          datasourceName: dsSettings?.name ?? 'Data source not found',
        },
      });
    } else if (derivedFieldConfig.url) {
      acc.push({
        // We do not know what title to give here so we count on presentation layer to create a title from metadata.
        title: derivedFieldConfig.field || '',
        // This is hardcoded for Jaeger or Zipkin not way right now to specify datasource specific query object
        url: derivedFieldConfig.url,
      });
    }
    return acc;
  }, [] as DataLink[]);

  return {
    name: derivedFieldConfigs[0].label,
    type: FieldType.string,
    config: {
      links: dataLinks,
    },
    // We are adding values later on
    values: new ArrayVector<string>([]),
  };
}
