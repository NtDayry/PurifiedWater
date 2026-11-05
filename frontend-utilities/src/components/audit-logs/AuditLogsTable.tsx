import { useEffect, useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebounce } from 'use-debounce';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import {
  FileClock,
  InfoIcon,
  Search,
  RefreshCw,
  Activity,
  PlusCircle,
  Edit3,
  Trash2,
  Lock,
} from 'lucide-react';
import { AnimateArrowDownIcon, AnimateArrowUpIcon, CsvIcon, ExcelIcon } from '@/icons';
import { getAuditLogs, getAuditLogFilters, createAuditLog } from '@/api';
import { useDragScroll } from '@/hooks/useScroll';
import { useLoading } from '@/context/LoadingContext';
import useSwalAlert from '@/hooks/useSwalAlert';
import { useTableState } from '@/hooks/useTableState';
import { useAuditLogsTableStore } from '@/store/useAuditLogsTable';
import { getPageNumbers } from '@/components/utils/getPageNumbers';
import { formatDate } from '@/components/utils/date';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/radixUI/input';
import Pagination from '@/components/table-pagination/Pagination';
import Badge, { BadgeColor } from '@/components/ui/badge/Badge';
import AuditLogDataModal from '@/components/audit-logs/AuditLogDataModal';
import Button from '@/components/ui/button/Button';
import Select from '@/components/form/Select';
import DatePicker from '@/components/form/date-picker';
import Tooltip from '@/components/ui/tooltip/Tooltip';
import { exportCSVAuditLogs } from './exportCsvAuditLogs';
import { exportExcelAuditLogs } from './exportExcelAuditLogs';
import type { AuditLogItem } from '@_types/audit_log';
import type { TableHeaderType } from '@_types/table';

dayjs.extend(customParseFormat);

interface FilterState {
  start_time: string;
  stop_time: string;
  display_start: string;
  display_stop: string;
  action: string;
  entity: string;
}

function normalizeLabel(value: string | null | undefined) {
  if (!value) return '-';
  return value;
}

function actionBadgeColor(action: string): BadgeColor {
  const normalized = (action || '').toLowerCase();
  if (normalized.includes('delete') || normalized.includes('remove') || normalized.includes('revoke')) return 'error';
  if (normalized.includes('create') || normalized.includes('add')) return 'success';
  if (normalized.includes('update') || normalized.includes('edit') || normalized.includes('patch')) return 'info';
  if (normalized.includes('login') || normalized.includes('logout') || normalized.includes('auth')) return 'warning';
  return 'light';
}

export default function AuditLogsTable() {
  const { t } = useTranslation();
  const SwalAlert = useSwalAlert();
  const { scrollRef, onPointerMove, onPointerUp, onPointerDown } = useDragScroll<HTMLDivElement>();
  const { loading, setLoading } = useLoading();

  const [dataTable, setDataTable] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);
  const [isDataModalOpen, setIsDataModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filter Dropdown Options
  const [actionOptions, setActionOptions] = useState<{ value: string; label: string }[]>([
    { value: 'all', label: 'All Actions' },
  ]);
  const [entityOptions, setEntityOptions] = useState<{ value: string; label: string }[]>([
    { value: 'all', label: 'All Entities' },
  ]);

  const [filters, setFilters] = useState<FilterState>({
    start_time: dayjs().subtract(7, 'day').startOf('day').toISOString(),
    stop_time: dayjs().endOf('day').toISOString(),
    display_start: dayjs().subtract(7, 'day').format('DD/MM/YYYY'),
    display_stop: dayjs().format('DD/MM/YYYY'),
    action: 'all',
    entity: 'all',
  });

  const {
    searchTerm,
    setSearchTerm,
    currentPage,
    setCurrentPage,
    rowsPerPage,
    setRowsPerPage,
    sortKey,
    sortDirection,
    setSort,
  } = useTableState(useAuditLogsTableStore);

  const [debouncedSearch] = useDebounce(searchTerm, 500);

  // Fetch filter options (Actions, Entities) from backend
  useEffect(() => {
    getAuditLogFilters()
      .then((res) => {
        if (res.actions && res.actions.length > 0) {
          setActionOptions([
            { value: 'all', label: 'All Actions' },
            ...res.actions.map((act) => ({ value: act, label: act })),
          ]);
        }
        if (res.entities && res.entities.length > 0) {
          setEntityOptions([
            { value: 'all', label: 'All Entities' },
            ...res.entities.map((ent) => ({ value: ent, label: ent })),
          ]);
        }
      })
      .catch((err) => console.warn('Failed to fetch audit log filter options:', err));
  }, []);

  const computedActionOptions = useMemo(() => {
    return actionOptions.map((opt) =>
      opt.value === 'all' ? { ...opt, label: t('page.audit_logs.filter.all_actions') } : opt
    );
  }, [actionOptions, t]);

  const computedEntityOptions = useMemo(() => {
    return entityOptions.map((opt) =>
      opt.value === 'all' ? { ...opt, label: t('page.audit_logs.filter.all_entities') } : opt
    );
  }, [entityOptions, t]);

  const tableHeader: TableHeaderType[] = useMemo(
    () => [
      { label: t('page.audit_logs.table.header.created_at'), key: 'created_at', isSort: true },
      { label: t('page.audit_logs.table.header.username'), key: 'username', isSort: true },
      { label: t('page.audit_logs.table.header.action'), key: 'action', isSort: true },
      { label: t('page.audit_logs.table.header.entity'), key: 'entity', isSort: true },
      { label: t('page.audit_logs.table.header.entity_id'), key: 'entity_id', isSort: true },
      { label: t('page.audit_logs.table.header.ip_address'), key: 'ip_address', isSort: true },
      { label: t('page.audit_logs.table.header.user_agent'), key: 'user_agent', isSort: true },
    ],
    [t]
  );

  // Fetch audit logs with backend pagination and filters
  const fetchLogs = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const response = await getAuditLogs({
        page: currentPage,
        limit: rowsPerPage,
        search: debouncedSearch,
        start_time: filters.start_time,
        stop_time: filters.stop_time,
        action: filters.action,
        entity: filters.entity,
        sortKey,
        sortDirection,
      });

      setDataTable(response.items || []);
      setTotal(response.total || 0);
      setTotalPages(response.total_pages || 1);
    } catch (error: any) {
      const msg = error?.response?.data?.detail || error?.message || t('page.audit_logs.swal.fetch_error');
      SwalAlert.error({ message: typeof msg === 'string' ? msg : JSON.stringify(msg) });
    } finally {
      setIsRefreshing(false);
    }
  }, [currentPage, rowsPerPage, debouncedSearch, filters.start_time, filters.stop_time, filters.action, filters.entity, sortKey, sortDirection, t]);

  useEffect(() => {
    setLoading(true, 'before', 500);
    fetchLogs().finally(() => setLoading(false));
  }, [fetchLogs]);

  // Handle Date and Select filter changes
  const handleFilterChange = useCallback((id: string, val: string) => {
    setCurrentPage(1); // Reset to page 1 on filter change
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
          display_start: start.format('DD/MM/YYYY'),
          display_stop: stop.format('DD/MM/YYYY'),
        };
      });
    } else {
      setFilters((prev) => ({
        ...prev,
        [id]: val,
      }));
    }
  }, [setCurrentPage]);

  const handleSort = (key: string, enable = false) => {
    if (!enable) return;

    if (sortKey === key) {
      setSort(key, sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(key, 'asc');
    }
  };

  // Helper to fetch all records for Export
  const fetchAllForExport = async (): Promise<AuditLogItem[]> => {
    const response = await getAuditLogs({
      page: 1,
      limit: 10000,
      search: debouncedSearch,
      start_time: filters.start_time,
      stop_time: filters.stop_time,
      action: filters.action,
      entity: filters.entity,
      sortKey,
      sortDirection,
    });
    return response.items || [];
  };

  const handleExportCSV = async () => {
    setLoading(true);
    try {
      const exportItems = await fetchAllForExport();
      if (!exportItems.length) {
        SwalAlert.warning({
          title: t('page.audit_logs.swal.no_data_title'),
          message: t('page.audit_logs.swal.no_data_msg'),
        });
        return;
      }
      exportCSVAuditLogs(exportItems);
      createAuditLog({
        action: 'export_audit_logs_csv',
        entity: 'audit_logs',
        new_data: {
          format: 'csv',
          total_records: exportItems.length,
          filters,
        },
      });
      SwalAlert.Toast({ message: t('page.audit_logs.swal.export_csv_success') });
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || t('page.audit_logs.swal.export_csv_error');
      SwalAlert.error({ message: typeof msg === 'string' ? msg : JSON.stringify(msg) });
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = async () => {
    setLoading(true);
    try {
      const exportItems = await fetchAllForExport();
      if (!exportItems.length) {
        SwalAlert.warning({
          title: t('page.audit_logs.swal.no_data_title'),
          message: t('page.audit_logs.swal.no_data_msg'),
        });
        return;
      }
      await exportExcelAuditLogs(exportItems, 'audit_logs_report', {
        start: filters.start_time,
        stop: filters.stop_time,
      });
      createAuditLog({
        action: 'export_audit_logs_excel',
        entity: 'audit_logs',
        new_data: {
          format: 'excel',
          total_records: exportItems.length,
          filters,
        },
      });
      SwalAlert.Toast({ message: t('page.audit_logs.swal.export_excel_success') });
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || t('page.audit_logs.swal.export_excel_error');
      SwalAlert.error({ message: typeof msg === 'string' ? msg : JSON.stringify(msg) });
    } finally {
      setLoading(false);
    }
  };

  // KPI calculations based on current page / table
  const kpiStats = useMemo(() => {
    const creates = dataTable.filter((l) => (l.action || '').toLowerCase().includes('create')).length;
    const updates = dataTable.filter(
      (l) => (l.action || '').toLowerCase().includes('update') || (l.action || '').toLowerCase().includes('edit')
    ).length;
    const deletes = dataTable.filter(
      (l) => (l.action || '').toLowerCase().includes('delete') || (l.action || '').toLowerCase().includes('remove')
    ).length;
    const auths = dataTable.filter(
      (l) => (l.action || '').toLowerCase().includes('login') || (l.action || '').toLowerCase().includes('logout')
    ).length;

    return { total, creates, updates, deletes, auths };
  }, [dataTable, total]);

  const detail = t('page.audit_logs.table.detail');

  const openDataModal = (row: AuditLogItem) => {
    setSelectedLog(row);
    setIsDataModalOpen(true);
  };

  const closeDataModal = () => {
    setIsDataModalOpen(false);
    setSelectedLog(null);
  };

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <div className="p-5 rounded-xl bg-white border border-gray-250 dark:border-white/[0.05] dark:bg-gray-800/30 shadow-md">
        <div className="flex gap-4 flex-col lg:flex-row items-end justify-between">
          <div className="w-full grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <DatePicker
              id="start_time"
              label={t('page.audit_logs.filter.from')}
              value={filters.display_start}
              onChange={handleFilterChange}
            />
            <DatePicker
              id="stop_time"
              label={t('page.audit_logs.filter.to')}
              value={filters.display_stop}
              options={{
                maxDate: dayjs().endOf('day').toISOString(),
              }}
              onChange={handleFilterChange}
            />
            <Select
              id="action"
              label={t('page.audit_logs.filter.action')}
              className="w-full"
              options={computedActionOptions}
              value={filters.action}
              onChange={handleFilterChange}
            />
            <Select
              id="entity"
              label={t('page.audit_logs.filter.entity')}
              className="w-full"
              options={computedEntityOptions}
              value={filters.entity}
              onChange={handleFilterChange}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-end gap-3 w-full lg:w-auto justify-end">
            <Button
              variant={{ light: 'neutral-soft', dark: 'neutral-soft-outline' }}
              onClick={fetchLogs}
              disabled={isRefreshing}
              className="!px-3"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant={{ light: 'info-soft', dark: 'info-soft-outline' }}
              startIcon={<CsvIcon className="w-5 h-5" />}
              onClick={handleExportCSV}
            >
              CSV
            </Button>
            <Button
              variant={{ light: 'info-soft', dark: 'info-soft-outline' }}
              startIcon={<ExcelIcon className="w-5 h-5" />}
              onClick={handleExportExcel}
            >
              Excel
            </Button>
          </div>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="rounded-xl border border-gray-250 bg-white p-4 dark:border-white/[0.05] dark:bg-white/[0.03] shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{t('page.audit_logs.kpi.total_records')}</p>
              <h4 className="text-xl font-bold text-gray-800 dark:text-white">{kpiStats.total.toLocaleString()}</h4>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-250 bg-white p-4 dark:border-white/[0.05] dark:bg-white/[0.03] shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{t('page.audit_logs.kpi.creates')}</p>
              <h4 className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{kpiStats.creates}</h4>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-250 bg-white p-4 dark:border-white/[0.05] dark:bg-white/[0.03] shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{t('page.audit_logs.kpi.updates')}</p>
              <h4 className="text-xl font-bold text-sky-600 dark:text-sky-400">{kpiStats.updates}</h4>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-250 bg-white p-4 dark:border-white/[0.05] dark:bg-white/[0.03] shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{t('page.audit_logs.kpi.deletes')}</p>
              <h4 className="text-xl font-bold text-rose-600 dark:text-rose-400">{kpiStats.deletes}</h4>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-250 bg-white p-4 dark:border-white/[0.05] dark:bg-white/[0.03] shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{t('page.audit_logs.kpi.auth')}</p>
              <h4 className="text-xl font-bold text-purple-600 dark:text-purple-400">{kpiStats.auths}</h4>
            </div>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white shadow-xl rounded-xl border border-gray-250 dark:bg-white/[0.03] dark:border-white/[0.05] overflow-hidden">
        <div className="flex flex-col gap-4 px-4 py-5 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-lg font-bold text-gray-600 dark:text-white/[0.8]">
            {detail.replace('[ci]', dataTable.length.toLocaleString()).replace('[ti]', total.toLocaleString())}
          </p>

          <div className="relative w-full lg:w-80">
            <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t('page.audit_logs.table.search')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`pl-9 pr-3 ${searchTerm ? '!text-success' : 'text-muted-foreground'}`}
            />
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-800" />

        <div
          ref={scrollRef}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerMove={onPointerMove}
          className="max-w-full overflow-x-auto select-none custom-scrollbar"
        >
          <Table className="min-w-[1200px]">
            <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
              <TableRow>
                <TableCell className="p-0 bg-gray-500/10 dark:bg-gray-800 font-medium text-gray-500 text-start text-theme-lg dark:text-white/[0.8]">
                  {null}
                </TableCell>
                {tableHeader.map((header) => (
                  <TableCell
                    key={header.key}
                    isHeader
                    onClick={() => handleSort(header.key, header.isSort)}
                    className={`px-4 py-3 bg-gray-500/10 min-w-[120px] dark:bg-gray-800 font-medium text-gray-500 text-start text-theme-lg dark:text-white/[0.8] ${
                      header.isSort ? 'cursor-pointer select-none' : ''
                    }`}
                  >
                    <h4 className={`flex items-center gap-1 justify-${header.align || 'start'} ${sortKey !== header.key ? 'w-full' : ''}`}>
                      {header.label}
                      <span className={`${sortKey === header.key ? 'visible' : 'invisible'}`}>
                        {sortDirection === 'asc' ? <AnimateArrowUpIcon className="size-4" /> : <AnimateArrowDownIcon className="size-4" />}
                      </span>
                    </h4>
                  </TableCell>
                ))}
              </TableRow>
            </TableHeader>

            <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
              {dataTable.map((row) => (
                <TableRow key={row.id} className="hover:bg-primary/10 dark:hover:bg-gray-800/60 animate-slideDown">
                  <TableCell className="ps-3 pe-1 py-3 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                    <div className="flex items-center gap-2">
                      <Tooltip text={t('page.audit_logs.table.view_details')} position="right">
                        <button
                          type="button"
                          onClick={() => openDataModal(row)}
                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-400 bg-white text-gray-500 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:border-brand-500/40 dark:hover:bg-brand-500/10 dark:hover:text-brand-300"
                        >
                          <InfoIcon className="size-7" />
                        </button>
                      </Tooltip>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                    <div className="flex items-center gap-2">{formatDate(row.created_at)}</div>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                    <span className="font-semibold text-gray-800 dark:text-white/90">{normalizeLabel(row.username)}</span>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-start text-theme-sm">
                    <Badge color={actionBadgeColor(row.action)}>{row.action}</Badge>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                    <span className="font-medium">{normalizeLabel(row.entity)}</span>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                    <span className="font-mono text-xs">{normalizeLabel(row.entity_id)}</span>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                    <span className="font-mono text-xs">{normalizeLabel(row.ip_address)}</span>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                    <span className="block max-w-[20rem] truncate" title={row.user_agent || undefined}>
                      {normalizeLabel(row.user_agent)}
                    </span>
                  </TableCell>
                </TableRow>
              ))}

              {!loading && dataTable.length === 0 && (
                <TableRow className="animate-fadeIn">
                  <TableCell colSpan={12} className="px-5 py-4 sm:px-6 text-start">
                    <div className="border dark:border-gray-800 bg-gray-400/[0.1] dark:bg-gray-800 rounded-lg">
                      <div className="text-center py-12">
                        <FileClock className="w-12 h-12 text-muted-foreground dark:text-white/[0.5] mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-muted-foreground dark:text-white/[0.5] mb-2">
                          {t('page.audit_logs.table.empty.title')}
                        </h3>
                        <p className="text-muted-foreground dark:text-white/[0.5] mb-4">{t('page.audit_logs.table.empty.subtitle')}</p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-800" />

        {/* Backend Pagination Component */}
        <Pagination
          filteredData={Array(total)}
          totalPages={totalPages}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          pagesLists={getPageNumbers(currentPage, totalPages)}
          rowsPerPage={rowsPerPage}
          setRowsPerPage={setRowsPerPage}
          rowPerPageText={{
            display: t('page.audit_logs.table.row_per_page.display'),
            row: t('page.audit_logs.table.row_per_page.row'),
          }}
        />

        <AuditLogDataModal log={selectedLog} isOpen={isDataModalOpen} onClose={closeDataModal} />
      </div>
    </div>
  );
}
