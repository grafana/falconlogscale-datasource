import { DataSourcePlugin } from '@grafana/data';

import { DataSource } from './DataSource';
import { ConfigEditor } from './components/ConfigEditor/ConfigEditor';
import { QueryEditor } from './components/QueryEditor/QueryEditor';
import { LogScaleOptions, LogScaleQuery } from './types';

export const plugin = new DataSourcePlugin<DataSource, LogScaleQuery, LogScaleOptions>(DataSource)
  .setConfigEditor(ConfigEditor)
  .setQueryEditor(QueryEditor);
