import * as ExcelJS from 'exceljs';
import { AuditLogItem } from '@_types/audit_log';
import { dateUtils } from '@/components/utils/DatetimeFormat';

function formatDataValue(val: any): string {
  if (val === null || val === undefined) return '-';
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val, null, 2);
    } catch {
      return String(val);
    }
  }
  return String(val);
}

export const exportExcelAuditLogs = async (
  logs: AuditLogItem[],
  filename = 'audit_logs_report',
  timeRangeInfo?: { start?: string; stop?: string }
) => {
  if (!logs || logs.length === 0) {
    console.warn('❌ No audit logs to export');
    return;
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PurifieldWater System';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Audit Logs', {
    pageSetup: { paperSize: 9, orientation: 'landscape' },
    views: [{ showGridLines: true }],
  });

  const total = logs.length;
  const uniqueUsers = new Set(logs.map((l) => l.username).filter(Boolean)).size;
  const createCount = logs.filter((l) => (l.action || '').toLowerCase().includes('create')).length;
  const updateCount = logs.filter(
    (l) => (l.action || '').toLowerCase().includes('update') || (l.action || '').toLowerCase().includes('edit')
  ).length;
  const deleteCount = logs.filter(
    (l) => (l.action || '').toLowerCase().includes('delete') || (l.action || '').toLowerCase().includes('remove')
  ).length;
  const authCount = logs.filter(
    (l) => (l.action || '').toLowerCase().includes('login') || (l.action || '').toLowerCase().includes('logout')
  ).length;

  // 1. Title Banner (Row 1)
  worksheet.mergeCells('A1:J1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'Purified Water System — Audit Logs Report';
  titleCell.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 38;

  // 2. Meta Info (Row 2)
  worksheet.mergeCells('A2:J2');
  const metaCell = worksheet.getCell('A2');
  const rangeText = timeRangeInfo?.start && timeRangeInfo?.stop
    ? ` | Time Range: ${dateUtils.formatCompactDateTime(timeRangeInfo.start)} – ${dateUtils.formatCompactDateTime(timeRangeInfo.stop)}`
    : '';
  metaCell.value = `Exported At: ${dateUtils.formatCompactDateTime(new Date().toISOString())} | Total Records: ${total} | Unique Users: ${uniqueUsers}${rangeText}`;
  metaCell.font = { name: 'Segoe UI', size: 10, italic: true, color: { argb: 'FF475569' } };
  metaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  metaCell.alignment = { vertical: 'middle', horizontal: 'left' };
  worksheet.getRow(2).height = 22;

  // Row 3: Blank spacing
  worksheet.getRow(3).height = 10;

  // 3. KPI Summary Row (Row 4)
  const summaryRow = worksheet.getRow(4);
  summaryRow.height = 26;

  const summaryData = [
    { col: 'A', label: 'Total Logs', val: total, color: 'FF2563EB' },
    { col: 'C', label: 'Creates', val: createCount, color: 'FF10B981' },
    { col: 'E', label: 'Updates', val: updateCount, color: 'FF0284C7' },
    { col: 'G', label: 'Deletes', val: deleteCount, color: 'FFEF4444' },
    { col: 'I', label: 'Auth Events', val: authCount, color: 'FF8B5CF6' },
  ];

  summaryData.forEach((s) => {
    const cell = worksheet.getCell(`${s.col}4`);
    cell.value = `${s.label}: ${s.val}`;
    cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: s.color } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  // Row 5: Spacing
  worksheet.getRow(5).height = 10;

  // 4. Column Headers (Row 6)
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

  const headerRowNumber = 6;
  const headerRow = worksheet.getRow(headerRowNumber);
  headerRow.height = 28;

  headers.forEach((h, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    cell.alignment = { vertical: 'middle', horizontal: idx === 0 || idx === 3 ? 'center' : 'left' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'medium', color: { argb: 'FF475569' } },
      left: { style: 'thin', color: { argb: 'FF94A3B8' } },
      right: { style: 'thin', color: { argb: 'FF94A3B8' } },
    };
  });

  // 5. Data Rows
  let currentRowIndex = headerRowNumber + 1;
  logs.forEach((item, idx) => {
    const row = worksheet.getRow(currentRowIndex);
    row.height = 22;
    const isEven = idx % 2 === 0;
    const bgArgb = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

    const actionLower = (item.action || '').toLowerCase();
    let actBg = 'FFE2E8F0';
    let actFg = 'FF334155';
    if (actionLower.includes('delete') || actionLower.includes('remove') || actionLower.includes('revoke')) {
      actBg = 'FFFEE2E2';
      actFg = 'FF991B1B';
    } else if (actionLower.includes('create') || actionLower.includes('add')) {
      actBg = 'FFDCFCE7';
      actFg = 'FF166534';
    } else if (actionLower.includes('update') || actionLower.includes('edit') || actionLower.includes('patch')) {
      actBg = 'FFE0F2FE';
      actFg = 'FF075985';
    } else if (actionLower.includes('login') || actionLower.includes('logout')) {
      actBg = 'FFF3E8FF';
      actFg = 'FF6B21A8';
    }

    const rowData = [
      item.id,
      item.created_at ? dateUtils.formatCompactDateTime(item.created_at) : '-',
      item.username || '-',
      item.action || '-',
      item.entity || '-',
      item.entity_id || '-',
      item.ip_address || '-',
      item.user_agent || '-',
      formatDataValue(item.old_data),
      formatDataValue(item.new_data),
    ];

    rowData.forEach((val, cIdx) => {
      const cell = row.getCell(cIdx + 1);
      cell.value = val;
      cell.font = { name: 'Segoe UI', size: 10 };
      cell.alignment = {
        vertical: 'middle',
        horizontal: cIdx === 0 ? 'center' : 'left',
        wrapText: cIdx >= 8, // Old data and New data wrap text
      };

      if (cIdx === 3) {
        // Action column
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: actBg } };
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: actFg } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } };
      }

      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    });

    currentRowIndex++;
  });

  // 6. Column Widths
  const colWidths = [8, 20, 18, 18, 18, 14, 16, 26, 30, 30];
  colWidths.forEach((w, i) => {
    worksheet.getColumn(i + 1).width = w;
  });

  // 7. Save and trigger download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
};
