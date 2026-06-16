import { dateTime, FieldType } from '@grafana/data';
import {
  CacheRequestInfo,
  isEligibleForIncremental,
  lsqlContainsAggregation,
  QueryCache,
} from './incrementalQuery';
import { FormatAs, LogScaleQuery, LogScaleQueryType } from './types';
import { pluginVersion } from 'utils/version';

const makeQuery = (overrides: Partial<LogScaleQuery> = {}): LogScaleQuery => ({
  refId: 'A',
  repository: 'my-repo',
  lsql: 'error',
  queryType: LogScaleQueryType.LQL,
  formatAs: FormatAs.Logs,
  version: pluginVersion,
  ...overrides,
});

const makeField = (name: string, type: FieldType, values: unknown[]) => ({
  name,
  type,
  values,
  config: {},
});

const NOW = 1_700_000_000_000;

// Build a minimal DataQueryRequest-like object for the cache.
const makeRequest = (overrides: Record<string, unknown> = {}) => ({
  dashboardUID: 'dash1',
  panelId: 1,
  requestId: 'req1',
  timezone: 'browser',
  app: 'panel-editor',
  startTime: NOW,
  intervalMs: 1000,
  range: {
    from: dateTime(NOW - 3_600_000),
    to: dateTime(NOW),
    raw: { from: 'now-1h', to: 'now' },
  },
  rangeRaw: { from: 'now-1h', to: 'now' },
  targets: [makeQuery()],
  ...overrides,
});

// ── lsqlContainsAggregation ───────────────────────────────────────────────────

describe('lsqlContainsAggregation', () => {
  it.each([
    ['timeChart(span=1h)', true],
    ['groupBy([status], function=count())', true],
    ['count()', true],
    ['sum(bytes)', true],
    ['avg(responseTime)', true],
    ['table([status, url])', true],
    ['sort(field=@timestamp)', true],
    ['head(100)', true],
    ['tail(100)', true],
    ['stats(count=count(), avg=avg(responseTime))', true],
    ['top(10, field=url)', true],
    ['percentile(field=bytes, percentiles=[95, 99])', true],
    ['bucket(span=1m)', true],
    ['worldMap(ip=clientIp)', true],
    // case-insensitive
    ['TIMECHART(span=1h)', true],
    ['GroupBy([status])', true],
    // plain log searches — no aggregate
    ['status=error', false],
    ['/timeout/i', false],
    ['loglevel=ERROR | @rawstring=*exception*', false],
    // field name that resembles a function but no parens
    ['count > 5', false],
    ['min_response', false],
  ])('lsql %j → %s', (lsql, expected) => {
    expect(lsqlContainsAggregation(lsql)).toBe(expected);
  });
});

// ── isEligibleForIncremental ──────────────────────────────────────────────────

describe('isEligibleForIncremental', () => {
  it('returns true for a standard LQL log query', () => {
    expect(isEligibleForIncremental(makeQuery())).toBe(true);
  });

  it('returns true for a metrics query', () => {
    expect(isEligibleForIncremental(makeQuery({ formatAs: FormatAs.Metrics }))).toBe(true);
  });

  it('returns false for a Repositories query', () => {
    expect(isEligibleForIncremental(makeQuery({ queryType: LogScaleQueryType.Repositories }))).toBe(false);
  });

  it('returns false for a Variable format query', () => {
    expect(isEligibleForIncremental(makeQuery({ formatAs: FormatAs.Variable }))).toBe(false);
  });

  it('returns false for a live query', () => {
    expect(isEligibleForIncremental(makeQuery({ live: true }))).toBe(false);
  });

  it('returns false when disableIncrementalQuerying is set', () => {
    expect(isEligibleForIncremental(makeQuery({ disableIncrementalQuerying: true }))).toBe(false);
  });

  it('returns false when lsql contains an aggregate function', () => {
    expect(isEligibleForIncremental(makeQuery({ lsql: 'timechart(span=1h)' }))).toBe(false);
    expect(isEligibleForIncremental(makeQuery({ lsql: 'groupBy([status], function=count())' }))).toBe(false);
  });

  it('returns true for a plain log search with no aggregate functions', () => {
    expect(isEligibleForIncremental(makeQuery({ lsql: 'status=error' }))).toBe(true);
  });
});

// ── QueryCache.requestInfo ────────────────────────────────────────────────────

describe('QueryCache.requestInfo', () => {
  const ident = 'dash1|1|A';
  const sig = 'error|my-repo|logs';

  it('returns shouldCache=false for absolute time ranges', () => {
    const cache = new QueryCache();
    const request = makeRequest({ rangeRaw: { from: dateTime(NOW - 3_600_000), to: dateTime(NOW) } });
    const info = cache.requestInfo(request as any);
    expect(info.shouldCache).toBe(false);
  });

  it('returns shouldCache=true for relative-to-now ranges', () => {
    const cache = new QueryCache();
    const info = cache.requestInfo(makeRequest() as any);
    expect(info.shouldCache).toBe(true);
  });

  it('returns the original request unmodified on cache miss', () => {
    const cache = new QueryCache();
    const request = makeRequest() as any;
    const info = cache.requestInfo(request);
    expect(info.request.range.from.valueOf()).toBe(request.range.from.valueOf());
  });

  it('evicts stale cache entry on miss', () => {
    const cache = new QueryCache();
    cache.cache.set(ident, { signature: sig, prevTo: NOW - 60_000, frames: [] });
    // Change lsql so signature differs → cache miss
    const request = makeRequest({ targets: [makeQuery({ lsql: 'new query' })] }) as any;
    cache.requestInfo(request);
    expect(cache.cache.get(ident)).toBeUndefined();
  });

  it('returns partial request on cache hit', () => {
    const cache = new QueryCache('10m');
    const prevTo = NOW - 60_000;
    cache.cache.set(ident, { signature: sig, prevTo, frames: [] });

    const request = makeRequest() as any;
    const info = cache.requestInfo(request);
    const expectedCutoff = prevTo - 10 * 60_000;
    expect(info.request.range.from.valueOf()).toBe(expectedCutoff);
  });

  it('does not go below original from when overlap window exceeds available range', () => {
    const cache = new QueryCache('10m');
    const prevTo = NOW - 60_000;
    cache.cache.set(ident, { signature: sig, prevTo, frames: [] });

    // Request from is only 2 minutes ago — overlap window is 10m but we clamp.
    const from = dateTime(NOW - 2 * 60_000);
    const request = makeRequest({ range: { from, to: dateTime(NOW), raw: {} } }) as any;
    const info = cache.requestInfo(request);
    expect(info.request.range.from.valueOf()).toBeGreaterThanOrEqual(from.valueOf());
  });

  it('does not do partial query when new from is after prevTo', () => {
    const cache = new QueryCache('10m');
    const prevTo = NOW - 3_600_000; // prevTo is 1h ago
    cache.cache.set(ident, { signature: sig, prevTo, frames: [] });

    // new from is after prevTo (user jumped forward in time)
    const request = makeRequest({
      range: { from: dateTime(NOW - 60_000), to: dateTime(NOW), raw: {} },
    }) as any;
    const info = cache.requestInfo(request);
    // Should fall back to full re-query
    expect(info.request.range.from.valueOf()).toBe(NOW - 60_000);
  });

  it('builds correct target signatures', () => {
    const cache = new QueryCache();
    const info = cache.requestInfo(makeRequest() as any);
    expect(info.targetSignatures.get(ident)).toBe(sig);
  });

  it('skips ineligible targets in signatures', () => {
    const cache = new QueryCache();
    const request = makeRequest({
      targets: [makeQuery({ formatAs: FormatAs.Variable })],
    }) as any;
    const info = cache.requestInfo(request);
    expect(info.targetSignatures.size).toBe(0);
  });
});

// ── QueryCache.procFrames ─────────────────────────────────────────────────────
describe('QueryCache.procFrames', () => {
  const makeCacheRequestInfo = (overrides: Partial<CacheRequestInfo> = {}): CacheRequestInfo => ({
    request: makeRequest() as any,
    targetSignatures: new Map([['dash1|1|A', 'error|my-repo|logs']]),
    shouldCache: true,
    ...overrides,
  });

  it('returns frames unchanged when shouldCache=false', () => {
    const cache = new QueryCache();
    const frame = { refId: 'A', fields: [], length: 0 };
    const result = cache.procFrames(
      makeRequest() as any,
      makeCacheRequestInfo({ shouldCache: false }),
      [frame as any]
    );
    expect(result[0]).toBe(frame);
  });

  it('passes through frames for ineligible targets', () => {
    const cache = new QueryCache();
    const frame = { refId: 'A', fields: [], length: 0 };
    // Empty targetSignatures → A is not eligible
    const result = cache.procFrames(
      makeRequest() as any,
      makeCacheRequestInfo({ targetSignatures: new Map() }),
      [frame as any]
    );
    expect(result[0]).toStrictEqual(frame);
  });

  it('caches a frame on first call (cache miss)', () => {
    const cache = new QueryCache();
    const frame = {
      refId: 'A',
      fields: [makeField('@timestamp', FieldType.time, [new Date(NOW - 60_000)])],
      length: 1,
    };
    cache.procFrames(makeRequest() as any, makeCacheRequestInfo(), [frame as any]);
    expect(cache.cache.get('dash1|1|A')).toBeDefined();
    expect(cache.cache.get('dash1|1|A')!.signature).toBe('error|my-repo|logs');
  });

  describe('ascending (metrics) merge', () => {
    const t1 = new Date(NOW - 30 * 60_000); // 30 min ago — before cutoff
    const t2 = new Date(NOW - 20 * 60_000); // 20 min ago — before cutoff
    const t3 = new Date(NOW - 5 * 60_000);  // 5 min ago  — new
    const t4 = new Date(NOW);               // now         — new

    const seedFrames = [{
      refId: 'A',
      fields: [
        makeField('@timestamp', FieldType.time, [t1, t2]),
        makeField('value', FieldType.number, [1, 2]),
      ],
      length: 2,
    }];

    const newFrames = [{
      refId: 'A',
      fields: [
        makeField('@timestamp', FieldType.time, [t3, t4]),
        makeField('value', FieldType.number, [3, 4]),
      ],
      length: 2,
    }];

    it('prepends cached rows and appends new rows', () => {
      const cache = new QueryCache();
      // Seed the cache via first call.
      cache.procFrames(makeRequest() as any, makeCacheRequestInfo(), seedFrames as any);

      // Second call with new data.
      const [result] = cache.procFrames(makeRequest() as any, makeCacheRequestInfo(), newFrames as any);
      const tsVals = result.fields.find((f) => f.name === '@timestamp')!.values as Date[];
      expect(tsVals).toEqual([t1, t2, t3, t4]);
    });

    it('merges value column in parallel', () => {
      const cache = new QueryCache();
      cache.procFrames(makeRequest() as any, makeCacheRequestInfo(), seedFrames as any);
      const [result] = cache.procFrames(makeRequest() as any, makeCacheRequestInfo(), newFrames as any);
      const numVals = result.fields.find((f) => f.name === 'value')!.values;
      expect(numVals).toEqual([1, 2, 3, 4]);
    });

    it('sets frame length to the merged row count', () => {
      const cache = new QueryCache();
      cache.procFrames(makeRequest() as any, makeCacheRequestInfo(), seedFrames as any);
      const [result] = cache.procFrames(makeRequest() as any, makeCacheRequestInfo(), newFrames as any);
      expect(result.length).toBe(4);
    });
  });

  describe('descending (log events) merge', () => {
    const tOld1 = new Date(NOW - 40 * 60_000); // 40 min ago
    const tOld2 = new Date(NOW - 30 * 60_000); // 30 min ago
    const tNew1 = new Date(NOW - 2 * 60_000);  // 2 min ago
    const tNew2 = new Date(NOW);               // now

    const seedFrames = [{
      refId: 'A',
      fields: [
        makeField('@timestamp', FieldType.time, [tOld2, tOld1]), // newest-first
        makeField('@rawstring', FieldType.string, ['msg2', 'msg1']),
      ],
      length: 2,
    }];

    const newFrames = [{
      refId: 'A',
      fields: [
        makeField('@timestamp', FieldType.time, [tNew2, tNew1]),
        makeField('@rawstring', FieldType.string, ['msg4', 'msg3']),
      ],
      length: 2,
    }];

    it('produces newest-first ordering after merge', () => {
      const cache = new QueryCache();
      cache.procFrames(makeRequest() as any, makeCacheRequestInfo(), seedFrames as any);
      const [result] = cache.procFrames(makeRequest() as any, makeCacheRequestInfo(), newFrames as any);
      const tsVals = result.fields.find((f) => f.name === '@timestamp')!.values as Date[];
      expect(tsVals[0].getTime()).toBeGreaterThanOrEqual(tsVals[1].getTime());
      expect(tsVals).toContain(tNew2);
      expect(tsVals).toContain(tNew1);
      expect(tsVals).toContain(tOld2);
      expect(tsVals).toContain(tOld1);
    });

    it('sets frame length to the merged row count', () => {
      const cache = new QueryCache();
      cache.procFrames(makeRequest() as any, makeCacheRequestInfo(), seedFrames as any);
      const [result] = cache.procFrames(makeRequest() as any, makeCacheRequestInfo(), newFrames as any);
      expect(result.length).toBe(4);
    });
  });

  describe('empty response', () => {
    it('serves cached frames when the partial query returns no frames', () => {
      const cache = new QueryCache();
      const t1 = new Date(NOW - 30 * 60_000);
      const frame = {
        refId: 'A',
        fields: [
          makeField('@timestamp', FieldType.time, [t1]),
          makeField('value', FieldType.number, [1]),
        ],
        length: 1,
      };
      // Seed the cache.
      cache.procFrames(makeRequest() as any, makeCacheRequestInfo(), [frame as any]);

      // Partial query returns nothing — cached data must still be served.
      const result = cache.procFrames(makeRequest() as any, makeCacheRequestInfo(), []);
      expect(result).toHaveLength(1);
      expect(result[0].fields.find((f) => f.name === 'value')!.values).toEqual([1]);
    });

    it('advances prevTo when the partial query returns no frames', () => {
      const cache = new QueryCache();
      const frame = {
        refId: 'A',
        fields: [makeField('@timestamp', FieldType.time, [new Date(NOW - 60_000)])],
        length: 1,
      };
      cache.procFrames(makeRequest() as any, makeCacheRequestInfo(), [frame as any]);

      cache.procFrames(makeRequest() as any, makeCacheRequestInfo(), []);
      expect(cache.cache.get('dash1|1|A')!.prevTo).toBe(NOW);
    });
  });

  describe('trimming to request range', () => {
    it('excludes cached rows outside the request range', () => {
      const cache = new QueryCache();

      // Seed with a frame that covers the request window.
      const t1 = new Date(NOW - 30 * 60_000);
      const t2 = new Date(NOW - 20 * 60_000);
      const seedFrames = [{
        refId: 'A',
        fields: [
          makeField('@timestamp', FieldType.time, [t1, t2]),
          makeField('value', FieldType.number, [1, 2]),
        ],
        length: 2,
      }];
      cache.procFrames(makeRequest() as any, makeCacheRequestInfo(), seedFrames as any);

      // Now request with a narrowed window that excludes t1.
      const narrowFrom = dateTime(NOW - 25 * 60_000);
      const narrowRequest = makeRequest({
        range: { from: narrowFrom, to: dateTime(NOW), raw: {} },
      });
      const newFrames = [{
        refId: 'A',
        fields: [
          makeField('@timestamp', FieldType.time, [new Date(NOW - 5 * 60_000)]),
          makeField('value', FieldType.number, [3]),
        ],
        length: 1,
      }];
      const [result] = cache.procFrames(
        narrowRequest as any,
        makeCacheRequestInfo({ request: narrowRequest as any }),
        newFrames as any
      );
      const tsVals = result.fields.find((f) => f.name === '@timestamp')!.values as Date[];
      expect(tsVals).not.toContain(t1); // outside narrow window
      expect(tsVals).toContain(t2);
    });
  });

  describe('output cloning', () => {
    it('returns cloned field values so callers cannot mutate the cache', () => {
      const cache = new QueryCache();
      const frame = {
        refId: 'A',
        fields: [makeField('@timestamp', FieldType.time, [new Date(NOW)])],
        length: 1,
      };
      const [result] = cache.procFrames(makeRequest() as any, makeCacheRequestInfo(), [frame as any]);
      const cached = cache.cache.get('dash1|1|A')!.frames[0];
      // Mutating the returned values must not affect the cache.
      (result.fields[0].values as unknown[]).push(new Date(NOW + 1));
      expect((cached.fields[0].values as unknown[]).length).toBe(1);
    });
  });
});
