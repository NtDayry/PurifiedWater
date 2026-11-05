import * as ExcelJS from 'exceljs';
import { dateUtils } from '@/components/utils/DatetimeFormat';

interface Sensor {
  key: string;
  name: string;
  unit: string;
  decimal_places: number;
  values: (number | null)[];
}

// Flatten sensors tree recursively
const collectSensors = (group: any, result: Sensor[] = []): Sensor[] => {
  if (!group) return result;

  if (group.sensors?.length) {
    result.push(...group.sensors);
  }

  if (group.children?.length) {
    [...group.children]
      .sort((a: any, b: any) => (a.group_index ?? 0) - (b.group_index ?? 0))
      .forEach((child: any) => collectSensors(child, result));
  }

  return result;
};

// Fallback timestamp if no timestamps in meta
const buildFakeTimestamps = (length: number) => {
  return Array.from({ length }, (_, i) => `#${i}`);
};

/**
 * Main Excel Export function using ExcelJS with rich styling.
 */
export const exportExcelByGroup = async (raw: any, filename = 'sensor_report') => {
  const groups = raw?.data ?? [];
  const timestamps = raw?.meta?.timestamps ?? [];

  if (!groups.length) {
    console.error('❌ No group data available for export');
    return;
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PurifieldWater System';
  workbook.created = new Date();

  const usedNames = new Set<string>();

  const sortedGroups = [...groups].sort((a, b) => (a.group_index ?? 0) - (b.group_index ?? 0));

  for (const group of sortedGroups) {
    const sensors = collectSensors(group);
    if (!sensors.length) continue;

    const tsList = timestamps.length > 0 ? timestamps : buildFakeTimestamps(sensors[0].values.length);

    // Sanitize sheet name (Max 31 characters, unique)
    let groupName = group.group_name || group.sub_group_name || group.group_key || 'Report';
    let safeName = groupName.replace(/[:\\/?*\[\]]/g, '_').slice(0, 31);
    let counter = 1;
    while (usedNames.has(safeName)) {
      safeName = `${groupName.slice(0, 27)}_${counter++}`;
    }
    usedNames.add(safeName);

    const worksheet = workbook.addWorksheet(safeName, {
      views: [{ showGridLines: true }],
    });

    const totalColumns = sensors.length + 1; // 1 for Timestamp + sensors

    // ─── 1. Title Banner (Row 1-2) ───────────────────────────
    worksheet.mergeCells(1, 1, 1, totalColumns);
    const titleCell = worksheet.getCell(1, 1);
    titleCell.value = `PURIFIELD WATER — ${groupName.toUpperCase()} REPORT`;
    titleCell.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' }, // Slate 800
    };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(1).height = 36;

    // Subheader Info (Row 2)
    worksheet.mergeCells(2, 1, 2, totalColumns);
    const subTitleCell = worksheet.getCell(2, 1);
    const timeRangeStr = raw?.meta?.time_range
      ? `Time Range: ${dateUtils.formatCompactDateTime(raw.meta.time_range.start)} - ${dateUtils.formatCompactDateTime(raw.meta.time_range.stop)}`
      : `Exported Date: ${dateUtils.formatCompactDateTime(new Date().toISOString())}`;
    subTitleCell.value = `${timeRangeStr}  |  Total Sensors: ${sensors.length}  |  Data Points: ${tsList.length}`;
    subTitleCell.font = { name: 'Segoe UI', size: 10, italic: true, color: { argb: 'FF475569' } };
    subTitleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF1F5F9' }, // Slate 100
    };
    subTitleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getRow(2).height = 22;

    // Row 3: Blank spacing
    worksheet.getRow(3).height = 10;

    // ─── 2. Column Headers (Row 4) ───────────────────────────
    const headerRow = worksheet.getRow(4);
    headerRow.height = 28;

    const headers = ['Timestamp', ...sensors.map((s) => `${s.name} (${s.unit || ''})`.trim())];
    headers.forEach((h, colIndex) => {
      const cell = headerRow.getCell(colIndex + 1);
      cell.value = h;
      cell.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2563EB' }, // Brand Blue / Indigo
      };
      cell.alignment = { vertical: 'middle', horizontal: colIndex === 0 ? 'center' : 'right' };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF1D4ED8' } },
        bottom: { style: 'medium', color: { argb: 'FF1D4ED8' } },
        left: { style: 'thin', color: { argb: 'FF93C5FD' } },
        right: { style: 'thin', color: { argb: 'FF93C5FD' } },
      };
    });

    // ─── 3. Data Rows ─────────────────────────────────────────
    const startDataRow = 5;

    tsList.forEach((ts: string, rowIdx: number) => {
      const rowNum = startDataRow + rowIdx;
      const row = worksheet.getRow(rowNum);
      row.height = 20;

      const isEven = rowIdx % 2 === 0;
      const rowBgColor = isEven ? 'FFFFFFFF' : 'FFF8FAFC'; // Alternating row color

      // Timestamp Cell
      const tsCell = row.getCell(1);
      tsCell.value = ts.startsWith('#') ? ts : dateUtils.formatCompactDateTime(ts);
      tsCell.alignment = { vertical: 'middle', horizontal: 'center' };
      tsCell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF334155' } };
      tsCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBgColor } };
      tsCell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };

      // Sensor Value Cells
      sensors.forEach((sensor, sIdx) => {
        const valCell = row.getCell(sIdx + 2);
        const rawVal = sensor.values?.[rowIdx];

        if (rawVal !== null && rawVal !== undefined && !isNaN(Number(rawVal))) {
          const numVal = Number(rawVal);
          valCell.value = numVal;

          // Excel Number formatting (e.g., #,##0.00)
          const decimals = sensor.decimal_places ?? 2;
          const formatZeros = decimals > 0 ? '.' + '0'.repeat(decimals) : '';
          valCell.numFmt = `#,##0${formatZeros}`;
        } else {
          valCell.value = '-';
          valCell.alignment = { vertical: 'middle', horizontal: 'center' };
        }

        if (typeof valCell.value === 'number') {
          valCell.alignment = { vertical: 'middle', horizontal: 'right' };
        }

        valCell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF0F172A' } };
        valCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBgColor } };
        valCell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
      });
    });

    // ─── 4. Statistics Summary Section (MIN / MAX / AVG) ─────
    const totalDataRows = tsList.length;
    if (totalDataRows > 0) {
      const summaryStartRow = startDataRow + totalDataRows + 1;

      // Header row for summary
      const summaryHeaderRow = worksheet.getRow(summaryStartRow);
      summaryHeaderRow.height = 22;
      summaryHeaderRow.getCell(1).value = 'STATISTICS SUMMARY';
      summaryHeaderRow.getCell(1).font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1E293B' } };
      summaryHeaderRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };

      const stats = [
        { label: 'MINIMUM', color: 'FFD97706', calc: (vals: number[]) => (vals.length ? Math.min(...vals) : null) },
        { label: 'MAXIMUM', color: 'FFDC2626', calc: (vals: number[]) => (vals.length ? Math.max(...vals) : null) },
        { label: 'AVERAGE', color: 'FF2563EB', calc: (vals: number[]) => (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null) },
      ];

      stats.forEach((stat, sIndex) => {
        const statRow = worksheet.getRow(summaryStartRow + 1 + sIndex);
        statRow.height = 22;

        const labelCell = statRow.getCell(1);
        labelCell.value = stat.label;
        labelCell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: stat.color } };
        labelCell.alignment = { vertical: 'middle', horizontal: 'center' };
        labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        labelCell.border = {
          top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        };

        sensors.forEach((sensor, sIdx) => {
          const cell = statRow.getCell(sIdx + 2);
          const validVals = (sensor.values ?? []).filter((v): v is number => v !== null && v !== undefined && !isNaN(Number(v)));
          const statVal = stat.calc(validVals);

          if (statVal !== null) {
            cell.value = statVal;
            const decimals = sensor.decimal_places ?? 2;
            const formatZeros = decimals > 0 ? '.' + '0'.repeat(decimals) : '';
            cell.numFmt = `#,##0${formatZeros}`;
            cell.alignment = { vertical: 'middle', horizontal: 'right' };
          } else {
            cell.value = '-';
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          }

          cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF0F172A' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          };
        });
      });
    }

    // ─── 5. Auto-fit Column Widths ───────────────────────────
    headers.forEach((headerText, colIdx) => {
      let maxLen = headerText.length;

      // Sample first 50 rows for length
      const maxRowsToCheck = Math.min(tsList.length, 50);
      for (let r = 0; r < maxRowsToCheck; r++) {
        if (colIdx === 0) {
          const val = tsList[r];
          if (val) maxLen = Math.max(maxLen, val.length);
        } else {
          const val = sensors[colIdx - 1]?.values?.[r];
          if (val !== null && val !== undefined) {
            maxLen = Math.max(maxLen, String(val).length + 4);
          }
        }
      }

      worksheet.getColumn(colIdx + 1).width = Math.max(maxLen + 4, 18);
    });
  }

  // ─── 6. Trigger Browser File Download ──────────────────────
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  const dateStr = new Date().toISOString().split('T')[0];
  anchor.download = `${filename}_${dateStr}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
};
