import { api, API_URL } from '@/api';

export interface SensorConfig {
  id: number;
  device_name: string;
  metric_name: string;
  decode_type: string;
  raw_min: number;
  raw_max: number;
  range_min: number;
  range_max: number;
  unit: string | null;
  decimal_places: number;
  is_active: boolean;
  superseded_by: number | null;
  alert_enabled?: boolean;
  alert_min?: number | null;
  alert_max?: number | null;
  max_range?: number | null;
}


export interface SensorConfigUpdate {
  decode_type: string;
  raw_min: number;
  raw_max: number;
  range_min: number;
  range_max: number;
  unit: string | null;
  decimal_places: number;
}

export const getSensorConfigs = (device_name?: string): Promise<SensorConfig[]> =>
  api
    .get(API_URL.SENSORS_CONFIGS, { params: device_name ? { device_name } : undefined })
    .then((r) => r.data);

export const updateSensorConfig = (id: number, data: SensorConfigUpdate): Promise<SensorConfig> =>
  api.put(`${API_URL.SENSORS_CONFIGS}/${id}`, data).then((r) => r.data);
