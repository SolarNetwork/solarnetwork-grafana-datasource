import React, { useEffect, useState } from 'react';
import {
  Combobox,
  ComboboxOption,
  FieldSet,
  InlineFieldRow,
  InlineField,
  MultiCombobox,
  RadioButtonGroup,
  Stack,
  TagsInput,
} from '@grafana/ui';
import { SelectableValue, QueryEditorProps } from '@grafana/data';
import { DataSource } from '../datasource';
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
    nodeIds,
    sourceIds,
    metrics,
    combiningType,
    aggregation,
    datumReadingType
  } = query;

  const [nodeIdOptions, setNodeIdOptions] = useState<Array<{ label: string; value: number }>>([]);
  const [loading, setLoading] = useState(false);

  // asynchronously load node IDs
  useEffect(() => {
    let active = true;

    const loadNodeIds = async () => {
      setLoading(true);
      try {
        const nodeIds = await datasource.getNodeList();
        if (active) {
          const options = nodeIds.map((nodeId: number) => ({
            label: nodeId.toString(),
            value: nodeId
          }));
          setNodeIdOptions(options);
        }
      } catch (error) {
        console.error('Failed to load node IDs for token.', error);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadNodeIds();

    return () => {
      active = false;
    };
  }, [datasource]);

  const onNodeIdsChange = (option: Array<ComboboxOption<number>>) => {
    const selectedNodeIds: number[] = option.filter((o) => !!o.value).map((o) => o.value!);
    onChange({ ...query, nodeIds: selectedNodeIds });
    onRunQuery();
  };

  const onSourceIdsChangeTags = (tags: string[]) => {
    onChange({ ...query, sourceIds: tags });
    onRunQuery();
  };

  const onMetricsChangeTags = (tags: string[]) => {
    onChange({ ...query, metrics: tags });
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
          <InlineField label="Node IDs" labelWidth={20}>
            <MultiCombobox
              width={40}
              options={nodeIdOptions}
              value={nodeIds}
              placeholder={loading ? 'Loading...' : ''}
              isClearable
              loading={loading}
              onChange={onNodeIdsChange} />
          </InlineField>
        </InlineFieldRow>
        <InlineFieldRow>
          <InlineField label="Source IDs" labelWidth={20}>
            <TagsInput
              width={40}
              placeholder='New source ID (enter key to add)'
              tags={sourceIds}
              onChange={onSourceIdsChangeTags}
              autoColors={false}
            />
          </InlineField>
        </InlineFieldRow>
        <InlineFieldRow>
          <InlineField label="Metrics" labelWidth={20}>
            <TagsInput
              width={40}
              placeholder='New metric (enter key to add)'
              tags={metrics}
              onChange={onMetricsChangeTags}
              autoColors={false}
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
