import React, { useEffect, useMemo, useState } from 'react';
import { QueryEditorProps, SelectableValue, toOption } from '@grafana/data';
import { Select, QueryField } from '@grafana/ui';
import { EditorRows, EditorRow, EditorField } from '@grafana/plugin-ui';
import { DataSource } from '../../DataSource';
import { LogScaleOptions, LogScaleQuery } from '../../types';
import { parseRepositoriesResponse } from '../../utils/utils';
import { selectors } from 'e2e/selectors';

export type Props = QueryEditorProps<DataSource, LogScaleQuery, LogScaleOptions>;

export function LogScaleQueryEditor(props: Props) {
  const { datasource, query, onChange, onRunQuery } = props;
  const [repositories, setRepositories] = useState<Array<SelectableValue<string>>>([]);

  const variableOptionGroup = useMemo(
    () => ({
      label: 'Template Variables',
      expanded: false,
      options: datasource.getVariables().map(toOption),
    }),
    [datasource]
  );

  useEffect(() => {
    datasource.getRepositories().then((result: string[]) => {
      const repositories = parseRepositoriesResponse(result);
      repositories.unshift({ label: `$defaultRepo (${datasource.defaultRepository})`, value: '$defaultRepo' });
      setRepositories([
        {
          label: 'Template Variables',
          options: variableOptionGroup.options,
        },
        ...repositories,
      ]);
    });
  }, [datasource, variableOptionGroup]);

  useEffect(() => {
    if (datasource.defaultRepository && !query.repository) {
      onChange({ ...query, repository: datasource.defaultRepository });
    }
  }, [datasource, onChange, query]);

  return (
    <EditorRows>
      <EditorRow>
        <EditorField label="Query" width={'100%'} data-testid={selectors.components.queryEditor.queryField.input}>
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
            data-testid={selectors.components.queryEditor.repository.input}
          />
        </EditorField>
      </EditorRow>
    </EditorRows>
  );
}
