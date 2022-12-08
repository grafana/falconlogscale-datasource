import React from 'react';
import { QueryEditorProps } from '@grafana/data';
import { HumioDataSource } from './HumioDataSource';
import { HumioOptions, HumioQuery } from './types';
import _ from 'lodash';
import { LogScaleQueryEditor } from 'components/LogScaleQueryEditor';

type Props = QueryEditorProps<HumioDataSource, HumioQuery, HumioOptions>;

export function QueryEditor(props: Props) {
  const { datasource, onChange, onRunQuery, query } = props;

    return (
      <LogScaleQueryEditor
      datasource={datasource}
      onChange={onChange}
      runQuery={onRunQuery}
      query={query}/>
    );
}
