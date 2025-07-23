import { DataSourceJsonData } from '@grafana/data';
import { DataQuery } from '@grafana/schema';

export interface SolarNetworkDataSourceOptions extends DataSourceJsonData {
  token: string;
  host: string;
  proxy?: string;
}

export interface SolarNetworkDataSourceSecureOptions {
  secret: string;
}

export interface SigningKeyInfo {
  key: CryptoJS.lib.WordArray;
  date: Date;
}

export interface SolarNetworkQuery extends DataQuery {
  queryType: string;
  nodeIds: number[];
  sourceIds: string[];
  metrics: string[];
  combiningType: string;
  aggregation: string;
  datumReadingType: string;
}
