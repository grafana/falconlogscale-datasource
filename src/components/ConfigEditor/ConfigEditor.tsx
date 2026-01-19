import React, { useEffect, useState } from 'react';
import {
  DataSourcePluginOptionsEditorProps,
  DataSourceSettings,
  GrafanaTheme2,
  SelectableValue,
  updateDatasourcePluginOption,
} from '@grafana/data';
import { Field, SecretInput, Select, Switch, useTheme2 } from '@grafana/ui';
import { DataLinks } from '../DataLinks';
import { config, getBackendSrv } from '@grafana/runtime';
import {
  AdvancedHttpSettings,
  Auth,
  AuthMethod,
  ConfigSection,
  ConnectionSettings,
  DataSourceDescription,
  convertLegacyAuthProps,
} from '@grafana/plugin-ui';

import { LogScaleOptions, SecretLogScaleOptions, DataSourceMode, NGSIEMRepos } from '../../types';
import { lastValueFrom } from 'rxjs';
import { parseRepositoriesResponse } from 'utils/utils';
import { DefaultRepository } from './DefaultRepository';
import { Divider } from './Divider';
import { OAuth2Component } from './OAuth2Component';
import { css } from '@emotion/css';

const getStyles = (theme: GrafanaTheme2) => ({
  toggle: css`
    margin-top: 7px;
    margin-left: 5px;
  `,
  infoText: css`
    padding-bottom: ${theme.v1.spacing.md};
    color: ${theme.v1.colors.textWeak};
  `,
});

export interface Props extends DataSourcePluginOptionsEditorProps<LogScaleOptions, SecretLogScaleOptions> {}

export const ConfigEditor: React.FC<Props> = (props: Props) => {
  const theme = useTheme2();
  const styles = getStyles(theme);

  const { onOptionsChange, options } = props;
  const onTokenReset = () => {
    setUnsaved(true);
    onOptionsChange({
      ...options,
      jsonData: { ...options.jsonData, authenticateWithToken: false, defaultRepository: undefined, oauth2: false, oauth2ClientId: undefined },
      secureJsonData: undefined,
      secureJsonFields: {},
    });
  };

  const [disabled, setDisabled] = useState<boolean>(true);
  const [repositories, setRepositories] = useState<SelectableValue[]>([]);
  const [unsaved, setUnsaved] = useState<boolean>(true);

  const selectedMode = options.jsonData.mode || DataSourceMode.LogScale;
  const isNGSIEMMode = selectedMode === DataSourceMode.NGSIEM;

  const saveOptions = async (): Promise<void> => {
    if (unsaved) {
      await getBackendSrv()
        .put(`/api/datasources/${options.id}`, options)
        .then((result: { datasource: DataSourceSettings<LogScaleOptions> }) => {
          updateDatasourcePluginOption(props, 'version', result.datasource.version);
          return result.datasource.version;
        });
      setUnsaved(false);
    }
  };

  const getRepositories = async () => {
    if (isNGSIEMMode) {
      return parseRepositoriesResponse(NGSIEMRepos);
    }
    try {
      await saveOptions();
      const res = await lastValueFrom(
        getBackendSrv().fetch({ url: `/api/datasources/uid/${options.uid}/resources/repositories`, method: 'GET' })
      );
      return parseRepositoriesResponse(res);
    } catch (err) {
      return Promise.resolve([]);
    }
  };

  const onRepositoryChange = (value: SelectableValue | undefined) => {
    onOptionsChange({
      ...options,
      jsonData: { ...options.jsonData, defaultRepository: value ? value.value : undefined },
    });
  };

  useEffect(() => {
    setDisabled(true);
    if (
      ((options.jsonData.baseUrl || options.url) &&
        (options.secureJsonFields?.accessToken || options.secureJsonData?.accessToken)) ||
      options.jsonData.oauthPassThru ||
      (options.jsonData.oauth2 && options.jsonData.oauth2ClientId && options.secureJsonFields?.oauth2ClientSecret)
    ) {
      setDisabled(false);
    }
  }, [options]);

  // Ensure default repository is set to 'search-all' in NGSIEM mode
  useEffect(() => {
    if (isNGSIEMMode && !options.jsonData.defaultRepository) {
      onOptionsChange({
        ...options,
        jsonData: {
          ...options.jsonData,
          defaultRepository: 'search-all',
        },
      });
    }
  }, [isNGSIEMMode, options, onOptionsChange]);

  const logscaleTokenComponent = (
    <Field label={'Token'}>
      <SecretInput
        name="pwd"
        width={40}
        label={'Token'}
        aria-label={'Token'}
        placeholder={'Token'}
        value={options.secureJsonData?.accessToken}
        autoComplete="new-password"
        onBlur={(event) => {
          if (event.currentTarget.value) {
            setUnsaved(true);
            onOptionsChange({
              ...options,
              jsonData: {
                baseUrl: options.jsonData.baseUrl,
                authenticateWithToken: true,
                oauthPassThru: false,
                oauth2: false,
              },
              secureJsonData: { accessToken: event.currentTarget.value },
            });
          }
        }}
        isConfigured={options.jsonData.authenticateWithToken}
        onReset={onTokenReset}
        required={false}
      />
    </Field>
  );

  const newAuthProps = convertLegacyAuthProps({
    config: props.options,
    onChange: onOptionsChange,
  });

  const [authSelected, setAuthSelected] = useState<AuthMethod | `custom-${string}`>(
    newAuthProps.selectedMethod === AuthMethod.NoAuth ? 'custom-token' : newAuthProps.selectedMethod
  );

  const modeOptions: Array<SelectableValue<DataSourceMode>> = [
    { label: 'LogScale', value: DataSourceMode.LogScale },
    { label: 'NGSIEM', value: DataSourceMode.NGSIEM },
  ];

  const onSelectedMode = (value: SelectableValue | undefined) => {
    if (!value) {
      return;
    }
    const newMode = value.value;
    const newJsonData: any = {
      ...options.jsonData,
      mode: newMode,
    };

    // When switching to NGSIEM mode, set default repository to 'search-all'
    if (newMode === DataSourceMode.NGSIEM) {
      newJsonData.defaultRepository = 'search-all';
    }

    onOptionsChange({
      ...options,
      jsonData: newJsonData,
    });
    if (newMode === DataSourceMode.NGSIEM && authSelected !== 'custom-oauth-client-secret') {
      setAuthSelected('custom-oauth-client-secret');
    }
  };

  return (
    <>
      <DataSourceDescription
        dataSourceName="Falcon LogScale"
        docsLink="https://grafana.com/grafana/plugins/grafana-falconlogscale-datasource/"
        hasRequiredFields
      />
      <Divider />
      <ConnectionSettings config={options} onChange={onOptionsChange} />
      <Divider />
      <Field
        label="Mode"
        description="Select the data source mode. NGSIEM mode only supports OAuth2 client secret authentication."
      >
        <Select width={40} options={modeOptions} value={selectedMode} onChange={onSelectedMode} />
      </Field>
      <Divider />
      <Auth
        {...newAuthProps}
        customMethods={[
          {
            id: 'custom-token',
            label: 'LogScale Token Authentication',
            description: 'Authenticate to LogScale using a personal token.',
            component: logscaleTokenComponent,
          },
          {
            id: 'custom-oauth-client-secret',
            label: 'OAuth2 Client Credentials',
            description:
              'Authenticate using OAuth2 client credentials flow. The plugin will automatically fetch and refresh access tokens.',
            component: <OAuth2Component options={options} onOptionsChange={onOptionsChange} setUnsaved={setUnsaved} />,
          },
        ]}
        onAuthMethodSelect={(method) => {
          newAuthProps.onAuthMethodSelect(method);
          setAuthSelected(method);
          if (method !== 'custom-token' && options.jsonData.authenticateWithToken) {
            onTokenReset();
          }
          if (method !== 'custom-oauth-client-secret' && options.jsonData.oauth2) {
            onTokenReset();
          }
          if (method === 'custom-oauth-client-secret') {
            onOptionsChange({
              ...options,
              jsonData: {
                baseUrl: options.jsonData.baseUrl,
                authenticateWithToken: false,
                oauthPassThru: false,
                oauth2: true,
              },
            });
          }
          if (method === AuthMethod.OAuthForward) {
            onOptionsChange({
              ...options,
              jsonData: {
                baseUrl: options.jsonData.baseUrl,
                authenticateWithToken: false,
                oauthPassThru: true,
                oauth2: false,
              },
            });
          }
        }}
        selectedMethod={authSelected}
        visibleMethods={
          isNGSIEMMode
            ? ['custom-oauth-client-secret']
            : ['custom-token', AuthMethod.BasicAuth, AuthMethod.OAuthForward]
        }
      />
      <Divider />
      <ConfigSection
        title="Advanced settings"
        isCollapsible
        // isInitiallyOpen={/* if any of the advanced settings is enabled */}
      >
        <AdvancedHttpSettings config={props.options} onChange={props.onOptionsChange} />
      </ConfigSection>
      <Divider />
      <ConfigSection
        title="Additional settings"
        description="Additional settings are optional settings that can be configured for more control over your data source. This includes the default repository or data links."
        isCollapsible
        isInitiallyOpen={true}
      >
        <DefaultRepository
          disabled={disabled}
          defaultRepository={options.jsonData.defaultRepository}
          onRepositoryChange={onRepositoryChange}
          onRepositoriesChange={setRepositories}
          repositories={repositories}
          getRepositories={getRepositories}
          hideLoadRepoButton={isNGSIEMMode}
        />

        <DataLinks
          value={options.jsonData.dataLinks}
          onChange={(newValue: any) => {
            onOptionsChange({
              ...options,
              jsonData: {
                ...options.jsonData,
                dataLinks: newValue,
              },
            });
          }}
        />

        {config.secureSocksDSProxyEnabled && (
          <>
            <div className="gf-form-group">
              <h3 className="page-heading">Secure Socks Proxy</h3>
              <div className={styles.infoText}>
                Enable proxying the datasource connection through the secure socks proxy to a different network. See{' '}
                <a
                  href="https://grafana.com/docs/grafana/next/setup-grafana/configure-grafana/proxy/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Configure a data source connection proxy.
                </a>
              </div>
              <Field label="Enable">
                <div className={styles.toggle}>
                  <Switch
                    value={options.jsonData.enableSecureSocksProxy}
                    onChange={(e) => {
                      onOptionsChange({
                        ...options,
                        jsonData: {
                          ...options.jsonData,
                          enableSecureSocksProxy: e.currentTarget.checked,
                        },
                      });
                    }}
                  />
                </div>
              </Field>
            </div>
          </>
        )}
      </ConfigSection>
    </>
  );
};
