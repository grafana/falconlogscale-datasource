import { DataFrame, DataQueryRequest, DataQueryResponse, Field, isDataFrame } from '@grafana/data';
import { getDataLinks } from 'dataLink';
import { DataLinkConfig } from './components/DataLinks';
import { FormatAs, LogScaleQuery } from 'types';

export function transformBackendResult(
  response: DataQueryResponse,
  dataLinkConfigs: DataLinkConfig[],
  request: DataQueryRequest<LogScaleQuery>
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
    data: [...processFrames(dataFrames, dataLinkConfigs, request)],
  };
}

function processFrames(
  frames: DataFrame[],
  dataLinkConfigs: DataLinkConfig[],
  request: DataQueryRequest<LogScaleQuery>
): DataFrame[] {
  return frames.map((frame) => {
    const targetQuery = request.targets.find((x) => x.refId === frame.refId);
    if (!targetQuery || targetQuery.formatAs !== FormatAs.Logs) {
      return {
        ...frame,
        fields: [...orderFields(frame.fields)],
      };
    }
    return {
      ...frame,
      fields: [...orderFields(frame.fields), ...getDataLinks(frame, dataLinkConfigs)],
    };
  });
}

function orderFields(fields: Array<Field<any>>): Array<Field<any>> {
  const rawstringFieldIndex = fields.findIndex((x) => x.name === '@rawstring');
  if (rawstringFieldIndex === -1) {
    return fields;
  }
  const rawstringField = fields.splice(rawstringFieldIndex, 1)[0];
  if (rawstringField) {
    return [rawstringField, ...fields];
  }
  return fields;
}
