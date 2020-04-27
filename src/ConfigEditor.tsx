import React, { PureComponent, ChangeEvent } from 'react';
import { SecretFormField, FormField } from '@grafana/ui';
import { DataSourcePluginOptionsEditorProps } from '@grafana/data';
import { SolarNetworkDataSourceOptions, SolarNetworkDataSourceSecureOptions } from './types';

interface Props extends DataSourcePluginOptionsEditorProps<SolarNetworkDataSourceOptions> {}

interface State {}

export class ConfigEditor extends PureComponent<Props, State> {
  onTokenChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { onOptionsChange, options } = this.props;
    const jsonData = {
      ...options.jsonData,
      token: event.target.value,
    };
    onOptionsChange({ ...options, jsonData });
  };

  onSecretChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { onOptionsChange, options } = this.props;
    const secureJsonData = {
      secret: event.target.value,
    };
    onOptionsChange({ ...options, secureJsonData });
  };

  onResetSecret = () => {
    const { onOptionsChange, options } = this.props;
    const secureJsonFields = {
      ...options.secureJsonFields,
      secret: false,
    };
    const secureJsonData = {
      ...options.secureJsonData,
      secret: '',
    };
    onOptionsChange({ ...options, secureJsonFields, secureJsonData });
  };

  onHostChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { onOptionsChange, options } = this.props;
    const jsonData = {
      ...options.jsonData,
      host: event.target.value,
    };
    onOptionsChange({ ...options, jsonData });
  };

  onProxyChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { onOptionsChange, options } = this.props;
    const jsonData = {
      ...options.jsonData,
      proxy: event.target.value,
    };
    onOptionsChange({ ...options, jsonData });
  };

  render() {
    const { options } = this.props;
    const { jsonData, secureJsonFields } = options;
    const secureJsonData = (options.secureJsonData || {}) as SolarNetworkDataSourceSecureOptions;

    return (
      <div className="gf-form-group">
        <div className="gf-form">
          <FormField
            label="Token"
            labelWidth={6}
            inputWidth={20}
            onChange={this.onTokenChange}
            value={jsonData.token || ''}
            placeholder="Authorization token"
          />
        </div>
        <div className="gf-form-inline">
          <div className="gf-form">
            <SecretFormField
              isConfigured={(secureJsonFields && secureJsonFields.secret) as boolean}
              value={secureJsonData.secret || ''}
              label="Secret"
              placeholder="Authorization secret"
              labelWidth={6}
              inputWidth={20}
              onReset={this.onResetSecret}
              onChange={this.onSecretChange}
            />
          </div>
        </div>
        <div className="gf-form">
          <FormField
            label="Host"
            labelWidth={6}
            inputWidth={30}
            onChange={this.onHostChange}
            value={jsonData.host || ''}
            defaultValue="https://data.solarnetwork.net"
            placeholder="e.g. https://data.solarnetwork.net"
          />
        </div>
        <div className="gf-form">
          <FormField
            label="Proxy"
            labelWidth={6}
            inputWidth={30}
            onChange={this.onProxyChange}
            value={jsonData.proxy || ''}
            defaultValue="https://query.solarnetwork.net"
            placeholder="e.g. https://query.solarnetwork.net"
          />
        </div>
      </div>
    );
  }
}
