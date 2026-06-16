import { E2ESelectors } from '@grafana/e2e-selectors';

export const components = {
  configEditor: {
    defaultRepository: {
      input: 'data-testid default-repository',
    },
    loadRepositories: {
      button: 'data-testid load-repositories',
    },
  },
  queryEditor: {
    queryField: {
      input: 'data-testid query-field',
    },
    repository: {
      input: 'data-testid repository',
    },
  },
  variableEditor: {
    queryType: {
      input: 'data-testid query-type',
    },
  },
};

export const selectors: { components: E2ESelectors<typeof components> } = {
  components: components,
};
