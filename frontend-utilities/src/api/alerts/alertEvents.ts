import { api, API_URL } from '@/api';

export interface AlertEvent {
  id: number;
  alert_rule_id: number;
  device_name: string;
  metric_name: string;
  started_at: string;
  triggered_at: string | null;
  ended_at: string | null;
  trigger_value: number | null;
  duration_seconds: number | null;
  severity: 'info' | 'warning' | 'critical' | string;
  acknowledged: boolean;
  acknowledged_by: number | null;
  acknowledged_at: string | null;
  created_at: string;
}

export interface AlertEventsPaginatedResponse {
  items: AlertEvent[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface GetAlertEventsParams {
  device_name?: string;
  metric_name?: string;
  severity?: string;
  acknowledged?: boolean;
  active_only?: boolean;
  start_time?: string;
  stop_time?: string;
  page?: number;
  limit?: number;
}

export const getAlertEvents = (params?: GetAlertEventsParams): Promise<AlertEventsPaginatedResponse> =>
  api
    .get(API_URL.ALERTS_EVENTS, {
      params: {
        ...(params?.device_name ? { device_name: params.device_name } : {}),
        ...(params?.metric_name ? { metric_name: params.metric_name } : {}),
        ...(params?.severity ? { severity: params.severity } : {}),
        ...(params?.acknowledged !== undefined ? { acknowledged: params.acknowledged } : {}),
        ...(params?.active_only !== undefined ? { active_only: params.active_only } : {}),
        ...(params?.start_time ? { start_time: params.start_time } : {}),
        ...(params?.stop_time ? { stop_time: params.stop_time } : {}),
        ...(params?.page !== undefined ? { page: params.page } : {}),
        ...(params?.limit !== undefined ? { limit: params.limit } : {}),
      },
    })
    .then((r) => r.data);

export const acknowledgeAlertEvent = (eventId: number): Promise<AlertEvent> =>
  api.put(`${API_URL.ALERTS_EVENTS}/${eventId}/acknowledge`).then((r) => r.data);
