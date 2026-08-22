const HOSTNAME = import.meta.env.VITE_BASE_URL;
const DEFAULT_API_BASE_URL = '/api';

export const API_URL = {
  BASE_URL: import.meta.env.DEV ? DEFAULT_API_BASE_URL : (HOSTNAME || DEFAULT_API_BASE_URL),
  CONTENT_TYPE_JSON: { 'Content-Type': 'application/json; charset=utf-8' },
  CONTENT_TYPE_FORMDATA: { 'Content-Type': 'multipart/form-data' },

  LOGIN: '/auth/login',
  LOGOUT: '/auth/logout',
  REFRESH: '/auth/refresh',
  REGISTER: '/auth/register',

  USERS: '/users',
  USERS_ME: '/users/me',
  ROLES: '/auth/roles',
  ROLES_PERMISSIONS: '/auth/role-permissions',
  PERMISSIONS: '/auth/permissions',

  DEVICES: '/devices/tokens',
  SENSORS_CONFIGS: '/sensors/configs',
  SENSORS_GROUPS: '/sensors/groups',
  SENSORS_REGISTRY: '/sensors/registry',
  SENSORS_REPORT: '/sensors/report',
  ALERTS_RULES: '/alerts/rules',
  ALERTS_EVENTS: '/alerts/events',
  NOTIFICATION_SETTINGS: '/notifications/settings',

  LOTS: '/dashboard/lots',
  SCANS: '/dashboard/scans',
  TIMINGS: '/dashboard/timing',
  DEFECTS: '/dashboard/defects',
  AUDIT_LOGS: '/audit-logs',

  SUPPORT_TEAM: '/support-team',

  WS: `${import.meta.env.VITE_WS_URL || (window.location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + window.location.host}/ws/sensor-data`,
};

