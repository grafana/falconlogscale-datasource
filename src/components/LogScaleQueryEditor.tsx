import React, { useEffect, useState } from 'react';
import { SelectableValue } from '@grafana/data';
import { Select, QueryField } from '@grafana/ui';
import { HumioDataSource } from './../HumioDataSource';
import { HumioQuery } from './../types';

type Props = {
  datasource: HumioDataSource;
  onChange: (q: HumioQuery) => void;
  runQuery: () => void;
  query: HumioQuery;
}

type Repository = {
  Name: string
};

export function LogScaleQueryEditor(props: Props) {
  const { datasource } = props;
  const [repositories, setRepositories] = useState(Array<SelectableValue<string>>);
  
  useEffect(() => {
    datasource.getResource('/repositories').then((result: Repository[]) => {
      const repositories = result.map(({ Name }) => ({ value: Name, label: Name }));

      setRepositories(prevRepositories => [...prevRepositories, ...repositories])
    });
  }, [datasource]);

    return (
      <div className="query-editor-row" can-collapse="true">
        <div className="gf-form gf-form--grow flex-shrink-1 min-width-15 explore-input-margin">
          <QueryField
            query={props.query.queryString}
            onChange={(val) => props.onChange({...props.query, queryString: val})}
            onBlur={props.runQuery}
            onRunQuery={props.runQuery}
            placeholder="Enter a Humio query (run with Shift+Enter)"
            portalOrigin="Humio"
          />
        </div>

        <Select
          width={30}
          options={repositories}
          value={props.query.repository}
          onChange={(val) => props.onChange({...props.query, repository: val.value!.toString()})}
        />
      </div>
    );
}
