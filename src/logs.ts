import { DataFrame, DataQueryRequest, DataQueryResponse, Field, isDataFrame, Vector } from "@grafana/data";
import { getDataLinks } from "dataLink";
import { DataLinkConfig } from "grafana-plugin-ui";
import { LogScaleQuery } from "types";

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

function processFrames(frames: DataFrame[], dataLinkConfigs: DataLinkConfig[], request: DataQueryRequest<LogScaleQuery>): DataFrame[] {
  return frames.map((frame) => {
    const targetQuery = request.targets.find(x => x.refId === frame.refId);
    if (!targetQuery || targetQuery.queryType !== "logs") {
      return frame;
    }
    return {
      ...frame,
      fields: [...orderFields(frame.fields), ...getDataLinks(frame, dataLinkConfigs)],
    }
  });
}

function orderFields(fields: Field<any, Vector<any>>[]): Field<any, Vector<any>>[] {
  const rawstringField = fields.find(x => x.name === "@rawstring");
  if (rawstringField) {
    return [rawstringField, ...fields]
  }
  return fields;
}