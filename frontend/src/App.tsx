import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router';
import { useEffect } from 'react';
import { api, API_URL } from '@/api';
import Login from './pages/AuthPages/Login';
import Register from './pages/AuthPages/Register';
import Logout from './pages/AuthPages/Logout';
import NotFound from './pages/OtherPage/NotFound';
import UserProfiles from './pages/UserProfiles';
import AuditLogsPage from './pages/AuditLogs/AuditLogs';
import Home from './pages/Dashboard/Home';
import SystemMonitorPage from './pages/SystemMonitorPage';
import SettingsPage from './pages/SettingsPage/SettingsPage';
import SettingsDevicesPage from './pages/SettingsDevices/SettingsDevicesPage';
import UsersManagementPage from './pages/UsersManagement/UsersManagement';
import Support from './pages/Support';
import AppLayout from './layout/AppLayout';
import Reports from './pages/Reports/Reports';
import AlarmReportsPage from './pages/AlarmReports/AlarmReportsPage';

import { ScrollToTop } from './components/common/ScrollToTop';
import { URL } from './api';
import { useAuthStore } from '@/store/auth';

import { PermissionConfig, setServerPermissions } from './config/permission.config';
import { PermissionGuard } from '@/hooks/usePermission';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to={URL.LOGIN} replace />;
}

export default function App() {
  // Silent refresh on app mount: try to restore session from refresh token cookie
  useEffect(() => {
    const authDataString = localStorage.getItem('ocr-auth');
    if (!authDataString) return; // ไม่มีข้อมูล auth เลย ให้จบการทำงาน

    try {
      const authData = JSON.parse(authDataString);
      if (!authData?.state?.id) return;
    } catch (error) {
      console.error('Failed to parse ocr-auth from localStorage', error);
      return;
    }

    let mounted = true;

    const refresh = async () => {
      try {
        const res = await api.post(API_URL.REFRESH, {}, { _skipAuthRedirect: true });

        // FIX: Change profile_image to profileImage to match your state
        const { id, fullname, profile_image, username, role, permissions } = res.data || {};
        console.log('Refresh response:', res.data); // Debug log

        if (mounted && username && role) {
          // Pass the correctly mapped variable here
          useAuthStore.getState().setAuth(id, fullname, profile_image, username, role, permissions || []);
        }
      } catch {
        useAuthStore.getState().logout();
      }

      // After refresh attempt, load server permission registry once (do not race with refresh)
      try {
        const permRes = await api.get(API_URL.PERMISSIONS, { _skipAuthRedirect: true });
        const keys = (permRes.data?.permissions || []).map((permission: { permission_key?: string } | string) =>
          typeof permission === 'string' ? permission : permission.permission_key || ''
        );
        if (mounted) setServerPermissions(keys.filter(Boolean));
      } catch (err) {
        console.warn('Failed to load server permission keys:', err);
        if (mounted) setServerPermissions([]);
      }
    };

    refresh();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <>
      <Router>
        <ScrollToTop />
        <Routes>
          {/* Dashboard Layout */}
          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route
              path={URL.HOME}
              element={
                <PermissionGuard permissionKeys={PermissionConfig.Routes.dashboard}>
                  <Home />
                </PermissionGuard>
              }
            />
            <Route
              path={URL.HMI}
              element={
                <PermissionGuard permissionKeys={PermissionConfig.Routes.dashboard}>
                  <Home />
                </PermissionGuard>
              }
            />
            <Route
              path="/reports"
              element={
                <PermissionGuard permissionKeys={PermissionConfig.Routes.reports}>
                  <Reports />
                </PermissionGuard>
              }
            />
            <Route path={URL.ALARM_REPORTS} element={
              <PermissionGuard permissionKeys={PermissionConfig.Routes.alarm_reports}>
                <AlarmReportsPage />
              </PermissionGuard>
            } />
            <Route
              path="/settings-devices"
              element={
                <PermissionGuard permissionKeys={PermissionConfig.Routes.device}>
                  <SettingsDevicesPage />
                </PermissionGuard>
              }
            />

            <Route path={URL.SYSTEM_MONITOR} element={
              <PermissionGuard permissionKeys={PermissionConfig.Routes.system_monitor}>
                <SystemMonitorPage />
              </PermissionGuard>
            } />
            <Route
              path={URL.SETTINGS}
              element={
                <PermissionGuard permissionKeys={PermissionConfig.Routes.settings}>
                  <SettingsPage />
                </PermissionGuard>
              }
            />
            {/* Others Page */}
            <Route
              path={URL.AUDIT_LOGS}
              element={
                <PermissionGuard permissionKeys={PermissionConfig.Routes.audit_logs}>
                  <AuditLogsPage />
                </PermissionGuard>
              }
            />

            {/* Users management */}
            <Route
              path={URL.USERS_MANAGEMENT}
              element={
                <PermissionGuard permissionKeys={PermissionConfig.Routes.users_management}>
                  <UsersManagementPage />
                </PermissionGuard>
              }
            />

            <Route path={URL.USER_PROFILE} element={<UserProfiles />} />

            <Route path={URL.LOGOUT} element={<Logout />} />
          </Route>

          {/* Auth Layout */}
          <Route path={URL.LOGIN} element={<Login />} />
          <Route path={URL.REGISTER} element={<Register />} />

          {/* Fallback Route */}
          <Route path={URL.SUPPORT} element={<Support />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
    </>
  );
}
