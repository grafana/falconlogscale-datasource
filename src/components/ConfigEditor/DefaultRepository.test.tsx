import { render, waitFor, screen, act } from '@testing-library/react';
import { DefaultRepository, DefaultRepositoryProps } from './DefaultRepository';
import React from 'react';
import { selectors } from 'e2e/selectors';
import userEvent from '@testing-library/user-event';

const getDefaultProps = (overrides?: Partial<DefaultRepositoryProps>): DefaultRepositoryProps => {
  return {
    disabled: true,
    defaultRepository: '',
    repositories: [],
    onRepositoryChange: jest.fn(),
    onRepositoriesChange: jest.fn(),
    getRepositories: jest.fn().mockResolvedValue([{ label: 'test_repository', value: 'test_repository' }]),
    hideLoadRepoButton: false,
    ...overrides,
  };
};

describe('<DefaultRepository/>', () => {
  it('should render', async () => {
    const { container } = render(<DefaultRepository {...getDefaultProps()} />);

    await waitFor(() => expect(container).not.toBeEmptyDOMElement());
  });

  it('should render repository options', async () => {
    render(
      <DefaultRepository
        {...getDefaultProps({
          disabled: false,
          repositories: [{ label: 'test_repository', value: 'test_repository' }],
        })}
      />
    );

    await userEvent.type(screen.getByRole('combobox'), '{Space}');

    expect(await screen.getByText('test_repository')).toBeInTheDocument();
  });

  it('should auto-select the first repository when load repositories is clicked', async () => {
    const props = getDefaultProps({
      disabled: false,
      defaultRepository: undefined,
    });
    const repositories = [{ label: 'test_repository', value: 'test_repository' }];
    const { rerender } = render(<DefaultRepository {...props} />);

    await waitFor(() => expect(screen.getByText('Default Repository')).toBeInTheDocument());

    act(() => screen.getByTestId(selectors.components.configEditor.loadRepositories.button).click());
    expect(props.onRepositoriesChange).toHaveBeenCalledWith(repositories);

    rerender(<DefaultRepository {...{ ...props, repositories, defaultRepository: repositories[0].value }} />);

    expect(await screen.getByText('test_repository')).toBeInTheDocument();
  });

  it('should hide Load Repositories button when hideLoadRepoButton is true', async () => {
    render(
      <DefaultRepository
        {...getDefaultProps({
          disabled: false,
          hideLoadRepoButton: true,
        })}
      />
    );

    await waitFor(() => expect(screen.getByText('Default Repository')).toBeInTheDocument());
    expect(screen.queryByTestId(selectors.components.configEditor.loadRepositories.button)).not.toBeInTheDocument();
  });

  it('should show Load Repositories button when hideLoadRepoButton is false', async () => {
    render(
      <DefaultRepository
        {...getDefaultProps({
          disabled: false,
          hideLoadRepoButton: false,
        })}
      />
    );

    await waitFor(() => expect(screen.getByText('Default Repository')).toBeInTheDocument());
    expect(screen.getByTestId(selectors.components.configEditor.loadRepositories.button)).toBeInTheDocument();
  });

  it('should show Load Repositories button by default when hideLoadRepoButton is not provided', async () => {
    const props = {
      disabled: false,
      defaultRepository: '',
      repositories: [],
      onRepositoryChange: jest.fn(),
      onRepositoriesChange: jest.fn(),
      getRepositories: jest.fn().mockResolvedValue([{ label: 'test_repository', value: 'test_repository' }]),
    };

    render(<DefaultRepository {...props} />);

    await waitFor(() => expect(screen.getByText('Default Repository')).toBeInTheDocument());
    expect(screen.getByTestId(selectors.components.configEditor.loadRepositories.button)).toBeInTheDocument();
  });
});
