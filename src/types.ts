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

export interface SigningKeyInfo {
  key: WordArray;
  date: Date;
}

export interface SolarNetworkQuery extends DataQuery {
  nodeIds: number[];
  sourceIds: string[];
  metrics: string[];
  combiningType: string;
}
