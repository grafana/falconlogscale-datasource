import React, { useEffect, useState } from 'react';
import { QueryEditorProps } from '@grafana/data';
import { EditorRow } from '@grafana/experimental';
import { DataSource } from '../../DataSource';
import { FormatAs, LogScaleOptions, LogScaleQuery, LogScaleQueryType } from '../../types';
import { LogScaleQueryEditor } from 'components/QueryEditor/LogScaleQueryEditor';
import { Field, Switch } from '@grafana/ui';

export type Props = QueryEditorProps<DataSource, LogScaleQuery, LogScaleOptions>;

export function QueryEditor(props: Props) {
  const { query, onChange, onRunQuery } = props;
  const [isLogFormat, setIsLogFormat] = useState<boolean>(query.formatAs === FormatAs.Logs);

  // This sets the query type to logs if the user is in Explore and the query type is not set
  useEffect(() => {
    if (props.app === 'explore' && !query.queryType) {
      onChange({ ...query, queryType: LogScaleQueryType.LQL });
      setIsLogFormat(true);
      onRunQuery();
    }
  }, [props.app, query, onChange, onRunQuery]);

  const onFormatAsChange = (val: boolean) => {
    setIsLogFormat(val);
    onChange({ ...query, formatAs: val ? FormatAs.Logs : FormatAs.Metrics });
    onRunQuery();
  };

  return (
    <div>
      <LogScaleQueryEditor {...props} />
      {props.app === 'explore' ? (
        <EditorRow>
          <Field label="Format as logs">
            <Switch
              id="formatLogs"
              value={isLogFormat || false}
              onChange={(e) => onFormatAsChange(e.currentTarget.checked)}
            />
          </Field>
        </EditorRow>
      ) : (
        ''
      )}
    </div>
  );
}
