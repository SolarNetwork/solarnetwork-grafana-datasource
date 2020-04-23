import { DataSourcePlugin } from '@grafana/data';
import { DataSource } from './datasource';
import { ConfigEditor } from './ConfigEditor';
import { QueryEditor } from './QueryEditor';
import { SolarNetworkQuery, SolarNetworkDataSourceOptions } from './types';

export const plugin = new DataSourcePlugin<DataSource, SolarNetworkQuery, SolarNetworkDataSourceOptions>(DataSource)
  .setConfigEditor(ConfigEditor)
  .setQueryEditor(QueryEditor);
