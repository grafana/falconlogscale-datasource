import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { mockDatasource, mockQuery } from '../__fixtures__/datasource';
import { QueryEditor, Props } from './QueryEditor';
import { pluginVersion } from 'utils/version';

const getDefaultProps = (): Props => {
  const props: Props = {
    datasource: mockDatasource(),
    query: {
      ...mockQuery(),
      repository: '',
      lsql: '',
    },
    onChange: jest.fn(),
    onRunQuery: jest.fn(),
  };

  return props;
};

/**
 * Since QueryEditor is just a wrapper component for the
 * LogScaleQueryEditor component we don't extensively cover it with tests.
 * Just making sure it renders.
 */
describe('<QueryEditor />', () => {
  it('should render', async () => {
    const { container } = render(<QueryEditor {...getDefaultProps()} />);

    await waitFor(() => expect(container).not.toBeEmptyDOMElement());
  });

  it("should add a version to the query if it doesn't exist", async () => {
    const props = getDefaultProps();
    props.query.version = '';

    render(<QueryEditor {...props} />);

    await waitFor(() =>
      expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ version: pluginVersion }))
    );
  });
});
