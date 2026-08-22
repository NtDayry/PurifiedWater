import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Sidebar {
  isExpanded: boolean;
  setIsExpanded: (isExpanded: boolean) => void;
}

export const useSidebarStore = create<Sidebar>()(
  persist(
    (set) => ({
      isExpanded: true,

      setIsExpanded: (Expanded) => {
        set({ isExpanded: Expanded });
      },
    }),
    {
      name: 'sidebar-storage',
    }
  )
);
