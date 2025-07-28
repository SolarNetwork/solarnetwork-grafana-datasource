import { DataSourceJsonData } from '@grafana/data';
import { DataQuery } from '@grafana/schema';

import { AggregationNames, CombiningTypeNames, DatumReadingTypeNames } from 'solarnetwork-api-core/lib/domain';

/** The default host URL. */
export const DEFAULT_HOST = 'https://data.solarnetwork.net';

/** The default proxy URL (10m cache). */
export const DEFAULT_PROXY_URL = 'https://query.solarnetwork.net';

/**
 * The possible query types.
 */
export enum SolarNetworkQueryType {
  /** Use the `/datum/list` API. */
  List = 'listDatum',

  /** Use the `/datum/reading` API. */
  Reading = 'datumReading',
}

/**
 * Extension values to Aggregation names.
 */
export enum SolarNetworkExtendedAggregationNames {
  /** Auto adjust aggregation based on time range. */
  Auto = 'auto',
}

/**
 * The allowed SolarNetwork aggregation names.
 */
export type SolarNetworkAggregationNames = AggregationNames | SolarNetworkExtendedAggregationNames;

/**
 * Extension values to CombiningType names.
 */
export enum SolarNetworkExtendedCombiningTypeNames {
  /** Auto adjust aggregation based on time range. */
  None = 'none',
}

/**
 * The allowed SolarNetwork combining type names.
 */
export type SolarNetworkCombiningTypeNames = CombiningTypeNames | SolarNetworkExtendedCombiningTypeNames;

export interface SolarNetworkQuery extends DataQuery {
  queryType: SolarNetworkQueryType;
  nodeIds: number[];
  sourceIds: string[];
  metrics: string[];
  combiningType?: SolarNetworkCombiningTypeNames;
  aggregation: SolarNetworkAggregationNames;
  datumReadingType: DatumReadingTypeNames;
}

/**
 * Query default instance.
 */
export const DEFAULT_QUERY: Partial<SolarNetworkQuery> = {
  queryType: SolarNetworkQueryType.List,
  aggregation: SolarNetworkExtendedAggregationNames.Auto,
  combiningType: SolarNetworkExtendedCombiningTypeNames.None,
  datumReadingType: DatumReadingTypeNames.Difference,
};

/**
 * These are options configured for each DataSource instance.
 */
export interface SolarNetworkDataSourceOptions extends DataSourceJsonData {
  token: string;
  host: string;
  proxy?: string;
}

/**
 * Value that is used in the backend, but never sent over HTTP to the frontend.
 */
export interface SolarNetworkSecureJsonData {
  secret?: string;
}

/**
 * SolarNetwork API signing key.
 */
export interface SigningKeyInfo {
  key: CryptoJS.lib.WordArray;
  date: Date;
}
