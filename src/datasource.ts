import { AuthorizationV2Builder, Environment, HttpHeaders, HttpMethod, DatumFilter, NodeDatumUrlHelper, Aggregations } from 'solarnetwork-api-core';
import { DatumLoader } from 'solarnetwork-datum-loader';
import * as CryptoJS from 'crypto-js';

import { DataQueryRequest, DataQueryResponse, DataSourceApi, DataSourceInstanceSettings, MutableDataFrame, FieldType } from '@grafana/data';
import { getBackendSrv } from '@grafana/runtime';

import { SolarNetworkQuery, SolarNetworkDataSourceOptions, SigningKeyInfo } from './types';

const dayMilliseconds = 24 * 60 * 60 * 1000;

function sameUTCDate(d1: Date, d2: Date): boolean {
  return d1.toISOString().substr(0, 10) === d2.toISOString().substr(0, 10);
}

export class DataSource extends DataSourceApi<SolarNetworkQuery, SolarNetworkDataSourceOptions> {
  private token: string;
  private signingKey: Promise<SigningKeyInfo>;
  private nodeList: Promise<number[]>;
  private env: Environment;

  constructor(instanceSettings: DataSourceInstanceSettings<SolarNetworkDataSourceOptions>) {
    super(instanceSettings);
    const settingsData = instanceSettings.jsonData || ({} as SolarNetworkDataSourceOptions);
    this.token = settingsData.token;

    this.env = this.createEnvironment(settingsData.host, undefined);
    this.signingKey = this.getSigningKey();
    this.nodeList = this.populateNodeList();
  }

  private async getSigningKey(): Promise<SigningKeyInfo> {
    const tsdbRequest = {
      refId: 'sk',
      queries: [{ datasourceId: this.id }],
    };
    return getBackendSrv()
      .datasourceRequest({
        url: 'api/tsdb/query',
        method: 'POST',
        data: tsdbRequest,
      })
      .then((result: any) => {
        return {
          key: CryptoJS.enc.Hex.parse(result.data.results.sk.meta.key),
          date: new Date(result.data.results.sk.meta.date),
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

  private getPathFromUrl(url) {
    let a = document.createElement('a');
    a.href = url;
    return a.pathname + a.search;
  }

  private authV2Builder(path?: string): AuthorizationV2Builder {
    var authBuilder = new AuthorizationV2Builder(this.token, this.env);
    if (path) {
      authBuilder.path(path);
    }
    return authBuilder
      .method(HttpMethod.GET)
      .snDate(true)
      .date(new Date());
  }

  private async datumRequest(filter: DatumFilter): Promise<any> {
    var me = this;
    return await this.signingKey.then(signingKey => {
      if (!sameUTCDate(signingKey.date, new Date())) {
        // Update signing key and re-call
        me.signingKey = me.getSigningKey();
        return me.datumRequest(filter);
      }
      var urlHelper = new NodeDatumUrlHelper(me.env);
      var authBuilder = me.authV2Builder();
      authBuilder.signingKey = signingKey.key;
      authBuilder.signingKeyExpiration = new Date(signingKey.date.valueOf() + 7 * dayMilliseconds);
      let loader = new DatumLoader(urlHelper, filter, authBuilder);
      return loader.fetch();
    });
  }

  private async doRequest(url): Promise<any> {
    var path = this.getPathFromUrl(url);
    var authBuilder = this.authV2Builder(path);
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

  async query(options: DataQueryRequest<SolarNetworkQuery>): Promise<DataQueryResponse> {
    const { range } = options;
    const from = range!.from;
    const to = range!.to;

    var data = await Promise.all(
      options.targets.map(target => {
        var dateDiff = (to.valueOf() - from.valueOf()) / dayMilliseconds;
        const filter = new DatumFilter({
          nodeId: target.node,
          sourceId: target.source,
          startDate: from,
          endDate: to,
        });
        if (dateDiff > 7) {
          filter.aggregation = Aggregations.Hour;
        } else if (dateDiff > 30) {
          filter.aggregation = Aggregations.Day;
        } else if (dateDiff > 366) {
          filter.aggregation = Aggregations.Month;
        }

        return this.datumRequest(filter).then(results => {
          let times: number[] = [];
          let values: number[] = [];
          results.forEach(datum => {
            times.push(Date.parse(datum.created));
            values.push(datum[target.metric]);
          });
          return new MutableDataFrame({
            refId: target.refId,
            name: target.source,
            fields: [
              { name: 'Time', values: times, type: FieldType.time },
              { name: target.metric, values: values, type: FieldType.number },
            ],
          });
        });
      })
    );
    return { data };
  }

  async testDatasource() {
    const urlHelper = new NodeDatumUrlHelper(this.env);
    return this.doRequest(urlHelper.listAllNodeIdsUrl())
      .then((res: any) => {
        return { status: 'success', message: 'Success' };
      })
      .catch((err: any) => {
        return { status: 'error', message: err.statusText };
      });
  }
}
