import { useState, useEffect, useMemo, memo } from 'react';
import { SensorReportResponse } from '@_types/sensor';
import { DateRange } from '@/store/reportsStore';
import { dateUtils } from '@/components/utils/DatetimeFormat';
import { api, API_URL } from '@/api';
import { useDragScroll } from '@/hooks/useScroll';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { getPageNumbers } from '@/components/utils/getPageNumbers';
import Pagination from '@/components/table-pagination/Pagination';
import { getSensorColor, sortGroupTree } from './reportUtils';

// ==========================
// Combined Data Table Component (Backend Pagination)
// ==========================
export interface ReportTableProps {
  dateRange: DateRange;
  customColors: Record<string, string>;
  initialData?: SensorReportResponse;
}

export const ReportTable = memo(({ dateRange, customColors, initialData }: ReportTableProps) => {
  const [tableData, setTableData] = useState<SensorReportResponse | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [isLoading, setIsLoading] = useState(false);
  const { scrollRef, onPointerMove, onPointerUp, onPointerDown } = useDragScroll<HTMLDivElement>();

  // Reset to page 1 when date range or aggregation changes
  useEffect(() => {
    setCurrentPage(1);
  }, [dateRange.api, dateRange.aggregate]);

  // Fetch paginated table data from backend
  useEffect(() => {
    let isMounted = true;

    const fetchTableData = async () => {
      setIsLoading(true);
      try {
        const { data } = await api.post<SensorReportResponse>(API_URL.SENSORS_REPORT, {
          ...dateRange.api,
          aggregate: dateRange.aggregate,
          page: currentPage,
          page_size: rowsPerPage,
        });

        if (isMounted) {
          setTableData(data);
        }
      } catch (err) {
        console.error('Failed to fetch paginated table report:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchTableData();

    return () => {
      isMounted = false;
    };
  }, [dateRange.api, dateRange.aggregate, currentPage, rowsPerPage]);

  const activeData = tableData || initialData;
  const timestamps = activeData?.meta?.timestamps ?? [];
  const groups = activeData?.data ?? [];
  const totalCount = activeData?.meta?.total_count ?? (timestamps.length || 0);
  const totalPages = activeData?.meta?.total_pages ?? Math.max(1, Math.ceil(totalCount / rowsPerPage));

  // Flatten all sensors recursively across group hierarchy
  const allSensors = useMemo(() => {
    const list: {
      key: string;
      name: string;
      unit: string;
      decimal_places: number;
      values: (number | null)[];
      statistics: { min: number | null; max: number | null; avg?: number | null };
      color: string;
      groupName: string;
    }[] = [];

    const collect = (group: any, parentName = '') => {
      if (!group) return;
      const gName = group.group_name || group.sub_group_name || '';
      const fullGroupName = parentName ? `${parentName} > ${gName}` : gName;

      if (group.sensors?.length) {
        group.sensors.forEach((s: any) => {
          const validVals = (s.values ?? []).filter((v: any) => v !== null && v !== undefined && !isNaN(Number(v)));
          const computedAvg = validVals.length > 0 ? validVals.reduce((a: number, b: number) => a + Number(b), 0) / validVals.length : null;

          list.push({
            key: s.key,
            name: s.name,
            unit: s.unit || '',
            decimal_places: s.decimal_places ?? 2,
            values: s.values ?? [],
            statistics: {
              min: s.statistics?.min ?? (validVals.length ? Math.min(...validVals) : null),
              max: s.statistics?.max ?? (validVals.length ? Math.max(...validVals) : null),
              avg: s.statistics?.avg ?? computedAvg,
            },
            color: getSensorColor(s.key, customColors, s.color),
            groupName: fullGroupName,
          });
        });
      }

      if (group.children?.length) {
        group.children.forEach((child: any) => collect(child, fullGroupName));
      }
    };

    [...groups]
      .map(sortGroupTree)
      .sort((a, b) => a.group_index - b.group_index)
      .forEach((g) => collect(g));
    return list;
  }, [groups, customColors]);

  const startEntry = totalCount > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0;
  const endEntry = Math.min(currentPage * rowsPerPage, totalCount);

  if (isLoading && !activeData) {
    return (
      <div className="h-[250px] flex items-center justify-center bg-white shadow-xl rounded-xl border dark:bg-white/[0.03] dark:border-white/[0.05]">
        <p className="text-gray-500">Loading table data...</p>
      </div>
    );
  }

  if (!allSensors.length && !isLoading) {
    return (
      <div className="h-[250px] flex items-center justify-center bg-white shadow-xl rounded-xl border dark:bg-white/[0.03] dark:border-white/[0.05]">
        <p className="text-gray-500">No data available for table view.</p>
      </div>
    );
  }

  return (
    <div className="bg-white shadow-xl rounded-xl border dark:bg-white/[0.03] dark:border-white/[0.05] relative overflow-hidden">
      {isLoading && (
        <div className="absolute inset-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-[1px] z-40 flex items-center justify-center rounded-xl">
          <div className="flex items-center gap-2 text-xs font-semibold text-brand-600 bg-white dark:bg-gray-800 px-3 py-1.5 rounded-lg shadow border border-gray-200 dark:border-gray-700">
            <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-brand-600"></span>
            Loading page {currentPage}...
          </div>
        </div>
      )}

      {/* Table Header Info Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-4 py-3.5 sm:px-6 sm:py-4 gap-2 border-b border-gray-100 dark:border-gray-800">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-gray-800 dark:text-white/90">Combined Sensor Data Table</h3>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Total sensors: {allSensors.length} | Showing {startEntry.toLocaleString()} – {endEntry.toLocaleString()} of{' '}
            {totalCount.toLocaleString()} entries
          </p>
        </div>
      </div>

      {/* Drag Scrollable Table Container (Horizontal + Vertical Scrolling) */}
      <div
        ref={scrollRef}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerMove={onPointerMove}
        className="w-full max-w-full overflow-x-auto overflow-y-auto max-h-[560px] select-none custom-scrollbar"
      >
        <Table className="w-full min-w-[700px] border-collapse">
          {/* Table Header (Sticky Top, Timestamp Sticky Left) */}
          <TableHeader className="sticky top-0 z-20 bg-gray-100 dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
            <TableRow>
              <TableCell
                isHeader
                className="sticky left-0 top-0 z-30 bg-gray-100 dark:bg-gray-800 px-4 py-3 font-bold text-gray-700 dark:text-gray-200 text-start text-xs sm:text-sm whitespace-nowrap min-w-[150px] sm:min-w-[170px] border-r border-gray-200 dark:border-gray-700 shadow-[2px_0_4px_rgba(0,0,0,0.06)]"
              >
                Timestamp
              </TableCell>
              {allSensors.map((s) => (
                <TableCell
                  key={s.key}
                  isHeader
                  className="px-4 py-3 bg-gray-500/10 dark:bg-gray-800 font-medium text-gray-600 dark:text-gray-300 text-end text-xs sm:text-sm whitespace-nowrap min-w-[140px] sm:min-w-[160px]"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }}></span>
                    <span className="font-bold text-xs sm:text-sm text-gray-800 dark:text-white/90">{s.name}</span>
                  </div>
                  <div className="text-[11px] sm:text-xs font-normal text-gray-500 dark:text-gray-400 mt-0.5">
                    {s.groupName} {s.unit ? `(${s.unit})` : ''}
                  </div>
                </TableCell>
              ))}
            </TableRow>
          </TableHeader>

          {/* Table Body */}
          <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
            {timestamps.map((ts: string, idx: number) => (
              <TableRow key={idx} className="hover:bg-primary/10 dark:hover:bg-gray-800/60 transition-colors group">
                {/* Pinned Timestamp Column */}
                <TableCell className="sticky left-0 z-10 bg-white dark:bg-gray-900 group-hover:bg-gray-100 dark:group-hover:bg-gray-800/80 px-4 py-2.5 font-mono text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 text-start whitespace-nowrap border-r border-gray-100 dark:border-gray-800 shadow-[2px_0_4px_rgba(0,0,0,0.04)]">
                  {dateUtils.formatCompactDateTime(ts)}
                </TableCell>
                {allSensors.map((s) => {
                  const val = s.values[idx];
                  const hasVal = val !== null && val !== undefined && !isNaN(Number(val));
                  return (
                    <TableCell key={s.key} className="px-4 py-2.5 font-mono text-xs sm:text-sm font-medium text-end text-gray-800 dark:text-gray-200">
                      {hasVal ? Number(val).toFixed(s.decimal_places) : <span className="text-gray-300 dark:text-gray-600">-</span>}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>

          {/* Sticky Footer: MIN, MAX, AVG (Sticky Bottom, Labels Sticky Left) */}
          <tfoot className="sticky bottom-0 z-20 border-t-2 border-gray-200 dark:border-gray-700 shadow-md">
            {/* MIN Row */}
            <tr className="bg-amber-50/95 dark:bg-amber-950/90 backdrop-blur-[2px] border-b border-amber-100/50 dark:border-amber-900/30">
              <td className="sticky left-0 z-30 bg-amber-50 dark:bg-amber-950 px-4 py-2.5 font-bold text-amber-600 dark:text-amber-400 text-start text-xs sm:text-sm whitespace-nowrap border-r border-gray-200 dark:border-gray-700 shadow-[2px_0_4px_rgba(0,0,0,0.06)]">
                MIN (All Range)
              </td>
              {allSensors.map((s, i) => (
                <td key={i} className="px-4 py-2.5 font-mono text-end font-bold text-amber-600 dark:text-amber-400 text-xs sm:text-sm">
                  {s.statistics.min !== null ? s.statistics.min.toFixed(s.decimal_places) : '-'}
                </td>
              ))}
            </tr>

            {/* MAX Row */}
            <tr className="bg-rose-50/95 dark:bg-rose-950/90 backdrop-blur-[2px] border-b border-rose-100/50 dark:border-rose-900/30">
              <td className="sticky left-0 z-30 bg-rose-50 dark:bg-rose-950 px-4 py-2.5 font-bold text-rose-600 dark:text-rose-400 text-start text-xs sm:text-sm whitespace-nowrap border-r border-gray-200 dark:border-gray-700 shadow-[2px_0_4px_rgba(0,0,0,0.06)]">
                MAX (All Range)
              </td>
              {allSensors.map((s, i) => (
                <td key={i} className="px-4 py-2.5 font-mono text-end font-bold text-rose-600 dark:text-rose-400 text-xs sm:text-sm">
                  {s.statistics.max !== null ? s.statistics.max.toFixed(s.decimal_places) : '-'}
                </td>
              ))}
            </tr>

            {/* AVG Row */}
            <tr className="bg-blue-50/95 dark:bg-blue-950/90 backdrop-blur-[2px]">
              <td className="sticky left-0 z-30 bg-blue-50 dark:bg-blue-950 px-4 py-2.5 font-bold text-blue-600 dark:text-blue-400 text-start text-xs sm:text-sm whitespace-nowrap border-r border-gray-200 dark:border-gray-700 shadow-[2px_0_4px_rgba(0,0,0,0.06)]">
                AVG (All Range)
              </td>
              {allSensors.map((s, i) => {
                const avgVal = s.statistics?.avg;
                const hasAvg = avgVal !== null && avgVal !== undefined && !isNaN(Number(avgVal));
                return (
                  <td key={i} className="px-4 py-2.5 font-mono text-end font-bold text-blue-600 dark:text-blue-400 text-xs sm:text-sm">
                    {hasAvg ? Number(avgVal).toFixed(s.decimal_places) : '-'}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </Table>
      </div>

      {/* Divider before pagination */}
      <div className="border-t border-gray-100 dark:border-gray-800"></div>

      {/* Pagination Controls */}
      <Pagination
        filteredData={Array(totalCount > 0 ? totalCount : 1)}
        totalPages={totalPages}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        pagesLists={getPageNumbers(currentPage, totalPages)}
        rowsPerPage={rowsPerPage}
        setRowsPerPage={(val) => {
          setRowsPerPage(val);
          setCurrentPage(1);
        }}
        rowPerPageText={{
          display: 'Rows per page:',
          row: '[cr] of [tr]',
        }}
      />
    </div>
  );
});
ReportTable.displayName = 'ReportTable';

export default ReportTable;
