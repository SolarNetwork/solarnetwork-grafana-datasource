import { DataSourcePlugin } from '@grafana/data';
import { DataSource } from './datasource';
import { ConfigEditor } from './components/ConfigEditor';
import { QueryEditor } from './components/QueryEditor';
import { SolarNetworkQuery, SolarNetworkDataSourceOptions } from './types';

export const plugin = new DataSourcePlugin<DataSource, SolarNetworkQuery, SolarNetworkDataSourceOptions>(DataSource)
  .setConfigEditor(ConfigEditor)
  .setQueryEditor(QueryEditor);
