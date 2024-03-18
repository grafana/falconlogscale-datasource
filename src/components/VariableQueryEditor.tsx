import { DataSource } from 'DataSource';
import React from 'react';
import { LogScaleQuery } from 'types';
import { LogScaleQueryEditor } from 'components/LogScaleQueryEditor';

export type Props = {
  query: LogScaleQuery;
  onChange: (q: LogScaleQuery) => void;
  datasource: DataSource;
};

export function VariableQueryEditor(props: Props) {
  const { onChange, datasource, query } = props;

  return (
    <LogScaleQueryEditor
      datasource={datasource}
      onChange={onChange}
      onRunQuery={() => onChange(query)}
      query={query ?? {}}
    />
  );
}
