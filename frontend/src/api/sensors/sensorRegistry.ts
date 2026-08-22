import { api, API_URL } from '@/api';

export interface SensorGroup {
  id: number;
  name: string;
  display_name: string;
  color: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface SensorRegistryItem {
  id: number;
  group_id: number;
  metric_name: string;
  display_name: string;
  sort_order: number;
  is_active: boolean;
  group_name?: string;
  group_display_name?: string;
  group_color?: string;
  group_sort_order?: number;
}

export interface ReorderItem {
  id: number;
  sort_order: number;
}

export const getSensorGroups = (): Promise<SensorGroup[]> =>
  api.get(API_URL.SENSORS_GROUPS).then((r) => r.data);

export const getSensorRegistry = (group_id?: number): Promise<SensorRegistryItem[]> =>
  api.get(API_URL.SENSORS_REGISTRY, { params: group_id ? { group_id } : undefined }).then((r) => r.data);

export const reorderSensorGroups = (items: ReorderItem[]): Promise<{ status: string; updated: number }> =>
  api.put(`${API_URL.SENSORS_GROUPS}/reorder`, { items }).then((r) => r.data);

export const reorderSensors = (items: ReorderItem[]): Promise<{ status: string; updated: number }> =>
  api.put(`${API_URL.SENSORS_REGISTRY}/reorder`, { items }).then((r) => r.data);

export const updateSensorGroup = (id: number, data: Partial<SensorGroup>): Promise<SensorGroup> =>
  api.put(`${API_URL.SENSORS_GROUPS}/${id}`, data).then((r) => r.data);

export const updateSensorRegistryItem = (id: number, data: Partial<SensorRegistryItem>): Promise<SensorRegistryItem> =>
  api.put(`${API_URL.SENSORS_REGISTRY}/${id}`, data).then((r) => r.data);
