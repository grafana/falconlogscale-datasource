import React, { PureComponent } from 'react';
import { DataSourcePluginOptionsEditorProps } from '@grafana/data';
import { DataSourceHttpSettings, LegacyForms } from '@grafana/ui';

const { SecretFormField } = LegacyForms;

import { LogScaleOptions, SecretLogScaleOptions } from '../types';

interface Props extends DataSourcePluginOptionsEditorProps<LogScaleOptions, SecretLogScaleOptions> {}

interface State {
  props: any;
}

export class ConfigEditor extends PureComponent<Props, State> {
  constructor(props: Props) {
    super(props);

    props.options.jsonData = { ...props.options.jsonData };

    this.state = {
      props: props,
    };
  }

  componentDidMount() {}

  onPasswordReset = () => {
    const { options, onOptionsChange } = this.props;
    onOptionsChange({
      ...options,
      jsonData: { ...options.jsonData, authenticateWithToken: false },
      secureJsonData: undefined,
      secureJsonFields: {},
    });
  };

  body() {
    const { options, onOptionsChange } = this.props;
    return (
      <>
        <p>
          To authenticate against LogScale, you may either use the standard authentication methods as provided by
          Grafana under <b>Auth</b>, or use a LogScale token under <b>LogScale Token Authentication</b>. There should be
          no reason to mix these two methods for authentication, so be mindful not to configure both.
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
                authenticateWithToken: options.jsonData.authenticateWithToken,
              },
            })
          }
        />
        <div className="gf-form-group">
          <h5> LogScale Token Authentication </h5>
          <p>
            {' '}
            If you wish to authenticate using a personal LogScale token copy and paste it into the field below.{' '}
            <br></br>
          </p>
          <div className="gf-form max-width-25">
            <SecretFormField
              labelWidth={10}
              inputWidth={15}
              label="Token"
              value={options.secureJsonData?.accessToken}
              onChange={(newValue) =>
                onOptionsChange({
                  ...options,
                  jsonData: {
                    baseUrl: options.jsonData.baseUrl,
                    authenticateWithToken: true,
                  },
                  secureJsonData: { accessToken: newValue.currentTarget.value },
                })
              }
              isConfigured={options.jsonData.authenticateWithToken}
              onReset={this.onPasswordReset}
              required={false}
            />
          </div>
        </div>
      </>
    );
  }

  render() {
    return <>{this.body()}</>;
  }
}
