import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { AlertEvent, getAlertEvents, acknowledgeAlertEvent, getSensorConfigs, createAuditLog } from '@/api';
import Button from '../ui/button/Button';
import Select from '@/components/form/Select';
import DatePicker from '@/components/form/date-picker';
import { useLoading } from '@/context/LoadingContext';
import { CsvIcon, ExcelIcon } from '@/icons';
import { dateUtils } from '@/components/utils/DatetimeFormat';
import { exportCSVAlarms } from './exportCsvAlarms';
import { exportExcelAlarms } from './exportExcelAlarms';
import Badge from '@/components/ui/badge/Badge';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { Bell, AlertTriangle, ShieldAlert, CheckCircle, Clock, RefreshCw } from 'lucide-react';
import useSwalAlert from '@/hooks/useSwalAlert';
import Pagination from '@/components/table-pagination/Pagination';
import { getPageNumbers } from '@/components/utils/getPageNumbers';
import { useHasPermission } from '@/hooks/usePermission';
import { PermissionConfig } from '@/config/permission.config';

dayjs.extend(customParseFormat);

interface FilterState {
  start_time: string;
  stop_time: string;
  display_start: string;
  display_stop: string;
  device_name: string;
  severity: string;
  status: string; // 'all' | 'active' | 'ended' | 'acknowledged' | 'unacknowledged'
}

export default function AlarmReports() {
  const { t } = useTranslation();
  const canExportAlarm = useHasPermission([PermissionConfig.Modules.AlarmReports.actions.exportData]);
  const canAcknowledge = useHasPermission([PermissionConfig.Modules.AlarmReports.actions.acknowledge]);

  const { setLoading } = useLoading();
  const SwalAlert = useSwalAlert();

  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const [deviceOptions, setDeviceOptions] = useState<{ value: string; label: string }[]>([{ value: 'all', label: 'All Devices' }]);

  const [filters, setFilters] = useState<FilterState>({
    start_time: dayjs().subtract(7, 'day').startOf('day').toISOString(),
    stop_time: dayjs().endOf('day').toISOString(),
    display_start: dayjs().subtract(7, 'day').format(),
    display_stop: dayjs().format(),
    device_name: 'all',
    severity: 'all',
    status: 'all',
  });

  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch unique devices for filter dropdown
  useEffect(() => {
    getSensorConfigs()
      .then((configs) => {
        const uniqueDevices = Array.from(new Set(configs.map((c) => c.device_name))).filter(Boolean);
        setDeviceOptions([{ value: 'all', label: 'All Devices' }, ...uniqueDevices.map((d) => ({ value: d, label: d }))]);
      })
      .catch((err) => console.warn('Failed to fetch devices for filter:', err));
  }, []);

  const computedDeviceOptions = useMemo(() => {
    return deviceOptions.map((d) => (d.value === 'all' ? { ...d, label: t('page.alarm_reports.filter.all_devices') } : d));
  }, [deviceOptions, t]);

  const severityOptions = useMemo(
    () => [
      { value: 'all', label: t('page.alarm_reports.filter.all_severities') },
      { value: 'critical', label: t('page.alarm_reports.filter.critical') },
      { value: 'warning', label: t('page.alarm_reports.filter.warning') },
      { value: 'info', label: t('page.alarm_reports.filter.info') },
    ],
    [t]
  );

  const statusOptions = useMemo(
    () => [
      { value: 'all', label: t('page.alarm_reports.filter.all_status') },
      { value: 'active', label: t('page.alarm_reports.filter.active_only') },
      { value: 'ended', label: t('page.alarm_reports.filter.ended_only') },
      { value: 'acknowledged', label: t('page.alarm_reports.filter.acknowledged') },
      { value: 'unacknowledged', label: t('page.alarm_reports.filter.unacknowledged') },
    ],
    [t]
  );

  // Fetch alert events with pagination
  const fetchEvents = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const params: any = {
        page: currentPage,
        limit: rowsPerPage,
        start_time: filters.start_time,
        stop_time: filters.stop_time,
      };

      if (filters.device_name !== 'all') {
        params.device_name = filters.device_name;
      }
      if (filters.severity !== 'all') {
        params.severity = filters.severity;
      }
      if (filters.status === 'acknowledged') {
        params.acknowledged = true;
      } else if (filters.status === 'unacknowledged') {
        params.acknowledged = false;
      } else if (filters.status === 'active') {
        params.active_only = true;
      }

      const res = await getAlertEvents(params);

      let items = res.items || [];
      if (filters.status === 'ended') {
        items = items.filter((e) => e.ended_at !== null);
      }

      setEvents(items);
      setTotal(res.total || 0);
      setTotalPages(res.total_pages || 1);
    } catch (error) {
      console.error('Failed to fetch alarm events:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [currentPage, rowsPerPage, filters.start_time, filters.stop_time, filters.device_name, filters.severity, filters.status]);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    fetchEvents().finally(() => {
      if (isMounted) {
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [fetchEvents]);

  // Handle Date & Select Filter Changes
  const handleFilterChange = useCallback((id: string, val: string) => {
    setCurrentPage(1); // Reset page to 1 on filter change
    if (id === 'start_time' || id === 'stop_time') {
      const newDate = dayjs(val, 'DD/MM/YYYY');
      setFilters((prev) => {
        let start = dayjs(prev.start_time);
        let stop = dayjs(prev.stop_time);

        if (!start.isValid()) start = dayjs();
        if (!stop.isValid()) stop = dayjs();

        if (id === 'start_time') {
          start = newDate.startOf('day');
          if (start.isAfter(stop)) stop = start.endOf('day');
        } else if (id === 'stop_time') {
          stop = newDate.endOf('day');
          if (stop.isBefore(start)) start = stop.startOf('day');
        }

        return {
          ...prev,
          start_time: start.toISOString(),
          stop_time: stop.toISOString(),
          display_start: start.format(),
          display_stop: stop.format(),
        };
      });
    } else {
      setFilters((prev) => ({
        ...prev,
        [id]: val,
      }));
    }
  }, []);

  // Handle Acknowledge Alert Event
  const handleAcknowledge = async (eventItem: AlertEvent) => {
    try {
      const confirm = await SwalAlert.confirm({
        title: t('page.alarm_reports.swal.ack_confirm_title'),
        message: t('page.alarm_reports.swal.ack_confirm_msg', {
          device: eventItem.device_name,
          metric: eventItem.metric_name,
        }),
        confirmButtonText: t('page.alarm_reports.swal.ack_confirm_btn'),
        cancelButtonText: t('page.alarm_reports.swal.cancel_btn'),
      });

      if (!confirm.isConfirmed) return;

      const updated = await acknowledgeAlertEvent(eventItem.id);
      setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      SwalAlert.success({ message: t('page.alarm_reports.swal.ack_success') });
    } catch (error: any) {
      const msg = error?.response?.data?.detail || error?.message || t('page.alarm_reports.swal.ack_error');
      SwalAlert.error({ message: typeof msg === 'string' ? msg : JSON.stringify(msg) });
    }
  };

  // Helper to fetch all records for Export
  const fetchAllForExport = async () => {
    const params: any = {
      page: 1,
      limit: 5000,
      start_time: filters.start_time,
      stop_time: filters.stop_time,
    };
    if (filters.device_name !== 'all') params.device_name = filters.device_name;
    if (filters.severity !== 'all') params.severity = filters.severity;
    if (filters.status === 'acknowledged') params.acknowledged = true;
    else if (filters.status === 'unacknowledged') params.acknowledged = false;
    else if (filters.status === 'active') params.active_only = true;

    const res = await getAlertEvents(params);
    let items = res.items || [];
    if (filters.status === 'ended') items = items.filter((e) => e.ended_at !== null);
    return items;
  };

  const handleExportCSV = async () => {
    setLoading(true);
    try {
      const exportItems = await fetchAllForExport();
      exportCSVAlarms(exportItems);
      createAuditLog({
        action: 'export_alarm_csv',
        entity: 'alert_events',
        new_data: {
          format: 'csv',
          total_records: exportItems.length,
          filters,
        },
      });
      SwalAlert.Toast({ message: t('page.alarm_reports.swal.export_csv_success') });
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || t('page.alarm_reports.swal.export_csv_error');
      SwalAlert.error({ message: typeof msg === 'string' ? msg : JSON.stringify(msg) });
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = async () => {
    setLoading(true);
    try {
      const exportItems = await fetchAllForExport();
      await exportExcelAlarms(exportItems);
      createAuditLog({
        action: 'export_alarm_excel',
        entity: 'alert_events',
        new_data: {
          format: 'excel',
          total_records: exportItems.length,
          filters,
        },
      });
      SwalAlert.Toast({ message: t('page.alarm_reports.swal.export_excel_success') });
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || t('page.alarm_reports.swal.export_excel_error');
      SwalAlert.error({ message: typeof msg === 'string' ? msg : JSON.stringify(msg) });
    } finally {
      setLoading(false);
    }
  };

  // KPI Calculations based on loaded page events
  const kpiStats = useMemo(() => {
    const active = events.filter((e) => !e.ended_at).length;
    const critical = events.filter((e) => e.severity?.toLowerCase() === 'critical').length;
    const warning = events.filter((e) => e.severity?.toLowerCase() === 'warning').length;
    const info = events.filter((e) => e.severity?.toLowerCase() === 'info').length;
    const acknowledged = events.filter((e) => e.acknowledged).length;

    return { total, active, critical, warning, info, acknowledged };
  }, [events, total]);

  const severityBadgeColor = (severity: string) => {
    const s = (severity || '').toLowerCase();
    if (s === 'critical') return 'error';
    if (s === 'warning') return 'warning';
    return 'info';
  };

  const formatDuration = (seconds: number | null) => {
    if (seconds === null || seconds === undefined) return '-';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins < 60) return `${mins}m ${secs}s`;
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins}m`;
  };

  return (
    <div className="col-span-12 space-y-6">
      {/* Filter Bar */}
      <div className="animate-slideDown p-5 rounded-xl bg-white border border-gray-200 dark:border-gray-800 dark:bg-gray-800/30 shadow-sm">
        <div className="flex gap-4 flex-col lg:flex-row items-end justify-between">
          <div className="w-full grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
            <DatePicker 
              id="start_time" 
              label={t('page.alarm_reports.filter.from')} 
              value={dateUtils.formatCompactDate(filters.display_start)} 
              onChange={handleFilterChange} 
            />
            <DatePicker
              id="stop_time"
              label={t('page.alarm_reports.filter.to')}
              value={dateUtils.formatCompactDate(filters.display_stop)}
              options={{
                maxDate: dayjs().endOf('day').toISOString(),
              }}
              onChange={handleFilterChange}
            />
            <Select
              id="device_name"
              label={t('page.alarm_reports.filter.device')}
              className="w-full"
              options={computedDeviceOptions}
              defaultValue={filters.device_name}
              onChange={handleFilterChange}
            />
            <Select
              id="severity"
              label={t('page.alarm_reports.filter.severity')}
              className="w-full"
              options={severityOptions}
              defaultValue={filters.severity}
              onChange={handleFilterChange}
            />
            <Select
              id="status"
              label={t('page.alarm_reports.filter.status')}
              className="w-full"
              options={statusOptions}
              defaultValue={filters.status}
              onChange={handleFilterChange}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-end gap-3 w-full lg:w-auto justify-end">
            <Button variant={{ light: 'neutral-soft', dark: 'neutral-soft-outline' }} onClick={fetchEvents} disabled={isRefreshing} className="!px-3">
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
            {canExportAlarm && (
              <>
                <Button variant={{ light: 'info-soft', dark: 'info-soft-outline' }} startIcon={<CsvIcon className="w-5 h-5" />} onClick={handleExportCSV}>
                  CSV
                </Button>
                <Button
                  variant={{ light: 'info-soft', dark: 'info-soft-outline' }}
                  startIcon={<ExcelIcon className="w-5 h-5" />}
                  onClick={handleExportExcel}
                >
                  Excel
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-800/30 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{t('page.alarm_reports.kpi.total_alarms')}</p>
              <h4 className="text-xl font-bold text-gray-800 dark:text-white">{kpiStats.total}</h4>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-800/30 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{t('page.alarm_reports.kpi.active')}</p>
              <h4 className="text-xl font-bold text-rose-600 dark:text-rose-400">{kpiStats.active}</h4>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-800/30 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{t('page.alarm_reports.kpi.critical')}</p>
              <h4 className="text-xl font-bold text-red-600 dark:text-red-400">{kpiStats.critical}</h4>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-800/30 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{t('page.alarm_reports.kpi.warning')}</p>
              <h4 className="text-xl font-bold text-amber-600 dark:text-amber-400">{kpiStats.warning}</h4>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-800/30 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{t('page.alarm_reports.kpi.info')}</p>
              <h4 className="text-xl font-bold text-sky-600 dark:text-sky-400">{kpiStats.info}</h4>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-800/30 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{t('page.alarm_reports.kpi.ack')}</p>
              <h4 className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{kpiStats.acknowledged}</h4>
            </div>
          </div>
        </div>
      </div>

      {/* Alarm Data Table */}
      <div className="bg-white shadow-md rounded-xl border border-gray-200 dark:bg-gray-800/30 dark:border-gray-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
          <h3 className="text-base font-bold text-gray-800 dark:text-white flex items-center gap-2">
            <Bell className="w-5 h-5 text-indigo-500" />
            {t('page.alarm_reports.table.title', { count: total.toLocaleString() })}
          </h3>
        </div>

        <div className="max-w-full overflow-x-auto custom-scrollbar">
          <Table className="min-w-[1000px]">
            <TableHeader className="text-sm border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60">
              <TableRow>
                <TableCell isHeader className="px-4 py-3 text-start font-semibold text-gray-600 dark:text-gray-300">
                  {t('page.alarm_reports.table.header.id')}
                </TableCell>
                <TableCell isHeader className="px-4 py-3 text-start font-semibold text-gray-600 dark:text-gray-300">
                  {t('page.alarm_reports.table.header.device_metric')}
                </TableCell>
                <TableCell isHeader className="px-4 py-3 text-start font-semibold text-gray-600 dark:text-gray-300">
                  {t('page.alarm_reports.table.header.severity')}
                </TableCell>
                <TableCell isHeader className="px-4 py-3 text-start font-semibold text-gray-600 dark:text-gray-300">
                  {t('page.alarm_reports.table.header.trigger_value')}
                </TableCell>
                <TableCell isHeader className="px-4 py-3 text-start font-semibold text-gray-600 dark:text-gray-300">
                  {t('page.alarm_reports.table.header.started_at')}
                </TableCell>
                <TableCell isHeader className="px-4 py-3 text-start font-semibold text-gray-600 dark:text-gray-300">
                  {t('page.alarm_reports.table.header.ended_at')}
                </TableCell>
                <TableCell isHeader className="px-4 py-3 text-start font-semibold text-gray-600 dark:text-gray-300">
                  {t('page.alarm_reports.table.header.duration')}
                </TableCell>
                <TableCell isHeader className="px-4 py-3 text-center font-semibold text-gray-600 dark:text-gray-300">
                  {t('page.alarm_reports.table.header.acknowledged')}
                </TableCell>
              </TableRow>
            </TableHeader>

            <TableBody className="divide-y divide-gray-100 dark:divide-gray-800">
              {events.map((item) => (
                <TableRow key={item.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors">
                  <TableCell className="px-4 py-3.5 text-sm font-medium text-gray-600 dark:text-gray-400">#{item.id}</TableCell>
                  <TableCell className="px-4 py-3.5">
                    <div>
                      <span className="text-sm font-semibold text-gray-800 dark:text-white block">{item.metric_name}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{item.device_name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3.5">
                    <Badge size="sm" color={severityBadgeColor(item.severity)}>{(item.severity || 'info').toUpperCase()}</Badge>
                  </TableCell>
                  <TableCell className="px-4 py-3.5 font-mono text-sm font-bold text-gray-700 dark:text-gray-300">
                    {item.trigger_value !== null && item.trigger_value !== undefined ? item.trigger_value : '-'}
                  </TableCell>
                  <TableCell className="px-4 py-3.5 text-xs text-gray-600 dark:text-gray-400">
                    {item.started_at ? dateUtils.formatCompactDateTime(item.started_at) : '-'}
                  </TableCell>
                  <TableCell className="px-4 py-3.5 text-xs">
                    {item.ended_at ? (
                      <span className="text-gray-600 dark:text-gray-400">{dateUtils.formatCompactDateTime(item.ended_at)}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> {t('page.alarm_reports.table.badge.active')}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3.5 text-xs text-gray-600 dark:text-gray-400 font-mono">
                    {formatDuration(item.duration_seconds)}
                  </TableCell>
                  <TableCell className="px-4 py-3.5 text-center">
                    {item.acknowledged ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                        <CheckCircle className="w-4 h-4" /> {t('page.alarm_reports.table.action.acknowledged')}
                      </span>
                    ) : canAcknowledge ? (
                      <Button
                        size="sm"
                        variant={{ light: 'warning', dark: 'warning' }}
                        className="!py-1 !px-2.5 !text-xs"
                        onClick={() => handleAcknowledge(item)}
                      >
                        {t('page.alarm_reports.table.action.acknowledge')}
                      </Button>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                        {t('page.alarm_reports.table.action.unacknowledged')}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}

              {events.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="px-5 py-12 text-center text-gray-500 dark:text-gray-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Bell className="w-10 h-10 text-gray-300 dark:text-gray-700" />
                      <p className="text-base font-medium">{t('page.alarm_reports.table.empty.title')}</p>
                      <p className="text-xs text-gray-400">{t('page.alarm_reports.table.empty.subtitle')}</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Controls */}
        <Pagination
          filteredData={Array(total)}
          totalPages={totalPages}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          pagesLists={getPageNumbers(currentPage, totalPages)}
          rowsPerPage={rowsPerPage}
          setRowsPerPage={setRowsPerPage}
          rowPerPageText={{
            display: t('page.alarm_reports.table.row_per_page.display'),
            row: t('page.alarm_reports.table.row_per_page.row'),
          }}
        />
      </div>
    </div>
  );
}
