import React, { PureComponent } from 'react';
import { DataSourceJsonData, QueryEditorProps } from '@grafana/data';
import { getDataSourceSrv } from '@grafana/runtime';
import { Select, QueryField } from '@grafana/ui';
import { HumioDataSource, HumioQuery } from './HumioDataSource';
import { HumioOptions } from './types';
import HumioHelper from './humio/humio_helper';
import _ from 'lodash';

type Props = QueryEditorProps<HumioDataSource, HumioQuery, HumioOptions>;

interface State {
  repositories: any;
  datasource: HumioDataSource;
  link: string | undefined;
}

export class QueryEditor extends PureComponent<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      repositories: [],
      datasource: props.datasource,
      link: undefined,
    };
  }

  componentDidMount() {
    // let requestOpts: IDatasourceRequestOptions = {
    //   method: 'POST',
    //   url: this.state.datasource.graphql_endpoint,
    //   data: { query: '{searchDomains{name}}' },
    //   headers: this.state.datasource.headers,
    // };

    // getBackendSrv()
    //   .datasourceRequest(requestOpts)
    //   .then((res) => {
    //     let searchDomainNames = res.data.data.searchDomains.map(({ name }: { name: string }) => ({
    //       label: name,
    //       value: name,
    //     }));
    //     this.setState({
    //       repositories: _.sortBy(searchDomainNames, ['label']),
    //       link: this.props.query.humioRepository ? this.getHumioLink() : undefined,
    //     });
    //   });
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.query.humioRepository !== this.props.query.humioRepository) {
      this.setState({
        link: this.props.query.humioRepository ? this.getHumioLink() : undefined,
      });
    }
  }

  componentWillUnmount() {
    this.onChangeRepo(undefined); // Ensures that we don't carry over the repo when switching datasource.
  }

  onChangeQuery = (value: string, override?: boolean) => {
    // Send text change to parent
    const { query, onChange, onRunQuery } = this.props;
    if (onChange) {
      const nextQuery = { ...query, humioQuery: value };
      onChange(nextQuery);

      if (override && onRunQuery) {
        onRunQuery();
      }
    }
  };

  onChangeRepo = (value: string | undefined, override?: boolean) => {
    // Send text change to parent
    const { query, onChange, onRunQuery } = this.props;
    if (onChange) {
      const nextQuery = { ...query, humioRepository: value };
      onChange(nextQuery);

      if (override && onRunQuery) {
        onRunQuery();
      }
    }
  };

  private _composeQueryArgs(query: string, timeRange: any) {
    let isLive = HumioHelper.queryIsLive(location, timeRange);
    let replacedQuery = this.state.datasource.templateSrv.replace(query, undefined, this.state.datasource.formatting);

    var queryParams: { [k: string]: any } = { query: replacedQuery, live: isLive };
    queryParams['start'] = timeRange.from._d.getTime();

    if (!isLive) {
      queryParams['end'] = timeRange.to._d.getTime();
    }
    return queryParams;
  }

  private _serializeQueryArgs(queryArgs: any) {
    let str = [];
    for (let argument in queryArgs) {
      str.push(encodeURIComponent(argument) + '=' + encodeURIComponent(queryArgs[argument]));
    }
    return str.join('&');
  }

  getHumioLink() {
    let instanceSettings = getDataSourceSrv().getInstanceSettings(this.state.datasource.uid);
    let url = instanceSettings?.jsonData['baseUrl' as keyof DataSourceJsonData] ?? instanceSettings?.url ?? '';
    url = typeof url === 'boolean' ? '' : url;

    if (url[url.length - 1] === '/') {
      url = url.substring(0, url.length - 1);
    }
    if (url === '' || this.props.range === undefined) {
      return '#';
    } else {
      let queryParams = this._composeQueryArgs(this.props.query.humioQuery, this.props.range);
      return `${url}/${this.props.query.humioRepository}/search?${this._serializeQueryArgs(queryParams)}`;
    }
  }

  renderHumioLink() {
    if (this.state.link !== undefined) {
      return <a href={this.state.link}> Open query in Humio </a>;
    } else {
      return <div></div>;
    }
  }

  render() {
    return (
      <div className="query-editor-row" can-collapse="true">
        {this.renderHumioLink()}
        <div className="gf-form gf-form--grow flex-shrink-1 min-width-15 explore-input-margin">
          <QueryField
            query={this.props.query.humioQuery}
            onChange={this.onChangeQuery}
            onBlur={this.props.onBlur}
            onRunQuery={this.props.onRunQuery}
            placeholder="Enter a Humio query (run with Shift+Enter)"
            portalOrigin="Humio"
          ></QueryField>
        </div>

        <Select
          width={30}
          options={this.state.repositories}
          value={this.props.query.humioRepository}
          onChange={(x) => this.onChangeRepo(x.value)}
        ></Select>
      </div>
    );
  }
}
