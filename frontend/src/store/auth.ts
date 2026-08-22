import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { UserRole } from '@_types/user';

interface AuthStore {
  id: number | null;
  fullname: string | null;
  profileImage: string | null;
  username: string | null;
  role: UserRole | null;
  permissions?: string[];
  isAuthenticated: boolean;
  setAuth: (id: number | null, fullname: string, profileImage: string | null, username: string, role: UserRole, permissions?: string[]) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      id: null,
      fullname: null,
      profileImage: null,
      username: null,
      role: null,
      permissions: [],
      isAuthenticated: false,
      setAuth: (id, fullname, profileImage, username, role, permissions = []) =>
        set({ id, fullname, profileImage, username, role, permissions, isAuthenticated: true }),
      logout: () => set({ id: null, fullname: null, profileImage: null, username: null, role: null, permissions: [], isAuthenticated: false }),
    }),
    {
      name: 'ocr-auth',
    }
  )
);
