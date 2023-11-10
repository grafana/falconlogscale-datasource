import { MutableDataFrame } from '@grafana/data';
import { getDataLinks } from 'dataLink';
import { expect } from '@jest/globals';

jest.mock('@grafana/runtime', () => ({
  // @ts-ignore
  ...jest.requireActual('@grafana/runtime'),
  getDataSourceSrv: () => {
    return {
      getInstanceSettings: () => {
        return { name: 'dsName' };
      },
    };
  },
}));

describe('dataLink', () => {
  it('should add a data source data link', () => {
    const df = new MutableDataFrame({ fields: [{ name: 'line', values: ['no traceId', 'traceId=foo'] }] });
    const newFields = getDataLinks(df, [
      {
        matcherRegex: 'traceId=(\\w+)',
        field: 'line',
        label: 'trace',
        url: 'test',
        datasourceUid: 'uid',
      },
    ]);
    const trace = newFields.find((f) => f.name === 'trace');
    expect(trace!.values.toArray()).toEqual([null, 'foo']);
    expect(trace!.config.links!.length).toBe(1);
    expect(trace!.config.links![0]).toEqual({
      title: '',
      internal: { datasourceName: 'dsName', datasourceUid: 'uid', query: { query: 'test' } },
      url: '',
    });
  });

  it('should add a url data link', () => {
    const df = new MutableDataFrame({ fields: [{ name: 'line', values: ['no traceId', 'traceId=foo'] }] });
    const newFields = getDataLinks(df, [
      {
        matcherRegex: 'traceId=(\\w+)',
        field: 'line',
        label: 'trace',
        url: 'http://localhost/${__value.raw}',
      },
    ]);
    const trace = newFields.find((f) => f.name === 'trace');
    expect(trace!.values.toArray()).toEqual([null, 'foo']);
    expect(trace!.config.links!.length).toBe(1);
    expect(trace!.config.links![0]).toEqual({
      url: 'http://localhost/${__value.raw}',
      title: '',
    });
  });

  it('should add a data links only for matching field', () => {
    const df = new MutableDataFrame({ fields: [{ name: 'line', values: [null, 'traceId=foo'] }] });
    const newFields = getDataLinks(df, [
      {
        matcherRegex: 'traceId=(\\w+)',
        field: 'line',
        label: 'trace',
        url: 'http://localhost/${__value.raw}',
      },
    ]);
    const trace = newFields.find((f) => f.name === 'trace');
    expect(trace!.values.toArray()).toEqual([null, 'foo']);
  });

  it('should not add a data link because does not match regExp', () => {
    const df = new MutableDataFrame({ fields: [{ name: 'line', values: ['no traceId', 'agin no traceId'] }] });
    const newFields = getDataLinks(df, [
      {
        matcherRegex: 'traceId=(\\w+)',
        field: 'line',
        label: 'trace',
        url: 'http://localhost/${__value.raw}',
      },
    ]);
    const trace = newFields.find((f) => f.name === 'trace');
    expect(trace!.values.toArray()).toEqual([null, null]);
  });

  it('should not add a data link because there is no value', () => {
    const df = new MutableDataFrame({
      fields: [
        { name: 'traceId', values: ['id123'] },
        { name: 'line2', values: ['1', '2'] },
      ],
    });
    const newFields = getDataLinks(df, [
      {
        matcherRegex: '(.*)',
        field: 'traceId',
        label: 'trace',
        url: 'http://localhost/${__value.raw}',
      },
    ]);
    const trace = newFields.find((f) => f.name === 'trace');
    expect(trace!.values.toArray()).toEqual(['id123', null]);
  });

  it('should not add a data link because does not have matching field', () => {
    const df = new MutableDataFrame({ fields: [{ name: 'not a line', values: ['no traceId', 'traceId=foo'] }] });
    const newFields = getDataLinks(df, [
      {
        matcherRegex: 'traceId=(\\w+)',
        field: 'line',
        label: 'trace',
        url: 'http://localhost/${__value.raw}',
      },
    ]);
    const trace = newFields.find((f) => f.name === 'trace');
    expect(trace!.values.toArray()).toEqual([]);
  });

  it('should add multiple data link', () => {
    const df = new MutableDataFrame({ fields: [{ name: 'line', values: ['nothing', 'trace1=1234', 'trace2=foo'] }] });
    const newFields = getDataLinks(df, [
      {
        matcherRegex: 'ace1=(\\w+)',
        field: 'line',
        label: 'trace1',
        url: 'http://localhost/${__value.raw}',
      },
      {
        matcherRegex: 'ace2=(\\w+)',
        field: 'line',
        label: 'trace2',
        url: 'test',
        datasourceUid: 'uid',
      },
    ]);
    const trace1 = newFields.find((f) => f.name === 'trace1');
    expect(trace1!.values.toArray()).toEqual([null, '1234', null]);
    expect(trace1!.config.links![0]).toEqual({
      url: 'http://localhost/${__value.raw}',
      title: '',
    });

    const trace2 = newFields.find((f) => f.name === 'trace2');
    expect(trace2!.values.toArray()).toEqual([null, null, 'foo']);
    expect(trace2!.config.links![0]).toEqual({
      title: '',
      internal: { datasourceName: 'dsName', datasourceUid: 'uid', query: { query: 'test' } },
      url: '',
    });
  });

  it('should', () => {
    expect(true).toBe(true);
  });
});
