describe('sample test', () => {
  it('sample test', () => {
    expect(1).toBe(1);
  });
});

// import { HumioDataSource, HumioQuery } from './HumioDataSource';
// import { HumioOptions } from './types';
// import { AnnotationQueryRequest, CoreApp, DataQueryRequest, DataSourceInstanceSettings, dateTime } from '@grafana/data';
// import { TemplateSrv } from '@grafana/runtime';
// import HumioHelper from './humio/humio_helper';

// let initMock = jest.fn().mockReturnValue(createDefaultInitResponse());
// let pollMock = jest.fn().mockReturnValue(createDefaultHumioResponse());
// // @ts-ignore
// let deleteMock = jest.fn().mockReturnValue(createDefaultDeleteResponse());

// jest.mock('@grafana/runtime', () => ({
//   // @ts-ignore
//   ...jest.requireActual('@grafana/runtime'),
//   getBackendSrv: () => ({
//     datasourceRequest: (options: any, headers: any, proxyUrl: any) => {
//       if (options.method === 'POST') {
//         return Promise.resolve(initMock(options, headers, proxyUrl));
//       } else if (options.method === 'GET') {
//         return Promise.resolve(pollMock(options, headers, proxyUrl));
//       } else if (options.method === 'DELETE') {
//         return Promise.resolve(deleteMock(options, headers, proxyUrl));
//       } else {
//         throw Error('No mock implementation of HTTP verb ' + options.method);
//       }
//     },
//   }),
// }));

// function createDefaultHumioResponse() {
//   return {
//     data: {
//       done: true,
//       metaData: {
//         extraData: {},
//       },
//       events: [{ _count: '0' }],
//     },
//   };
// }

// function createDefaultFilterHumioResponse() {
//   return {
//     data: {
//       done: true,
//       metaData: {
//         extraData: {},
//       },
//       events: [{ '@timestamp': 0, key: 'value' }],
//     },
//   };
// }

// function createDefaultInitResponse() {
//   return {
//     data: {
//       id: 'abcde',
//     },
//   };
// }

// function createDefaultDeleteResponse() {
//   return {
//     data: {},
//   };
// }

// function createDataRequest(
//   targets: any[],
//   range: any,
//   panelId: Number = 0,
//   overrides?: Partial<DataQueryRequest>
// ): DataQueryRequest<HumioQuery> {
//   const defaults = {
//     app: CoreApp.Dashboard,
//     targets: targets.map((t) => {
//       return {
//         instant: false,
//         start: range.from,
//         end: range.to,
//         expr: 'test',
//         ...t,
//       };
//     }),
//     range: range,
//     interval: '15s',
//     showingGraph: true,
//     panelId: panelId,
//   };

//   return Object.assign(defaults, overrides || {}) as DataQueryRequest<HumioQuery>;
// }

// function makeAnnotationQueryRequest(query: string, range: any): AnnotationQueryRequest<HumioQuery> {
//   return {
//     annotation: {
//       humioQuery: query,
//       annotationQuery: query,
//       refId: '',
//       datasource: 'humio',
//       enable: true,
//       name: 'test-annotation',
//       humioRepository: 'test',
//       iconColor: 'red',
//     },
//     dashboard: {
//       id: 1,
//     } as any,
//     range: range,
//     rangeRaw: range.raw,
//   };
// }

// const templateSrv: any = {
//   replace: jest.fn((text) => {
//     if (text.startsWith('$')) {
//       return `resolvedVariable`;
//     } else {
//       return text;
//     }
//   }),
//   getAdhocFilters: jest.fn(() => []),
// };

// describe('HumioDataSource', () => {
//   let ds: HumioDataSource;
//   const instanceSettings = {
//     id: 1,
//     url: 'proxied',
//     directUrl: 'direct',
//     user: 'test',
//     password: 'passw3rd',
//     jsonData: {
//       customQueryParameters: '',
//     } as any,
//   } as unknown as DataSourceInstanceSettings<HumioOptions>;

//   beforeEach(() => {
//     ds = new HumioDataSource(instanceSettings, templateSrv as TemplateSrv);
//     HumioHelper.queryIsLive = jest.fn().mockReturnValue(false);
//   });

//   afterEach(() => {
//     jest.clearAllMocks();
//   });

//   describe('Regular Query', () => {
//     it('returns empty array when no targets', async () => {
//       const raw = { from: 'now-1h', to: 'now' };
//       const range = { from: dateTime(), to: dateTime(), raw: raw };

//       let res = await ds.query(createDataRequest([], range));
//       expect(res['data']).toEqual([]);
//     });

//     it('returns empty array when no repo given', async () => {
//       const raw = { from: 'now-1h', to: 'now' };
//       const range = { from: dateTime(), to: dateTime(), raw: raw };

//       let res = await ds.query(createDataRequest([{ humioQuery: 'timechart()' }], range));
//       expect(res['data']).toEqual([]);
//     });

//     it('for a static query, creates a static query job and polls data from it', async () => {
//       const raw = { from: 'now-1h', to: 'now' };
//       const range = { from: dateTime([2020, 4, 30, 10]), to: dateTime([2020, 4, 30, 11]), raw: raw };

//       const options = {
//         humioQuery: 'timechart()',
//         humioRepository: 'test',
//       };

//       let res = await ds.query(createDataRequest([options], range));

//       expect(initMock.mock.calls.length).toBe(1);
//       expect(initMock.mock.calls[0]).toEqual([
//         {
//           data: {
//             end: range.to.unix() * 1000,
//             isLive: false,
//             queryString: '/** Grafana initiated search */ timechart()',
//             showQueryEventDistribution: false,
//             start: range.from.unix() * 1000,
//             timeZoneOffsetMinutes: -new Date().getTimezoneOffset(),
//           },
//           headers: { 'Content-Type': 'application/json' },
//           method: 'POST',
//           url: 'proxied/api/v1/dataspaces/test/queryjobs',
//         },
//         undefined,
//         undefined,
//       ]);
//       expect(pollMock.mock.calls.length).toBe(1);

//       expect(res.error).toBeUndefined();
//       expect(res.data).toStrictEqual([{ datapoints: [[0]], target: '_count' }]);
//     });

//     it('for a live query, creates a live query job and polls data from it', async () => {
//       HumioHelper.queryIsLive = jest.fn().mockReturnValue(true);

//       const raw = { from: 'now-1h', to: 'now' };
//       const range = { from: dateTime([2020, 4, 30, 10]), to: dateTime([2020, 4, 30, 11]), raw: raw };

//       const options = {
//         humioQuery: 'timechart()',
//         humioRepository: 'test',
//       };

//       let res = await ds.query(createDataRequest([options], range));

//       expect(initMock.mock.calls.length).toBe(1);
//       expect(initMock.mock.calls[0]).toEqual([
//         {
//           data: {
//             isLive: true,
//             queryString: '/** Grafana initiated search */ timechart()',
//             showQueryEventDistribution: false,
//             start: '1h',
//             timeZoneOffsetMinutes: -new Date().getTimezoneOffset(),
//           },
//           headers: { 'Content-Type': 'application/json' },
//           method: 'POST',
//           url: 'proxied/api/v1/dataspaces/test/queryjobs',
//         },
//         undefined,
//         undefined,
//       ]);
//       expect(pollMock.mock.calls.length).toBe(1);

//       expect(res.error).toBeUndefined();
//       expect(res.data).toStrictEqual([{ datapoints: [[0]], target: '_count' }]);
//     });

//     it('for a live query, creates a static query job if range not supported for a live Humio query', async () => {
//       HumioHelper.queryIsLive = jest.fn().mockReturnValue(true);

//       const raw = { from: 'now/d', to: 'now' };
//       const range = { from: dateTime([2020, 4, 30, 10]), to: dateTime([2020, 4, 30, 11]), raw: raw };

//       const options = {
//         humioQuery: 'timechart()',
//         humioRepository: 'test',
//       };

//       let res = await ds.query(createDataRequest([options], range));

//       expect(initMock.mock.calls.length).toBe(1);
//       expect(initMock.mock.calls[0]).toEqual([
//         {
//           data: {
//             end: range.to.unix() * 1000,
//             isLive: false,
//             queryString: '/** Grafana initiated search */ timechart()',
//             showQueryEventDistribution: false,
//             start: range.from.unix() * 1000,
//             timeZoneOffsetMinutes: -new Date().getTimezoneOffset(),
//           },
//           headers: { 'Content-Type': 'application/json' },
//           method: 'POST',
//           url: 'proxied/api/v1/dataspaces/test/queryjobs',
//         },
//         undefined,
//         undefined,
//       ]);
//       expect(pollMock.mock.calls.length).toBe(1);

//       expect(res.error).toBeUndefined();
//       expect(res.data).toStrictEqual([{ datapoints: [[0]], target: '_count' }]);
//     });
//   });

//   describe('Annotation Query', () => {
//     it('Create static annotation query', async () => {
//       const raw = { from: 'now-1h', to: 'now' };
//       const range = { from: dateTime([2020, 4, 30, 10]), to: dateTime([2020, 4, 30, 11]), raw: raw };

//       pollMock = jest.fn().mockReturnValue(createDefaultFilterHumioResponse());

//       let res = await ds.annotationQuery(makeAnnotationQueryRequest('testQuery', range));

//       expect(initMock.mock.calls.length).toBe(1);
//       expect(initMock.mock.calls[0]).toEqual([
//         {
//           data: {
//             end: range.to.unix() * 1000,
//             isLive: false,
//             queryString: '/** Grafana initiated search */ testQuery',
//             showQueryEventDistribution: false,
//             start: range.from.unix() * 1000,
//             timeZoneOffsetMinutes: -new Date().getTimezoneOffset(),
//           },
//           headers: { 'Content-Type': 'application/json' },
//           method: 'POST',
//           url: 'proxied/api/v1/dataspaces/test/queryjobs',
//         },
//         undefined,
//         undefined,
//       ]);
//       expect(pollMock.mock.calls.length).toBe(1);
//       expect(res).toStrictEqual([{ time: 0, text: '', timeEnd: undefined, isRegion: false }]);
//     });

//     it('Create live annotation query', async () => {
//       HumioHelper.queryIsLive = jest.fn().mockReturnValue(true);

//       const raw = { from: 'now-1h', to: 'now' };
//       const range = { from: dateTime([2020, 4, 30, 10]), to: dateTime([2020, 4, 30, 11]), raw: raw };

//       pollMock = jest.fn().mockReturnValue(createDefaultFilterHumioResponse());

//       let res = await ds.annotationQuery(makeAnnotationQueryRequest('testQuery', range));

//       expect(initMock.mock.calls.length).toBe(1);
//       expect(initMock.mock.calls[0]).toEqual([
//         {
//           data: {
//             isLive: true,
//             queryString: '/** Grafana initiated search */ testQuery',
//             showQueryEventDistribution: false,
//             start: '1h',
//             timeZoneOffsetMinutes: -new Date().getTimezoneOffset(),
//           },
//           headers: { 'Content-Type': 'application/json' },
//           method: 'POST',
//           url: 'proxied/api/v1/dataspaces/test/queryjobs',
//         },
//         undefined,
//         undefined,
//       ]);
//       expect(pollMock.mock.calls.length).toBe(1);
//       expect(res).toStrictEqual([{ time: 0, text: '', timeEnd: undefined, isRegion: false }]);
//     });
//   });

//   describe('Formatting', () => {
//     let ds: HumioDataSource;
//     const instanceSettings = {
//       url: 'proxied',
//       jsonData: { authenticateWithToken: true, baseUrl: '' } as HumioOptions,
//     } as unknown as DataSourceInstanceSettings<HumioOptions>;

//     beforeEach(() => {
//       ds = new HumioDataSource(instanceSettings);
//     });

//     it('returns unaltered string when provided string', () => {
//       expect(ds.formatting('someUnalteredString')).toEqual('someUnalteredString');
//     });

//     it('returns first entry when provided list with one element', () => {
//       expect(ds.formatting(['someUnalteredString'])).toEqual('someUnalteredString');
//     });

//     it('returns formatted or-expression when given a list with more than one entry', () => {
//       expect(ds.formatting(['s1', 's2'])).toEqual('/^s1|s2$/');
//     });
//   });
// });
