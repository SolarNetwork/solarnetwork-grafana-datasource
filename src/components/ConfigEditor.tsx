import React, { ChangeEvent } from 'react';
import {
  Combobox,
  ComboboxOption,
  InlineField, Input, SecretInput
} from '@grafana/ui';
import { DataSourcePluginOptionsEditorProps } from '@grafana/data';
import {
  DEFAULT_HOST,
  DEFAULT_PROXY_URL,
  SolarNetworkDataSourceOptions,
  SolarNetworkSecureJsonData
} from '../types';

interface Props extends DataSourcePluginOptionsEditorProps<SolarNetworkDataSourceOptions, SolarNetworkSecureJsonData> { }

const ProxyUrls: Array<{ value: string, label: string }> = [
  { value: 'https://query.solarnetwork.net/1m', label: '1m cache' },
  { value: DEFAULT_PROXY_URL, label: '10m cache' },
];

export function ConfigEditor(props: Props) {
  const { onOptionsChange, options } = props;
  const { jsonData, secureJsonFields, secureJsonData } = options;

  const onTokenChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...jsonData,
        token: event.target.value,
      },
    });
  };

  // Secure field (only sent to the backend)
  const onSecretChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      secureJsonData: {
        secret: event.target.value,
      },
    });
  };

  const onResetSecret = () => {
    onOptionsChange({
      ...options,
      secureJsonFields: {
        ...options.secureJsonFields,
        secret: false,
      },
      secureJsonData: {
        ...options.secureJsonData,
        secret: '',
      },
    });
  };

  const onProxyUrlChange = (option: ComboboxOption<string>) => {
    onOptionsChange({ ...options, jsonData: { ...jsonData, proxy: option.value } });
  };

  const onHostChange = (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      jsonData: {
        ...jsonData,
        host: event.target.value,
      },
    });
  };

  return (
    <>
      <InlineField label="Token" labelWidth={14} interactive tooltip={'SolarNetwork API token'}>
        <Input
          id="config-editor-token"
          onChange={onTokenChange}
          value={jsonData.token}
          placeholder="API token"
          width={40}
        />
      </InlineField>
      <InlineField label="Secret" labelWidth={14} interactive tooltip={'SolarNetwork API token secret'}>
        <SecretInput
          required
          id="config-editor-secret"
          isConfigured={secureJsonFields.secret}
          value={secureJsonData?.secret}
          placeholder="API token secret"
          width={40}
          onReset={onResetSecret}
          onChange={onSecretChange}
        />
      </InlineField>
      <InlineField label="Host" labelWidth={14} interactive tooltip={'SolarNetwork API host'}>
        <Input
          id="config-editor-host"
          onChange={onHostChange}
          value={jsonData.host || DEFAULT_HOST}
          placeholder="API host"
          width={40}
        />
      </InlineField>
      <InlineField label="Proxy" labelWidth={14} interactive tooltip={'Caching proxy URL'}>
        <Combobox
          id="config-editor-proxy"
          options={ProxyUrls}
          value={jsonData.proxy || DEFAULT_PROXY_URL}
          width={40}
          onChange={onProxyUrlChange}
          createCustomValue
        />
      </InlineField>
    </>
  );
}
