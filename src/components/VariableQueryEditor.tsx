import { DataSource } from 'DataSource';
import React, { useState } from 'react';
import { LogScaleQuery } from 'types';
import { LogScaleQueryEditor } from 'components/LogScaleQueryEditor';


type Props = {
  query: LogScaleQuery;
  onChange: (q: LogScaleQuery, desc: string) => void;
  datasource: DataSource;
};

export function VariableQueryEditor(props: Props) {
  const { onChange, datasource } = props;
  const [query, setQuery] = useState(props.query || {} as LogScaleQuery);

  const handleVariableQuery = (q: LogScaleQuery) => {
      setQuery(q);
      onChange(q, `LogScale Query - ${query.lsql}`);
    };

  return (
    <LogScaleQueryEditor
      datasource={datasource}
      onChange={handleVariableQuery}
      runQuery={() => handleVariableQuery(query)}
      query={query}/>
  );
};
