import { useEffect, useState, useRef, useCallback } from 'react';
import { SensorReportResponse } from '@_types/sensor';
import Select from '@/components/form/Select';
import { useLoading } from '@/context/LoadingContext';
import DatePicker from '@/components/form/date-picker';
import { CsvIcon, ExcelIcon, TableIcon, PerformanceGraphIcon } from '@/icons';
import { exportExcelByGroup } from './exportExcel';
import { exportCSVAll } from './exportCsv';
import { dateUtils } from '@/components/utils/DatetimeFormat';
import { api, API_URL, createAuditLog, getAlertRules, getSensorConfigs, type AlertRule, type SensorConfig } from '@/api';
import { useHasPermission } from '@/hooks/usePermission';
import { PermissionConfig } from '@/config/permission.config';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import isoWeek from 'dayjs/plugin/isoWeek';
import { useReportsStore, PERIOD_OPTIONS } from '@/store/reportsStore';
import { sensorStore } from './reportUtils';
import ReportCharts from './ReportCharts';
import ReportTable from './ReportTable';

dayjs.extend(customParseFormat);
dayjs.extend(isoWeek);

// ==========================
// Main Component
// ==========================
export default function Reports() {
  const canExport = useHasPermission([PermissionConfig.Modules.Reports.actions.exportData]);
  const { setLoading } = useLoading();
  const [sensorData, setSensorData] = useState<SensorReportResponse>();
  const [sensorConfigs, setSensorConfigs] = useState<SensorConfig[]>([]);
  const [alertRules, setAlertRules] = useState<AlertRule[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  // Zustand Store for filter & viewMode persistence (default viewMode: table)
  const { viewMode, dateRange, setViewMode, handleDateRangeChange } = useReportsStore();

  const [customColors, setCustomColors] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('reports_custom_chart_colors');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const handleColorChange = useCallback((sensorKey: string, newColor: string) => {
    setCustomColors((prev) => {
      const updated = { ...prev, [sensorKey]: newColor };
      try {
        localStorage.setItem('reports_custom_chart_colors', JSON.stringify(updated));
      } catch (err) {
        console.error('Failed to save chart color:', err);
      }
      return updated;
    });
  }, []);

  const handleColorReset = useCallback((sensorKey: string) => {
    setCustomColors((prev) => {
      const updated = { ...prev };
      delete updated[sensorKey];
      try {
        localStorage.setItem('reports_custom_chart_colors', JSON.stringify(updated));
      } catch (err) {
        console.error('Failed to reset chart color:', err);
      }
      return updated;
    });
  }, []);

  // ==========================
  // WebSocket
  // ==========================
  useEffect(() => {
    const connectWS = () => {
      if (wsRef.current) return;

      const ws = new WebSocket(API_URL.WS);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const res = JSON.parse(event.data);
          const flatValues: Record<string, number> = {};

          if (res.data) {
            if (res.data.adjusted) {
              Object.assign(flatValues, res.data.adjusted);
            }
            if (typeof res.data === 'object') {
              Object.values(res.data).forEach((deviceData: any) => {
                if (typeof deviceData === 'object' && deviceData !== null) {
                  Object.assign(flatValues, deviceData);
                }
              });
            }
          }

          sensorStore.set({
            ...flatValues,
            timestamp: res.timestamp,
          });
        } catch (err) {
          console.error('WS Parse error:', err);
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        setTimeout(connectWS, 3000);
      };
    };

    connectWS();
    return () => wsRef.current?.close();
  }, []);

  // ==========================
  // Fetch History
  // ==========================
  useEffect(() => {
    let isMounted = true;

    const fetchHistory = async () => {
      setLoading(true);
      try {
        const [reportRes, configs, rules] = await Promise.all([
          api.post<SensorReportResponse>(API_URL.SENSORS_REPORT, { ...dateRange.api, aggregate: dateRange.aggregate }),
          getSensorConfigs().catch(() => []),
          getAlertRules().catch(() => []),
        ]);

        if (isMounted) {
          setSensorData(reportRes.data);
          setSensorConfigs(configs);
          setAlertRules(rules);
          console.log(reportRes.data);
        }
      } catch (error) {
        console.error('Fetch error:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchHistory();

    return () => {
      isMounted = false;
    };
  }, [dateRange.api, dateRange.aggregate]);

  const handleExportCSV = useCallback(() => {
    if (!sensorData) return;
    exportCSVAll(sensorData);
    createAuditLog({
      action: 'export_csv',
      entity: 'sensor_reports',
      new_data: {
        format: 'csv',
        start_time: dateRange.api.start_time,
        stop_time: dateRange.api.stop_time,
        aggregate: dateRange.aggregate,
        total_data_points: sensorData?.meta?.timestamps?.length ?? 0,
      },
    });
  }, [sensorData, dateRange]);

  const handleExportExcel = useCallback(async () => {
    if (!sensorData) return;
    await exportExcelByGroup(sensorData);
    createAuditLog({
      action: 'export_excel',
      entity: 'sensor_reports',
      new_data: {
        format: 'excel',
        start_time: dateRange.api.start_time,
        stop_time: dateRange.api.stop_time,
        aggregate: dateRange.aggregate,
        total_data_points: sensorData?.meta?.timestamps?.length ?? 0,
      },
    });
  }, [sensorData, dateRange]);

  return (
    <div
      key={`${dateRange.api.start_time}-${dateRange.api.stop_time}-${dateRange.aggregate}`}
      className="col-span-12 space-y-6 w-full"
    >
      {/* Filters & Actions Bar */}
      <div className="animate-slideDown p-5 rounded-xl bg-white border border-gray-200 dark:bg-gray-800/30 dark:border-gray-800 shadow-sm">
        <div className="flex gap-4 flex-col lg:flex-row items-stretch lg:items-end justify-between">
          <div className="w-full grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <DatePicker
              id="start_time"
              label="From"
              value={dateUtils.formatCompactDate(dateRange?.display.start_time || '')}
              onChange={handleDateRangeChange}
            />
            <DatePicker
              id="stop_time"
              label="To"
              value={dateUtils.formatCompactDate(dateRange?.display.stop_time || '')}
              options={{
                maxDate: dayjs().endOf('day').toISOString(),
              }}
              onChange={handleDateRangeChange}
            />
            <Select
              id="aggregate"
              label="Period time"
              className="w-full"
              options={PERIOD_OPTIONS}
              defaultValue={dateRange.aggregate}
              onChange={handleDateRangeChange}
            />
          </div>

          {/* Grouped Action Menu Toolbar */}
          <div className="flex items-center justify-end gap-2 shrink-0 flex-wrap">
            <div className="inline-flex rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-1 shadow-sm items-center flex-wrap sm:flex-nowrap">
              {/* View Toggle Group */}
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                  viewMode === 'table'
                    ? 'bg-brand-500 text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700/50'
                }`}
              >
                <TableIcon className="w-4 h-4" />
                Combined Table
              </button>
              <button
                type="button"
                onClick={() => setViewMode('charts')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                  viewMode === 'charts'
                    ? 'bg-brand-500 text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700/50'
                }`}
              >
                <PerformanceGraphIcon className="w-4 h-4" />
                Charts
              </button>

              {/* Export Group */}
              {canExport && (
                <>
                  {/* Separator */}
                  <div className="hidden sm:block w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1.5"></div>

                  <button
                    type="button"
                    onClick={handleExportCSV}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-400 transition-all"
                    title="Export CSV"
                  >
                    <CsvIcon className="w-4 h-4" />
                    CSV
                  </button>
                  <button
                    type="button"
                    onClick={handleExportExcel}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/30 dark:hover:text-blue-400 transition-all"
                    title="Export Excel"
                  >
                    <ExcelIcon className="w-4 h-4" />
                    Excel
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {sensorData?.data ? (
        viewMode === 'charts' ? (
          <ReportCharts
            sensorData={sensorData}
            sensorConfigs={sensorConfigs}
            alertRules={alertRules}
            customColors={customColors}
            onColorChange={handleColorChange}
            onColorReset={handleColorReset}
          />
        ) : (
          <ReportTable dateRange={dateRange} customColors={customColors} initialData={sensorData} />
        )
      ) : (
        <div className="h-[350px] flex items-center justify-center p-12 bg-white rounded-xl border dark:bg-gray-800/[0.3] dark:border-gray-700">
          <p className="text-gray-600 text-xl">Waiting for data...</p>
        </div>
      )}
    </div>
  );
}
