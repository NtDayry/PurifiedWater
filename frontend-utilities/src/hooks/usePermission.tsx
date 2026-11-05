import { Navigate } from 'react-router';
import { URL } from '@/api';
import { useAuthStore } from '@/store/auth';
import { hasServerPermissionKey } from '@/config/permission.config';
import { UserRole } from '@_types/user';

interface PermissionGuardProps {
  children: React.ReactNode;
  permissionKeys: readonly string[];
}

/**
 * Pure function to evaluate permissions for a given role and permissions list.
 */
export function checkPermission(
  role: UserRole | string | null | undefined,
  userPermissions: string[] = [],
  permissionKeys?: readonly string[] | string | undefined
): boolean {
  const keys = Array.isArray(permissionKeys)
    ? permissionKeys
    : permissionKeys
    ? [permissionKeys]
    : [];

  // 1. ตรวจสอบเงื่อนไขพื้นฐาน (ไม่มีคีย์ที่ต้องการ = อนุญาตให้เข้าถึง)
  if (!keys || keys.length === 0) return true;

  // 2. Super Admin หรือ Wildcard = ได้รับสิทธิ์ทั้งหมดเสมอ
  if (role === 'super admin' || userPermissions.includes('*')) return true;

  // 3. กรองตรวจสอบกับ Server Registry
  const validPermissionKeys = keys.filter((k) => {
    const known = hasServerPermissionKey(k);
    if (known === false) {
      return false;
    }
    return true;
  });

  if (validPermissionKeys.length === 0) return false;

  // 4. เช็กสิทธิ์จริงของ User จาก userPermissions array
  return validPermissionKeys.some((k) => userPermissions.includes(k));
}

export function useHasPermission(permissionKeys: readonly string[] = []) {
  const permissions = useAuthStore((s) => s.permissions) || [];
  const role = useAuthStore((s) => s.role);

  return checkPermission(role, permissions, permissionKeys);
}

export const usePermissions = useHasPermission;

export function PermissionGuard({ children, permissionKeys }: PermissionGuardProps) {
  const has = useHasPermission(permissionKeys);
  if (has) return <>{children}</>;
  return <Navigate to={URL.HOME} replace />;
}
