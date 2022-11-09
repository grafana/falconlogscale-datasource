import QueryJob from './humio/query_job';
import { HumioDataSource } from './HumioDataSource';
import { getDefaultTimeRange, MetricFindValue } from '@grafana/data';
import IGrafanaAttrs from './Interfaces/IGrafanaAttrs';
import _ from 'lodash';
import HumioHelper from 'humio/humio_helper';
import DatasourceRequestHeaders from 'Interfaces/IDatasourceRequestHeaders';

export default class MetricFindQuery {
  datasource: HumioDataSource;
  query: any;
  options: any;

  constructor(datasource: HumioDataSource, query: any, options: any) {
    this.datasource = datasource;
    this.query = query;
    this.options = options;
  }

  async process(): Promise<MetricFindValue[]> {
    let rawTime = await this.computeRawTimeRange(this.options);
    if (this.options.range) {
      this.options.range.raw = rawTime;
    } else {
      this.options.range = { raw: rawTime };
    }
    let res = await this.queryVariableContents(this.query, this.options);

    return new Promise((resolve) => resolve(res));
  }

  // This is a rater complex system for getting the time range, but Grafana doesn't allow for another way atm (July, 2020).
  // TODO(AlexanderBrandborg): Should petition Grafana to give us access to timeSrv or also give us a range on the 'never' and 'on dashboard load' options.
  async computeRawTimeRange(options: any) {
    // If variables refreshed on time range change, we get the range free of charge
    if (options.range) {
      return options.range.raw;
    }

    let uid = location.pathname.split('/')[2];
    const params = new URLSearchParams(location.search);
    const from = params.get('from');
    const to = params.get('to');

    // Url contains range, this happens if the time range has been changed after dashboard load
    if (from !== null && to !== null) {
      let finalFrom = Number(from) ? Number(from) : from;
      let finalTo = Number(to) ? Number(to) : to;

      return { to: finalTo, from: finalFrom };
    }

    // Case dashboard hasn't been saved, using the default
    if (uid === 'new') {
      return getDefaultTimeRange().raw;

      // Case dashboard has been saved
    } else {
      let savedDashboardTime = await this.getDashboardDefaultTime(uid);
      // range saved as an absolute in a Date format. Being converted to timestamp
      // TODO(AlexanderBrandborg): Could potentially turn these dates into moment.js objects, which makes the logic of read them again a bit easier
      if (savedDashboardTime.to !== 'now') {
        let absoluteFrom = Math.floor(new Date(savedDashboardTime.from).getTime());
        let absoluteTo = Math.floor(new Date(savedDashboardTime.to).getTime());

        return { from: absoluteFrom, to: absoluteTo };
      } else {
        return { from: savedDashboardTime.from, to: savedDashboardTime.to };
      }
    }
  }

  // Get time range of saved dashboard through API.
  async getDashboardDefaultTime(uid: string) {
    return fetch('/api/dashboards/uid/' + uid)
      .then((res) => res.json())
      .then(
        async (res: any) => {
          return res.dashboard.time;
        },
        (err: any) => {
          throw new Error('Dashboard with ' + uid + ' could not be found.');
        }
      );
  }

  // Just a single queryjob call without using the manager.
  // Variable queries will never be 'live' so the manager is not needed to keep query jobs alive
  async queryVariableContents(query: any, options: any) {
    let qj = new QueryJob(query.query);

    let grafanaAttrs: IGrafanaAttrs = {
      grafanaQueryOpts: options,
      headers: {} as DatasourceRequestHeaders,//this.datasource.headers,
      proxy_url: '',//this.datasource.rest_endpoint,
    };

    let target = {
      humioQuery: query.query,
      humioRepository: query.repo,
      refId: 'notUsed',
    };

    let isLive = HumioHelper.queryIsLive(location, grafanaAttrs.grafanaQueryOpts.range);
    let data = await qj.executeQuery(isLive, grafanaAttrs, target);
    if (data.error) {
      throw data.error; // TODO(AlexanderBrandborg): Only shows the error header on the variables page. Should be able to show the body also.
    }

    return _.flatMap(data.data.events, (res, index) => {
      let text = _.get(res, query.dataField);
      if (!text) {
        throw new Error(query.dataField + ' is not a field that exists on returned Humio events for variable query');
      }

      return { text: text };
    });
  }
}
