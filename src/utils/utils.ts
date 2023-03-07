import { SelectableValue } from '@grafana/data';

export const parseRepositoriesResponse = (res: any): SelectableValue[] => {
  if (!res && !res.length) {
    return [];
  }
  return res.map((repository: string) => ({ label: repository, value: repository }));
};
