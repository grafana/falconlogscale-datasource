import { DataFrame } from '@grafana/data';
import { FormatAs, LogScaleQuery, LogScaleQueryType } from './types';

const DEFAULT_OVERLAP_MS = 10 * 60 * 1000;

export function parseDuration(duration: string): number {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/.exec(duration.trim());
  if (!match) {
    return DEFAULT_OVERLAP_MS;
  }
  const n = parseFloat(match[1]);
  switch (match[2]) {
    case 'ms':
      return n;
    case 's':
      return n * 1_000;
    case 'm':
      return n * 60_000;
    case 'h':
      return n * 3_600_000;
    case 'd':
      return n * 86_400_000;
    default:
      return DEFAULT_OVERLAP_MS;
  }
}

export interface CacheEntry {
  frames: DataFrame[];
  cachedFrom: number;
  cachedTo: number;
  lsql: string;
  repository: string;
}

export class IncrementalQueryCache {
  private store = new Map<string, CacheEntry>();

  buildKey(query: LogScaleQuery): string {
    return `${query.repository}::${query.formatAs}::${query.lsql}`;
  }

  get(key: string): CacheEntry | undefined {
    return this.store.get(key);
  }

  set(key: string, entry: CacheEntry): void {
    this.store.set(key, entry);
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

// Complete list of LogScale aggregate functions.
// Source: https://library.humio.com/data-analysis/functions-aggregate.html
// Aggregate functions summarise multiple events into fewer rows, so incremental
// querying (which splices cached rows with a fresh partial result) produces
// incorrect totals/counts for these queries.
const AGGREGATE_FUNCTIONS = [
  'accumulate', 'array:intersection', 'array:reduceAll', 'array:reduceColumn',
  'array:union', 'avg', 'bucket', 'callFunction', 'collect', 'correlate',
  'count', 'counterAsRate', 'createEvents', 'fieldStats', 'groupBy', 'head',
  'linReg', 'max', 'min', 'neighbor', 'partition', 'percentage', 'percentile',
  'range', 'rdns', 'sankey', 'selectFromMax', 'selectFromMin', 'selectLast',
  'series', 'session', 'slidingTimeWindow', 'slidingWindow', 'sort', 'stats',
  'stdDev', 'sum', 'table', 'tail', 'timeChart', 'top', 'transpose', 'window',
  'worldMap',
];

const AGGREGATE_FN_RE = new RegExp(
  `\\b(?:${AGGREGATE_FUNCTIONS.map((fn) => fn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*\\(`,
  'i'
);

export function lsqlContainsAggregation(lsql: string): boolean {
  return AGGREGATE_FN_RE.test(lsql);
}

/**
 * Returns true when the two frames have exactly the same set of field names.
 * Used to detect schema changes that would produce malformed merged frames.
 */
export function schemasMatch(cached: DataFrame, next: DataFrame): boolean {
  const cachedNames = cached.fields.sort((a, b) => {
    if (b.name > a.name) {return 1;}
    if (b.name < a.name) {return -1;}
    return 0;
  });

  const nextNames = next.fields.sort((a, b) => {
    if (b.name > a.name) {return 1;}
    if (b.name < a.name) {return -1;}
    return 0;
  });

  if (cachedNames.length !== nextNames.length) {
    return false;
  }
  return cachedNames.every((f, i) => f.name === nextNames[i].name && f.type === nextNames[i].type);
}

export function isEligibleForIncremental(query: LogScaleQuery): boolean {
  return (
    query.queryType === LogScaleQueryType.LQL &&
    query.formatAs !== FormatAs.Variable &&
    !query.live &&
    !query.disableIncrementalQuerying &&
    !lsqlContainsAggregation(query.lsql ?? '')
  );
}

export function isCacheValid(entry: CacheEntry, query: LogScaleQuery, requestFromMs: number): boolean {
  if (entry.lsql !== query.lsql) {
    return false;
  }
  if (entry.repository !== query.repository) {
    return false;
  }
  // If the requested range starts significantly before what we cached, the user has
  // expanded the time window backwards and we need a full re-query.
  if (requestFromMs < entry.cachedFrom - 5_000) {
    return false;
  }
  return true;
}

function getTimestampMs(value: unknown): number {
  if (value instanceof Date) {
    return value.getTime();
  }
  return Number(value);
}

/**
 * Merge new frames from the backend with frames stored in the cache.
 *
 * cutoffMs:     cached rows with @timestamp < cutoffMs are retained; the new frames
 *               provide data for [cutoffMs, now], replacing everything at or after the cutoff.
 * requestFromMs: the dashboard's current "from" time. Cached rows older than this are
 *               excluded so that narrowing the time range takes effect immediately.
 */
export function mergeWithCache(
  cachedEntry: CacheEntry,
  newFrames: DataFrame[],
  cutoffMs: number,
  requestFromMs: number
): DataFrame[] {
  return newFrames.map((newFrame) => {
    const cachedFrame = cachedEntry.frames.find((f) => f.refId === newFrame.refId);
    if (!cachedFrame) {
      return newFrame;
    }

    const tsFieldIndex = cachedFrame.fields.findIndex((f) => f.name === '@timestamp');
    if (tsFieldIndex === -1) {
      return newFrame;
    }

    const cachedTsValues = cachedFrame.fields[tsFieldIndex].values as unknown[];
    const rowCount = cachedTsValues.length;

    // Detect sort order from first vs last timestamp.
    // Log events are newest-first (descending); time-series are oldest-first (ascending).
    const firstTs = rowCount > 0 ? getTimestampMs(cachedTsValues[0]) : 0;
    const lastTs = rowCount > 0 ? getTimestampMs(cachedTsValues[rowCount - 1]) : 0;
    const isDescending = rowCount > 1 && firstTs > lastTs;

    let keepStart = 0;
    let keepEnd = rowCount;

    if (isDescending) {
      // values: [newest, ..., oldest]
      // keepStart: skip rows in the overlap window (ts >= cutoffMs) — covered by new data.
      // keepEnd:   skip rows older than the dashboard's from time (ts < requestFromMs).
      let cutIdx = rowCount;
      for (let i = 0; i < rowCount; i++) {
        if (getTimestampMs(cachedTsValues[i]) < cutoffMs) {
          cutIdx = i;
          break;
        }
      }
      keepStart = cutIdx;

      let fromIdx = rowCount;
      for (let i = keepStart; i < rowCount; i++) {
        if (getTimestampMs(cachedTsValues[i]) < requestFromMs) {
          fromIdx = i;
          break;
        }
      }
      keepEnd = fromIdx;
    } else {
      // values: [oldest, ..., newest]
      // keepStart: skip rows older than the dashboard's from time (ts < requestFromMs).
      // keepEnd:   skip rows in the overlap window (ts >= cutoffMs) — covered by new data.
      let fromIdx = 0;
      for (let i = 0; i < rowCount; i++) {
        if (getTimestampMs(cachedTsValues[i]) < requestFromMs) {
          fromIdx = i + 1;
        }
      }
      keepStart = fromIdx;

      let cutIdx = keepStart;
      for (let i = keepStart; i < rowCount; i++) {
        if (getTimestampMs(cachedTsValues[i]) < cutoffMs) {
          cutIdx = i + 1;
        }
      }
      keepEnd = cutIdx;
    }

    const mergedFields = cachedFrame.fields.map((cachedField) => {
      const newField = newFrame.fields.find((f) => f.name === cachedField.name);
      const cachedValues = Array.from(cachedField.values as unknown[]).slice(keepStart, keepEnd);
      const newValues = newField ? Array.from(newField.values as unknown[]) : [];

      if (isDescending) {
        return { ...cachedField, values: [...newValues, ...cachedValues] };
      }
      return { ...cachedField, values: [...cachedValues, ...newValues] };
    });

    // Include fields that exist in the new frame but not in the cache (schema evolution).
    const newOnlyFields = newFrame.fields.filter((nf) => !cachedFrame.fields.some((cf) => cf.name === nf.name));

    const mergedLength = mergedFields.length > 0 ? (mergedFields[0].values as unknown[]).length : newFrame.length;
    return { ...newFrame, fields: [...mergedFields, ...newOnlyFields], length: mergedLength };
  });
}
