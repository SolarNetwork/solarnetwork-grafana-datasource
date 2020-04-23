import React, { PureComponent, ChangeEvent } from 'react';
import { FormField } from '@grafana/ui';
import { QueryEditorProps } from '@grafana/data';
import { DataSource } from './datasource';
import { SolarNetworkQuery, SolarNetworkDataSourceOptions } from './types';

type Props = QueryEditorProps<DataSource, SolarNetworkQuery, SolarNetworkDataSourceOptions>;

interface State {}

export class QueryEditor extends PureComponent<Props, State> {
  onComponentDidMount() {}

  onNodeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { onChange, query, onRunQuery } = this.props;
    onChange({ ...query, node: parseFloat(event.target.value) });
    onRunQuery(); // executes the query
  };

  onSourceChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { onChange, query, onRunQuery } = this.props;
    onChange({ ...query, source: event.target.value });
    onRunQuery(); // executes the query
  };

  onMetricChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { onChange, query, onRunQuery } = this.props;
    onChange({ ...query, metric: event.target.value });
    onRunQuery(); // executes the query
  };

  render() {
    return (
      <div className="gf-form">
        <FormField width={4} value={this.props.query.node} onChange={this.onNodeChange} label="Node ID" type="number" step="1"></FormField>
        <FormField width={8} value={this.props.query.source} onChange={this.onSourceChange} label="Source" type="string"></FormField>
        <FormField width={8} value={this.props.query.metric} onChange={this.onMetricChange} label="Metric" type="string"></FormField>
      </div>
    );
  }
}
