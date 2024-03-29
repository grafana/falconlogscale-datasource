import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { mockDatasource, mockQuery } from './__fixtures__/datasource';
import { VariableQueryEditor, Props } from './VariableQueryEditor';

const getDefaultProps = (): Props => {
  const props: Props = {
    datasource: mockDatasource(),
    query: {
      ...mockQuery(),
      repository: '',
      lsql: '',
    },
    onChange: jest.fn(),
  };

  return props;
};

/**
 * Since VariableQueryEditor is just a wrapper component for the
 * LogScaleQueryEditor component we don't extensively cover it with tests.
 * Just making sure it renders.
 */
describe('<VariableQueryEditor />', () => {
  it('should render', async () => {
    const { container } = render(<VariableQueryEditor {...getDefaultProps()} />);

    await waitFor(() => expect(container).not.toBeEmptyDOMElement());
  });
});
