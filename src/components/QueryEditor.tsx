import React, { useState } from 'react';
import { QueryEditorProps } from '@grafana/data';
import { DataSource } from '../DataSource';
import { LogScaleOptions, LogScaleQuery } from '../types';
import { LogScaleQueryEditor } from 'components/LogScaleQueryEditor';
import { InlineSwitch } from '@grafana/ui';

export type Props = QueryEditorProps<DataSource, LogScaleQuery, LogScaleOptions>;

export function QueryEditor(props: Props) {
  const { query, onChange, onRunQuery } = props;
  const [isLogFormat, setIsLogFormat] = useState<boolean>(query.queryType === 'logs');

  const onIsExploreChange = (val: boolean) => {
    setIsLogFormat(val);
    onChange({ ...query, queryType: val ? 'logs' : 'metrics' });
    onRunQuery();
  };
  return (
    <div>
      <LogScaleQueryEditor {...props} />
      {props.app === 'explore' ? (
        <InlineSwitch
          aria-label="formatLogs"
          label="Format as logs"
          showLabel={true}
          value={isLogFormat || false}
          onChange={(e) => onIsExploreChange(e.currentTarget.checked)}
          transparent={true}
        />
      ) : (
        ''
      )}
    </div>
  );
}
