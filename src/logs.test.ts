import { MutableDataFrame } from '@grafana/data';
import { transformBackendResult } from 'logs';
import { expect } from '@jest/globals';

describe('logs', () => {
  it('should order backend results to have @rawstring first', () => {
    const df = new MutableDataFrame({ fields: [{ name: 'line' }, { name: '@rawstring' }] });
    const newFields = transformBackendResult({ data: [df] }, [], { targets: [] } as any);
    expect(newFields.data[0].fields.length).toBe(2);
    expect(newFields.data[0].fields[0].name).toBe('@rawstring');
    expect(newFields.data[0].fields[1].name).toBe('line');
  });

  it('it should not reorder backend results', () => {
    const df = new MutableDataFrame({ fields: [{ name: 'line' }, { name: 'line2' }] });
    const newFields = transformBackendResult({ data: [df] }, [], { targets: [] } as any);
    expect(newFields.data[0].fields.length).toBe(2);
    expect(newFields.data[0].fields[0].name).toBe('line');
    expect(newFields.data[0].fields[1].name).toBe('line2');
  });
});
