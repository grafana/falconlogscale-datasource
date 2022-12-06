import { HumioDataSource } from 'HumioDataSource';
import React, { useEffect, useState } from 'react';
import { VariableQueryData } from 'types';
import { QueryField, Select } from '@grafana/ui';
import { SelectableValue } from '@grafana/data';

type Props = {
  query: VariableQueryData;
  onChange: (q: VariableQueryData, desc: string) => void;
  datasource: HumioDataSource;
};
type Repository = {
  Name: string
};

export function VariableQueryEditor(props: Props) {
  const { onChange, datasource } = props;
  const [query, setQuery] = useState(!!props.query ? props.query : ({} as VariableQueryData));
  const [repositories, setRepositories] = useState(Array<SelectableValue<string>>);
  
  useEffect(() => {
    datasource.getResource('/repositories').then((result: Repository[]) => {
      const repositories = result.map(({ Name }) => ({ value: Name, label: Name }));

      setRepositories(prevRepositories => [...prevRepositories, ...repositories])
    });
  }, [datasource]);

  const handleVariableQuery = (q: string) => {
    const updated = {...query, query: q}
      setQuery(updated);
      onChange(updated, query.query);
    };

  return (
     <div className="query-editor-row" can-collapse="true">
        <div className="gf-form gf-form--grow flex-shrink-1 min-width-15 explore-input-margin">
          <QueryField
            query={query.query}
            onChange={handleVariableQuery}
            placeholder="Enter a Humio query (run with Shift+Enter)"
            portalOrigin="Humio"
          ></QueryField>
        </div>

        <Select
          width={30}
          options={repositories}
          value={query.repo}
          onChange={(val) => props.onChange({...props.query, repo: val.value!.toString()}, query.repo)}
        ></Select>
      </div>
  );
};
