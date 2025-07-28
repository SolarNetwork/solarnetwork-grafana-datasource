import {
  CoreApp,
  createDataFrame,
  DataFrame,
  DataFrameDTO,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceInstanceSettings,
  FieldType,
  TestDataSourceResponse,
} from '@grafana/data';
import { BackendSrvRequest, DataSourceWithBackend, getBackendSrv } from '@grafana/runtime';

import {
  DEFAULT_PROXY_URL,
  DEFAULT_QUERY,
  SigningKeyInfo,
  SolarNetworkDataSourceOptions,
  SolarNetworkExtendedAggregationNames,
  SolarNetworkExtendedCombiningTypeNames,
  SolarNetworkQuery,
  SolarNetworkQueryType,
} from './types';

import CryptoJS from 'crypto-js';

import {
  Aggregation,
  AggregationNames,
  Aggregations,
  CombiningType,
  Datum,
  DatumFilter,
  DatumReadingType,
  DatumReadingTypeNames,
} from 'solarnetwork-api-core/lib/domain';
import {
  AuthorizationV2Builder,
  Environment,
  HostConfig,
  HttpHeaders,
  HttpMethod,
  SolarQueryApi,
} from 'solarnetwork-api-core/lib/net';
import { DatumLoader } from 'solarnetwork-api-core/lib/tool';

import { flatten } from 'lodash';

const minuteMilliseconds = 60 * 1000;
const dayMilliseconds = 24 * 60 * minuteMilliseconds;

function sameUTCDate(d1: Date, d2: Date): boolean {
  return d1.toISOString().substring(0, 10) === d2.toISOString().substring(0, 10);
}

function parseDatumResponse(filter: DatumFilter, target: SolarNetworkQuery, results: Datum[]): DataFrame[] {
  const series: Map<string, DataFrameDTO> = new Map<string, DataFrameDTO>();
  results.forEach((datum) => {
    const seriesName = target.nodeIds.length > 1 ? datum.nodeId + ' ' + datum.sourceId : datum.sourceId;
    if (!series.has(seriesName)) {
      const frame: DataFrameDTO = {
        refId: target.refId,
        name: datum.sourceId,
        fields: [{ name: 'Time', values: [], type: FieldType.time }],
      };
      target.metrics.forEach((metric) => {
        frame.fields.push({
          name: metric,
          values: [],
          type: FieldType.number,
        });
      });
      series.set(seriesName, frame);
    }
    const s = series.get(seriesName);
    if (s) {
      s.fields.forEach((field) => {
        if (field.name === 'Time') {
          field.values!.push(Date.parse(datum.created));
        } else {
          field.values!.push(datum[field.name]);
        }
      });
    }
  });
  return [...series.entries()].map(([_source, frame]) => {
    return createDataFrame(frame);
  });
}

export class DataSource extends DataSourceWithBackend<SolarNetworkQuery, SolarNetworkDataSourceOptions> {
  private token: string;
  private signingKey: Promise<SigningKeyInfo>;
  private api: SolarQueryApi;

  constructor(instanceSettings: DataSourceInstanceSettings<SolarNetworkDataSourceOptions>) {
    super(instanceSettings);

    const settingsData = instanceSettings.jsonData || ({} as SolarNetworkDataSourceOptions);
    this.token = settingsData.token;

    this.api = this.createQueryApi(settingsData.host, settingsData.proxy);
    this.signingKey = this.getSigningKey();
  }

  getDefaultQuery(_: CoreApp): Partial<SolarNetworkQuery> {
    return DEFAULT_QUERY;
  }

  /* TODO
  applyTemplateVariables(query: SolarNetworkQuery, scopedVars: ScopedVars) {
    return {
      ...query,
      queryText: getTemplateSrv().replace(query.queryText, scopedVars),
    };
  }
  */

  async testDatasource(): Promise<TestDataSourceResponse> {
    return this.getNodeList()
      .then((res: any) => {
        return { status: 'success', message: 'Success' };
      })
      .catch((err: any) => {
        return { status: 'error', message: err.data?.message || err.statusText || err.status };
      });
  }

  filterQuery(query: SolarNetworkQuery): boolean {
    // if no query has been provided, prevent the query from being executed
    return !!query.nodeIds?.length || !!query.sourceIds?.length || !!query.metrics?.length;
  }

  private async getSigningKey(): Promise<SigningKeyInfo> {
    return this.getResource('sk').then((result: any) => {
      return {
        key: CryptoJS.enc.Hex.parse(result.key),
        date: new Date(result.date),
      };
    });
  }

  /**
   * Get a list of all node IDs available to the configured credentials.
   *
   * @returns the available node IDs
   */
  async getNodeList(): Promise<number[]> {
    return this.doRequest(this.api.listAllNodeIdsUrl()).then((result: any) => {
      let nodeList: number[] = [];
      result.data.data.forEach((node: number) => {
        nodeList.push(node);
      });
      return nodeList;
    });
  }

  private createQueryApi(host: string | undefined, proxy: string | undefined): SolarQueryApi {
    const config: Partial<HostConfig> = {};

    if (host) {
      const a = document.createElement('a');
      a.href = host;
      config.host = a.hostname;
      config.protocol = a.protocol.substring(0, a.protocol.length - 1);
      config.hostname = a.hostname;
      if (a.port) {
        config.port = Number(a.port);
      }
    }
    if (proxy) {
      config.proxyUrlPrefix = proxy;
    } else {
      config.proxyUrlPrefix = DEFAULT_PROXY_URL;
    }

    return new SolarQueryApi(new Environment(config));
  }

  private authV2Builder(url?: string): AuthorizationV2Builder {
    const authBuilder = new AuthorizationV2Builder(this.token, this.api.environment);
    if (url) {
      authBuilder.url(url, true);
    }
    return authBuilder.method(HttpMethod.GET).snDate(true);
  }

  private async doRequest(url: string): Promise<any> {
    const authBuilder = this.authV2Builder(url);
    const me = this;
    return await this.signingKey.then((signingKey) => {
      if (!sameUTCDate(signingKey.date, new Date())) {
        // Update signing key and re-call
        me.signingKey = me.getSigningKey();
        return me.doRequest(url);
      }
      const options: BackendSrvRequest = {
        url: this.api.toRequestUrl(url),
        headers: {
          Accept: 'application/json',
        },
        method: HttpMethod.GET,
      };
      options.headers![HttpHeaders.X_SN_DATE] = authBuilder.requestDateHeaderValue;
      options.headers![HttpHeaders.AUTHORIZATION] = authBuilder.buildWithKey(signingKey.key);
      return getBackendSrv().datasourceRequest(options);
    });
  }

  private tryQuery<T>(filter: DatumFilter, target: SolarNetworkQuery, callback: () => Promise<T>): Promise<T> {
    const authBuilder = this.authV2Builder();
    if (!filter.nodeId || !filter.sourceId || !authBuilder.tokenId || !target.metrics || !target.metrics.length) {
      return Promise.reject('Node ID, source ID, metrics, or security token not configured.');
    }
    return callback();
  }

  private async listDatumRequest(filter: DatumFilter, target: SolarNetworkQuery): Promise<Datum[]> {
    const me = this;
    return await this.signingKey.then((signingKey) => {
      if (!sameUTCDate(signingKey.date, new Date())) {
        // Update signing key and re-call
        me.signingKey = me.getSigningKey();
        return me.listDatumRequest(filter, target);
      }

      return me.tryQuery(filter, target, () => {
        const authBuilder = me.authV2Builder();
        authBuilder.key(signingKey.key, signingKey.date);
        const loader = new DatumLoader(this.api, filter, authBuilder);
        return loader.fetch();
      });
    });
  }

  private async datumReadingRequest(
    filter: DatumFilter,
    readingType: DatumReadingType,
    target: SolarNetworkQuery
  ): Promise<Datum[]> {
    const me = this;
    return await this.signingKey.then((signingKey) => {
      if (!sameUTCDate(signingKey.date, new Date())) {
        // Update signing key and re-call
        me.signingKey = me.getSigningKey();
        return me.datumReadingRequest(filter, readingType, target);
      }

      return me.tryQuery(filter, target, () => {
        const authBuilder = me.authV2Builder();
        authBuilder.key(signingKey.key, signingKey.date);
        const loader = new DatumLoader(this.api, filter, authBuilder).readings(true);
        return loader.fetch();
      });
    });
  }

  private async fetchListDatumResult(filter: DatumFilter, target: SolarNetworkQuery): Promise<DataFrame[]> {
    return this.listDatumRequest(filter, target).then((results) => parseDatumResponse(filter, target, results));
  }

  private async fetchDatumReadingResult(
    filter: DatumFilter,
    readingType: DatumReadingType,
    target: SolarNetworkQuery
  ): Promise<DataFrame[]> {
    return this.datumReadingRequest(filter, readingType, target).then((results) =>
      parseDatumResponse(filter, target, results)
    );
  }

  private async listDatumQuery(
    from: Date,
    to: Date,
    aggregation: Aggregation | undefined,
    target: SolarNetworkQuery
  ): Promise<DataFrame[]> {
    let filter: DatumFilter = new DatumFilter({
      nodeIds: target.nodeIds,
      sourceIds: target.sourceIds,
      startDate: from,
      endDate: to,
    });
    if (aggregation) {
      filter.aggregation = aggregation;
    }
    return this.fetchListDatumResult(filter, target);
  }

  private async listDatumCombiningQuery(
    from: Date,
    to: Date,
    aggregation: Aggregation | undefined,
    combiningType: CombiningType | undefined,
    target: SolarNetworkQuery
  ): Promise<DataFrame[]> {
    if (!combiningType) {
      return [];
    }
    const combiName: string = combiningType.name;
    const filter: DatumFilter = new DatumFilter({
      nodeIds: target.nodeIds,
      sourceIds: target.sourceIds,
      combiningType: combiningType,
      sourceIdMaps: new Map<string, Set<string>>([[combiName, new Set<string>(target.sourceIds)]]),
      startDate: from,
      endDate: to,
    });
    if (target.nodeIds.length > 1) {
      filter.nodeIdMaps = new Map<number, Set<number>>([[-1, new Set<number>(target.nodeIds)]]);
    }
    if (aggregation) {
      filter.aggregation = aggregation;
    } else {
      filter.aggregation = Aggregations.FiveMinute;
    }
    target.nodeIds = [-1];
    target.sourceIds = ['Sum'];
    return this.fetchListDatumResult(filter, target);
  }

  private async datumReadingQuery(
    from: Date | undefined,
    to: Date,
    aggregation: Aggregation | undefined,
    target: SolarNetworkQuery
  ): Promise<DataFrame[]> {
    const filter: DatumFilter = new DatumFilter();
    filter.nodeIds = target.nodeIds;
    filter.sourceIds = target.sourceIds;
    if (from) {
      filter.startDate = from;
    }
    filter.endDate = to;
    if (aggregation) {
      filter.aggregation = aggregation;
    }
    const readingType: DatumReadingType = DatumReadingType.valueOf(
      target.datumReadingType || DatumReadingTypeNames.Difference
    )!;
    return this.fetchDatumReadingResult(filter, readingType, target);
  }

  async query(options: DataQueryRequest<SolarNetworkQuery>): Promise<DataQueryResponse> {
    const { range } = options;
    const from = range!.from.toDate();
    const to = new Date(range!.to.valueOf() + minuteMilliseconds);
    const dateDiff = (to.valueOf() - from.valueOf()) / dayMilliseconds;

    const data = await Promise.all(
      options.targets.map((target) => {
        let aggregation: Aggregation | undefined = undefined;
        if (!target.aggregation || target.aggregation === SolarNetworkExtendedAggregationNames.Auto) {
          if (dateDiff > 366) {
            aggregation = Aggregations.Month;
          } else if (dateDiff > 30) {
            aggregation = Aggregations.Day;
          } else if (dateDiff > 7) {
            aggregation = Aggregations.Hour;
          }
        } else if (target.aggregation !== AggregationNames.None) {
          aggregation = Aggregation.valueOf(target.aggregation);
        }

        if (target.queryType === SolarNetworkQueryType.Reading) {
          return this.datumReadingQuery(from, to, aggregation, target);
        } else if (!target.combiningType || target.combiningType === SolarNetworkExtendedCombiningTypeNames.None) {
          return this.listDatumQuery(from, to, aggregation, target);
        } else {
          let combiningType: CombiningType | undefined = CombiningType.valueOf(target.combiningType);
          return this.listDatumCombiningQuery(from, to, aggregation, combiningType, target);
        }
      })
    ).then(flatten);
    return { data } as DataQueryResponse;
  }
}
