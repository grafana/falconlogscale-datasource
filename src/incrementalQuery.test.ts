import { FieldType } from '@grafana/data';
import {
  CacheEntry,
  IncrementalQueryCache,
  isCacheValid,
  isEligibleForIncremental,
  lsqlContainsAggregation,
  mergeWithCache,
  parseDuration,
  schemasMatch,
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

const makeCacheEntry = (overrides: Partial<CacheEntry> = {}): CacheEntry => ({
  frames: [],
  cachedFrom: NOW - 3_600_000,
  cachedTo: NOW - 60_000,
  lsql: 'error',
  repository: 'my-repo',
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

// ── schemasMatch ──────────────────────────────────────────────────────────────

describe('schemasMatch', () => {
  const frame = (names: string[]) => ({
    refId: 'A',
    fields: names.map((n) => makeField(n, FieldType.string, [])),
    length: 0,
  });

  it('returns true when field names are identical', () => {
    expect(schemasMatch(frame(['@timestamp', 'value']), frame(['@timestamp', 'value']))).toBe(true);
  });

  it('returns true regardless of field order', () => {
    expect(schemasMatch(frame(['value', '@timestamp']), frame(['@timestamp', 'value']))).toBe(true);
  });

  it('returns false when new frame has an extra field', () => {
    expect(schemasMatch(frame(['@timestamp']), frame(['@timestamp', 'newField']))).toBe(false);
  });

  it('returns false when new frame is missing a field', () => {
    expect(schemasMatch(frame(['@timestamp', 'value']), frame(['@timestamp']))).toBe(false);
  });

  it('returns false when field names differ with same count', () => {
    expect(schemasMatch(frame(['@timestamp', 'old']), frame(['@timestamp', 'new']))).toBe(false);
  });
});

// ── parseDuration ─────────────────────────────────────────────────────────────

describe('parseDuration', () => {
  it.each([
    ['0s', 0],
    ['30s', 30_000],
    ['1m', 60_000],
    ['10m', 600_000],
    ['1h', 3_600_000],
    ['2h', 7_200_000],
    ['1d', 86_400_000],
    ['500ms', 500],
  ])('parses "%s" to %i ms', (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it('returns default 10m for invalid input', () => {
    expect(parseDuration('foo')).toBe(600_000);
    expect(parseDuration('')).toBe(600_000);
    expect(parseDuration('10')).toBe(600_000);
  });
});

// ── IncrementalQueryCache ─────────────────────────────────────────────────────

describe('IncrementalQueryCache', () => {
  it('builds a key from query fields', () => {
    const cache = new IncrementalQueryCache();
    const q = makeQuery();
    const key = cache.buildKey(q);
    expect(key).toBe(`${q.repository}::${q.formatAs}::${q.lsql}`);
  });

  it('stores and retrieves entries', () => {
    const cache = new IncrementalQueryCache();
    const q = makeQuery();
    const key = cache.buildKey(q);
    const entry = makeCacheEntry();
    cache.set(key, entry);
    expect(cache.get(key)).toBe(entry);
  });

  it('deletes entries', () => {
    const cache = new IncrementalQueryCache();
    const q = makeQuery();
    const key = cache.buildKey(q);
    cache.set(key, makeCacheEntry());
    cache.delete(key);
    expect(cache.get(key)).toBeUndefined();
  });

  it('clears all entries', () => {
    const cache = new IncrementalQueryCache();
    cache.set('a', makeCacheEntry());
    cache.set('b', makeCacheEntry());
    cache.clear();
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
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

// ── isCacheValid ──────────────────────────────────────────────────────────────

describe('isCacheValid', () => {
  const entry = makeCacheEntry();

  it('returns true for a normal sliding-window refresh', () => {
    // requestFromMs is later than cachedFrom (window slid forward)
    const requestFromMs = NOW - 3_500_000;
    expect(isCacheValid(entry, makeQuery(), requestFromMs)).toBe(true);
  });

  it('returns true when requestFromMs equals cachedFrom', () => {
    expect(isCacheValid(entry, makeQuery(), entry.cachedFrom)).toBe(true);
  });

  it('returns false when lsql changed', () => {
    expect(isCacheValid(entry, makeQuery({ lsql: 'new query' }), entry.cachedFrom)).toBe(false);
  });

  it('returns false when repository changed', () => {
    expect(isCacheValid(entry, makeQuery({ repository: 'other-repo' }), entry.cachedFrom)).toBe(false);
  });

  it('returns false when user expands time range backwards', () => {
    // requestFromMs is much earlier than cachedFrom
    const requestFromMs = entry.cachedFrom - 10_000;
    expect(isCacheValid(entry, makeQuery(), requestFromMs)).toBe(false);
  });

  it('allows small tolerance around cachedFrom', () => {
    // within 5s is still valid
    const requestFromMs = entry.cachedFrom - 4_999;
    expect(isCacheValid(entry, makeQuery(), requestFromMs)).toBe(true);
  });
});

// ── mergeWithCache ────────────────────────────────────────────────────────────

describe('mergeWithCache', () => {
  const T = NOW;
  const cutoff = T - 10 * 60_000;      // 10 minutes ago
  const requestFrom = T - 60 * 60_000; // 1 hour ago (well before any test data)

  it('returns new frame unchanged when no matching cached frame exists', () => {
    const entry = makeCacheEntry({ frames: [] });
    const newFrame = {
      refId: 'A',
      name: 'events',
      fields: [makeField('@timestamp', FieldType.time, [new Date(T)])],
      length: 1,
    };
    const result = mergeWithCache(entry, [newFrame], cutoff, requestFrom);
    expect(result[0]).toBe(newFrame);
  });

  it('returns new frame unchanged when @timestamp field is absent', () => {
    const cachedFrame = {
      refId: 'A',
      name: 'events',
      fields: [makeField('message', FieldType.string, ['old'])],
      length: 1,
    };
    const entry = makeCacheEntry({ frames: [cachedFrame] });
    const newFrame = {
      refId: 'A',
      name: 'events',
      fields: [makeField('message', FieldType.string, ['new'])],
      length: 1,
    };
    const result = mergeWithCache(entry, [newFrame], cutoff, requestFrom);
    expect(result[0]).toBe(newFrame);
  });

  describe('ascending (metrics / time series)', () => {
    // oldest → newest order
    const t1 = new Date(T - 30 * 60_000); // 30 min ago — before cutoff
    const t2 = new Date(T - 20 * 60_000); // 20 min ago — before cutoff
    const t3 = new Date(T - 5 * 60_000);  // 5 min ago  — after cutoff (new)
    const t4 = new Date(T);               // now         — after cutoff (new)

    const cachedFrame = {
      refId: 'A',
      name: 'events',
      fields: [
        makeField('@timestamp', FieldType.time, [t1, t2]),
        makeField('value', FieldType.number, [1, 2]),
      ],
      length: 2,
    };
    const newFrame = {
      refId: 'A',
      name: 'events',
      fields: [
        makeField('@timestamp', FieldType.time, [t3, t4]),
        makeField('value', FieldType.number, [3, 4]),
      ],
      length: 2,
    };

    it('prepends cached rows that precede the cutoff', () => {
      const entry = makeCacheEntry({ frames: [cachedFrame] });
      const [result] = mergeWithCache(entry, [newFrame], cutoff, requestFrom);
      const tsValues = result.fields.find((f) => f.name === '@timestamp')!.values;
      expect(tsValues).toEqual([t1, t2, t3, t4]);
    });

    it('sets frame length to the merged row count', () => {
      const entry = makeCacheEntry({ frames: [cachedFrame] });
      const [result] = mergeWithCache(entry, [newFrame], cutoff, requestFrom);
      expect(result.length).toBe(4);
    });

    it('merges all field columns in parallel', () => {
      const entry = makeCacheEntry({ frames: [cachedFrame] });
      const [result] = mergeWithCache(entry, [newFrame], cutoff, requestFrom);
      const numValues = result.fields.find((f) => f.name === 'value')!.values;
      expect(numValues).toEqual([1, 2, 3, 4]);
    });

    it('drops cached rows that fall inside the overlap window', () => {
      // Add a cached row inside the overlap window (after cutoff)
      const tInOverlap = new Date(cutoff + 60_000);
      const cachedWithOverlap = {
        ...cachedFrame,
        fields: [
          makeField('@timestamp', FieldType.time, [t1, t2, tInOverlap]),
          makeField('value', FieldType.number, [1, 2, 99]),
        ],
      };
      const entry = makeCacheEntry({ frames: [cachedWithOverlap] });
      const [result] = mergeWithCache(entry, [newFrame], cutoff, requestFrom);
      const tsValues = result.fields.find((f) => f.name === '@timestamp')!.values;
      // tInOverlap must NOT appear — it is replaced by new data
      expect(tsValues).toContain(t1);
      expect(tsValues).toContain(t2);
      expect(tsValues).not.toContain(tInOverlap);
    });

    it('excludes cached rows older than requestFromMs', () => {
      // t1 is before the narrowed requestFrom, t2 is within range
      const narrowFrom = T - 25 * 60_000; // 25 min ago — between t1 (30m) and t2 (20m)
      const entry = makeCacheEntry({ frames: [cachedFrame] });
      const [result] = mergeWithCache(entry, [newFrame], cutoff, narrowFrom);
      const tsValues = result.fields.find((f) => f.name === '@timestamp')!.values;
      expect(tsValues).not.toContain(t1);
      expect(tsValues).toContain(t2);
      expect(tsValues).toContain(t3);
      expect(tsValues).toContain(t4);
    });
  });

  describe('descending (log events)', () => {
    // newest → oldest order
    const tOld1 = new Date(T - 40 * 60_000); // 40 min ago — before cutoff
    const tOld2 = new Date(T - 30 * 60_000); // 30 min ago — before cutoff
    const tNew1 = new Date(T - 2 * 60_000);  // 2 min ago  — after cutoff
    const tNew2 = new Date(T);               // now         — after cutoff

    const cachedFrame = {
      refId: 'A',
      name: 'events',
      fields: [
        makeField('@timestamp', FieldType.time, [tOld2, tOld1]),  // newest-first
        makeField('@rawstring', FieldType.string, ['msg2', 'msg1']),
      ],
      length: 2,
    };
    const newFrame = {
      refId: 'A',
      name: 'events',
      fields: [
        makeField('@timestamp', FieldType.time, [tNew2, tNew1]),
        makeField('@rawstring', FieldType.string, ['msg4', 'msg3']),
      ],
      length: 2,
    };

    it('produces newest-first ordering after merge', () => {
      const entry = makeCacheEntry({ frames: [cachedFrame] });
      const [result] = mergeWithCache(entry, [newFrame], cutoff, requestFrom);
      const tsValues = result.fields.find((f) => f.name === '@timestamp')!.values;
      expect(tsValues).toEqual([tNew2, tNew1, tOld2, tOld1]);
    });

    it('sets frame length to the merged row count', () => {
      const entry = makeCacheEntry({ frames: [cachedFrame] });
      const [result] = mergeWithCache(entry, [newFrame], cutoff, requestFrom);
      expect(result.length).toBe(4);
    });

    it('merges @rawstring in the same order', () => {
      const entry = makeCacheEntry({ frames: [cachedFrame] });
      const [result] = mergeWithCache(entry, [newFrame], cutoff, requestFrom);
      const rawValues = result.fields.find((f) => f.name === '@rawstring')!.values;
      expect(rawValues).toEqual(['msg4', 'msg3', 'msg2', 'msg1']);
    });

    it('excludes cached rows older than requestFromMs', () => {
      // tOld1 is before the narrowed requestFrom, tOld2 is within range
      const narrowFrom = T - 35 * 60_000; // 35 min ago — between tOld1 (40m) and tOld2 (30m)
      const entry = makeCacheEntry({ frames: [cachedFrame] });
      const [result] = mergeWithCache(entry, [newFrame], cutoff, narrowFrom);
      const tsValues = result.fields.find((f) => f.name === '@timestamp')!.values;
      expect(tsValues).not.toContain(tOld1);
      expect(tsValues).toContain(tOld2);
      expect(tsValues).toContain(tNew1);
      expect(tsValues).toContain(tNew2);
    });
  });

  describe('schema evolution', () => {
    it('appends fields present in new frame but absent from cache', () => {
      const cachedFrame = {
        refId: 'A',
        name: 'events',
        fields: [
          makeField('@timestamp', FieldType.time, [new Date(T - 20 * 60_000)]),
          makeField('value', FieldType.number, [1]),
        ],
        length: 1,
      };
      const newFrame = {
        refId: 'A',
        name: 'events',
        fields: [
          makeField('@timestamp', FieldType.time, [new Date(T)]),
          makeField('value', FieldType.number, [2]),
          makeField('newField', FieldType.string, ['extra']),
        ],
        length: 1,
      };
      const entry = makeCacheEntry({ frames: [cachedFrame] });
      const [result] = mergeWithCache(entry, [newFrame], cutoff, requestFrom);
      const fieldNames = result.fields.map((f) => f.name);
      expect(fieldNames).toContain('newField');
    });
  });
});
