import React from 'react';
import { render, waitFor, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigEditor, type Props } from './ConfigEditor';

const getDefaultProps = (): Props => {
  const options: Partial<Props['options']> = {
    jsonData: {
      baseUrl: 'https://test-default.com',
      authenticateWithToken: false,
    },
    secureJsonData: {},
  };

  return {
    options: {
      ...options,
    },
    onOptionsChange: jest.fn(),
  } as unknown as Props;
};

describe('<ConfigEditor />', () => {
  it('should render', async () => {
    const { container } = render(<ConfigEditor {...getDefaultProps()} />);

    await waitFor(() => expect(container).not.toBeEmptyDOMElement());
  });

  it('should render URL when it is passed', () => {
    const props = getDefaultProps();
    props.options.url = props.options.jsonData.baseUrl = 'http://humio-test.test';

    render(<ConfigEditor {...props} />);

    expect(screen.getByDisplayValue('http://humio-test.test')).toBeInTheDocument();
  });

  it('should call `onOptionsChange` when URL changes', async () => {
    const props = getDefaultProps();

    render(<ConfigEditor {...props} />);

    const input = screen.getByLabelText('Datasource HTTP settings url');
    await userEvent.type(input, 'http://humio-test.test');

    expect(props.onOptionsChange).toHaveBeenCalledWith({
      url: 'http://humio-test.test',
      jsonData: {
        ...props.options.jsonData,
        baseUrl: 'http://humio-test.test',
      },
      secureJsonData: {},
    });
  });

  it('should render token as "configured" when token is set', () => {
    const props = getDefaultProps();
    props.options.jsonData.authenticateWithToken = true;

    render(<ConfigEditor {...props} />);

    expect(screen.getByText('Token')).toBeInTheDocument();
    expect(screen.getByDisplayValue('configured')).toBeInTheDocument();
  });

  it('should call `onOptionsChange` when token changes', async () => {
    const props = getDefaultProps();

    render(<ConfigEditor {...props} />);

    await userEvent.type(screen.getByPlaceholderText('Token'), 'TEST_TOKEN');

    expect(props.onOptionsChange).toHaveBeenCalledWith({
      jsonData: {
        ...props.options.jsonData,
        authenticateWithToken: true,
      },
      secureJsonData: {
        accessToken: 'TEST_TOKEN',
      },
    });
  });

  it('should call `onOptionsChange` when token is reset', async () => {
    const props = getDefaultProps();
    props.options.jsonData.authenticateWithToken = true;

    render(<ConfigEditor {...props} />);

    await userEvent.click(screen.getByText('Reset'));

    expect(props.onOptionsChange).toHaveBeenCalledWith({
      jsonData: {
        ...props.options.jsonData,
        authenticateWithToken: false,
      },
      secureJsonData: undefined,
      secureJsonFields: {},
    });
  });
});
