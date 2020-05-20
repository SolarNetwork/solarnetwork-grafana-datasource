import React, { PureComponent } from 'react';
import { Select, MultiSelect, InlineFormLabel } from '@grafana/ui';
import { SelectableValue, QueryEditorProps } from '@grafana/data';
import { DataSource } from './datasource';
import { SolarNetworkQuery, SolarNetworkDataSourceOptions } from './types';
import { Aggregation, CombiningType } from 'solarnetwork-api-core';

type Props = QueryEditorProps<DataSource, SolarNetworkQuery, SolarNetworkDataSourceOptions>;

interface State {
  nodeIds: Array<SelectableValue<number>>;
  selectedNodeIds: Array<SelectableValue<number>>;
  sourceIds: Array<SelectableValue<string>>;
  metrics: Array<SelectableValue<string>>;
  combiningTypes: Array<SelectableValue<string>>;
  aggregations: Array<SelectableValue<string>>;
}

export class QueryEditor extends PureComponent<Props, State> {
  state: State = {
    nodeIds: [],
    selectedNodeIds: [],
    sourceIds: [],
    metrics: [],
    combiningTypes: [],
    aggregations: [],
  };

  constructor(props: Props) {
    super(props);

    if (this.props.query.sourceIds) {
      this.props.query.sourceIds.forEach(sourceId => {
        this.state.sourceIds.push({ value: sourceId, label: sourceId });
      });
    }

    if (this.props.query.metrics) {
      this.props.query.metrics.forEach(metric => {
        this.state.metrics.push({ value: metric, label: metric });
      });
    }

    if (!this.props.query.combiningType) {
      this.props.query.combiningType = 'none';
    }
    this.state.combiningTypes.push({ value: 'none', label: 'None' });
    CombiningType.enumValues().forEach(value => {
      this.state.combiningTypes.push({ value: value.name, label: value.name });
    });

    if (!this.props.query.aggregation) {
      this.props.query.aggregation = 'auto';
    }
    this.state.aggregations.push({ value: 'auto', label: 'Auto' });
    this.state.aggregations.push({ value: 'none', label: 'None' });
    Aggregation.enumValues().forEach(value => {
      this.state.aggregations.push({ value: value.name, label: value.name });
    });
  }

  async componentDidMount() {
    const { query, datasource } = this.props;
    const state = this.state;

    const nodeIds = await datasource.getNodeList();
    let setNodeIds: Array<SelectableValue<number>> = [];
    nodeIds.forEach(nodeId => {
      state.nodeIds.push({ value: nodeId, label: String(nodeId) });
      if (query.nodeIds.includes(nodeId)) {
        setNodeIds.push(state.nodeIds[state.nodeIds.length - 1]);
      }
    });
    this.setState({ selectedNodeIds: setNodeIds });
  }

  onNodeIdsChange = (v: Array<SelectableValue<number>>) => {
    const { onChange, query } = this.props;
    const nodeIds = v.map((v: any) => v.value);
    onChange({ ...query, nodeIds: nodeIds });
    this.setState({ selectedNodeIds: nodeIds });
    this.tryQuery(); // executes the query
  };

  onSourceIdsChange = (v: Array<SelectableValue<string>>) => {
    const { onChange, query } = this.props;
    onChange({ ...query, sourceIds: v.map((v: any) => v.value) });
    this.tryQuery(); // executes the query
  };

  onSourceIdsCreateOption = (v: string) => {
    const { onChange, query } = this.props;
    var sourceIds = query.sourceIds || [];
    onChange({ ...query, sourceIds: sourceIds.concat(v) });
    this.setState({ sourceIds: this.state.sourceIds.concat({ value: v, label: v }) });
    this.tryQuery(); // executes the query
  };

  onMetricsChange = (v: Array<SelectableValue<string>>) => {
    const { onChange, query } = this.props;
    onChange({ ...query, metrics: v.map((v: any) => v.value) });
    this.tryQuery(); // executes the query
  };

  onMetricsCreateOption = (v: string) => {
    const { onChange, query } = this.props;
    var metrics = query.metrics || [];
    onChange({ ...query, metrics: metrics.concat(v) });
    this.setState({ metrics: this.state.metrics.concat({ value: v, label: v }) });
    this.tryQuery(); // executes the query
  };

  onCombiningTypeChange = (option: SelectableValue<string>) => {
    const { onChange, query } = this.props;
    if (option.value) {
      onChange({ ...query, combiningType: option.value });
    }
    this.tryQuery(); // executes the query
  };

  onAggregationChange = (option: SelectableValue<string>) => {
    const { onChange, query } = this.props;
    if (option.value) {
      onChange({ ...query, aggregation: option.value });
    }
    this.tryQuery(); // executes the query
  };

  tryQuery = () => {
    const { query, onRunQuery } = this.props;
    if (!query.nodeIds || !query.nodeIds.length) {
      return;
    }
    if (!query.sourceIds || !query.sourceIds.length) {
      return;
    }
    if (!query.metrics || !query.metrics.length) {
      return;
    }
    onRunQuery();
  };

  render() {
    return (
      <div className="gf-form">
        <InlineFormLabel width={7}>Node Ids</InlineFormLabel>
        <MultiSelect value={this.state.selectedNodeIds} options={this.state.nodeIds} onChange={this.onNodeIdsChange} />

        <InlineFormLabel width={7}>Source Ids</InlineFormLabel>
        <MultiSelect
          allowCustomValue
          value={this.props.query.sourceIds}
          options={this.state.sourceIds}
          onChange={this.onSourceIdsChange}
          onCreateOption={this.onSourceIdsCreateOption}
        />

        <InlineFormLabel width={7}>Metrics</InlineFormLabel>
        <MultiSelect
          allowCustomValue
          value={this.props.query.metrics}
          options={this.state.metrics}
          onChange={this.onMetricsChange}
          onCreateOption={this.onMetricsCreateOption}
        />

        <InlineFormLabel width={7}>Combining Type</InlineFormLabel>
        <Select
          value={this.props.query.combiningType}
          options={this.state.combiningTypes}
          onChange={this.onCombiningTypeChange}
        />

        <InlineFormLabel width={7}>Aggregation</InlineFormLabel>
        <Select
          value={this.props.query.aggregation}
          options={this.state.aggregations}
          onChange={this.onAggregationChange}
        />
      </div>
    );
  }
}
