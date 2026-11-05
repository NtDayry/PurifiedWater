import { createTableStore } from './createTableStore';

export const useAuditLogsTableStore = createTableStore({
  name: 'audit-logs-table-storage',
  defaultSortKey: 'created_at',
  defaultSortDirection: 'desc',
  defaultRowsPerPage: 20,
});
