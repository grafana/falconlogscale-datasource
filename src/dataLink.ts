import { ArrayVector, DataFrame, DataLink, DataQueryResponse, Field, FieldType, isDataFrame } from '@grafana/data';
import { getDataSourceSrv } from '@grafana/runtime';
import { DataLinkConfig } from 'grafana-plugin-ui';

export function transformBackendResult(
  response: DataQueryResponse,
  dataLinkConfigs: DataLinkConfig[]
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
    data: [...processFrames(dataFrames, dataLinkConfigs)],
  };
}

function processFrames(frames: DataFrame[], dataLinkConfigs: DataLinkConfig[]): DataFrame[] {
  return frames.map((frame) => {
    return {
      ...frame,
      fields: [...frame.fields, ...getDataLinks(frame, dataLinkConfigs)],
    }
  });
}

export function getDataLinks(dataFrame: DataFrame, dataLinkConfigs: DataLinkConfig[]): Field[] {
  if (!dataLinkConfigs.length) {
    return [];
  }

  const dataLinks = dataLinkConfigs.map(dl => {
    return {
      dataLinkConfig: dl,
      newField: dataLinkConfigToDataFrameField(dl),
      lineField: dataFrame.fields.find((f) => f.type === FieldType.string && f.name === dl.field),
    }
  });

  dataLinks.forEach((dl) => {
    dl.lineField?.values.toArray().forEach((line) => {
      const logMatch = line.match(dl.dataLinkConfig.matcherRegex);
      dl.newField.values.add(logMatch && logMatch[1]);
    })
  });

  return dataLinks.map(f => f.newField);
}

function dataLinkConfigToDataFrameField(dataLinkConfig: DataLinkConfig): Field<any, ArrayVector> {
  const dataSourceSrv = getDataSourceSrv();

  let dataLink = {} as DataLink;
  if (dataLinkConfig.datasourceUid) {
    const dsSettings = dataSourceSrv.getInstanceSettings(dataLinkConfig.datasourceUid);

    dataLink = {
      title: '',
      url: '',
      internal: {
        query: { query: dataLinkConfig.url },
        datasourceUid: dataLinkConfig.datasourceUid,
        datasourceName: dsSettings?.name ?? dataLinkConfig.label,
      },
    };
  } else if (dataLinkConfig.url) {
    dataLink = {
      title: '',
      url: dataLinkConfig.url,
    };
  }
  return {
    name: dataLinkConfig.label,
    type: FieldType.string,
    config: {
      links: [dataLink],
    },
    // We are adding values later on
    values: new ArrayVector<string>([]),
  };
}