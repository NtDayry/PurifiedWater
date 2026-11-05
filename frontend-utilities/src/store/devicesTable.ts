import { createTableStore } from './createTableStore';

export const useDevicesTableStore = createTableStore({
  name: 'devices-table-storage',
  defaultSortKey: 'created_at',
  defaultSortDirection: 'desc',
  defaultRowsPerPage: 20,
});
