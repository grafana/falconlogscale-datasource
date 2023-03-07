import { SelectableValue } from '@grafana/data';

export const parseRepositoriesResponse = (res: any): SelectableValue[] => {
  if (!res && !res.length) {
    return [];
  }

  if (res.data && res.data.length) {
    return res.data.map((repository: string) => ({ label: repository, value: repository }));
  }

  return res.map((repository: string) => ({ label: repository, value: repository }));
};
