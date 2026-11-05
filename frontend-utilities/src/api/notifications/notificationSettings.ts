import { api, API_URL } from '@/api';

export interface NotificationSettings {
  id: number;
  notify_line: boolean;
  line_token: string | null;
  notify_email: boolean;
  email_recipients: string | null;
  updated_at: string;
}

export type NotificationSettingsPayload = Pick<NotificationSettings, 'notify_line' | 'line_token' | 'notify_email' | 'email_recipients'>;

export interface NotificationTestPayload {
  channel?: 'line' | 'email' | 'all';
  line_token?: string | null;
  email_recipients?: string | null;
  custom_message?: string | null;
}

export interface NotificationTestResponse {
  success: boolean;
  line_result?: {
    total: number;
    details: Array<{ token?: string; target?: string; status: 'success' | 'failed' | 'warning' | 'error'; message: string; code?: number }>;
  } | null;
  email_result?: {
    total: number;
    details: Array<{ recipient?: string; status: 'success' | 'failed' | 'warning' | 'error'; message: string }>;
  } | null;
  message: string;
}

export const getNotificationSettings = (): Promise<NotificationSettings> =>
  api.get(API_URL.NOTIFICATION_SETTINGS).then((r) => r.data);

export const updateNotificationSettings = (data: NotificationSettingsPayload): Promise<NotificationSettings> =>
  api.put(API_URL.NOTIFICATION_SETTINGS, data).then((r) => r.data);

export const testNotificationSettings = (data: NotificationTestPayload): Promise<NotificationTestResponse> =>
  api.post(`${API_URL.NOTIFICATION_SETTINGS}/test`, data, { timeout: 30000 }).then((r) => r.data);
