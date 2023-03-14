import { AbstractLabelMatcher, AbstractLabelOperator, AbstractQuery, LanguageProvider } from "@grafana/data";
import { LogScaleQuery } from "types";
import { DataSource } from "./DataSource";

export default class FalconLogScaleLanguageProvider extends LanguageProvider {
  datasource: DataSource
  declare request: (url: string, params?: any) => Promise<any>;
  declare start: () => Promise<Array<Promise<any>>>;

  constructor(datasource: DataSource, initialValues?: any) {
    super();
    this.datasource = datasource;

    Object.assign(this, initialValues);
  }

  importFromAbstractQuery(abstractQuery: AbstractQuery): LogScaleQuery {
    return {
      repository: abstractQuery.labelMatchers.find(x => x.name === '__name__')?.value || '',
      lsql: this.getQuery(abstractQuery.labelMatchers),
      refId: abstractQuery.refId,
    };
  }

  getQuery(labels: AbstractLabelMatcher[]): string {
    return labels
      .map((label) => {
        if (label.name === '__name__') {
          return;
        }
        switch (label.operator) {
          case AbstractLabelOperator.Equal: {
            return label.name + '="' + label.value + '"';
          }
          case AbstractLabelOperator.NotEqual: {
            return `${label.name} != "${label.value}"`;
          }
          case AbstractLabelOperator.EqualRegEx: {
            return `${label.name} = *${label.value}*`;
          }
          case AbstractLabelOperator.NotEqualRegEx: {
            return `${label.name} != *${label.value}*`;
          }
        }
      })
      .filter(x => x)
      .join('\n| ');
  }
}
