import React from 'react';
import { QueryEditorProps } from '@grafana/data';
import { DataSource } from '../DataSource';
import { LogScaleOptions, LogScaleQuery } from '../types';
import { LogScaleQueryEditor } from 'components/LogScaleQueryEditor';

export type Props = QueryEditorProps<DataSource, LogScaleQuery, LogScaleOptions>;

export function QueryEditor(props: Props) {
  const { datasource, onChange, onRunQuery, query } = props;

  return <LogScaleQueryEditor datasource={datasource} onChange={onChange} runQuery={onRunQuery} query={query} />;
}
