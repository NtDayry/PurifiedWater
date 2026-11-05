export interface AuditLogItem {
  id: number;
  created_at: string;
  user_id: number | null;
  username: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
}

export interface AuditLogListResponse {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  items: AuditLogItem[];
}

export interface GetAuditLogsParams {
  page?: number;
  limit?: number;
  search?: string;
  start_time?: string;
  stop_time?: string;
  action?: string;
  entity?: string;
  username?: string;
  sortKey?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface AuditLogFiltersResponse {
  actions: string[];
  entities: string[];
  usernames: string[];
}
