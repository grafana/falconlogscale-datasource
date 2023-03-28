import React, { useEffect, useState } from 'react';
import { QueryEditorProps, SelectableValue } from '@grafana/data';
import { Select, QueryField, InlineFormLabel } from '@grafana/ui';
import { DataSource } from '../DataSource';
import { LogScaleOptions, LogScaleQuery } from './../types';
import { parseRepositoriesResponse } from '../utils/utils';

export type Props = QueryEditorProps<DataSource, LogScaleQuery, LogScaleOptions>;

export function LogScaleQueryEditor(props: Props) {
  const { datasource, query, onChange, onRunQuery } = props;
  const [repositories, setRepositories] = useState<Array<SelectableValue<string>>>([]);

  useEffect(() => {
    datasource.getRepositories().then((result: string[]) => {
      const repositories = parseRepositoriesResponse(result);
      setRepositories(repositories);
    });
    if (datasource.defaultRepository && !query.repository) {
      onChange({ ...query, repository: datasource.defaultRepository });
    }
  }, [datasource, onChange, query]);

  return (
    <div className="query-editor-row" can-collapse="true">
      <div className="gf-form-inline gf-form-inline--nowrap">
        <div className="gf-form gf-form--grow flex-shrink-1">
          <InlineFormLabel width={6}>Query</InlineFormLabel>
          <QueryField
            query={query.lsql}
            onChange={(val) => onChange({ ...query, lsql: val })}
            onRunQuery={onRunQuery}
            placeholder="Enter a LogScale query (run with Shift+Enter)"
            portalOrigin="LogScale"
          />
        </div>
      </div>

      <div className="gf-form gf-form--grow flex-shrink-1">
        <InlineFormLabel width={6}>Repository</InlineFormLabel>
        <Select
          width={30}
          options={repositories}
          value={query.repository}
          onChange={(val) => onChange({ ...query, repository: val.value!.toString() })}
        />
      </div>
    </div>
  );
}
