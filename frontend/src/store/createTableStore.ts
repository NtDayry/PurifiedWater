import { create } from 'zustand';
import { persist } from 'zustand/middleware';
export type SortDirection = 'asc' | 'desc';

export interface TableStore {
  searchTerm: string;
  currentPage: number;
  rowsPerPage: number;
  sortKey: string;
  sortDirection: SortDirection;
  setSearchTerm: (v: string) => void;
  setCurrentPage: (v: number) => void;
  setRowsPerPage: (v: number) => void;
  setSort: (key: string, direction: SortDirection) => void;
  reset: () => void;
}

interface CreateTableStoreProps {
  name: string;
  defaultSortKey?: string;
  defaultSortDirection?: SortDirection;
  defaultRowsPerPage?: number;
}

export const createTableStore = ({
  name = 'table-store',
  defaultSortKey = 'created',
  defaultSortDirection = 'desc',
  defaultRowsPerPage = 50,
}: CreateTableStoreProps) =>
  create<TableStore>()(
    persist(
      (set) => ({
        searchTerm: '',
        currentPage: 1,
        rowsPerPage: defaultRowsPerPage,
        sortKey: defaultSortKey,
        sortDirection: defaultSortDirection,
        setSearchTerm: (v) => set({ searchTerm: v, currentPage: 1 }),
        setCurrentPage: (v) => set({ currentPage: v }),
        setRowsPerPage: (v) => set({ rowsPerPage: v, currentPage: 1 }),
        setSort: (key, direction) => set({ sortKey: key, sortDirection: direction }),
        reset: () =>
          set({
            searchTerm: '',
            currentPage: 1,
            rowsPerPage: defaultRowsPerPage,
            sortKey: defaultSortKey,
            sortDirection: defaultSortDirection,
          }),
      }),
      {
        name,
      }
    )
  );
