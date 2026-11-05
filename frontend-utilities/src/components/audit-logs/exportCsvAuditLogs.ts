import { AuditLogItem } from '@_types/audit_log';
import { dateUtils } from '@/components/utils/DatetimeFormat';

function safeString(value: any): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function escapeCsvField(val: string): string {
  if (val.includes('"') || val.includes(',') || val.includes('\n') || val.includes('\r')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return `"${val}"`;
}

export const exportCSVAuditLogs = (logs: AuditLogItem[], filename = 'audit_logs_report') => {
  if (!logs || logs.length === 0) {
    console.warn('❌ No audit logs to export');
    return;
  }

  const headers = [
    'ID',
    'Created At',
    'Username',
    'Action',
    'Entity',
    'Entity ID',
    'IP Address',
    'User Agent',
    'Old Data',
    'New Data',
  ];

  const rows: string[][] = [headers.map(escapeCsvField)];

  logs.forEach((item) => {
    const row = [
      String(item.id),
      item.created_at ? dateUtils.formatCompactDateTime(item.created_at) : '-',
      safeString(item.username),
      safeString(item.action),
      safeString(item.entity),
      safeString(item.entity_id),
      safeString(item.ip_address),
      safeString(item.user_agent),
      safeString(item.old_data),
      safeString(item.new_data),
    ].map((val) => escapeCsvField(String(val)));

    rows.push(row);
  });

  const csvContent = '\uFEFF' + rows.map((r) => r.join(',')).join('\n'); // Add UTF-8 BOM for Thai/Excel compatibility

  const blob = new Blob([csvContent], {
    type: 'text/csv;charset=utf-8;',
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};
