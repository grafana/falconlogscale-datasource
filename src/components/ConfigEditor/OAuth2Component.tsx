import React from 'react';
import { Field, SecretInput } from '@grafana/ui';
import { DataSourcePluginOptionsEditorProps } from '@grafana/data';
import { LogScaleOptions, SecretLogScaleOptions } from '../../types';

interface OAuth2ComponentProps {
  options: DataSourcePluginOptionsEditorProps<LogScaleOptions, SecretLogScaleOptions>['options'];
  onOptionsChange: DataSourcePluginOptionsEditorProps<LogScaleOptions, SecretLogScaleOptions>['onOptionsChange'];
  setUnsaved: (unsaved: boolean) => void;
}

export const OAuth2Component: React.FC<OAuth2ComponentProps> = ({ options, onOptionsChange, setUnsaved }) => {
  return (
    <>
      <Field label={'Client ID'} description={'The OAuth2 client ID'}>
        <input
          className="gf-form-input width-40"
          type="text"
          placeholder={'Client ID'}
          value={options.jsonData.oauth2ClientId || ''}
          onChange={(event) => {
            setUnsaved(true);
            onOptionsChange({
              ...options,
              jsonData: {
                ...options.jsonData,
                oauth2: true,
                authenticateWithToken: false,
                oauthPassThru: false,
                oauth2ClientId: event.currentTarget.value,
              },
            });
          }}
        />
      </Field>
      <Field label={'Client Secret'} description={'The OAuth2 client secret'}>
        <SecretInput
          name="oauth2-client-secret"
          width={40}
          label={'Client Secret'}
          aria-label={'Client Secret'}
          placeholder={'Client Secret'}
          value={options.secureJsonData?.oauth2ClientSecret}
          autoComplete="new-password"
          onBlur={(event) => {
            if (event.currentTarget.value) {
              setUnsaved(true);
              onOptionsChange({
                ...options,
                jsonData: {
                  ...options.jsonData,
                  oauth2: true,
                  authenticateWithToken: false,
                  oauthPassThru: false,
                },
                secureJsonData: {
                  ...options.secureJsonData,
                  oauth2ClientSecret: event.currentTarget.value,
                },
              });
            }
          }}
          isConfigured={!!(options.jsonData.oauth2 && options.secureJsonFields?.oauth2ClientSecret)}
          onReset={() => {
            setUnsaved(true);
            onOptionsChange({
              ...options,
              jsonData: { ...options.jsonData, oauth2: false, oauth2ClientId: undefined },
              secureJsonData: { ...options.secureJsonData, oauth2ClientSecret: undefined },
              secureJsonFields: { ...options.secureJsonFields, oauth2ClientSecret: false },
            });
          }}
          required={false}
        />
      </Field>
    </>
  );
};
