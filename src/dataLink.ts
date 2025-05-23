import { DataFrame, DataLink, Field, FieldType } from '@grafana/data';
import { getDataSourceSrv } from '@grafana/runtime';
import { DataLinkConfig } from './components/DataLinks';

export function getDataLinks(dataFrame: DataFrame, dataLinkConfigs: DataLinkConfig[]): Field[] {
  if (!dataLinkConfigs.length) {
    return [];
  }

  const dataLinks = dataLinkConfigs.map((dl) => {
    return {
      dataLinkConfig: dl,
      newField: dataLinkConfigToDataFrameField(dl),
      lineField: dataFrame.fields.find((f) => f.type === FieldType.string && f.name === dl.field),
    };
  });

  dataLinks.forEach((dl) => {
    dl.lineField?.values.forEach((line) => {
      if (!line) {
        dl.newField.values.push(null);
        return;
      }
      const logMatch = line.match(dl.dataLinkConfig.matcherRegex);
      dl.newField.values.push(logMatch && logMatch[1]);
    });
  });

  return dataLinks.map((f) => f.newField);
}

function dataLinkConfigToDataFrameField(dataLinkConfig: DataLinkConfig): Field<any> {
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
    values: [],
  };
}
