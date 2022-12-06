import { DataSourcePlugin } from '@grafana/data';

import { HumioDataSource } from './HumioDataSource';
import { ConfigEditor } from './ConfigEditor';
import { QueryEditor } from './QueryEditor';
import { VariableQueryEditor } from './VariableQueryEditor';
import { HumioOptions, HumioQuery } from './types';
import { HumioAnnotationQueryEditor } from './AnnotationQueryEditor';

export const plugin = new DataSourcePlugin<HumioDataSource, HumioQuery, HumioOptions>(HumioDataSource)
  .setConfigEditor(ConfigEditor)
  .setQueryEditor(QueryEditor)
  .setVariableQueryEditor(VariableQueryEditor)
  .setAnnotationQueryCtrl(HumioAnnotationQueryEditor);
