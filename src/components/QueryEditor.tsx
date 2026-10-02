import React from "react";
import { useOptions } from "./options"
import {
  Combobox,
  ComboboxOption,
  FieldSet,
  InlineFieldRow,
  InlineField,
  MultiCombobox,
  RadioButtonGroup,
  Stack,
  Switch,
} from '@grafana/ui';
import { SelectableValue, QueryEditorProps } from '@grafana/data';
import { getTemplateSrv } from '@grafana/runtime';
import { DataSource, resolveValues } from '../datasource';
import {
  SolarNetworkAggregationNames,
  SolarNetworkCombiningTypeNames,
  SolarNetworkExtendedAggregationNames,
  SolarNetworkExtendedCombiningTypeNames,
  SolarNetworkDataSourceOptions,
  SolarNetworkQuery,
  SolarNetworkQueryType,
} from '../types';

import { Aggregation, AggregationNames, CombiningType, CombiningTypeNames, DatumReadingType, DatumReadingTypeNames } from 'solarnetwork-api-core/lib/domain';

type Props = QueryEditorProps<DataSource, SolarNetworkQuery, SolarNetworkDataSourceOptions>;

const DefaultQueryType = SolarNetworkQueryType.List;
const QueryTypes: Array<{ value: SolarNetworkQueryType, label: string }> = [
  { value: SolarNetworkQueryType.List, label: 'List' },
  { value: SolarNetworkQueryType.Reading, label: 'Reading' },
];

const DefaultCombiningType = 'none';

const CombiningTypes: Array<{ value: SolarNetworkCombiningTypeNames, label: string }> = [
  { value: SolarNetworkExtendedCombiningTypeNames.None, label: 'None' }
];
CombiningType.enumValues().forEach(value => {
  CombiningTypes.push({ value: value.name as CombiningTypeNames, label: value.name });
});

const DefaultAggregation = 'auto';

const Aggregations: Array<{ value: SolarNetworkAggregationNames, label: string }> = [
  { value: SolarNetworkExtendedAggregationNames.Auto, label: 'Auto' },
];
Aggregation.enumValues().forEach(value => {
  Aggregations.push({ value: value.name as AggregationNames, label: value.name });
});

const DefaultDatumReadingType = DatumReadingTypeNames.Difference;

const DatumReadingTypes: Array<{ value: DatumReadingTypeNames, label: string }> = [];
DatumReadingType.enumValues().forEach(value => {
  DatumReadingTypes.push({ value: value.name as DatumReadingTypeNames, label: value.name });
});

export function QueryEditor({ query, onChange, onRunQuery, datasource }: Props) {
  const { queryType,
    useStreaming,
    nodeIds,
    sourceIds,
    metrics,
    combiningType,
    aggregation,
    datumReadingType
  } = query;

  const variableOptions = getTemplateSrv().getVariables().map((variable) => ({ label: `$${variable.name}`, value: `$${variable.name}` }));

  const nIds = resolveValues(nodeIds, undefined, (v) => typeof v === "string" ? Number(v) : v);
  const sIds = resolveValues(sourceIds);
  const nodeIdOptions = useOptions(() => datasource.getNodeList(), []);
  const sourceIdOptions = useOptions(() => datasource.getSourceList(nIds), [nodeIds]);
  const metricOptions = useOptions(() => datasource.getMetricList(nIds, sIds), [nodeIds, sourceIds]);

  const onUseStreamingChange = (value: boolean) => {
    onChange({ ...query, useStreaming: value });
    onRunQuery();
  };

  const onNodeIdsChange = (options: Array<ComboboxOption<number | string>>) => {
    onChange({ ...query, nodeIds: options.map((option) => option.value) });
    onRunQuery();
  };

  const onSourceIdsChange = (options: Array<ComboboxOption<string>>) => {
    onChange({ ...query, sourceIds: options.map((option) => option.value) });
    onRunQuery();
  };

  const onMetricsChange = (options: Array<ComboboxOption<string>>) => {
    onChange({ ...query, metrics: options.map((option) => option.value) });
    onRunQuery();
  };

  const onQueryTypeChange = (value: SolarNetworkQueryType) => {
    onChange({ ...query, queryType: value });
    onRunQuery();
  };

  const onCombiningTypeChange = (option: SelectableValue<string>) => {
    onChange({ ...query, combiningType: option.value as SolarNetworkCombiningTypeNames || DefaultCombiningType });
    onRunQuery();
  };

  const onAggregationChange = (option: SelectableValue<string>) => {
    onChange({ ...query, aggregation: option.value as SolarNetworkAggregationNames || DefaultAggregation });
    onRunQuery();
  };

  const onDatumReadingTypeChange = (option: SelectableValue<string>) => {
    onChange({ ...query, datumReadingType: option.value as DatumReadingTypeNames || DefaultDatumReadingType });
    onRunQuery();
  };

  return (
    <Stack gap={5}>
      <FieldSet label="Query Data">
        <InlineFieldRow>
          <InlineField label="Streaming" labelWidth={20}>
            <Switch
              value={useStreaming}
              onChange={event => { onUseStreamingChange(event.currentTarget.checked); }} />
          </InlineField>
        </InlineFieldRow>
        <InlineFieldRow>
          <InlineField label="Node IDs" labelWidth={20}>
            <MultiCombobox
              width={40}
              options={[...variableOptions, ...nodeIdOptions.options]}
              value={nodeIds}
              isClearable
              loading={nodeIdOptions.loading}
              onChange={onNodeIdsChange} />
          </InlineField>
        </InlineFieldRow>
        <InlineFieldRow>
          <InlineField label="Source IDs" labelWidth={20}>
            <MultiCombobox
              width={40}
              options={[...variableOptions, ...sourceIdOptions.options]}
              placeholder="New source ID (enter key to add)"
              value={sourceIds}
              isClearable
              loading={sourceIdOptions.loading}
              onChange={onSourceIdsChange}
              createCustomValue
            />
          </InlineField>
        </InlineFieldRow>
        <InlineFieldRow>
          <InlineField label="Metrics" labelWidth={20}>
            <MultiCombobox
              width={40}
              options={[...variableOptions, ...metricOptions.options]}
              placeholder='New metric (enter key to add)'
              value={metrics}
              isClearable
              loading={metricOptions.loading}
              onChange={onMetricsChange}
              createCustomValue
            />
          </InlineField>
        </InlineFieldRow>
      </FieldSet>
      <FieldSet label="Query Style">
        <InlineFieldRow>
          <InlineField label="Query Type" labelWidth={20}>
            <RadioButtonGroup options={QueryTypes} value={queryType || DefaultQueryType} onChange={onQueryTypeChange} />
          </InlineField>
        </InlineFieldRow>
        <InlineFieldRow>
          <InlineField label="Combining Type" labelWidth={20}>
            <Combobox options={CombiningTypes} value={combiningType || DefaultCombiningType} onChange={onCombiningTypeChange} />
          </InlineField>
        </InlineFieldRow>
        <InlineFieldRow>
          <InlineField label="Aggregation" labelWidth={20}>
            <Combobox options={Aggregations} value={aggregation || DefaultAggregation} onChange={onAggregationChange} />
          </InlineField>
        </InlineFieldRow>
        <InlineFieldRow>
          <InlineField label="Reading Type" labelWidth={20}>
            <Combobox options={DatumReadingTypes} value={datumReadingType || DefaultDatumReadingType} onChange={onDatumReadingTypeChange} />
          </InlineField>
        </InlineFieldRow>
      </FieldSet>
    </Stack>
  );
}
