import { SelectableValue } from '@grafana/data';
import { Repository } from 'types';

export const parseRepositoriesResponse = (res: any): SelectableValue[] => {
  if (!res.data && !res.data.length) {
    return [];
  }
  return res.data.map(({ Name }: Repository) => ({ label: Name, value: Name }));
};
