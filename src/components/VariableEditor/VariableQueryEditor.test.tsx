import React from 'react';
import { render, waitFor, screen, act } from '@testing-library/react';
import { mockDatasource, mockQuery } from '../__fixtures__/datasource';
import VariableQueryEditor, { Props } from './VariableQueryEditor';
import { FormatAs, LogScaleQueryType } from 'types';
import { openMenu } from 'react-select-event';

const getDefaultProps = (): Props => {
  const props: Props = {
    datasource: mockDatasource(),
    query: {
      ...mockQuery(),
      repository: '',
      lsql: '',
      formatAs: FormatAs.Logs,
      queryType: LogScaleQueryType.LQL,
    },
    onChange: jest.fn(),
  };

  return props;
};

describe('<VariableQueryEditor />', () => {
  it('should render', async () => {
    await waitFor(() => render(<VariableQueryEditor {...getDefaultProps()} />));

    await waitFor(() => screen.getByText('Query Type'));
  });

  it('will migrate a legacy variable query', async () => {
    const props = getDefaultProps();
    props.datasource.defaultRepository = 'test-repository';

    render(<VariableQueryEditor {...props} query={'test-lql-query' as any} />);

    expect(props.onChange).toHaveBeenCalled();
    expect(props.onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        lsql: 'test-lql-query',
        formatAs: FormatAs.Variable,
        queryType: LogScaleQueryType.LQL,
        repository: 'test-repository',
      })
    );
  });

  it('will render the builder for LQL query type', async () => {
    render(<VariableQueryEditor {...getDefaultProps()} />);

    await waitFor(() => screen.getByText('Repository'));
  });

  it('will run repositories query', async () => {
    const props = getDefaultProps();
    const { rerender } = render(<VariableQueryEditor {...props} />);
    await waitFor(() => screen.getByLabelText('select query type'));

    const querySelector = await screen.getByLabelText('select query type');
    await waitFor(() => openMenu(querySelector));
    await act(async () => {
      screen.getByText('Repositories').click();
      const newQuery = { ...props.query, queryType: LogScaleQueryType.Repositories };
      rerender(<VariableQueryEditor {...props} query={newQuery} />);
    });

    expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ queryType: LogScaleQueryType.Repositories }));
    expect(props.datasource.getRepositories).toHaveBeenCalled();
  });
});
