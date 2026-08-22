import { api, API_URL } from '@/api';
import { AuditLogListResponse, GetAuditLogsParams, AuditLogFiltersResponse } from '@_types/audit_log';

export async function getAuditLogs(params?: GetAuditLogsParams) {
  const res = await api.get<AuditLogListResponse>(API_URL.AUDIT_LOGS, {
    params: {
      page: params?.page ?? 1,
      limit: params?.limit ?? 20,
      search: params?.search,
      start_time: params?.start_time,
      stop_time: params?.stop_time,
      action: params?.action !== 'all' ? params?.action : undefined,
      entity: params?.entity !== 'all' ? params?.entity : undefined,
      username: params?.username !== 'all' ? params?.username : undefined,
      sort_key: params?.sortKey,
      sort_dir: params?.sortDirection,
    },
  });

  return res.data;
}

export async function getAuditLogFilters() {
  const res = await api.get<AuditLogFiltersResponse>(`${API_URL.AUDIT_LOGS}/filters`);
  return res.data;
}
