import React from 'react';
import { render, waitFor, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getMockDatasource } from './__fixtures__/datasource';
import { mockDataQuery } from 'grafana-plugin-ui';
import { LogScaleQueryEditor, type Props, type Repository } from './LogScaleQueryEditor';

const getDefaultProps = (): Props => {
  const props: Props = {
    datasource: getMockDatasource(),
    onChange: jest.fn(),
    runQuery: jest.fn(),
    query: {
      ...mockDataQuery(),
      repository: '',
      lsql: '',
    },
  };

  props.datasource.getResource = async (): Promise<Repository[]> => [
    { Name: 'repository_1' },
    { Name: 'repository_2' },
    { Name: 'repository_3' },
  ];

  return props;
};

describe('<LogScaleQueryEditor />', () => {
  it('should render', async () => {
    const { container } = render(<LogScaleQueryEditor {...getDefaultProps()} />);

    await waitFor(() => expect(container).not.toBeEmptyDOMElement());
  });

  it('should render repositories list', async () => {
    const props = getDefaultProps();

    render(<LogScaleQueryEditor {...props} />);

    // expand select box
    await userEvent.type(screen.getByRole('combobox'), '{Space}');

    expect(screen.getByText('repository_1')).toBeInTheDocument();
    expect(screen.getByText('repository_2')).toBeInTheDocument();
    expect(screen.getByText('repository_3')).toBeInTheDocument();
    expect(() => screen.getByText('non_existent_repository')).toThrow();
  });

  it('should render selected repository', async () => {
    const props = getDefaultProps();
    props.query.repository = 'repository_3';

    render(<LogScaleQueryEditor {...props} />);

    expect(await screen.findByText('repository_3')).toBeInTheDocument();
    expect(() => screen.getByText('repository_1')).toThrow();
    expect(() => screen.getByText('repository_2')).toThrow();
  });

  it('should call `onChange` when repository changes', async () => {
    const onChange = jest.fn();
    const props: Props = {
      ...getDefaultProps(),
      onChange,
    };
    props.query.repository = 'repository_3';

    render(<LogScaleQueryEditor {...props} />);
    expect(await screen.findByText('repository_3')).toBeInTheDocument();

    // expand select box and click one of the options
    await userEvent.type(screen.getByRole('combobox'), '{Space}');
    await userEvent.click(screen.getByText('repository_2'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({
      ...props.query,
      repository: 'repository_2',
    });
  });

  it('should render query', async () => {
    const queryString = 'SOME TEST QUERY';
    const props = getDefaultProps();
    props.query.lsql = queryString;

    render(<LogScaleQueryEditor {...props} />);

    expect(await screen.findByText(queryString)).toBeInTheDocument();
  });

  it('should call `onChange` when query changes', async () => {
    // <QueryField /> component used inside LogScaleQueryEditor uses
    // slate-react under the hood, which is not a textarea, but
    // contenteditable. Triggering `onChange` inside the test is
    // not trivial. Skipping for now.
  });
});