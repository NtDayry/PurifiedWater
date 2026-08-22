export const PermissionMap = {
  FullAccess: '*',

  // === 1. ระดับเมนูหลัก / หน้าเว็บ (Route Guard & Sidebar Menu) ===
  Pages: {
    Dashboard: 'page:dashboard',
    Reports: 'page:reports',
    UsersManagement: 'page:users_management',
    Settings: 'page:settings',
    AuditLog: 'page:audit_log',
    Device: 'page:device',
    SystemMonitor: 'page:system_monitor',
    AlarmReports: 'page:alarm_reports',
  },

  // === 2. ระดับข้อมูล/การทำงาน (API Protection & UI Element Control) ===
  Actions: {
    AuditLog: {
      ReadAuditLog: 'audit_log:read',
    },

    Data: {
      Export: 'data:export',
    },

    Alarm: {
      Export: 'alarm:export',
      Acknowledge: 'alarm:acknowledge',
    },

    User: {
      View: 'user:read',
      Create: 'user:create',
      EditUser: 'user:edit',
      DeleteUser: 'user:delete',
      EditRole: 'role:edit',
      EditStatus: 'status:edit',
      ResetPassword: 'password:reset',
      ResetAttempts: 'attempts:reset',
    },

    Support: {
      Create: 'support:create',
      Edit: 'support:edit',
      Delete: 'support:delete',
    },

    Role: {
      Read: 'role:read',
    },

    Permission: {
      Read: 'permissions:read',
      Edit: 'permissions:edit',
    },
  },
} as const;

type JoinValues<T> = T extends string ? T : { [K in keyof T]: JoinValues<T[K]> }[keyof T];

export type Permission = JoinValues<typeof PermissionMap>;