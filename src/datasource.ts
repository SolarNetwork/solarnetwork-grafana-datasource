import { AuthorizationV2Builder, Environment, HttpHeaders, HttpMethod } from 'solarnetwork-api-core';

import { DataQueryRequest, DataQueryResponse, DataSourceApi, DataSourceInstanceSettings, MutableDataFrame, FieldType } from '@grafana/data';
import { getBackendSrv } from '@grafana/runtime';

import { SolarNetworkQuery, SolarNetworkDataSourceOptions } from './types';

export class DataSource extends DataSourceApi<SolarNetworkQuery, SolarNetworkDataSourceOptions> {
  private token: string;
  private secret: string;
  private host: string;
  private proxy?: string;

  constructor(instanceSettings: DataSourceInstanceSettings<SolarNetworkDataSourceOptions>) {
    super(instanceSettings);
    const settingsData = instanceSettings.jsonData || ({} as SolarNetworkDataSourceOptions);
    this.token = settingsData.token;
    this.host = settingsData.host;
    this.proxy = settingsData.proxy;
    this.secret = settingsData.secret;
  }

  private authV2Builder(url) {
    let a = document.createElement('a');
    a.href = this.host;
    const env = new Environment({
      host: a.hostname,
      protocol: a.protocol.substring(0, a.protocol.length - 1),
      hostname: a.hostname,
      port: a.port,
    });
    var authBuilder = new AuthorizationV2Builder(this.token, env);
    return authBuilder
      .method(HttpMethod.GET)
      .url(url)
      .snDate(true)
      .date(new Date())
      .saveSigningKey(this.secret);
  }

  private doRequest(url): Promise<any> {
    var authBuilder = this.authV2Builder(url);
    var host = this.proxy || this.host;
    var options = {
      url: host + url,
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
    const { range } = options;
    const from = range!.from.toISOString().substr(0, 16);
    const to = range!.to.toISOString().substr(0, 16);

    var data = await Promise.all(
      options.targets.map(target => {
        const url =
          '/solarquery/api/v1/sec/datum/list?nodeId=' +
          target.node +
          '&sourceIds=' +
          target.source +
          '&withoutTotalResultsCount=true&aggregation=Hour&startDate=' +
          from +
          '&endDate=' +
          to;

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
    const url = '/solarquery/api/v1/sec/nodes/';

    return this.doRequest(url)
      .then((res: any) => {
        return { status: 'success', message: 'Success' };
      })
      .catch((err: any) => {
        return { status: 'error', message: err.statusText };
      });
  }
}
