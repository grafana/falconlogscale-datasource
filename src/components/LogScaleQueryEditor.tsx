import React, { useEffect, useState } from 'react';
import { SelectableValue } from '@grafana/data';
import { Select, QueryField } from '@grafana/ui';
import { DataSource } from '../DataSource';
import { LogScaleQuery } from './../types';

export type Props = {
  datasource: DataSource;
  onChange: (q: LogScaleQuery) => void;
  runQuery: () => void;
  query: LogScaleQuery;
};

export type Repository = {
  Name: string;
};

export function LogScaleQueryEditor(props: Props) {
  const { datasource, query, onChange, runQuery } = props;
  const [repositories, setRepositories] = useState(Array<SelectableValue<string>>);

  useEffect(() => {
    datasource.getResource('/repositories').then((result: Repository[]) => {
      const repositories = result.map(({ Name }) => ({ value: Name, label: Name }));
      setRepositories((prevRepositories) => [...prevRepositories, ...repositories]);
    });
  }, [datasource]);

  return (
    <div className="query-editor-row" can-collapse="true">
      <div className="gf-form gf-form--grow flex-shrink-1 min-width-15 explore-input-margin">
        <QueryField
          query={query.lsql}
          onChange={(val) => onChange({ ...query, lsql: val })}
          onBlur={runQuery}
          onRunQuery={runQuery}
          placeholder="Enter a LogScale query (run with Shift+Enter)"
          portalOrigin="LogScale"
        />
      </div>

      <Select
        width={30}
        options={repositories}
        value={query.repository}
        onChange={(val) => onChange({ ...query, repository: val.value!.toString() })}
      />
    </div>
  );
}
