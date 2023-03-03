import { SelectableValue } from '@grafana/data';
import { InlineField, Select, Button } from '@grafana/ui';
import React, { useReducer, useEffect } from 'react';

interface DefaultRepositoryProps {
  disabled: boolean;
  defaultRepository?: string;
  repositories: SelectableValue[];
  onRepositoryChange: (value: SelectableValue | undefined) => void;
  onRepositoriesChange: (repos: SelectableValue[]) => void;
  getRepositories: () => Promise<SelectableValue[]>;
}

export const DefaultRepository = ({
  disabled,
  defaultRepository,
  repositories,
  onRepositoryChange,
  onRepositoriesChange,
  getRepositories,
}: DefaultRepositoryProps) => {
  const [loadRepositoriesClicked, onLoadRepositories] = useReducer((val) => val + 1, 0);

  useEffect(() => {
    if (!getRepositories || disabled) {
      onRepositoriesChange([]);
      return;
    }
    let canceled = false;
    getRepositories().then((result) => {
      if (!canceled) {
        updateRepositories(result, loadRepositoriesClicked);
      }
    });
    return () => {
      canceled = true;
    };
    // This effect is intended to be called only once initially and when Load Repositories is clicked
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, loadRepositoriesClicked]);

  const updateRepositories = (received: Array<SelectableValue<string>>, autoSelect = false) => {
    onRepositoriesChange(received);
    if (autoSelect && !defaultRepository && received.length > 0) {
      // Selecting the default repository if repositories are received and there is no default
      onRepositoryChange(received[0]);
    } else if (defaultRepository) {
      const found = received.find((opt) => opt.value === defaultRepository);
      if (!found) {
        onRepositoryChange(undefined);
      }
    }
  };
  return (
    <div className="gf-form-group">
      <h5> Default LogScale Repository </h5>
      <p>
        Select the datasources default repository. This repository will be used for features such as traces to logs.{' '}
        <br></br>
      </p>
      <InlineField
        label="Default Repository"
        labelWidth={20}
        // data-testid={selectors.components.configEditor.authType.select}
      >
        <div className="width-30" style={{ display: 'flex', gap: '4px' }}>
          <Select
            className="width-15"
            value={defaultRepository}
            options={repositories}
            onChange={onRepositoryChange}
            disabled={disabled}
          />
          <Button
            variant="secondary"
            type="button"
            onClick={onLoadRepositories}
            disabled={disabled}
            // data-testid={selectors.components.configEditor.loadSubscriptions.button}
          >
            Load Repositories
          </Button>
        </div>
      </InlineField>
    </div>
  );
};
