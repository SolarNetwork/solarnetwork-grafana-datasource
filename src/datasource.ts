import {
  CoreApp,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceInstanceSettings,
  LiveChannelScope,
  MetricFindValue,
  ScopedVars,
  TestDataSourceResponse,
  TimeRange,
} from '@grafana/data';
import {
  DataSourceWithBackend,
  getGrafanaLiveSrv,
  getTemplateSrv,
} from '@grafana/runtime';

import {
  DEFAULT_QUERY,
  SolarNetworkDataSourceOptions,
  SolarNetworkQuery,
  SolarNetworkVariableQuery,
} from './types';
import { VariableSupport } from './variableSupport';

import CryptoJS from 'crypto-js';

import { merge, Observable } from 'rxjs';

export class DataSource extends DataSourceWithBackend<SolarNetworkQuery, SolarNetworkDataSourceOptions> {
  constructor(instanceSettings: DataSourceInstanceSettings<SolarNetworkDataSourceOptions>) {
    super(instanceSettings);
    this.variables = new VariableSupport(this);
  }

  getDefaultQuery(_: CoreApp): Partial<SolarNetworkQuery> {
    return DEFAULT_QUERY;
  }

  applyTemplateVariables(query: SolarNetworkQuery, scopedVars: ScopedVars) {
    return {
      ...query,
      nodeIds: resolveValues(query.nodeIds, scopedVars, (v) => (typeof v === "string" ? Number(v) : v)),
      sourceIds: resolveValues(query.sourceIds, scopedVars),
      metrics: resolveValues(query.metrics, scopedVars),
    };
  }

  async metricFindQuery(
    variableQuery: SolarNetworkVariableQuery | string,
    options?: {
      scopedVars?: ScopedVars,
      range?: TimeRange,
    },
  ): Promise<MetricFindValue[]> {
    if (typeof variableQuery === 'string') return [];

    const scopedVars = options?.scopedVars;

    const nodeIds = resolveValues(variableQuery.nodeIds, scopedVars, (v) => (typeof v === "string" ? Number(v) : v ));
    const sourceIds = resolveValues(variableQuery.sourceIds, scopedVars);

    switch (variableQuery.kind) {
        case 'nodes':
            const nodes = await this.getNodeList();
            return nodes.map((n) => ({ text: String(n), value: n }));

        case 'sources':
            const sources = await this.getSourceList(nodeIds);
            return sources.map((s) => ({ text: s }));

        case 'metrics':
            const metrics = await this.getMetricList(nodeIds, sourceIds);
            return metrics.map((m) => ({ text: m }));
    }
  }

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

  query(request: DataQueryRequest<SolarNetworkQuery>): Observable<DataQueryResponse> {
    const normalQueries = request.targets.filter(q => !q.useStreaming);
    const streamingQueries = request.targets.filter(q => q.useStreaming);

    const observables: Observable<DataQueryResponse>[] = [];

    if (normalQueries.length > 0) {
      observables.push(
        super.query({
          ...request,
          targets: normalQueries,
        })
      );
    }

    for (const query of streamingQueries) {
      // path has symbol and length constraints, so make a hash for it
      const pathHash = CryptoJS.SHA1(`${query.queryType}-${query.sourceIds.join(",")}-${query.nodeIds.join(",")}-${query.metrics.join(",")}-${query.aggregation}`);
      observables.push(
        getGrafanaLiveSrv().getDataStream({
          addr: {
            scope: LiveChannelScope.DataSource,
            namespace: this.uid, // this gets renamed to stream in future versions
            path: `sn/${query.refId}-${pathHash}`,
            data: query,
          },
        })
      );
    }

    return merge(...observables);
  }

  /**
   * Get a list of all node IDs available to the configured credentials.
   *
   * @returns the available node IDs
   */
  async getNodeList(): Promise<number[]> {
    return this.getResource<number[]>("nodes");
  }

  /**
   * Get a list of all source IDs for the given nodes
   *
   * @param {number[]} the nodeIds to get sources for
   * @returns the available sources
   */
  async getSourceList(nodeIds: number[]): Promise<string[]> {
    if (!nodeIds.length) return [];
    return this.getResource<string[]>("sources", {
        nodeIds: nodeIds,
    });
  }

  /**
   * Get a list of all metrics for the given nodes and sources
   *
   * @param {number[]} the nodeIds to get metrics for
   * @param {string[]} the nodeIds to get metrics for
   * @returns the available sources
   */
  async getMetricList(nodeIds: number[], sourceIds: string[]): Promise<string[]> {
    if (!nodeIds.length && !sourceIds.length) return [];
    return this.getResource<string[]>("metrics", {
        nodeIds: nodeIds,
        sourceIds: sourceIds,
    });
  }
}

export function resolveValues<T = string>(
  expressions: Array<string | T> | undefined,
  scopedVars?: ScopedVars,
  convert?: (value: string) => T,
): T[] {
  return expressions?.flatMap((expression) => {
    if (typeof expression !== "string") return [expression];

    const values: string[] = [];

    getTemplateSrv().replace(
      expression,
      scopedVars,
      (value: string | string[]) => {
        if (Array.isArray(value)) {
          values.push(...value);
        } else {
          values.push(value);
        }
        return "";
      }
    );

    return convert ? values.map(convert) : values as T[];
  }) ?? [];
}
