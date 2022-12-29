import React from 'react';
import { DataSourcePluginOptionsEditorProps } from '@grafana/data';
import { DataSourceHttpSettings, LegacyForms } from '@grafana/ui';

const { SecretFormField } = LegacyForms;

import { LogScaleOptions, SecretLogScaleOptions } from '../types';

export interface Props extends DataSourcePluginOptionsEditorProps<LogScaleOptions, SecretLogScaleOptions> {}

export const ConfigEditor: React.FC<Props> = ({ options, onOptionsChange }) => {
  const onTokenReset = () => {
    onOptionsChange({
      ...options,
      jsonData: { ...options.jsonData, authenticateWithToken: false },
      secureJsonData: undefined,
      secureJsonFields: {},
    });
  };

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
        onChange={(newValue) =>
          onOptionsChange({
            ...newValue,
            jsonData: {
              ...newValue.jsonData,
              baseUrl: newValue.url,
            },
          })
        }
      />
      <div className="gf-form-group">
        <h5> LogScale Token Authentication </h5>
        <p>
          {' '}
          If you wish to authenticate using a personal LogScale token copy and paste it into the field below. <br></br>
        </p>
        <div className="gf-form max-width-25">
          <SecretFormField
            labelWidth={10}
            inputWidth={15}
            label="Token"
            placeholder="Token"
            value={options.secureJsonData?.accessToken}
            onChange={(event) =>
              onOptionsChange({
                ...options,
                jsonData: {
                  baseUrl: options.jsonData.baseUrl,
                  authenticateWithToken: true,
                },
                secureJsonData: { accessToken: event.currentTarget.value },
              })
            }
            isConfigured={options.jsonData.authenticateWithToken}
            onReset={onTokenReset}
            required={false}
          />
        </div>
      </div>
    </>
  );
};
