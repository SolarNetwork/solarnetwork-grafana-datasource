import React, { PureComponent, ChangeEvent } from 'react';
import { FormField, Select } from '@grafana/ui';
import { SelectableValue, QueryEditorProps } from '@grafana/data';
import { DataSource } from './datasource';
import { SolarNetworkQuery, SolarNetworkDataSourceOptions } from './types';

type Props = QueryEditorProps<DataSource, SolarNetworkQuery, SolarNetworkDataSourceOptions>;

interface State {
  nodeList: Array<SelectableValue<number>>;
  selectedNode?: SelectableValue<number>;
}

export class QueryEditor extends PureComponent<Props, State> {
  constructor(props: Props) {
    super(props);

    this.state = {
      nodeList: [],
      selectedNode: undefined,
    };
    var me = this;
    this.props.datasource.getNodeList().then(values => {
      values.forEach(value => {
        me.state.nodeList.push({ value: value, label: String(value) });
        if (value === me.props.query.node) {
          me.setState({ selectedNode: me.state.nodeList[me.state.nodeList.length - 1] });
        }
      });
    });
  }

  onNodeChange = (option: SelectableValue<number>) => {
    const { onChange, query, onRunQuery } = this.props;
    if (option.value) {
      onChange({ ...query, node: option.value });
      this.setState({ selectedNode: option });
    }
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
        <div className="gf-form-label">NodeID</div>
        <Select width={8} isSearchable={false} value={this.state.selectedNode} options={this.state.nodeList} onChange={this.onNodeChange} />
        <FormField width={8} value={this.props.query.source} onChange={this.onSourceChange} label="Source" type="string"></FormField>
        <FormField width={8} value={this.props.query.metric} onChange={this.onMetricChange} label="Metric" type="string"></FormField>
      </div>
    );
  }
}
