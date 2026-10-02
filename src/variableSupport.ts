import { CustomVariableSupport, DataQueryRequest, MetricFindValue } from '@grafana/data';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { DataSource } from './datasource';
import { SolarNetworkVariableQuery } from './types';
import { VariableQueryEditor } from './components/VariableQueryEditor';

export class VariableSupport extends CustomVariableSupport<DataSource, SolarNetworkVariableQuery> {
  editor = VariableQueryEditor;

  constructor(private datasource: DataSource) {
    super();
  }

  query(request: DataQueryRequest<SolarNetworkVariableQuery>): Observable<{ data: MetricFindValue[] }> {
    const [query] = request.targets;
    const { range, scopedVars } = request;

    const result = this.datasource.metricFindQuery(query, { scopedVars, range });
    return from(result).pipe(map((data) => ({ data })));
  }
}
