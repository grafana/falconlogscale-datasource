import { HumioDataSource } from 'HumioDataSource';
import React, { useState } from 'react';
import { HumioQuery } from 'types';
import { LogScaleQueryEditor } from 'components/LogScaleQueryEditor';


type Props = {
  query: HumioQuery;
  onChange: (q: HumioQuery, desc: string) => void;
  datasource: HumioDataSource;
};

export function VariableQueryEditor(props: Props) {
  const { onChange, datasource } = props;
  const [query, setQuery] = useState(props.query || {} as HumioQuery);

  const handleVariableQuery = (q: HumioQuery) => {
    const updated: HumioQuery = {...query, queryString: q.queryString}
      setQuery(updated);
      onChange(updated, query.queryString);
    };

  return (
    <LogScaleQueryEditor
      datasource={datasource}
      onChange={handleVariableQuery}
      runQuery={() => handleVariableQuery(query)}
      query={query}/>
    
  );
};
