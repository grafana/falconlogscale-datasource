import React, { useEffect, useState } from 'react';
import { QueryEditorProps, SelectableValue } from '@grafana/data';
import { Select, QueryField } from '@grafana/ui';
import { HumioDataSource } from './HumioDataSource';
import { HumioOptions, HumioQuery } from './types';
import _ from 'lodash';

type Props = QueryEditorProps<HumioDataSource, HumioQuery, HumioOptions>;

export function QueryEditor(props: Props) {
  const { datasource } = props;
  const [repositories, setRepositories] = useState(Array<SelectableValue<string>>);
  
  useEffect(() => {
    datasource.getResource('/repositories').then(result => {
      console.log('RESULT: ', result);
      setRepositories(prevRepositories => [...prevRepositories, ...result])
    });
  }, []);

  // const reposTemp: Array<SelectableValue<string>> = [
  //   { value: 'humio-organization-fdr-demo', label: 'humio-organization-fdr-demo' },
  // ];
    return (
      <div className="query-editor-row" can-collapse="true">
        <div className="gf-form gf-form--grow flex-shrink-1 min-width-15 explore-input-margin">
          <QueryField
            query={props.query.queryString}
            onChange={(val) => props.onChange({...props.query, queryString: val})}
            onBlur={props.onBlur}
            onRunQuery={props.onRunQuery}
            placeholder="Enter a Humio query (run with Shift+Enter)"
            portalOrigin="Humio"
          ></QueryField>
        </div>

        <Select
          width={30}
          options={repositories}
          value={props.query.repository}
          onChange={(val) => props.onChange({...props.query, repository: val.value!.toString()})}
        ></Select>
      </div>
    );
}
