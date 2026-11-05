import { UserRole } from './user';

export interface LoginResponse {
  id: number;
  fullname: string;
  profile_image: string | null;
  username: string;
  role: UserRole;
  permissions?: string[];
}

export interface AuthUser {
  username: string;

  role: UserRole;

  isAuthenticated: boolean;
  permissions?: string[];
}

export interface PermissionItem {
  permission_key: string;
  description_th: string;
  description_en: string;
}