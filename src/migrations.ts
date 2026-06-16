import { FormatAs, LogScaleQuery, LogScaleQueryType } from 'types';

export function migrateQuery(query: LogScaleQuery): LogScaleQuery {
  const migratedQuery = { ...query };
  if (!query.hasOwnProperty('queryType')) {
    migratedQuery.queryType = LogScaleQueryType.LQL;
  }

  if (!query.hasOwnProperty('formatAs')) {
    migratedQuery.formatAs = FormatAs.Metrics;
  }

  return migratedQuery;
}
