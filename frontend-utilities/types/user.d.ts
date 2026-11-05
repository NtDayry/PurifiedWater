export type UserRole = 'admin' | 'operator' | 'viewer' | 'super admin';
export type UserStatus = 'active' | 'pending' | 'blocked';

export interface User {
  id: number;
  registered_date: string;
  fullname: string;
  username: string;
  department: string;
  profile_image: string | null;
  role: UserRole;
  permissions: string[];
  status: UserStatus;
  password_changed_at: string | null;
  sign_in_attempts: number;
  last_sign_in_attempt: string | null;
  token_version: string;
  updated_at: string;
}
