import { TableStore } from '@/store/createTableStore';

export const useTableState = (store: any) => {
  const searchTerm = store((s: TableStore) => s.searchTerm);
  const setSearchTerm = store((s: TableStore) => s.setSearchTerm);
  const currentPage = store((s: TableStore) => s.currentPage);
  const setCurrentPage = store((s: TableStore) => s.setCurrentPage);
  const rowsPerPage = store((s: TableStore) => s.rowsPerPage);
  const setRowsPerPage = store((s: TableStore) => s.setRowsPerPage);
  const sortKey = store((s: TableStore) => s.sortKey);
  const sortDirection = store((s: TableStore) => s.sortDirection);
  const setSort = store((s: TableStore) => s.setSort);
  const reset = store((s: TableStore) => s.reset);

  return {
    searchTerm,
    setSearchTerm,
    currentPage,
    setCurrentPage,
    rowsPerPage,
    setRowsPerPage,
    sortKey,
    sortDirection,
    setSort,
    reset,
  };
};
