import { createTableStore } from './createTableStore';

export const useUsersTableStore = createTableStore({
  name: 'users-table-storage',
  defaultSortKey: 'registered_date',
  defaultSortDirection: 'desc',
  defaultRowsPerPage: 50,
});
