import {
  AuthorizationV2Builder,
  Environment,
  HttpHeaders,
  HttpMethod,
  DatumFilter,
  NodeDatumUrlHelper,
  Aggregations,
  Aggregation,
  CombiningType,
  DatumReadingType,
} from 'solarnetwork-api-core';
import { DatumLoader } from 'solarnetwork-datum-loader';
import * as CryptoJS from 'crypto-js';
import { flatten } from 'lodash';

import {
  DataQueryRequest,
  DataQueryResponse,
  DataSourceInstanceSettings,
  MutableDataFrame,
  FieldType,
} from '@grafana/data';
import { DataSourceWithBackend, getBackendSrv } from '@grafana/runtime';

import { SolarNetworkQuery, SolarNetworkDataSourceOptions, SigningKeyInfo } from './types';

const minuteMilliseconds = 60 * 1000;
const dayMilliseconds = 24 * 60 * minuteMilliseconds;

function sameUTCDate(d1: Date, d2: Date): boolean {
  return d1.toISOString().substr(0, 10) === d2.toISOString().substr(0, 10);
}

export class DataSource extends DataSourceWithBackend<SolarNetworkQuery, SolarNetworkDataSourceOptions> {
  private token: string;
  private signingKey: Promise<SigningKeyInfo>;
  private nodeList: Promise<number[]>;
  private env: Environment;

  constructor(instanceSettings: DataSourceInstanceSettings<SolarNetworkDataSourceOptions>) {
    super(instanceSettings);
    const settingsData = instanceSettings.jsonData || ({} as SolarNetworkDataSourceOptions);
    this.token = settingsData.token;

    this.env = this.createEnvironment(settingsData.host, settingsData.proxy);
    this.signingKey = this.getSigningKey();
    this.nodeList = this.populateNodeList();
  }

  private async getSigningKey(): Promise<SigningKeyInfo> {
    return this.getResource('sk').then((result: any) => {
      return {
        key: CryptoJS.enc.Hex.parse(result.key),
        date: new Date(result.date),
      };
    });
  }

  private async populateNodeList(): Promise<number[]> {
    const urlHelper = new NodeDatumUrlHelper(this.env);
    return this.doRequest(urlHelper.listAllNodeIdsUrl()).then((result: any) => {
      let nodeList: number[] = [];
      result.data.data.forEach(node => {
        nodeList.push(node);
      });
      return nodeList;
    });
  }

  async getNodeList(): Promise<number[]> {
    return await this.nodeList;
  }

  private createEnvironment(host, proxy) {
    let h = document.createElement('a');
    h.href = host;
    let proxyHost: string | undefined;
    let proxyPort: string | undefined;
    if (proxy) {
      let p = document.createElement('a');
      p.href = proxy;
      proxyHost = p.hostname;
      proxyPort = p.port;
    }
    return new Environment({
      host: h.hostname,
      protocol: h.protocol.substring(0, h.protocol.length - 1),
      hostname: h.hostname,
      port: h.port,
      proxyHost: proxyHost,
      proxyPort: proxyPort,
    });
  }

  private authV2Builder(url?: string): AuthorizationV2Builder {
    var authBuilder = new AuthorizationV2Builder(this.token, this.env);
    if (url) {
      let a = document.createElement('a');
      a.href = url;
      if (a.pathname) {
        authBuilder.path(a.pathname);
      }
      if (a.search) {
        var urlParams = new URLSearchParams(a.search);
        var params = {};
        for (let entry of urlParams.entries()) {
          const [key, value] = entry;
          params[key] = value;
        }
        authBuilder.queryParams(params);
      }
    }
    return authBuilder
      .method(HttpMethod.GET)
      .snDate(true)
      .date(new Date());
  }

  private async listDatumRequest(filter: DatumFilter): Promise<any> {
    var me = this;
    return await this.signingKey.then(signingKey => {
      if (!sameUTCDate(signingKey.date, new Date())) {
        // Update signing key and re-call
        me.signingKey = me.getSigningKey();
        return me.listDatumRequest(filter);
      }
      var urlHelper = new NodeDatumUrlHelper(me.env);
      var authBuilder = me.authV2Builder();
      authBuilder.key(signingKey.key, signingKey.date);
      let loader = new DatumLoader(urlHelper, filter, authBuilder);
      return loader.fetch();
    });
  }

  private async datumReadingRequest(filter: DatumFilter, readingType: DatumReadingType): Promise<any> {
    var urlHelper = new NodeDatumUrlHelper(this.env);
    var url = urlHelper.datumReadingUrl(filter, readingType);
    return this.doRequest(url);
  }

  private async doRequest(url): Promise<any> {
    var authBuilder = this.authV2Builder(url);
    var me = this;
    return await this.signingKey.then(signingKey => {
      if (!sameUTCDate(signingKey.date, new Date())) {
        // Update signing key and re-call
        me.signingKey = me.getSigningKey();
        return me.doRequest(url);
      }
      var options = {
        url: url,
        headers: {
          Accept: 'application/json',
        },
        method: HttpMethod.GET,
      };
      options.headers[HttpHeaders.X_SN_DATE] = authBuilder.requestDateHeaderValue;
      options.headers[HttpHeaders.AUTHORIZATION] = authBuilder.buildWithKey(signingKey.key);
      return getBackendSrv().datasourceRequest(options);
    });
  }

  private async fetchListDatumResult(filter, target): Promise<MutableDataFrame[]> {
    return this.listDatumRequest(filter).then(results => {
      let series: Map<string, any> = new Map<string, any>();
      results.forEach(datum => {
        const seriesName = target.nodeIds.length > 1 ? datum.nodeId + ' ' + datum.sourceId : datum.sourceId;
        if (!series.has(seriesName)) {
          let frame = {
            refId: target.refId,
            name: datum.sourceId,
            fields: [{ name: 'Time', values: [], type: FieldType.time }],
          };
          target.metrics.forEach(metric => {
            frame.fields.push({
              name: metric,
              values: [],
              type: FieldType.number,
            });
          });
          series.set(seriesName, frame);
        }
        var s = series.get(seriesName);
        if (s) {
          s.fields.forEach(field => {
            if (field.name === 'Time') {
              field.values.push(Date.parse(datum.created));
            } else {
              field.values.push(datum[field.name]);
            }
          });
        }
      });
      return [...series.entries()].map(([source, frame]) => {
        return new MutableDataFrame(frame);
      });
    });
  }

  private async fetchDatumReadingResult(filter, readingType, target): Promise<MutableDataFrame[]> {
    return this.datumReadingRequest(filter, readingType).then(data => {
      let series: Map<string, any> = new Map<string, any>();
      data.data.data.results.forEach(datum => {
        const seriesName = target.nodeIds.length > 1 ? datum.nodeId + ' ' + datum.sourceId : datum.sourceId;
        if (!series.has(seriesName)) {
          let frame = {
            refId: target.refId,
            name: datum.sourceId,
            fields: [{ name: 'Time', values: [], type: FieldType.time }],
          };
          target.metrics.forEach(metric => {
            frame.fields.push({
              name: metric,
              values: [],
              type: FieldType.number,
            });
          });
          series.set(seriesName, frame);
        }
        var s = series.get(seriesName);
        if (s) {
          s.fields.forEach(field => {
            if (field.name === 'Time') {
              field.values.push(Date.parse(datum.endDate));
            } else {
              field.values.push(datum[field.name]);
            }
          });
        }
      });
      return [...series.entries()].map(([source, frame]) => {
        return new MutableDataFrame(frame);
      });
    });
  }

  private async listDatumQuery(from, to, aggregation, target): Promise<MutableDataFrame[]> {
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

  private async listDatumCombiningQuery(from, to, aggregation, combiningType, target): Promise<MutableDataFrame[]> {
    if (!combiningType) {
      return new MutableDataFrame();
    }
    let combiName: string = combiningType.name;
    let filter: DatumFilter = new DatumFilter({
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

  private async datumReadingQuery(from, to, aggregation, target): Promise<MutableDataFrame[]> {
    let filter: DatumFilter = new DatumFilter({
      nodeIds: target.nodeIds,
      sourceIds: target.sourceIds,
      startDate: from,
      endDate: to,
    });
    if (aggregation) {
      filter.aggregation = aggregation;
    }
    let readingType = DatumReadingType.valueOf(target.datumReadingType);
    return this.fetchDatumReadingResult(filter, readingType, target);
  }

  async query(options: DataQueryRequest<SolarNetworkQuery>): Promise<DataQueryResponse> {
    const { range } = options;
    const from = range!.from;
    const to = new Date(range!.to.valueOf() + minuteMilliseconds);
    const dateDiff = (to.valueOf() - from.valueOf()) / dayMilliseconds;

    var data = await Promise.all(
      options.targets.map(target => {
        let aggregation: Aggregation = undefined;
        if (!target.aggregation || target.aggregation === 'auto') {
          if (dateDiff > 366) {
            aggregation = Aggregations.Month;
          } else if (dateDiff > 30) {
            aggregation = Aggregations.Day;
          } else if (dateDiff > 7) {
            aggregation = Aggregations.Hour;
          }
        } else if (target.aggregation !== 'none') {
          aggregation = Aggregation.valueOf(target.aggregation);
        }

        if (target.queryType === 'datumReading') {
          return this.datumReadingQuery(from, to, aggregation, target);
        } else {
          if (target.combiningType === 'none') {
            return this.listDatumQuery(from, to, aggregation, target);
          } else {
            let combiningType: CombiningType = CombiningType.valueOf(target.combiningType);
            return this.listDatumCombiningQuery(from, to, aggregation, combiningType, target);
          }
        }
      })
    ).then(flatten);
    return { data };
  }

  async testDatasource() {
    this.callHealthCheck()
      .then((res: any) => {
        const urlHelper = new NodeDatumUrlHelper(this.env);
        return this.doRequest(urlHelper.listAllNodeIdsUrl())
          .then((res: any) => {
            return { status: 'success', message: 'Success' };
          })
          .catch((err: any) => {
            return { status: 'error', message: err.statusText };
          });
      })
      .catch((err: any) => {
        return { status: 'error', message: 'Backend failed' };
      });
  }
}
