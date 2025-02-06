import { SelectableValue } from '@grafana/data';
import { Field, Select } from '@grafana/ui';
import { LogScaleQueryEditor } from 'components/QueryEditor/LogScaleQueryEditor';
import { DataSource } from 'DataSource';
import { selectors } from 'e2e/selectors';
import React from 'react';
import { useEffectOnce } from 'react-use';
import { LogScaleQueryType, LogScaleQuery, FormatAs } from 'types';

export type Props = {
  query: LogScaleQuery;
  onChange: (q: LogScaleQuery) => void;
  datasource: DataSource;
};

const VariableQueryEditor = (props: Props) => {
  const { query, onChange, datasource } = props;
  const VARIABLE_TYPE_OPTIONS = [
    { label: 'Repositories', value: LogScaleQueryType.Repositories },
    { label: 'LQL Query', value: LogScaleQueryType.LQL },
  ];

  const queryType = query.queryType || LogScaleQueryType.LQL;
  const version = query.version || '';

  useEffectOnce(() => {
    if (typeof query === 'string') {
      onChange({
        refId: 'A',
        repository: datasource.defaultRepository ?? '',
        formatAs: FormatAs.Variable,
        lsql: query,
        queryType: LogScaleQueryType.LQL,
        version
      });
    } else if (!query.queryType) {
      onChange({ ...query, queryType: LogScaleQueryType.LQL });
    }
  });

  const onQueryTypeChange = (selectableValue: SelectableValue) => {
    if (selectableValue.value) {
      onChange({
        ...query,
        queryType: selectableValue.value,
        lsql: '',
      });
    }
  };

  return (
    <>
      <Field label="Query Type" data-testid={selectors.components.variableEditor.queryType.input}>
        <Select
          aria-label="select query type"
          onChange={onQueryTypeChange}
          options={VARIABLE_TYPE_OPTIONS}
          width={25}
          value={queryType}
        />
      </Field>
      {query.queryType === LogScaleQueryType.LQL && (
        <LogScaleQueryEditor
          datasource={datasource}
          onChange={onChange}
          onRunQuery={() => onChange(query)}
          query={query ?? {}}
        />
      )}
    </>
  );
};

export default VariableQueryEditor;
