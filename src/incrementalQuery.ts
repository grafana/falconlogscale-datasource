// Core pattern mirrors grafana-prometheus QueryCache:
// https://github.com/grafana/grafana/blob/main/packages/grafana-prometheus/src/querycache/QueryCache.ts
import {
  amendTable,
  DataFrame,
  DataQueryRequest,
  dateTime,
  durationToMilliseconds,
  incrRoundDn,
  isValidDuration,
  parseDuration,
  QueryResultMetaNotice,
  Table,
} from '@grafana/data';
import { FormatAs, LogScaleQuery, LogScaleQueryType } from './types';

export const DEFAULT_OVERLAP_WINDOW = '10m';

// dashboardUID|panelId|refId — stable across query/interval changes.
type TargetId = string;
// lsql|repository|formatAs
type TargetSig = string;

interface TargetCache {
  signature: TargetSig;
  prevTo: number;
  frames: DataFrame[];
}

export interface CacheRequestInfo {
  /** The (possibly time-adjusted) request to send to the backend. */
  request: DataQueryRequest<LogScaleQuery>;
  targetSignatures: Map<TargetId, TargetSig>;
  shouldCache: boolean;
}

// Complete list of LogScale aggregate functions.
// Source: https://library.humio.com/data-analysis/functions-aggregate.html
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

export function isEligibleForIncremental(query: LogScaleQuery): boolean {
  return (
    query.queryType === LogScaleQueryType.LQL &&
    query.formatAs !== FormatAs.Variable &&
    !query.live &&
    !query.disableIncrementalQuerying &&
    !lsqlContainsAggregation(query.lsql ?? '')
  );
}

function getTargetId(request: DataQueryRequest<LogScaleQuery>, target: LogScaleQuery): TargetId {
  return `${request.dashboardUID ?? ''}|${request.panelId ?? ''}|${target.refId}`;
}

function getTargetSignature(target: LogScaleQuery): TargetSig {
  return `${target.lsql ?? ''}|${target.repository ?? ''}|${target.formatAs ?? ''}`;
}

function tsToMs(value: Date | number): number {
  return value instanceof Date ? value.getTime() : value;
}

function isFrameDescending(frame: DataFrame): boolean {
  const tsIdx = frame.fields.findIndex((f) => f.name === '@timestamp');
  if (tsIdx === -1 || frame.length < 2) {
    return false;
  }
  const vals = frame.fields[tsIdx].values as Array<Date | number>;
  return tsToMs(vals[0]) > tsToMs(vals[frame.length - 1]);
}

function cloneFrame(frame: DataFrame): DataFrame {
  return {
    ...frame,
    fields: frame.fields.map((f) => ({ ...f, values: f.values.slice() })),
  };
}

/**
 * Merge a descending (log) response frame into the accumulated cached frame.
 * New events are prepended; cached rows that fall inside the overlap window
 * (ts >= cutoffMs) are dropped so the fresher response data takes precedence.
 */
function mergeDescending(cachedFrame: DataFrame, respFrame: DataFrame): DataFrame {
  const tsIdx = respFrame.fields.findIndex((f) => f.name === '@timestamp');

  // Determine the cutoff: the earliest timestamp in the response (last row,
  // since the frame is newest-first).  Cached rows at or after this point are
  // already covered by the new response.
  let cutoffMs = -Infinity;
  if (tsIdx !== -1) {
    const respTsVals = respFrame.fields[tsIdx].values as Array<Date | number>;
    if (respTsVals.length > 0) {
      cutoffMs = tsToMs(respTsVals[respTsVals.length - 1]);
    }
  }

  // Find the first cached row that predates the cutoff.
  const cachedTsIdx = cachedFrame.fields.findIndex((f) => f.name === '@timestamp');
  let keepFrom = 0;
  if (cachedTsIdx !== -1) {
    const cachedTsVals = cachedFrame.fields[cachedTsIdx].values as Array<Date | number>;
    while (keepFrom < cachedTsVals.length && tsToMs(cachedTsVals[keepFrom]) >= cutoffMs) {
      keepFrom++;
    }
  }

  const mergedFields = cachedFrame.fields.map((cachedField) => {
    const respField = respFrame.fields.find((f) => f.name === cachedField.name);
    const newVals = respField ? [...respField.values] : [];
    const oldVals = cachedField.values.slice(keepFrom);
    return { ...cachedField, values: [...newVals, ...oldVals] };
  });

  // Append fields present only in the new frame (schema evolution).
  const newOnlyFields = respFrame.fields.filter(
    (rf) => !cachedFrame.fields.some((cf) => cf.name === rf.name)
  );

  const allFields = [...mergedFields, ...newOnlyFields];
  return {
    ...cachedFrame,
    fields: allFields,
    length: allFields[0]?.values.length ?? 0,
  };
}

/**
 * Trim a frame's rows to the [fromMs, toMs] window.
 * Returns null when the result would be empty.
 */
function trimFrameToRange(frame: DataFrame, fromMs: number, toMs: number): DataFrame | null {
  const tsIdx = frame.fields.findIndex((f) => f.name === '@timestamp');
  if (tsIdx === -1) {
    return frame.length > 0 ? frame : null;
  }

  const tsVals = frame.fields[tsIdx].values as Array<Date | number>;
  const rowCount = tsVals.length;
  const desc = isFrameDescending(frame);
  let start = 0;
  let end = rowCount;

  if (desc) {
    // newest-first: skip rows newer than toMs, then keep while >= fromMs.
    while (start < rowCount && tsToMs(tsVals[start]) > toMs) { start++; }
    end = start;
    while (end < rowCount && tsToMs(tsVals[end]) >= fromMs) { end++; }
  } else {
    // oldest-first: skip rows older than fromMs, keep while <= toMs.
    while (start < rowCount && tsToMs(tsVals[start]) < fromMs) { start++; }
    end = start;
    while (end < rowCount && tsToMs(tsVals[end]) <= toMs) { end++; }
  }

  if (end <= start) {
    return null;
  }
  if (start === 0 && end === rowCount) {
    return frame;
  }

  return {
    ...frame,
    fields: frame.fields.map((f) => ({ ...f, values: f.values.slice(start, end) })),
    length: end - start,
  };
}

export class QueryCache {
  private overlapWindowMs: number;
  /** Exposed for testing. */
  cache = new Map<TargetId, TargetCache>();

  constructor(overlapString: string = DEFAULT_OVERLAP_WINDOW) {
    this.overlapWindowMs = isValidDuration(overlapString)
      ? durationToMilliseconds(parseDuration(overlapString))
      : durationToMilliseconds(parseDuration(DEFAULT_OVERLAP_WINDOW));
  }

  /**
   * Inspects the cache and returns an (optionally time-adjusted) request along
   * with metadata consumed by procFrames.  Mirrors Prometheus QueryCache.requestInfo.
   */
  requestInfo(request: DataQueryRequest<LogScaleQuery>): CacheRequestInfo {
    const newFrom = request.range.from.valueOf();
    const newTo = request.range.to.valueOf();

    // Only cache relative-to-now queries that can benefit from incremental updates.
    const shouldCache = request.rangeRaw?.to?.toString() === 'now';

    const targetSignatures = new Map<TargetId, TargetSig>();
    for (const target of request.targets) {
      if (isEligibleForIncremental(target)) {
        targetSignatures.set(getTargetId(request, target), getTargetSignature(target));
      }
    }

    let doPartialQuery = shouldCache && targetSignatures.size > 0;
    let prevTo: number | undefined;
    const invalidatedIds = new Set<TargetId>();

    for (const [id, sig] of targetSignatures) {
      const cached = this.cache.get(id);
      if (cached?.signature !== sig) {
        if (cached !== undefined) {
          // Had a prior entry but the query changed — record for notice in procFrames.
          invalidatedIds.add(id);
        }
        doPartialQuery = false;
        break;
      }
      prevTo = cached.prevTo;
      // Only do a partial query when the new window follows the cached window.
      if (!(newTo > prevTo && newFrom <= prevTo)) {
        doPartialQuery = false;
        break;
      }
    }

    if (doPartialQuery && prevTo !== undefined) {
      // Clamp so we never re-query further back than the overlap window allows.
      const newFromPartial = Math.max(prevTo - this.overlapWindowMs, newFrom);
      // Align to panel interval to improve backend cache-hit probability (same as Prometheus).
      const alignedFrom = request.intervalMs > 0
        ? incrRoundDn(newFromPartial, request.intervalMs)
        : newFromPartial;
      request = {
        ...request,
        range: {
          ...request.range,
          from: dateTime(alignedFrom),
          to: dateTime(newTo),
        },
      };
    } else {
      // Full re-query: evict stale entries so procFrames starts fresh.
      for (const id of targetSignatures.keys()) {
        this.cache.delete(id);
      }
    }

    return { request, targetSignatures, shouldCache };
  }

  /**
   * Merges backend response frames with the accumulated cache and returns the
   * full result trimmed to the original request's time range.
   * Must be called with the *original* (un-adjusted) request.
   * Mirrors Prometheus QueryCache.procFrames.
   */
  procFrames(
    request: DataQueryRequest<LogScaleQuery>,
    requestInfo: CacheRequestInfo | undefined,
    respFrames: DataFrame[]
  ): DataFrame[] {
    if (!requestInfo?.shouldCache) {
      return respFrames;
    }

    const newFrom = request.range.from.valueOf();
    const newTo = request.range.to.valueOf();

    // Group response frames by target identity.
    const framesById = new Map<TargetId, DataFrame[]>();
    for (const frame of respFrames) {
      const id = `${request.dashboardUID ?? ''}|${request.panelId ?? ''}|${frame.refId}`;
      const list = framesById.get(id) ?? [];
      list.push(frame);
      framesById.set(id, list);
    }

    const outFrames: DataFrame[] = [];

    // Pass through frames for ineligible targets (not in targetSignatures).
    for (const [id, frames] of framesById) {
      if (!requestInfo.targetSignatures.has(id)) {
        outFrames.push(...frames);
      }
    }

    // Process all eligible targets. Iterating over targetSignatures (rather than
    // framesById) means id with no response frames are also visited, so cached
    // data is served when a partial query returns empty — both paths share the same
    // trim/cache/output logic below.
    for (const [id, sig] of requestInfo.targetSignatures) {
      const respFrames = framesById.get(id) ?? [];
      const cachedEntry = this.cache.get(id);

      if (respFrames.length === 0 && !cachedEntry) {
        continue; // Nothing to serve and nothing to merge.
      }

      // Clone cached frames before merging so that mergeDescending (which splices
      // field value arrays in place) cannot corrupt the stored cache entry.
      // A second, shallower clone is applied to all output frames at the end of
      // procFrames to prevent downstream Grafana transforms from mutating the cache
      // through shared array references — both clones are load-bearing.
      const accFrames: DataFrame[] = cachedEntry ? cachedEntry.frames.map(cloneFrame) : [];

      for (const respFrame of respFrames) {
        if (respFrame.length === 0 || respFrame.fields.length === 0) {
          continue;
        }

        const idx = accFrames.findIndex((f) => f.refId === respFrame.refId);
        if (idx === -1) {
          accFrames.push(respFrame);
        } else {
          const cachedFrame = accFrames[idx];
          if (isFrameDescending(cachedFrame)) {
            // Descending (log events): prepend new rows, drop overlap from cache.
            accFrames[idx] = mergeDescending(cachedFrame, respFrame);
          } else {
            // Ascending (metrics): use amendTable from @grafana/data to append
            // new rows that come after the cached window.
            const prevTable = cachedFrame.fields.map((f) => f.values) as Table;
            const nextTable = respFrame.fields.map((f) => f.values) as Table;
            const amendedTable = amendTable(prevTable, nextTable);
            if (amendedTable) {
              accFrames[idx] = {
                ...cachedFrame,
                fields: cachedFrame.fields.map((field, i) => ({
                  ...field,
                  values: amendedTable[i] ?? field.values,
                })),
                length: amendedTable[0]?.length ?? cachedFrame.length,
              };
            }
          }
        }
      }

      // Trim each accumulated frame to the original request range and update the
      // cache. prevTo is always advanced so the next refresh queries from the
      // current window edge, even when the response was empty.
      const trimmedFrames: DataFrame[] = [];
      for (const frame of accFrames) {
        const trimmed = trimFrameToRange(frame, newFrom, newTo);
        if (trimmed !== null) {
          trimmedFrames.push(trimmed);
        }
      }

      this.cache.set(id, { signature: sig, prevTo: newTo, frames: trimmedFrames });

      outFrames.push(...trimmedFrames);
    }

    // Shallow-clone field value arrays so downstream Grafana transforms cannot
    // mutate the arrays we just stored in the cache (see deep clone above).
    // transformV2 mutates field values for heatmap de-acc, and modifies field order, so we gotta clone here, for now :(
    return outFrames.map((frame) => ({
      ...frame,
      fields: frame.fields.map((field) => ({
        ...field,
        values: field.values.slice(),
      })),
    }));
  }
}
