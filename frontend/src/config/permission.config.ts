import { PermissionMap as PM } from '@_types/permission.map';

// Static shape of PermissionConfig keys reference PermissionMap values (strings).
// We also allow runtime population/validation from the server via setServerPermissions().
export const PermissionConfig = {
  // === 1. ส่วนควบคุมการเข้าถึงเส้นทาง (Route Guard Config) ===
  // เช็กแค่ว่า User มีสิทธิ์ "เข้าหน้าเว็บ" นี้หรือไม่ในระดับกรอบใหญ่
  Routes: {
    dashboard: [PM.Pages.Dashboard],
    reports: [PM.Pages.Reports],
    audit_logs: [PM.Pages.AuditLog],
    users_management: [PM.Pages.UsersManagement],
    settings: [PM.Pages.Settings],
    device: [PM.Pages.Device],
    system_monitor: [PM.Pages.SystemMonitor],
    alarm_reports: [PM.Pages.AlarmReports],
  },

  // === 2. ส่วนควบคุม Elements / ข้อมูล / ปุ่มกด ภายในแต่ละโมดูลหน้าจอ ===
  Modules: {
    // หน้าแดชบอร์ดภาพรวม
    Dashboard: {
      view: [PM.Pages.Dashboard],
    },

    // หน้ารายงานข้อมูลระบบน้ำ
    Reports: {
      view: [PM.Pages.Reports],
      actions: {
        exportData: PM.Actions.Data.Export,
      },
    },

    AuditLog: {
      view: [PM.Pages.AuditLog],
      actions: {
        readAuditLog: PM.Actions.AuditLog.ReadAuditLog,
      },
    },

    // หน้า Alarm Reports
    AlarmReports: {
      view: [PM.Pages.AlarmReports],
      actions: {
        exportData: PM.Actions.Alarm.Export,
        acknowledge: PM.Actions.Alarm.Acknowledge,
      },
    },

    // หน้าจัดการผู้ใช้งาน
    UsersManagement: {
      view: [PM.Actions.User.View],
      actions: {
        create: PM.Actions.User.Create,
        editUser: PM.Actions.User.EditUser,
        deleteUser: PM.Actions.User.DeleteUser,
        editRole: PM.Actions.User.EditRole,
        editStatus: PM.Actions.User.EditStatus,
        resetPassword: PM.Actions.User.ResetPassword,
        resetAttempts: PM.Actions.User.ResetAttempts,
      },
    },

    // หน้าจัดการ token อุปกรณ์
    DevicesManagement: {
      view: [PM.Pages.Device],
    },
  },
} as const;

// Runtime server-backed permission keys (if any). Populated by App init.
let _serverPermissionKeys: Set<string> | null = null;

export function setServerPermissions(keys: string[]) {
  _serverPermissionKeys = new Set(keys || []);
}

export function hasServerPermissionKey(key: string) {
  if (!_serverPermissionKeys) return null; // unknown
  return _serverPermissionKeys.has(key);
}
