import React, { useEffect, useState } from 'react';
import { QueryEditorProps, SelectableValue } from '@grafana/data';
import { Select, QueryField } from '@grafana/ui';
import { EditorRows, EditorRow, EditorField } from '@grafana/experimental';
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
  }, [datasource]);

  useEffect(() => {
    if (datasource.defaultRepository && !query.repository) {
      onChange({ ...query, repository: datasource.defaultRepository });
    }
  }, [datasource, onChange, query]);

  return (
    <EditorRows>
      <EditorRow>
        <EditorField label="Query" width={'100%'}>
          <QueryField
            query={query.lsql}
            onChange={(val) => onChange({ ...query, lsql: val })}
            onRunQuery={onRunQuery}
            placeholder="Enter a LogScale query (run with Shift+Enter)"
            portalOrigin="LogScale"
          />
        </EditorField>
      </EditorRow>
      <EditorRow>
        <EditorField label="Repository">
          <Select
            width={30}
            options={repositories}
            value={query.repository}
            onChange={(val) => onChange({ ...query, repository: val.value!.toString() })}
          />
        </EditorField>
      </EditorRow>
    </EditorRows>
  );
}
