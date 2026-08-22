import { UserRole, UserStatus } from './user';

// =========================
// Login
// =========================
export interface LoginForm {
  username: string;
  password: string;
}

// =========================
// Create User
// =========================
export interface UserCreateForm {
  fullname: string;
  username: string;
  password: string;
  confirmPassword: string;
  department: string;
  profile_image?: string;
  role?: UserRole;
  status?: UserStatus;
}

// =========================
// Update User
// =========================
export interface ProfileUpdateForm {
  id: number;
  username: string;
  fullname?: string;
  fname?: string;
  lname?: string;
  department: string;
}

// =========================
// Change Password
// =========================
export interface ProfilePasswordForm {
  password: string;
  newPassword: string;
  confirmPassword: string;
}
