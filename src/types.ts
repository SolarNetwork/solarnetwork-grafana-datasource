import { DataQuery, DataSourceJsonData } from '@grafana/data';

export interface SolarNetworkDataSourceOptions extends DataSourceJsonData {
  token: string;
  secret: string;
  host: string;
  proxy?: string;
}

export interface SolarNetworkQuery extends DataQuery {
  node: number;
  source: string;
  metric: string;
}
