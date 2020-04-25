import { AuthorizationV2Builder, Environment, HttpHeaders, HttpMethod, DatumFilter, NodeDatumUrlHelper } from 'solarnetwork-api-core';

import { DataQueryRequest, DataQueryResponse, DataSourceApi, DataSourceInstanceSettings, MutableDataFrame, FieldType } from '@grafana/data';
import { getBackendSrv } from '@grafana/runtime';

import { SolarNetworkQuery, SolarNetworkDataSourceOptions } from './types';

export class DataSource extends DataSourceApi<SolarNetworkQuery, SolarNetworkDataSourceOptions> {
  private token: string;
  private secret: string;
  private env: Environment;

  constructor(instanceSettings: DataSourceInstanceSettings<SolarNetworkDataSourceOptions>) {
    super(instanceSettings);
    const settingsData = instanceSettings.jsonData || ({} as SolarNetworkDataSourceOptions);
    this.token = settingsData.token;
    this.secret = settingsData.secret;

    this.env = this.createEnvironment(settingsData.host, settingsData.proxy);
  }

  private createEnvironment(host, proxy) {
    let h = document.createElement('a');
    h.href = host;
    let proxyHost: string | undefined;
    if (proxy) {
      let p = document.createElement('a');
      p.href = proxy;
      proxyHost = p.hostname;
    }
    return new Environment({
      host: h.hostname,
      protocol: h.protocol.substring(0, h.protocol.length - 1),
      hostname: h.hostname,
      port: h.port,
      proxyHost: proxyHost,
    });
  }

  private getPathFromUrl(url) {
    let a = document.createElement('a');
    a.href = url;
    return a.pathname + a.search;
  }

  private authV2Builder(path) {
    var authBuilder = new AuthorizationV2Builder(this.token, this.env);
    return authBuilder
      .method(HttpMethod.GET)
      .url(path)
      .snDate(true)
      .date(new Date())
      .saveSigningKey(this.secret);
  }

  private doRequest(url): Promise<any> {
    var authBuilder = this.authV2Builder(this.getPathFromUrl(url));
    var options = {
      url: url,
      headers: {
        Accept: 'application/json',
      },
      method: HttpMethod.GET,
      showSuccessAlert: true,
    };
    options.headers[HttpHeaders.X_SN_DATE] = authBuilder.requestDateHeaderValue;
    options.headers[HttpHeaders.AUTHORIZATION] = authBuilder.buildWithSavedKey();
    return getBackendSrv().datasourceRequest(options);
  }

  async query(options: DataQueryRequest<SolarNetworkQuery>): Promise<DataQueryResponse> {
    console.log(options);
    const { range } = options;
    const from = range!.from;
    const to = range!.to;
    const env = this.env;

    var data = await Promise.all(
      options.targets.map(target => {
        var urlHelper = new NodeDatumUrlHelper(env);
        const filter = new DatumFilter({
          nodeId: target.node,
          sourceId: target.source,
          startDate: from,
          endDate: to,
        });
        const url = urlHelper.listDatumUrl(filter);
        console.log(url);

        return this.doRequest(url).then(result => {
          let times: number[] = [];
          let values: number[] = [];
          result.data.data.results.forEach(datum => {
            times.push(Date.parse(datum.created));
            values.push(datum[target.metric]);
          });
          return new MutableDataFrame({
            refId: target.refId,
            fields: [
              { name: 'Time', values: times, type: FieldType.time },
              { name: 'Value', values: values, type: FieldType.number },
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
