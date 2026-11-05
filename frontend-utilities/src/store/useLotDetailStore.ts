import { createTableStore } from './createTableStore';

export const useLotDetailStore = createTableStore({
  name: 'lot-detail-storage',
  defaultSortKey: 'created',
  defaultSortDirection: 'desc',
  defaultRowsPerPage: 20,
});