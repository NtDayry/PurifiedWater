import { api, API_URL } from '@/api';

export interface AlertRule {
  id?: number;
  device_name: string;
  metric_name: string;
  threshold_min: number | null;
  threshold_max: number | null;
  sustained_seconds: number;
  severity: 'info' | 'warning' | 'critical' | string;
  notify_web: boolean;
  notify_line: boolean;
  notify_email: boolean;
  save_alarm: boolean;
  line_token?: string | null;
  email_recipients?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export type AlertRulePayload = Omit<AlertRule, 'id' | 'created_at' | 'updated_at'>;

export const getAlertRules = (device_name?: string, metric_name?: string): Promise<AlertRule[]> =>
  api
    .get(API_URL.ALERTS_RULES, {
      params: {
        ...(device_name ? { device_name } : {}),
        ...(metric_name ? { metric_name } : {}),
      },
    })
    .then((r) => r.data);

export const upsertAlertRule = (data: AlertRulePayload): Promise<AlertRule> =>
  api.post(`${API_URL.ALERTS_RULES}/upsert`, data).then((r) => r.data);

export const deleteAlertRule = (id: number): Promise<void> =>
  api.delete(`${API_URL.ALERTS_RULES}/${id}`).then((r) => r.data);
