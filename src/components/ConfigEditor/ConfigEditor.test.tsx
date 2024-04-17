import React from 'react';
import { render, waitFor, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigEditor, Props } from './ConfigEditor';
import { selectors } from 'e2e/selectors';

const getDefaultProps = (): Props => {
  const options: Partial<Props['options']> = {
    jsonData: {
      authenticateWithToken: false,
    },
    secureJsonData: {},
    secureJsonFields: {
      basicAuthPassword: false,
    },
    url: 'https://test-default.com',
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
    props.options.url = 'http://humio-test.test';

    render(<ConfigEditor {...props} />);

    expect(screen.getByDisplayValue('http://humio-test.test')).toBeInTheDocument();
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
    await userEvent.tab();

    expect(props.onOptionsChange).toHaveBeenCalledWith({
      ...props.options,
      jsonData: {
        ...props.options.jsonData,
        authenticateWithToken: true,
        oauthPassThru: false,
      },
      secureJsonData: {
        accessToken: 'TEST_TOKEN',
      },
      secureJsonFields: {
        basicAuthPassword: false,
      },
    });
  });

  it('should call `onOptionsChange` when token is reset', async () => {
    const props = getDefaultProps();
    props.options.jsonData.authenticateWithToken = true;

    render(<ConfigEditor {...props} />);

    await userEvent.click(screen.getByText('Reset'));

    expect(props.onOptionsChange).toHaveBeenCalledWith({
      ...props.options,
      jsonData: {
        ...props.options.jsonData,
        authenticateWithToken: false,
      },
      secureJsonData: undefined,
      secureJsonFields: {},
    });
  });

  it('should render DefaultRepository as disabled when token is not set', async () => {
    const props = getDefaultProps();

    render(<ConfigEditor {...props} />);

    expect(
      screen.getByTestId(selectors.components.configEditor.defaultRepository.input).querySelector('input')
    ).toBeDisabled();
  });

  it('should render DefaultRepository as enabled when token is set', async () => {
    const props = getDefaultProps();
    props.options.jsonData.authenticateWithToken = true;
    props.options.secureJsonData = { accessToken: 'test_token' };

    render(<ConfigEditor {...props} />);

    await waitFor(() =>
      expect(
        screen.getByTestId(selectors.components.configEditor.defaultRepository.input).querySelector('input')
      ).toBeEnabled()
    );
  });
});
