import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '@/components/ui/button/Button';
import { api, API_URL, axios } from '@/api';
import { useAuthStore } from '@/store/auth';
import useSwalAlert from '@/hooks/useSwalAlert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/radixUI/select';
import { PermissionItem } from '@_types/auth';

type ApiListResponse = { roles?: string[]; permissions?: PermissionItem[] };
type RolePermissionsResponse = { role?: string; permissions?: string[] };

const normalizePermissions = (permissions: string[]) => Array.from(new Set(permissions.map((permission) => permission.trim()).filter(Boolean)));
const sortPermissions = (permissions: string[]) => [...permissions].sort((a, b) => a.localeCompare(b));

const samePermissionSet = (left: string[], right: string[]) => {
  const a = sortPermissions(normalizePermissions(left));
  const b = sortPermissions(normalizePermissions(right));
  return a.length === b.length && a.every((value, index) => value === b[index]);
};

const toErrorMessage = (error: unknown, fallback: string, messages?: { forbiddenMessage?: string; notFoundMessage?: string }) => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { detail?: string | string[]; message?: string } | undefined;
    const detail = data?.detail;
    if (Array.isArray(detail)) return detail.join(', ');
    if (typeof detail === 'string' && detail.trim()) return detail;
    if (typeof data?.message === 'string' && data.message.trim()) return data.message;
    if (error.response?.status === 403) return messages?.forbiddenMessage ?? 'คุณไม่มีสิทธิ์จัดการ permissions';
    if (error.response?.status === 404) return messages?.notFoundMessage ?? 'ไม่พบข้อมูลที่ร้องขอ';
  }

  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
};

export default function PermissionsSettingsPanel() {
  const { t, i18n } = useTranslation();
  const SwalAlert = useSwalAlert();

  const panelKey = 'page.settings.panel';
  const authRole = useAuthStore((state) => state.role);
  const authPermissions = useAuthStore((state) => state.permissions) || [];
  const currentLanguage = (i18n.resolvedLanguage || i18n.language || 'en').toLowerCase();
  const isThai = currentLanguage.startsWith('th');

  const [roles, setRoles] = useState<string[]>([]);
  const [allPermissions, setAllPermissions] = useState<string[]>([]);
  const [permissionMeta, setPermissionMeta] = useState<Record<string, PermissionItem>>({});
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [originalPermissions, setOriginalPermissions] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isRoleLoading, setIsRoleLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshingCache, setIsRefreshingCache] = useState(false);
  const [isPreloadingCache, setIsPreloadingCache] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const canManagePermissions = authRole === 'super admin' || authPermissions.includes('*') || authPermissions.includes('permissions:edit');

  const visiblePermissions = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = sortPermissions(allPermissions.filter((permission) => permission !== '*'));

    if (!query) return list;

    return list.filter((permission) => {
      const meta = permissionMeta[permission];
      const haystacks = [permission, meta?.description_th ?? '', meta?.description_en ?? ''].map((value) => value.toLowerCase());
      return haystacks.some((value) => value.includes(query));
    });
  }, [allPermissions, permissionMeta, search]);

  const isFullAccess = selectedPermissions.includes('*');
  const isDirty = !samePermissionSet(selectedPermissions, originalPermissions);
  const selectedCount = isFullAccess ? '∞' : selectedPermissions.length;
  const totalCount = allPermissions.filter((permission) => permission !== '*').length;

  const loadRolePermissions = async (roleName: string) => {
    if (!roleName) return;

    setIsRoleLoading(true);
    setErrorMessage('');
    setStatusMessage('');

    try {
      const response = await api.get<RolePermissionsResponse>(`${API_URL.ROLES_PERMISSIONS}/${encodeURIComponent(roleName)}`);
      const permissions = normalizePermissions(response.data?.permissions || []);
      setSelectedPermissions(permissions);
      setOriginalPermissions(permissions);
      setStatusMessage(t('page.settings.panel.messages.loaded_role', { role: roleName }));
    } catch (error) {
      setErrorMessage(
        toErrorMessage(error, t('page.settings.panel.errors.load_permissions'), {
          forbiddenMessage: t('page.settings.panel.errors.forbidden'),
          notFoundMessage: t('page.settings.panel.errors.role_not_found'),
        })
      );
    } finally {
      setIsRoleLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      setIsBootstrapping(true);
      setErrorMessage('');

      try {
        const [rolesResponse, permissionsResponse] = await Promise.all([
          api.get<ApiListResponse>(API_URL.ROLES),
          api.get<ApiListResponse>(API_URL.PERMISSIONS),
        ]);

        const fetchedRoles = normalizePermissions(rolesResponse.data?.roles || []);
        const fetchedPermissionItems = permissionsResponse.data?.permissions || [];
        const fetchedPermissions = normalizePermissions(fetchedPermissionItems.map((item) => item.permission_key));
        const fetchedPermissionMeta = Object.fromEntries(
          fetchedPermissionItems
            .filter((item) => item.permission_key)
            .map((item) => [item.permission_key, item])
        ) as Record<string, PermissionItem>;

        if (!active) return;

        setRoles(fetchedRoles);
        setAllPermissions(fetchedPermissions);
        setPermissionMeta(fetchedPermissionMeta);

        const initialRole = selectedRole || fetchedRoles[0] || '';
        if (initialRole) {
          setSelectedRole(initialRole);
          await loadRolePermissions(initialRole);
        }
      } catch (error) {
        if (active) {
          setErrorMessage(
            toErrorMessage(error, t('page.settings.panel.errors.load_bootstrap'), {
              forbiddenMessage: t('page.settings.panel.errors.forbidden'),
              notFoundMessage: t('page.settings.panel.errors.role_not_found'),
            })
          );
        }
      } finally {
        if (active) {
          setIsBootstrapping(false);
        }
      }
    };

    void bootstrap();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRoleChange = async (nextRole: string) => {
    setSelectedRole(nextRole);
    await loadRolePermissions(nextRole);
  };

  const togglePermission = (permission: string) => {
    if (permission === '*') {
      setSelectedPermissions(['*']);
      return;
    }

    setSelectedPermissions((current) => {
      const withoutWildcard = current.filter((value) => value !== '*');
      if (withoutWildcard.includes(permission)) {
        return withoutWildcard.filter((value) => value !== permission);
      }
      return normalizePermissions([...withoutWildcard, permission]);
    });
  };

  const handleSelectAll = () => {
    setSelectedPermissions(normalizePermissions(allPermissions.filter((permission) => permission !== '*')));
  };

  const handleGrantAll = () => {
    setSelectedPermissions(['*']);
  };

  const handleClear = () => {
    setSelectedPermissions([]);
  };

  const handleReload = async () => {
    await loadRolePermissions(selectedRole);
  };

  const handleSave = async () => {
    if (!selectedRole) return;

    setIsSaving(true);
    setErrorMessage('');
    setStatusMessage('');

    try {
      const payloadPermissions = isFullAccess ? ['*'] : normalizePermissions(selectedPermissions);
      const response = await api.put<RolePermissionsResponse>(`${API_URL.ROLES_PERMISSIONS}/${encodeURIComponent(selectedRole)}`, {
        permissions: payloadPermissions,
      });

      const savedPermissions = normalizePermissions(response.data?.permissions || payloadPermissions);
      setSelectedPermissions(savedPermissions);
      setOriginalPermissions(savedPermissions);
      setStatusMessage(t('page.settings.panel.messages.saved_role', { role: selectedRole }));
      SwalAlert.Toast();
    } catch (error) {
      setErrorMessage(
        toErrorMessage(error, t('page.settings.panel.errors.save_permissions'), { forbiddenMessage: t('page.settings.panel.errors.forbidden') })
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleInvalidateCache = async () => {
    if (!selectedRole) return;

    setIsRefreshingCache(true);
    setErrorMessage('');
    setStatusMessage('');

    try {
      await api.post(`${API_URL.ROLES_PERMISSIONS}/${encodeURIComponent(selectedRole)}/invalidate`);
      setStatusMessage(t('page.settings.panel.messages.invalidated_role', { role: selectedRole }));
    } catch (error) {
      setErrorMessage(
        toErrorMessage(error, t('page.settings.panel.errors.invalidate_cache'), { forbiddenMessage: t('page.settings.panel.errors.forbidden') })
      );
    } finally {
      setIsRefreshingCache(false);
    }
  };

  const handlePreloadCache = async () => {
    setIsPreloadingCache(true);
    setErrorMessage('');
    setStatusMessage('');

    try {
      const response = await api.post<{ roles_loaded?: number }>(`${API_URL.ROLES_PERMISSIONS}/preload`);
      const loadedCount = response.data?.roles_loaded ?? roles.length;
      setStatusMessage(t('page.settings.panel.messages.preloaded_cache', { count: loadedCount }));
    } catch (error) {
      setErrorMessage(
        toErrorMessage(error, t('page.settings.panel.errors.preload_cache'), { forbiddenMessage: t('page.settings.panel.errors.forbidden') })
      );
    } finally {
      setIsPreloadingCache(false);
    }
  };

  const pendingState = isBootstrapping || isRoleLoading;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-lg dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
          <div className="mb-5">
            <h3 className="text-xl font-semibold text-gray-800 dark:text-white/90">{t(`${panelKey}.select_role.title`)}</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t(`${panelKey}.select_role.subtitle`)}</p>
          </div>

          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">{t(`${panelKey}.select_role.role_label`)}</label>
          <Select value={selectedRole} onValueChange={handleRoleChange}>
            <SelectTrigger className="text-gray-700 dark:text-gray-300">
              <SelectValue placeholder="เรียงตาม" />
            </SelectTrigger>
            <SelectContent>
              {roles.map((role) => (
                <SelectItem key={role} value={role}>
                  {role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/40">
              <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{t(`${panelKey}.select_role.roles_count`)}</p>
              <p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">{roles.length}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/40">
              <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{t(`${panelKey}.select_role.permissions_count`)}</p>
              <p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">{allPermissions.length}</p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400">
            <p>
              {t(`${panelKey}.select_role.current_user`)}: {authRole ?? '-'}
            </p>
            <p className="mt-1">
              {t(`${panelKey}.select_role.manage_status`)}:{' '}
              {canManagePermissions ? t(`${panelKey}.select_role.edit`) : t(`${panelKey}.select_role.read_only`)}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="primary-soft-outline" onClick={() => void handleReload()} disabled={!selectedRole || pendingState}>
              {t(`${panelKey}.select_role.reload`)}
            </Button>
            <Button
              size="sm"
              variant="warning-soft-outline"
              onClick={() => void handleInvalidateCache()}
              disabled={!selectedRole || isRefreshingCache || pendingState || !canManagePermissions}
            >
              {isRefreshingCache ? t(`${panelKey}.select_role.invalidate_wait`) : t(`${panelKey}.select_role.invalidate_cache`)}
            </Button>
            <Button size="sm" variant="info-soft-outline" onClick={() => void handlePreloadCache()} disabled={isPreloadingCache || pendingState || !canManagePermissions}>
              {isPreloadingCache ? t(`${panelKey}.select_role.preload_wait`) : t(`${panelKey}.select_role.preload_cache`)}
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-lg dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold text-gray-800 dark:text-white/90">
                {t(`${panelKey}.permissions.title`, { role: selectedRole || '-' })}
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t(`${panelKey}.permissions.sample_api`)}{' '}
                <span className="font-medium text-gray-700 dark:text-gray-300">/api/auth/role-permissions/admin</span>
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="success-soft-outline"
                onClick={() => void handleSave()}
                disabled={!selectedRole || isSaving || !isDirty || !canManagePermissions}
              >
                {isSaving ? t(`${panelKey}.permissions.save_wait`) : t(`${panelKey}.permissions.save`)}
              </Button>
              <Button
                size="sm"
                variant="primary-soft-outline"
                onClick={handleSelectAll}
                disabled={!selectedRole || isFullAccess || !canManagePermissions}
              >
                {t(`${panelKey}.permissions.select_all`)}
              </Button>
              <Button
                size="sm"
                variant="error-soft-outline"
                onClick={handleClear}
                disabled={!selectedRole || !selectedPermissions.length || !canManagePermissions}
              >
                {t(`${panelKey}.permissions.clear_all`)}
              </Button>
              <Button
                size="sm"
                variant="warning-soft-outline"
                onClick={handleGrantAll}
                disabled={!selectedRole || isFullAccess || !canManagePermissions}
              >
                {t(`${panelKey}.permissions.full_access_button`)}
              </Button>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-4">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/40">
              <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{t(`${panelKey}.permissions.selected`)}</p>
              <p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">{selectedCount}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/40">
              <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{t(`${panelKey}.permissions.available`)}</p>
              <p className="mt-2 text-2xl font-semibold text-gray-800 dark:text-white/90">{totalCount}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/40 md:col-span-2">
              <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{t(`${panelKey}.permissions.status`)}</p>
              <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
                {pendingState
                  ? t(`${panelKey}.permissions.loading`)
                  : isDirty
                    ? t(`${panelKey}.permissions.dirty`)
                    : t(`${panelKey}.permissions.synced`)}
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/40">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t(`${panelKey}.permissions.search_title`)}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t(`${panelKey}.permissions.search_subtitle`)}</p>
              </div>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t(`${panelKey}.permissions.search_placeholder`)}
                className="h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-950 dark:text-white/90 md:max-w-md"
                disabled={!selectedRole}
              />
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950/60">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-base font-semibold text-gray-800 dark:text-white/90">{t(`${panelKey}.permissions.list_title`)}</h4>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t(`${panelKey}.permissions.list_subtitle`)}</p>
              </div>
              <label className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={isFullAccess}
                  onChange={() => togglePermission('*')}
                  disabled={!selectedRole || !canManagePermissions}
                />
                {t(`${panelKey}.permissions.full_access`)}
              </label>
            </div>

            {visiblePermissions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                {t(`${panelKey}.permissions.empty_search`)}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visiblePermissions.map((permission) => {
                  const checked = isFullAccess || selectedPermissions.includes(permission);

                  return (
                    <label
                      key={permission}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${checked ? 'border-brand-300 bg-brand-50 dark:border-brand-700 dark:bg-brand-950/20' : 'border-gray-200 bg-gray-50 hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900/40 dark:hover:border-gray-700'}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePermission(permission)}
                        disabled={!selectedRole || !canManagePermissions || isFullAccess}
                        className="mt-1"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium text-gray-800 dark:text-white/90">
                          {isThai
                            ? permissionMeta[permission]?.description_th || permissionMeta[permission]?.description_en || permission
                            : permissionMeta[permission]?.description_en || permissionMeta[permission]?.description_th || permission}
                        </p>
                        <p className="mt-1 break-all text-xs text-gray-500 dark:text-gray-400">{permission}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {statusMessage && (
            <div className="mt-4 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-sm text-success-700 dark:border-success-700/40 dark:bg-success-950/20 dark:text-success-300">
              {statusMessage}
            </div>
          )}

          {errorMessage && (
            <div className="mt-4 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-700/40 dark:bg-error-950/20 dark:text-error-300">
              {errorMessage}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
