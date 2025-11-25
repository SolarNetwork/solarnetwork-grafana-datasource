import {
  CoreApp,
  DataSourceInstanceSettings,
  TestDataSourceResponse,
} from '@grafana/data';
import { BackendSrvRequest, DataSourceWithBackend, getBackendSrv } from '@grafana/runtime';

import {
  DEFAULT_PROXY_URL,
  DEFAULT_QUERY,
  SigningKeyInfo,
  SolarNetworkDataSourceOptions,
  SolarNetworkQuery,
} from './types';

import CryptoJS from 'crypto-js';

import {
  AuthorizationV2Builder,
  Environment,
  HostConfig,
  HttpHeaders,
  HttpMethod,
  SolarQueryApi,
} from 'solarnetwork-api-core/lib/net';

function sameUTCDate(d1: Date, d2: Date): boolean {
  return d1.toISOString().substring(0, 10) === d2.toISOString().substring(0, 10);
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
}
