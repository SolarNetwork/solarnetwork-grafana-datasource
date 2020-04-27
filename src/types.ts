import { DataQuery, DataSourceJsonData } from '@grafana/data';
import { WordArray } from 'crypto-js';

export interface SolarNetworkDataSourceOptions extends DataSourceJsonData {
  token: string;
  host: string;
  proxy?: string;
}

export interface SolarNetworkDataSourceSecureOptions {
  secret: string;
}

export interface SolarNetworkQuery extends DataQuery {
  node: number;
  source: string;
  metric: string;
}

export interface SigningKeyInfo {
  key: WordArray;
  date: Date;
}
