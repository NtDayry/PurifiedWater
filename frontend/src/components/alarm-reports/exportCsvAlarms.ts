import { AlertEvent } from '@/api';
import { dateUtils } from '@/components/utils/DatetimeFormat';

export const exportCSVAlarms = (events: AlertEvent[], filename = 'alarm_report') => {
  if (!events || events.length === 0) {
    console.warn('❌ No alarm events to export');
    return;
  }

  const headers = [
    'Event ID',
    'Device Name',
    'Metric Name',
    'Severity',
    'Trigger Value',
    'Started At',
    'Triggered At',
    'Ended At',
    'Duration (Seconds)',
    'Acknowledged',
    'Acknowledged By',
    'Acknowledged At',
  ];

  const rows: string[][] = [headers];

  events.forEach((item) => {
    const row = [
      String(item.id),
      `"${(item.device_name || '').replace(/"/g, '""')}"`,
      `"${(item.metric_name || '').replace(/"/g, '""')}"`,
      (item.severity || '').toUpperCase(),
      item.trigger_value !== null && item.trigger_value !== undefined ? String(item.trigger_value) : '-',
      item.started_at ? dateUtils.formatCompactDateTime(item.started_at) : '-',
      item.triggered_at ? dateUtils.formatCompactDateTime(item.triggered_at) : '-',
      item.ended_at ? dateUtils.formatCompactDateTime(item.ended_at) : 'Active',
      item.duration_seconds !== null && item.duration_seconds !== undefined ? String(item.duration_seconds) : '-',
      item.acknowledged ? 'YES' : 'NO',
      item.acknowledged_by ? String(item.acknowledged_by) : '-',
      item.acknowledged_at ? dateUtils.formatCompactDateTime(item.acknowledged_at) : '-',
    ];
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
