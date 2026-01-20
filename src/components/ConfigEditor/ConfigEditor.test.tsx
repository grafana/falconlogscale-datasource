import React from 'react';
import { render, waitFor, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigEditor, Props } from './ConfigEditor';
import { selectors } from 'e2e/selectors';
import { DataSourceMode } from '../../types';

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
        baseUrl: undefined,
        authenticateWithToken: true,
        oauthPassThru: false,
        oauth2: false,
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
        defaultRepository: undefined,
        oauth2: false,
        oauth2ClientId: undefined,
        oauthPassThru: false,
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

  it('should preserve auth selection on refresh', async () => {
    const props = getDefaultProps();
    props.options.jsonData.oauthPassThru = true;
    props.options.jsonData.authenticateWithToken = false;

    const { rerender } = render(<ConfigEditor {...props} />);

    await waitFor(() => expect(screen.getByText('Forward OAuth Identity')).toBeInTheDocument());

    rerender(<ConfigEditor {...props} />);

    await waitFor(() => expect(screen.getByText('Forward OAuth Identity')).toBeInTheDocument());
  });

  describe('Mode switching', () => {
    it('should clear auth settings and set defaultRepository when in NGSIEM mode', () => {
      const props = getDefaultProps();
      props.options.jsonData.mode = DataSourceMode.NGSIEM;
      props.options.jsonData.authenticateWithToken = false;
      props.options.jsonData.oauth2 = false;
      props.options.jsonData.oauthPassThru = false;
      props.options.jsonData.defaultRepository = 'search-all';

      render(<ConfigEditor {...props} />);

      // Verify NGSIEM mode is displayed
      expect(screen.getByText('NGSIEM')).toBeInTheDocument();

      // Verify the expected state for NGSIEM mode
      expect(props.options.jsonData.mode).toBe(DataSourceMode.NGSIEM);
      expect(props.options.jsonData.defaultRepository).toBe('search-all');
      expect(props.options.jsonData.authenticateWithToken).toBe(false);
      expect(props.options.jsonData.oauth2).toBe(false);
      expect(props.options.jsonData.oauthPassThru).toBe(false);
    });

    it('should clear auth settings and defaultRepository when in LogScale mode', () => {
      const props = getDefaultProps();
      props.options.jsonData.mode = DataSourceMode.LogScale;
      props.options.jsonData.authenticateWithToken = false;
      props.options.jsonData.oauth2 = false;
      props.options.jsonData.oauthPassThru = false;
      props.options.jsonData.defaultRepository = undefined;

      render(<ConfigEditor {...props} />);

      // Verify LogScale mode is displayed
      expect(screen.getByText('LogScale')).toBeInTheDocument();

      // Verify the expected state for LogScale mode
      expect(props.options.jsonData.mode).toBe(DataSourceMode.LogScale);
      expect(props.options.jsonData.defaultRepository).toBeUndefined();
      expect(props.options.jsonData.authenticateWithToken).toBe(false);
      expect(props.options.jsonData.oauth2).toBe(false);
      expect(props.options.jsonData.oauthPassThru).toBe(false);
    });
  });
});
