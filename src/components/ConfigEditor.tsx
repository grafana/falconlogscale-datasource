import React, { useEffect, useState } from 'react';
import {
  DataSourcePluginOptionsEditorProps,
  DataSourceSettings,
  SelectableValue,
  updateDatasourcePluginOption,
} from '@grafana/data';
import { DataSourceHttpSettings, LegacyForms } from '@grafana/ui';

const { SecretFormField } = LegacyForms;

import { LogScaleOptions, SecretLogScaleOptions } from '../types';
import { DataLinks } from 'grafana-plugin-ui';
import { getBackendSrv } from '@grafana/runtime';
import { lastValueFrom } from 'rxjs';
import { parseRepositoriesResponse } from 'utils/utils';
import { DefaultRepository } from './DefaultRepository';

export interface Props extends DataSourcePluginOptionsEditorProps<LogScaleOptions, SecretLogScaleOptions> {}

export const ConfigEditor: React.FC<Props> = (props: Props) => {
  const { onOptionsChange, options } = props;
  const onTokenReset = () => {
    setUnsaved(true);
    onOptionsChange({
      ...options,
      jsonData: { ...options.jsonData, authenticateWithToken: false, defaultRepository: undefined },
      secureJsonData: undefined,
      secureJsonFields: {},
    });
  };

  const [disabled, setDisabled] = useState<boolean>(true);
  const [repositories, setRepositories] = useState<SelectableValue[]>([]);
  const [unsaved, setUnsaved] = useState<boolean>(true);

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
      (options.jsonData.baseUrl && (options.secureJsonFields?.accessToken || options.secureJsonData?.accessToken)) ||
      options.jsonData.oauthPassThru
    ) {
      setDisabled(false);
    }
  }, [options]);

  return (
    <>
      <p>
        To authenticate against LogScale, you may either use the standard authentication methods as provided by Grafana
        under <b>Auth</b>, or use a LogScale token under <b>LogScale Token Authentication</b>. There should be no reason
        to mix these two methods for authentication, so be mindful not to configure both.
      </p>

      <DataSourceHttpSettings
        defaultUrl={'https://cloud.humio.com'}
        dataSourceConfig={options}
        showAccessOptions={false}
        showForwardOAuthIdentityOption={true}
        onChange={(newValue) => {
          onOptionsChange({
            ...options,
            ...newValue,
            jsonData: {
              ...options.jsonData,
              ...newValue.jsonData,
              baseUrl: newValue.url,
            },
          });
          setUnsaved(true);
        }}
      />
      <div className="gf-form-group">
        <h5> LogScale Token Authentication </h5>
        <p>
          If you wish to authenticate using a personal LogScale token copy and paste it into the field below. <br></br>
        </p>
        <div className="gf-form max-width-25">
          <SecretFormField
            labelWidth={10}
            inputWidth={15}
            label="Token"
            placeholder="Token"
            value={options.secureJsonData?.accessToken}
            autoComplete="new-password"
            onBlur={(event) => {
              if (event.currentTarget.value) {
                onOptionsChange({
                  ...options,
                  jsonData: {
                    baseUrl: options.jsonData.baseUrl,
                    authenticateWithToken: true,
                  },
                  secureJsonData: { accessToken: event.currentTarget.value },
                });
              }
            }}
            isConfigured={options.jsonData.authenticateWithToken}
            onReset={onTokenReset}
            required={false}
            tooltip={'If the Forward OAuth Identity option is enabled then this token will not be used.'}
          />
        </div>
      </div>
      <DefaultRepository
        disabled={disabled}
        defaultRepository={options.jsonData.defaultRepository}
        onRepositoryChange={onRepositoryChange}
        onRepositoriesChange={setRepositories}
        repositories={repositories}
        getRepositories={getRepositories}
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
    </>
  );
};
