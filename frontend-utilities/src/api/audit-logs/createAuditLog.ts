import { api, API_URL } from '@/api';

export interface CreateAuditLogParams {
  action: string;
  entity: string;
  entity_id?: string;
  old_data?: any;
  new_data?: any;
}

export async function createAuditLog(payload: CreateAuditLogParams) {
  try {
    const res = await api.post(API_URL.AUDIT_LOGS, payload);
    return res.data;
  } catch (error) {
    console.error('Failed to create audit log:', error);
  }
}
