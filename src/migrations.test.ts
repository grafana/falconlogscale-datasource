import { migrateQuery } from 'migrations';
import { LogScaleQueryType, FormatAs, LogScaleQuery } from 'types';

describe('migrateQuery', () => {
  describe('should migrate the query to the new format', () => {
    [
      {
        description: 'migrates a query without a type to the default (LQL)',
        input: {
          refId: 'A',
          intervalMs: 1000,
          query: '',
          repository: 'test-repo',
        },
        expected: {
          query: '',
          queryType: LogScaleQueryType.LQL,
          repository: 'test-repo',
        },
      },
      {
        description: 'migrates a query without the formatAs prop to the default (metrics)',
        input: {
          refId: 'A',
          intervalMs: 1000,
          query: '',
          repository: 'test-repo',
        },
        expected: {
          query: '',
          formatAs: FormatAs.Metrics,
          repository: 'test-repo',
        },
      },
    ].forEach((t) =>
      it(t.description, () => {
        const oldQuery = { ...t.input } as unknown as LogScaleQuery;
        const newQuery = migrateQuery(oldQuery);
        expect(newQuery).toMatchObject(t.expected);
      })
    );
  });
});
