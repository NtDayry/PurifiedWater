import * as ExcelJS from 'exceljs';
import { AlertEvent } from '@/api';
import { dateUtils } from '@/components/utils/DatetimeFormat';

export const exportExcelAlarms = async (events: AlertEvent[], filename = 'alarm_report') => {
  if (!events || events.length === 0) {
    console.warn('❌ No alarm events to export');
    return;
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PurifieldWater System';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Alarm Events', {
    pageSetup: { paperSize: 9, orientation: 'landscape' },
    views: [{ showGridLines: true }],
  });

  // Calculate summary stats
  const total = events.length;
  const criticalCount = events.filter((e) => e.severity?.toLowerCase() === 'critical').length;
  const warningCount = events.filter((e) => e.severity?.toLowerCase() === 'warning').length;
  const infoCount = events.filter((e) => e.severity?.toLowerCase() === 'info').length;
  const activeCount = events.filter((e) => !e.ended_at).length;
  const ackCount = events.filter((e) => e.acknowledged).length;

  // Title Block
  worksheet.mergeCells('A1:L1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'Purified Water System - Alarm Events Report';
  titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 36;

  // Meta row
  worksheet.mergeCells('A2:L2');
  const metaCell = worksheet.getCell('A2');
  metaCell.value = `Exported at: ${dateUtils.formatCompactDateTime(new Date().toISOString())} | Total Records: ${total}`;
  metaCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF475569' } };
  metaCell.alignment = { vertical: 'middle', horizontal: 'left' };
  worksheet.getRow(2).height = 20;

  // Summary Cards Row
  const summaryRow = worksheet.getRow(4);
  summaryRow.height = 24;

  const summaryData = [
    { col: 'A', label: 'Total Alarms', val: total, color: 'FF3B82F6' },
    { col: 'C', label: 'Critical', val: criticalCount, color: 'FFEF4444' },
    { col: 'E', label: 'Warning', val: warningCount, color: 'FFF59E0B' },
    { col: 'G', label: 'Info', val: infoCount, color: 'FF3B82F6' },
    { col: 'I', label: 'Active', val: activeCount, color: 'FFEC4899' },
    { col: 'K', label: 'Acknowledged', val: ackCount, color: 'FF10B981' },
  ];

  summaryData.forEach((s) => {
    const cell = worksheet.getCell(`${s.col}4`);
    cell.value = `${s.label}: ${s.val}`;
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: s.color } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  // Table Headers
  const headers = [
    'ID',
    'Device Name',
    'Metric Name',
    'Severity',
    'Trigger Value',
    'Started At',
    'Triggered At',
    'Ended At',
    'Duration (s)',
    'Status',
    'Acknowledged',
    'Ack At',
  ];

  const headerRowNumber = 6;
  const headerRow = worksheet.getRow(headerRowNumber);
  headerRow.height = 28;

  headers.forEach((h, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'medium', color: { argb: 'FF475569' } },
      left: { style: 'thin', color: { argb: 'FF94A3B8' } },
      right: { style: 'thin', color: { argb: 'FF94A3B8' } },
    };
  });

  // Add Data Rows
  let currentRowIndex = headerRowNumber + 1;
  events.forEach((item, idx) => {
    const row = worksheet.getRow(currentRowIndex);
    row.height = 22;
    const isEven = idx % 2 === 0;
    const bgArgb = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

    const severityUpper = (item.severity || 'info').toUpperCase();
    let sevBg = 'FFE2E8F0';
    let sevFg = 'FF334155';
    if (severityUpper === 'CRITICAL') {
      sevBg = 'FFFEE2E2';
      sevFg = 'FF991B1B';
    } else if (severityUpper === 'WARNING') {
      sevBg = 'FFFEF3C7';
      sevFg = 'FF92400E';
    } else if (severityUpper === 'INFO') {
      sevBg = 'FFE0F2FE';
      sevFg = 'FF075985';
    }

    const rowData = [
      item.id,
      item.device_name || '-',
      item.metric_name || '-',
      severityUpper,
      item.trigger_value !== null && item.trigger_value !== undefined ? item.trigger_value : '-',
      item.started_at ? dateUtils.formatCompactDateTime(item.started_at) : '-',
      item.triggered_at ? dateUtils.formatCompactDateTime(item.triggered_at) : '-',
      item.ended_at ? dateUtils.formatCompactDateTime(item.ended_at) : 'ACTIVE',
      item.duration_seconds !== null && item.duration_seconds !== undefined ? item.duration_seconds : '-',
      item.ended_at ? 'Ended' : 'Active',
      item.acknowledged ? 'Yes' : 'No',
      item.acknowledged_at ? dateUtils.formatCompactDateTime(item.acknowledged_at) : '-',
    ];

    rowData.forEach((val, cIdx) => {
      const cell = row.getCell(cIdx + 1);
      cell.value = val;
      cell.font = { name: 'Calibri', size: 10 };
      cell.alignment = { vertical: 'middle', horizontal: cIdx === 0 || cIdx === 3 || cIdx === 9 || cIdx === 10 ? 'center' : 'left' };

      if (cIdx === 3) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: sevBg } };
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: sevFg } };
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

  // Set column widths
  const colWidths = [8, 18, 18, 14, 14, 20, 20, 20, 14, 12, 14, 20];
  colWidths.forEach((w, i) => {
    worksheet.getColumn(i + 1).width = w;
  });

  // Export buffer & download
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
