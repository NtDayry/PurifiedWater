import { createTableStore } from './createTableStore';

export const useInspectionTableStore = createTableStore({
  name: 'inspection-table-storage',
  defaultSortKey: 'created',
  defaultSortDirection: 'desc',
  defaultRowsPerPage: 20,
});