import { HumioDataSource } from 'HumioDataSource';
import React, { ChangeEvent, useEffect, useState } from 'react';
import { HumioQuery } from 'types';
import { InlineField, Select, LegacyForms } from '@grafana/ui';
import { SelectableValue } from '@grafana/data';

const { FormField } = LegacyForms;

type Props = {
  query: HumioQuery;
  onChange: (q: HumioQuery, desc: string) => void;
  datasource: HumioDataSource;
};
type Repository = {
  Name: string
};

export function VariableQueryEditor(props: Props) {
  const { onChange, datasource } = props;
  const [query, setQuery] = useState(props.query || {} as HumioQuery);
  const [repositories, setRepositories] = useState(Array<SelectableValue<string>>);
  
  useEffect(() => {
    datasource.getResource('/repositories').then((result: Repository[]) => {
      const repositories = result.map(({ Name }) => ({ value: Name, label: Name }));

      setRepositories(prevRepositories => [...prevRepositories, ...repositories])
    });
  }, [datasource]);

  const handleVariableQuery = (event: ChangeEvent<HTMLInputElement>) => {
    const updated: HumioQuery = {...query, queryString: event.target.value}
      setQuery(updated);
      props.onChange(updated, query.queryString);
    };

  return (
     <div className="query-editor-row" can-collapse="true">
       <InlineField label="Query" labelWidth={17} grow>
          <FormField
            value={query.queryString}
            onBlur={handleVariableQuery}
            onChange={handleVariableQuery}
            placeholder="Enter a Humio query (run with Shift+Enter)" 
            label={'Humio query'}
            />
          </InlineField>

        <Select
          width={30}
          options={repositories}
          value={query.repository}
          onChange={(val) => onChange({...props.query, repository: val.value!.toString()}, query.repository)}
        ></Select>
      </div>
  );
};
