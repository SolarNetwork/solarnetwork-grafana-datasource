import React, { useCallback, useMemo } from "react";
import { useOptions } from "./options";
import { DataSource, resolveValues } from "../datasource";
import {
  Combobox,
  ComboboxOption,
  InlineFieldRow,
  InlineField,
  MultiCombobox,
} from '@grafana/ui';
import { getTemplateSrv } from '@grafana/runtime';
import { SolarNetworkVariableQuery, VariableQueryKind } from '../types';

interface VariableQueryProps {
  query: SolarNetworkVariableQuery;
  onChange: (query: SolarNetworkVariableQuery, definition: string) => void;
  datasource: DataSource,
}

const kindOptions: Array<ComboboxOption<VariableQueryKind>> = [
  { label: 'Nodes', value: 'nodes' },
  { label: 'Sources', value: 'sources' },
  { label: 'Metrics', value: 'metrics' },
];

export function VariableQueryEditor({ query, onChange, datasource }: VariableQueryProps) {
  const {
    nodeIds,
    sourceIds,
  } = query;
  const kind = query.kind ?? "nodes";

  const variableOptions = getTemplateSrv().getVariables().map((variable) => ({ label: `$${variable.name}`, value: `$${variable.name}` }));

  const nIds = useMemo(() => resolveValues(nodeIds, undefined, (v) => typeof v === "string" ? Number(v) : v), [nodeIds]);
  const getNodeList = useCallback(() => datasource.getNodeList(), [datasource]);
  const nodeIdOptions = useOptions(getNodeList);
  const getSourceList = useCallback(() => datasource.getSourceList(nIds), [datasource, nIds]);
  const sourceIdOptions = useOptions(getSourceList);

  const onKindChange = (option: ComboboxOption<VariableQueryKind>) => {
    if (option.value === undefined) {
      return;
    }
    onChange({ ...query, kind: option.value }, "kind");
  };

  const onNodeIdsChange = (options: Array<ComboboxOption<number | string>>) => {
    onChange({ ...query, nodeIds: options.map((option) => option.value) }, "nodes");
  };

  const onSourceIdsChange = (options: Array<ComboboxOption<string>>) => {
    onChange({ ...query, sourceIds: options.map((option) => option.value) }, "sources");
  };

  return (
    <>
      <InlineFieldRow>
        <InlineField label="Kind">
          <Combobox
            options={kindOptions}
            value={kind}
            onChange={onKindChange} />
        </InlineField>
      </InlineFieldRow>
      {kind !== "nodes" && (
        <InlineFieldRow>
          <InlineField label="Node IDs">
            <MultiCombobox
              options={[...variableOptions, ...nodeIdOptions.options]}
              placeholder='New node (enter key to add)'
              value={nodeIds}
              isClearable
              loading={nodeIdOptions.loading}
              onChange={onNodeIdsChange}
            />
          </InlineField>
        </InlineFieldRow>
      )}
      {kind === "metrics" && (
        <InlineFieldRow>
          <InlineField label="Source IDs" labelWidth={20}>
            <MultiCombobox
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
      )}
    </>
  );
}
