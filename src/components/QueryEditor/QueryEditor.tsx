import React, { useEffect, useState } from 'react';
import { QueryEditorProps } from '@grafana/data';
import { EditorField, EditorRow } from '@grafana/plugin-ui';
import { DataSource } from '../../DataSource';
import { FormatAs, LogScaleOptions, LogScaleQuery, LogScaleQueryType } from '../../types';
import { LogScaleQueryEditor } from 'components/QueryEditor/LogScaleQueryEditor';
import { Field, Switch } from '@grafana/ui';
import { pluginVersion } from 'utils/version';

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

  useEffect(() => {
    if (!query.version) {
      onChange({ ...query, version: pluginVersion });
    }
  }, [query, onChange]);

  const onFormatAsChange = (val: boolean) => {
    setIsLogFormat(val);
    onChange({ ...query, formatAs: val ? FormatAs.Logs : FormatAs.Metrics });
    onRunQuery();
  };

  const onLiveQueryChange = () => {
    query.live = !query.live;
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
      {props.app === 'panel-editor' ? (
        <div style={{ padding: '5px 0 0 0' }}>
          <EditorRow>
            <EditorField label="Enable live querying">
              <Switch id="liveQuerying" value={query.live || false} onChange={onLiveQueryChange} />
            </EditorField>
          </EditorRow>
        </div>
      ) : (
        ''
      )}
    </div>
  );
}
