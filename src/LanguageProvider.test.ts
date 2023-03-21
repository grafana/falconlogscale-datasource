import { AbstractLabelOperator, AbstractQuery, DataSourceInstanceSettings, DataSourcePluginMeta, PluginType } from '@grafana/data';

import LanguageProvider from './LanguageProvider';
import { DataSource } from './DataSource';
import { LogScaleOptions, LogScaleQuery } from './types';
import { TemplateSrv } from '@grafana/runtime';

describe('transform abstract query to a LogScale query', () => {
  let datasource: DataSource;
  beforeEach(() => {
    const templateSrvStub = {
      getAdhocFilters: jest.fn(() => []),
      replace: jest.fn((a: string) => a),
    } as unknown as TemplateSrv;

    datasource = createDataSource({}, templateSrvStub);
  });

  it('with labels and a repo', () => {
    const instance = new LanguageProvider(datasource);
    const abstractQuery: AbstractQuery = {
      refId: 'bar',
      labelMatchers: [
        { name: '__name__', operator: AbstractLabelOperator.Equal, value: 'repo' },
        { name: 'label1', operator: AbstractLabelOperator.Equal, value: 'value1' },
        { name: 'label2', operator: AbstractLabelOperator.NotEqual, value: 'value2' },
        { name: 'label3', operator: AbstractLabelOperator.EqualRegEx, value: 'value3' },
        { name: 'label4', operator: AbstractLabelOperator.NotEqualRegEx, value: 'value4' },
      ],
    };
    const result = instance.importFromAbstractQuery(abstractQuery);

    expect(result).toEqual({
      lsql: "label1=\"value1\"\n| label2 != \"value2\"\n| label3 = *value3*\n| label4 != *value4*",
      repository: "repo",
      refId: abstractQuery.refId,
    } as LogScaleQuery);
  });

  it('with a repo', () => {
    const instance = new LanguageProvider(datasource);
    const abstractQuery: AbstractQuery = {
      refId: 'bar',
      labelMatchers: [
        { name: '__name__', operator: AbstractLabelOperator.Equal, value: 'repo' },
      ],
    };
    const result = instance.importFromAbstractQuery(abstractQuery);

    expect(result).toEqual({
      lsql: "",
      repository: "repo",
      refId: abstractQuery.refId,
    } as LogScaleQuery);
  });

  it('with no labels and repo', () => {
    const instance = new LanguageProvider(datasource);
    const abstractQuery = { labelMatchers: [], refId: 'foo' };
    const result = instance.importFromAbstractQuery(abstractQuery);

    expect(result).toEqual({
      refId: abstractQuery.refId,
      lsql: "",
      repository: "",
    } as LogScaleQuery);
  });
});

export function createDataSource(
  settings: Partial<DataSourceInstanceSettings<LogScaleOptions>> = {},
  templateSrv: TemplateSrv
) {
  const { jsonData, ...rest } = settings;

  const instanceSettings: DataSourceInstanceSettings<LogScaleOptions> = {
    id: 1,
    meta: {
      id: 'id',
      name: 'name',
      type: PluginType.datasource,
    } as DataSourcePluginMeta,
    name: 'test-data-source',
    type: 'type',
    uid: 'uid',
    access: 'proxy',
    url: '',
    jsonData: {
      authenticateWithToken: false,
      defaultRepository: '',
      ...jsonData,
    },
    database: '[test-]YYYY.MM.DD',
    ...rest,
  };

  return new DataSource(instanceSettings, templateSrv);
}
