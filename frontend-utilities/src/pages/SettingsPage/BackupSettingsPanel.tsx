import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Database,
  Download,
  Upload,
  RotateCcw,
  Trash2,
  Play,
  HardDrive,
  Clock,
  Layers,
  FileArchive,
  Search,
  RefreshCw,
  Sliders,
  AlertTriangle,
  ShieldAlert,
  Square,
  Activity,
  CheckCircle2,
  XCircle,
  X,
  CloudUpload,
} from 'lucide-react';
import Button from '@/components/ui/button/Button';
import Badge from '@/components/ui/badge/Badge';
import { Modal } from '@/components/ui/modal';
import Input from '@/components/form/input/InputField';
import { Switch } from '@/components/ui/radixUI/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/radixUI/select';
import useSwalAlert from '@/hooks/useSwalAlert';
import { useAuthStore } from '@/store/auth';
import { useBackupJobStore } from '@/store/backupJob';
import {
  BackupConfig,
  BackupItem,
  BackupStats,
  BackupType,
  StorageTargetType,
  TestStorageConnectionPayload,
  TestStorageConnectionResult,
  createBackup,
  deleteBackup,
  downloadBackupArchive,
  getBackupConfig,
  getBackupInfo,
  getBackupList,
  getBackupStats,
  restoreBackup,
  syncBackupRemoteStorage,
  testBackupStorageConnection,
  updateBackupConfig,
  uploadBackupFile,
} from '@/api';

const ACTIVE_DOWNLOAD_STORAGE_KEY = 'backup-active-download';

type DownloadProgress = {
  backupId: string;
  filename: string;
  percent: number;
  loadedMb: string;
  totalMb: string;
  status: 'downloading' | 'interrupted';
};

export default function BackupSettingsPanel() {
  const { t } = useTranslation();
  const SwalAlert = useSwalAlert();

  const authRole = useAuthStore((state) => state.role);
  const authPermissions = useAuthStore((state) => state.permissions) || [];
  const canManageBackup =
    authPermissions.includes('*') ||
    (authRole as string) === 'admin' ||
    (authRole as string) === 'super admin' ||
    authPermissions.includes('system:backup_restore');

  // Shared Backup Job Store
  const currentJob = useBackupJobStore((state) => state.currentJob);
  const isCancelling = useBackupJobStore((state) => state.isCancelling);
  const setOptimisticJob = useBackupJobStore((state) => state.setOptimisticJob);
  const cancelActiveJob = useBackupJobStore((state) => state.cancelActiveJob);
  const initWs = useBackupJobStore((state) => state.initWs);

  // Initialize shared WebSocket connection
  useEffect(() => {
    const cleanup = initWs();
    return () => cleanup();
  }, [initWs]);

  // Stats & List State
  const [stats, setStats] = useState<BackupStats | null>(null);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(false);

  // Config State
  const [config, setConfig] = useState<BackupConfig | null>(null);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<TestStorageConnectionResult | null>(null);

  // Create Backup Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createType, setCreateType] = useState<BackupType>('full');
  const [createIncludeFiles, setCreateIncludeFiles] = useState(true);
  const [createNote, setCreateNote] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Restore Modal State
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [selectedRestoreBackup, setSelectedRestoreBackup] = useState<BackupItem | null>(null);
  const [restoreChainInfo, setRestoreChainInfo] = useState<any[]>([]);
  const [isRestoring, setIsRestoring] = useState(false);

  // Upload Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Download State
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const downloadAbortControllerRef = useRef<AbortController | null>(null);

  const isJobActive = Boolean(
    currentJob &&
    currentJob.status &&
    currentJob.status !== 'idle' &&
    ['running', 'cancelling', 'completed', 'failed', 'cancelled'].includes(currentJob.status)
  );

  const isJobRunning = currentJob?.status === 'running' || currentJob?.status === 'cancelling';

  const formatSeconds = (sec: number) => {
    if (!sec || sec < 0) return '0s';
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}s`;
  };

  const getStageLabel = (stage?: string) => {
    if (!stage || stage === 'idle') return t('backup.stage_initializing', 'Initializing...');
    const key = `backup.stage_${stage}`;
    return t(
      key,
      stage.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
    );
  };

  // Fetch Data
  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [statsData, listData, configData] = await Promise.all([
        getBackupStats().catch(() => null),
        getBackupList({
          page,
          limit,
          search: search.trim() || undefined,
          type: selectedTypeFilter !== 'all' ? selectedTypeFilter : undefined,
        }).catch(() => null),
        getBackupConfig().catch(() => null),
      ]);

      if (statsData) setStats(statsData);
      if (listData) {
        setBackups(listData.items || []);
        setTotalCount(listData.total || 0);
        setTotalPages(listData.total_pages || 1);
      }
      if (configData) setConfig(configData);
    } catch (err) {
      console.error('Failed to load backup data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, selectedTypeFilter]);

  // Re-fetch list and stats when job status changes (e.g. completed or cancelled)
  useEffect(() => {
    if (currentJob?.status === 'completed' || currentJob?.status === 'cancelled' || currentJob?.status === 'failed') {
      fetchData();
    }
  }, [currentJob?.status]);

  // Handle Search submit
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchData();
  };

  // Handle Create Backup
  const handleCreateBackup = async () => {
    setIsCreating(true);
    try {
      setOptimisticJob({
        job_type: 'backup',
        backup_type: createType,
        stage: 'initializing',
        progress_percent: 5,
        operator_username: (authRole as string) || 'admin',
      });
      setIsCreateModalOpen(false);

      await createBackup({
        backup_type: createType,
        include_files: createIncludeFiles,
        note: createNote,
      });

      SwalAlert.Toast({ icon: 'success', title: t('backup.create_started', 'Backup operation started in background.') });
    } catch (err: any) {
      useBackupJobStore.setState({ currentJob: null });
      SwalAlert.error({ title: t('backup.create_failed', 'Backup Failed'), text: err?.response?.data?.detail || err.message });
    } finally {
      setIsCreating(false);
      setCreateNote('');
    }
  };

  // Handle Cancel Job
  const handleCancelJob = async () => {
    const res = await SwalAlert.confirm({
      title: t('backup.cancel_confirm_title', 'Stop Active Backup Process?'),
      text: t('backup.cancel_confirm_text', 'This will safely terminate execution and clean up temporary files.'),
      confirmButtonText: t('backup.cancel_confirm_btn', 'Yes, Cancel Operation'),
      icon: 'warning',
    });

    if (res.isConfirmed) {
      try {
        await cancelActiveJob('Operator requested stop from Web UI');
        fetchData();
        SwalAlert.Toast({ icon: 'info', title: t('backup.job_cancelled', 'Backup task cancelled successfully.') });
      } catch (err: any) {
        SwalAlert.Toast({ icon: 'error', title: err?.response?.data?.detail || err.message });
      }
    }
  };

  // Handle Cancel Download
  const handleCancelDownload = () => {
    if (downloadAbortControllerRef.current) {
      downloadAbortControllerRef.current.abort();
      downloadAbortControllerRef.current = null;
    }
    sessionStorage.removeItem(ACTIVE_DOWNLOAD_STORAGE_KEY);
    setDownloadingId(null);
    setDownloadProgress(null);
  };

  // An XHR download cannot continue after refresh. Keep a short-lived marker so
  // the user sees what happened, while leaving Download buttons ready to retry.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(ACTIVE_DOWNLOAD_STORAGE_KEY);
      if (!saved) return;
      const previous = JSON.parse(saved) as Omit<DownloadProgress, 'status'>;
      setDownloadProgress({ ...previous, status: 'interrupted' });
      sessionStorage.removeItem(ACTIVE_DOWNLOAD_STORAGE_KEY);
    } catch {
      sessionStorage.removeItem(ACTIVE_DOWNLOAD_STORAGE_KEY);
    }
  }, []);

  // Cleanup abort controller on component unmount
  useEffect(() => {
    return () => {
      if (downloadAbortControllerRef.current) {
        downloadAbortControllerRef.current.abort();
      }
    };
  }, []);

  // Handle Download Backup through the authenticated API client so that cookies,
  // refresh handling, cancellation, and progress reporting all work consistently.
  const handleDownloadBackup = async (item: BackupItem) => {
    // Clear any aborted/stale request before starting the next archive.
    handleCancelDownload();
    const controller = new AbortController();
    const initialProgress: DownloadProgress = {
      backupId: item.backup_id,
      filename: item.filename,
      percent: 0,
      loadedMb: '0.00',
      totalMb: '?',
      status: 'downloading',
    };
    downloadAbortControllerRef.current = controller;
    setDownloadingId(item.backup_id);
    setDownloadProgress(initialProgress);
    sessionStorage.setItem(ACTIVE_DOWNLOAD_STORAGE_KEY, JSON.stringify(initialProgress));

    try {
      await downloadBackupArchive(item.backup_id, item.filename, {
        signal: controller.signal,
        onProgress: (percent, loaded, total) => {
          const progress: DownloadProgress = {
            backupId: item.backup_id,
            filename: item.filename,
            percent,
            loadedMb: (loaded / (1024 * 1024)).toFixed(2),
            totalMb: total ? (total / (1024 * 1024)).toFixed(2) : '?',
            status: 'downloading',
          };
          setDownloadProgress(progress);
          sessionStorage.setItem(ACTIVE_DOWNLOAD_STORAGE_KEY, JSON.stringify(progress));
        },
      });

      SwalAlert.Toast({ icon: 'success', title: t('backup.download_complete', 'Backup archive downloaded.') });
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED') return;
      console.error('Download failed:', err);
      SwalAlert.Toast({
        icon: 'error',
        text: t('backup.download_failed', (err?.response?.data?.detail as string) || (err.message as string) || 'Failed to download backup archive.'),
      });
    } finally {
      if (downloadAbortControllerRef.current === controller) {
        downloadAbortControllerRef.current = null;
        sessionStorage.removeItem(ACTIVE_DOWNLOAD_STORAGE_KEY);
        setDownloadingId(null);
        setDownloadProgress(null);
      }
    }
  };

  // Handle Restore
  const handleOpenRestoreModal = async (item: BackupItem) => {
    setSelectedRestoreBackup(item);
    setIsRestoreModalOpen(true);
    try {
      const info = await getBackupInfo(item.backup_id);
      setRestoreChainInfo(info.restore_chain || [item]);
    } catch (err) {
      setRestoreChainInfo([item]);
    }
  };

  const handleExecuteRestore = async () => {
    if (!selectedRestoreBackup) return;

    const res = await SwalAlert.confirm({
      title: t('backup.restore_warning_title', 'CRITICAL: Confirm System Restore?'),
      text: t(
        'backup.restore_warning_text',
        'Restoring data will replace current database tables and file storage with data from the backup point. Proceed with caution.'
      ),
      confirmButtonText: t('backup.restore_confirm_btn', 'Yes, Restore System'),
      icon: 'warning',
    });

    if (!res.isConfirmed) return;

    setIsRestoring(true);
    try {
      setOptimisticJob({
        job_type: 'restore',
        stage: 'initializing',
        progress_percent: 5,
        operator_username: (authRole as string) || 'admin',
      });
      setIsRestoreModalOpen(false);

      await restoreBackup({
        backup_id: selectedRestoreBackup.backup_id,
        restore_chain: true,
      });

      SwalAlert.Toast({ icon: 'info', title: t('backup.restore_started', 'System restore process started in background.') });
    } catch (err: any) {
      SwalAlert.error({ title: t('backup.restore_failed', 'Restore Failed'), text: err?.response?.data?.detail || err.message });
    } finally {
      setIsRestoring(false);
    }
  };

  // Handle Delete
  const handleDeleteBackup = async (item: BackupItem) => {
    const res = await SwalAlert.confirm({
      title: t('backup.delete_confirm_title', 'Delete Backup Archive?'),
      text: t('backup.delete_confirm_text', `Are you sure you want to permanently delete '${item.filename}'?`, { filename: item.filename }),
      confirmButtonText: t('backup.delete_confirm_btn', 'Delete Archive'),
      icon: 'warning',
    });

    if (res.isConfirmed) {
      try {
        await deleteBackup(item.backup_id);
        SwalAlert.Toast({ icon: 'success', title: t('backup.deleted_success', 'Backup file deleted successfully.') });
        fetchData();
      } catch (err: any) {
        SwalAlert.Toast({ icon: 'error', title: err?.response?.data?.detail || err.message });
      }
    }
  };

  // Handle Upload
  const handleUploadBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    setIsUploading(true);
    try {
      await uploadBackupFile(uploadFile);
      SwalAlert.Toast({ icon: 'success', title: t('backup.upload_success', 'Backup archive uploaded successfully!') });
      setIsUploadModalOpen(false);
      setUploadFile(null);
      fetchData();
    } catch (err: any) {
      SwalAlert.error({ title: t('backup.upload_failed', 'Upload Failed'), text: err?.response?.data?.detail || err.message });
    } finally {
      setIsUploading(false);
    }
  };

  // Handle Save Config
  const handleSaveConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!config) return;

    setIsSavingConfig(true);
    try {
      await updateBackupConfig(config);
      SwalAlert.Toast({ icon: 'success', title: t('backup.config_saved', 'Backup configuration updated successfully!') });
    } catch (err: any) {
      SwalAlert.Toast({ icon: 'error', title: err?.response?.data?.detail || err.message });
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Handle Test Connection
  const handleTestConnection = async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (!config) return;
    setIsTestingConnection(true);
    if (!silent) {
      setConnectionTestResult(null);
    }

    const payload: TestStorageConnectionPayload = {
      storage_target_type: config.storage_target_type,
      custom_local: config.custom_local,
      network_share: config.network_share,
      sftp: config.sftp,
    };

    try {
      const res = await testBackupStorageConnection(payload);
      setConnectionTestResult(res);
      if (!silent) {
        if (res.status === 'success') {
          SwalAlert.success({
            title: t('backup.storage_test_success', 'ทดสอบการเชื่อมต่อสำเร็จ'),
            message: res.message,
            showConfirmButton: true,
            confirmButtonText: t('swal.buttons.ok', 'ตกลง'),
            timer: 3500,
          });
        } else {
          SwalAlert.error({
            title: t('backup.storage_test_failed', 'การเชื่อมต่อล้มเหลว'),
            message: res.message,
            showConfirmButton: true,
            confirmButtonText: t('swal.buttons.ok', 'ตกลง'),
            showCancelButton: false,
          });
        }
      }
    } catch (err: any) {
      const errMsg = err?.response?.data?.detail || err.message;
      setConnectionTestResult({
        status: 'error',
        target_type: config.storage_target_type,
        latency_ms: 0,
        message: errMsg,
      });
      if (!silent) {
        SwalAlert.error({
          title: t('backup.storage_test_failed', 'การเชื่อมต่อล้มเหลว'),
          message: errMsg,
          showConfirmButton: true,
          confirmButtonText: t('swal.buttons.ok', 'ตกลง'),
          showCancelButton: false,
        });
      }
    } finally {
      setIsTestingConnection(false);
    }
  };

  const [isSyncingRemote, setIsSyncingRemote] = useState(false);

  // Handle Sync Unsynced Backups to Remote Destination
  const handleSyncRemote = async () => {
    setIsSyncingRemote(true);
    try {
      const res = await syncBackupRemoteStorage();
      if (res.status === 'success') {
        SwalAlert.Toast({
          icon: 'success',
          title: t('backup.sync_success', `ซิงค์ไฟล์ ${res.synced_count} ไฟล์ไปยังปลายทางสำเร็จ!`),
        });
        fetchData();
      } else if (res.status === 'skipped') {
        SwalAlert.Toast({ icon: 'info', title: res.message });
      } else {
        SwalAlert.Toast({
          icon: 'warning',
          title: t('backup.sync_partial', `ซิงค์สำเร็จ ${res.synced_count} ไฟล์ มีข้อผิดพลาดบางส่วน`),
        });
        fetchData();
      }
    } catch (err: any) {
      SwalAlert.Toast({
        icon: 'error',
        title: err?.response?.data?.detail || err.message,
      });
    } finally {
      setIsSyncingRemote(false);
    }
  };

  // Auto-refresh storage connection and disk space tabbar whenever settings element is displayed
  useEffect(() => {
    if (!showConfigPanel || !config) return;

    const targetType = config.storage_target_type;
    let shouldCheck = false;

    if (targetType === 'local') {
      shouldCheck = true;
    } else if (targetType === 'custom_local' && config.custom_local?.directory_path?.trim()) {
      shouldCheck = true;
    } else if (targetType === 'network_share' && config.network_share?.share_path?.trim()) {
      shouldCheck = true;
    } else if (targetType === 'sftp' && config.sftp?.host?.trim() && config.sftp?.username?.trim()) {
      shouldCheck = true;
    }

    if (shouldCheck) {
      handleTestConnection({ silent: true });
    }
  }, [showConfigPanel, config?.storage_target_type]);

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* 1. Live Job Progress Banner                                               */}
      {/* ========================================================================= */}
      {isJobActive && currentJob && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-lg transition-all duration-300 dark:border-gray-800 dark:bg-gray-900/60 lg:p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className={`rounded-xl p-2.5 ${
                  currentJob.status === 'failed'
                    ? 'bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-400'
                    : currentJob.status === 'completed'
                      ? 'bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400'
                      : 'bg-primary-50 text-primary dark:bg-primary-500/15 dark:text-primary-400'
                }`}
              >
                {currentJob.job_type === 'restore' ? <RotateCcw className="w-6 h-6 animate-spin" /> : <Activity className="w-6 h-6" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-base font-semibold text-gray-800 dark:text-white/90">
                    {currentJob.job_type === 'restore'
                      ? t('backup.system_restoration_active', 'System Restoration Active')
                      : t('backup.system_backup_active', 'System Backup Active')}
                  </h4>
                  <Badge size="sm" color={currentJob.status === 'completed' ? 'success' : currentJob.status === 'failed' ? 'error' : 'primary'}>
                    {currentJob.status.toUpperCase()}
                  </Badge>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{getStageLabel(currentJob.stage)}</p>
              </div>
            </div>

            {/* Metrics & Abort */}
            <div className="flex w-full items-center justify-between gap-6 md:w-auto md:justify-end md:border-l md:border-gray-200 md:pl-6 dark:md:border-white/[0.08]">
              <div className="flex items-center gap-4 text-xs font-medium text-gray-600 dark:text-gray-300">
                {currentJob.total_records > 0 && (
                  <div>
                    <span className="text-gray-400 dark:text-gray-500 block text-[10px] uppercase tracking-wide font-semibold">
                      {t('backup.records', 'RECORDS')}
                    </span>
                    {currentJob.records_processed.toLocaleString()} / {currentJob.total_records.toLocaleString()}
                  </div>
                )}
                {currentJob.total_files > 0 && (
                  <div>
                    <span className="text-gray-400 dark:text-gray-500 block text-[10px] uppercase tracking-wide font-semibold">
                      {t('backup.files', 'FILES')}
                    </span>
                    {currentJob.files_processed.toLocaleString()} / {currentJob.total_files.toLocaleString()}
                  </div>
                )}
                <div>
                  <span className="text-gray-400 dark:text-gray-500 block text-[10px] uppercase tracking-wide font-semibold">
                    {t('backup.elapsed_remaining', 'ELAPSED / REMAINING')}
                  </span>
                  {formatSeconds(currentJob.elapsed_seconds)} / ~{formatSeconds(currentJob.estimated_remaining_seconds)}
                </div>
              </div>

              {isJobRunning && canManageBackup && (
                <Button
                  size="sm"
                  variant="error-soft-outline"
                  className="flex items-center gap-1.5"
                  onClick={handleCancelJob}
                  disabled={isCancelling}
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  {isCancelling ? t('backup.cancelling', 'Cancelling...') : t('backup.cancel_task', 'Cancel Task')}
                </Button>
              )}
            </div>
          </div>

          {/* Animated Progress Bar */}
          <div className="mt-5 border-t border-gray-100 pt-4 dark:border-gray-800">
            <div className="mb-1.5 flex justify-between text-xs font-semibold text-gray-700 dark:text-gray-300">
              <span>{t('backup.progress', 'Progress')}</span>
              <span>{currentJob.progress_percent}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.08]">
              <div
                className={`h-2 rounded-full transition-all duration-300 ${
                  currentJob.status === 'failed' ? 'bg-error' : currentJob.status === 'completed' ? 'bg-success' : 'bg-primary'
                }`}
                style={{ width: `${currentJob.progress_percent}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {downloadProgress && (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex items-center gap-3">
            <Download className="h-5 w-5 shrink-0 text-gray-600 dark:text-gray-300" />
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-3 text-sm font-medium text-gray-800 dark:text-white/90">
                <span className="truncate">{downloadProgress.filename}</span>
                <span className="shrink-0">
                  {downloadProgress.status === 'interrupted'
                    ? t('backup.download_interrupted', 'Download interrupted by page refresh')
                    : downloadProgress.percent > 0
                      ? `${downloadProgress.percent}%`
                      : t('backup.downloading_archive', 'Downloading backup archive')}
                </span>
              </div>
              {/* Animated Progress Bar */}
              <div className="mt-5 border-t border-gray-100 pt-4 dark:border-gray-800">
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.08]">
                  <div className={`h-2 rounded-full transition-all duration-300 bg-primary`} style={{ width: `${downloadProgress.percent}%` }} />
                </div>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {downloadProgress.loadedMb} MB / {downloadProgress.totalMb} MB
              </p>
            </div>
            {downloadProgress.status === 'downloading' ? (
              <Button size="sm" variant="error-soft-outline" onClick={handleCancelDownload}>
                <X className="h-4 w-4" />
                {t('backup.btn_cancel', 'Cancel')}
              </Button>
            ) : (
              <Button size="sm" variant="primary-soft-outline" onClick={() => setDownloadProgress(null)}>
                <X className="h-4 w-4" />
                {t('backup.dismiss', 'Dismiss')}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. Overview Metrics Cards                                                 */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900/40 shadow-theme-xs flex items-center gap-4">
          <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 shrink-0">
            <Database className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 truncate">{t('backup.total_backups', 'Total Backups')}</p>
            <h3 className="text-2xl font-semibold text-gray-800 dark:text-white/90 mt-1">{stats?.total_backups ?? 0}</h3>
            <span className="text-xs text-gray-500 dark:text-gray-400 truncate block mt-0.5">
              {stats?.full_backups ?? 0} Full | {stats?.differential_backups ?? 0} Diff | {stats?.incremental_backups ?? 0} Inc
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900/40 shadow-theme-xs flex items-center gap-4">
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 shrink-0">
            <HardDrive className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 truncate">
              {t('backup.total_storage', 'Total Archive Storage')}
            </p>
            <h3 className="text-2xl font-semibold text-gray-800 dark:text-white/90 mt-1">{stats?.total_size_formatted || '0.00 MB'}</h3>
            <span className="text-xs text-gray-500 dark:text-gray-400 truncate block mt-0.5">
              {t('backup.compressed_archives', 'Compressed Archives')}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900/40 shadow-theme-xs flex items-center gap-4">
          <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 truncate">
              {t('backup.last_backup_run', 'Last Backup Run')}
            </p>
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90 mt-1 truncate">
              {stats?.last_backup_at ? new Date(stats.last_backup_at).toLocaleString() : t('backup.never', 'Never')}
            </h3>
            <span className="text-xs text-gray-500 dark:text-gray-400 truncate block mt-0.5">
              Full: {stats?.last_full_backup_at ? new Date(stats.last_full_backup_at).toLocaleDateString() : t('backup.none', 'None')}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900/40 shadow-theme-xs flex items-center gap-4">
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 shrink-0">
            <Layers className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 truncate">
              {t('backup.automation_schedule', 'Automation Schedule')}
            </p>
            <h3 className="text-base font-semibold text-gray-800 dark:text-white/90 mt-1 flex items-center gap-1.5">
              {config?.enabled ? (
                <span className="text-success-600 dark:text-success-400 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-success animate-pulse" /> {t('backup.active', 'Active')} ({config.schedule_interval_hours}
                  h)
                </span>
              ) : (
                <span className="text-gray-400 dark:text-gray-500">{t('backup.disabled', 'Disabled')}</span>
              )}
            </h3>
            <span className="text-xs text-gray-500 dark:text-gray-400 truncate block mt-0.5">
              {t('backup.target', 'Target')}: {config?.storage_target_type || 'local'}
            </span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. Action Toolbar                                                         */}
      {/* ========================================================================= */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-lg dark:border-gray-800 dark:bg-white/[0.03] lg:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          {canManageBackup && (
            <>
              <Button
                size="sm"
                variant="success-soft-outline"
                className="flex items-center gap-2"
                onClick={() => setIsCreateModalOpen(true)}
                disabled={isJobRunning}
              >
                <Play className="w-4 h-4 fill-current" />
                {t('backup.btn_create_backup', 'Create Backup Now')}
              </Button>

              <Button
                size="sm"
                variant="info-soft-outline"
                className="flex items-center gap-2"
                onClick={() => setIsUploadModalOpen(true)}
                disabled={isJobRunning}
              >
                <Upload className="w-4 h-4" />
                {t('backup.btn_upload', 'Upload Archive')}
              </Button>
            </>
          )}

          <Button size="sm" variant="warning-soft-outline" className="flex items-center gap-2" onClick={() => setShowConfigPanel(!showConfigPanel)}>
            <Sliders className="w-4 h-4" />
            {showConfigPanel ? t('backup.btn_hide_config', 'Hide Configuration') : t('backup.btn_scheduler_config', 'Backup Settings & Storage')}
          </Button>

          <Button size="sm" variant="primary-soft-outline" onClick={fetchData} disabled={isLoading} className="px-3">
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. Configuration Settings Panel (Collapsible)                            */}
      {/* ========================================================================= */}
      {showConfigPanel && config && (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-lg dark:border-gray-800 dark:bg-white/[0.03] lg:p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-4">
            <div>
              <h3 className="text-xl font-semibold text-gray-800 dark:text-white/90">
                {t('backup.schedule_storage_title', 'Backup Schedule & Storage Destination')}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('backup.schedule_storage_desc', 'Configure automated schedules, destination paths, and retention rules.')}
              </p>
            </div>
            <Button size="sm" variant="success-soft-outline" onClick={() => handleSaveConfig()} disabled={isSavingConfig || !canManageBackup}>
              {isSavingConfig ? t('backup.btn_saving', 'Saving...') : t('backup.btn_save_config', 'Save Configuration')}
            </Button>
          </div>

          <form onSubmit={handleSaveConfig} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Section A: Automated Schedule */}
            <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/40">
              <h4 className="font-semibold text-sm text-gray-800 dark:text-white/90 flex items-center gap-2">
                <Clock className="w-4 h-4 text-brand-500" />
                {t('backup.automated_scheduling', 'Automated Scheduling')}
              </h4>

              <div className="flex items-center justify-between">
                <label htmlFor="config-automated-enabled" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                  {t('backup.enable_automated_backup', 'Enable Automated Backup')}
                </label>
                <Switch
                  id="config-automated-enabled"
                  checked={config.enabled}
                  onCheckedChange={(checked) => setConfig({ ...config, enabled: !!checked })}
                  disabled={!canManageBackup}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                  {t('backup.backup_frequency_hours', 'Backup Frequency (Hours)')}
                </label>
                <Input
                  type="number"
                  min="1"
                  max="720"
                  value={config.schedule_interval_hours}
                  onChange={(e) => setConfig({ ...config, schedule_interval_hours: parseInt(e.target.value) })}
                  onBlur={(e) => setConfig({ ...config, schedule_interval_hours: parseInt(e.target.value) || 24 })}
                  disabled={!canManageBackup}
                  className="h-10 w-full px-3 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                  {t('backup.full_backup_interval_days', 'Full Backup Interval (Days)')}
                </label>
                <Input
                  type="number"
                  min="1"
                  max="365"
                  value={config.full_backup_interval_days}
                  onChange={(e) => setConfig({ ...config, full_backup_interval_days: parseInt(e.target.value) })}
                  onBlur={(e) => setConfig({ ...config, full_backup_interval_days: parseInt(e.target.value) || 7 })}
                  disabled={!canManageBackup}
                  className="h-10 w-full px-3 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                  {t('backup.default_automated_type', 'Default Automated Type')}
                </label>
                <Select
                  value={config.auto_backup_type}
                  onValueChange={(val) => setConfig({ ...config, auto_backup_type: val as any })}
                  disabled={!canManageBackup}
                >
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder={t('backup.default_automated_type', 'Default Automated Type')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="incremental">{t('backup.incremental_option', 'Incremental (Changes since last backup)')}</SelectItem>
                    <SelectItem value="differential">{t('backup.differential_option', 'Differential (Changes since last full)')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Section B: Storage Target Destination */}
            <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/40">
              <h4 className="font-semibold text-sm text-gray-800 dark:text-white/90 flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-brand-500" />
                {t('backup.destination_target', 'Destination Target')}
              </h4>

              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">{t('backup.storage_type', 'Storage Type')}</label>
                <Select
                  value={config.storage_target_type}
                  onValueChange={(value) => setConfig({ ...config, storage_target_type: value as StorageTargetType })}
                  disabled={!canManageBackup}
                >
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder={t('backup.storage_type', 'Storage Type')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local">{t('backup.storage_local', 'Server Default Storage (storage/backups)')}</SelectItem>
                    <SelectItem value="custom_local">{t('backup.storage_custom_local', 'Custom Local Drive / Directory Path')}</SelectItem>
                    <SelectItem value="network_share">{t('backup.storage_network_share', 'Network Share / SMB (UNC Path)')}</SelectItem>
                    <SelectItem value="sftp">{t('backup.storage_sftp', 'Remote SFTP Server')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Custom Local Directory */}
              {config.storage_target_type === 'custom_local' && (
                <div>
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                    {t('backup.custom_local_path', 'Directory Path (e.g. D:/LABEL_BACKUPS or /mnt/backups)')}
                  </label>
                  <Input
                    type="text"
                    placeholder="e.g. D:/LABEL_BACKUPS or /mnt/backups"
                    value={config.custom_local?.directory_path || ''}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        custom_local: { directory_path: e.target.value },
                      })
                    }
                    className="h-10 w-full px-3 text-sm"
                  />
                </div>
              )}

              {/* Network Share SMB */}
              {config.storage_target_type === 'network_share' && (
                <div className="space-y-2">
                  <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                      {t('backup.network_share_path', 'UNC Share Path (e.g. \\\\192.168.0.250\\share)')}
                    </label>
                    <Input
                      type="text"
                      placeholder="e.g. \\\\192.168.0.250\\share"
                      value={config.network_share?.share_path || ''}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          network_share: {
                            share_path: e.target.value,
                            username: config.network_share?.username || '',
                            password: config.network_share?.password || '',
                            domain: config.network_share?.domain || '',
                          },
                        })
                      }
                      className="h-10 w-full px-3 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                        {t('backup.network_username', 'Username')}
                      </label>
                      <Input
                        type="text"
                        placeholder="Administrator"
                        value={config.network_share?.username || ''}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            network_share: {
                              share_path: config.network_share?.share_path || '',
                              password: config.network_share?.password || '',
                              domain: config.network_share?.domain || '',
                              username: e.target.value,
                            },
                          })
                        }
                        className="h-10 w-full px-3 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                        {t('backup.network_password', 'Password')}
                      </label>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        value={config.network_share?.password || ''}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            network_share: {
                              share_path: config.network_share?.share_path || '',
                              username: config.network_share?.username || '',
                              domain: config.network_share?.domain || '',
                              password: e.target.value,
                            },
                          })
                        }
                        className="h-10 w-full px-3 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                      {t('backup.network_domain', 'Domain / Workgroup (Optional)')}
                    </label>
                    <Input
                      type="text"
                      placeholder="WORKGROUP"
                      value={config.network_share?.domain || ''}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          network_share: {
                            share_path: config.network_share?.share_path || '',
                            username: config.network_share?.username || '',
                            password: config.network_share?.password || '',
                            domain: e.target.value,
                          },
                        })
                      }
                      className="h-10 w-full px-3 text-sm"
                    />
                  </div>
                </div>
              )}

              {/* SFTP Remote Server */}
              {config.storage_target_type === 'sftp' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                        {t('backup.sftp_host', 'Host / IP Address')}
                      </label>
                      <Input
                        type="text"
                        placeholder="192.168.1.100"
                        value={config.sftp?.host || ''}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            sftp: {
                              host: e.target.value,
                              port: config.sftp?.port || 22,
                              username: config.sftp?.username || '',
                              password: config.sftp?.password || '',
                              remote_path: config.sftp?.remote_path || '/backups',
                            },
                          })
                        }
                        className="h-10 w-full px-3 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">{t('backup.sftp_port', 'Port')}</label>
                      <Input
                        type="number"
                        placeholder="22"
                        value={config.sftp?.port || 22}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            sftp: {
                              host: config.sftp?.host || '',
                              port: parseInt(e.target.value) || 22,
                              username: config.sftp?.username || '',
                              password: config.sftp?.password || '',
                              remote_path: config.sftp?.remote_path || '/backups',
                            },
                          })
                        }
                        className="h-10 w-full px-3 text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                        {t('backup.sftp_username', 'SSH Username')}
                      </label>
                      <Input
                        type="text"
                        placeholder="backup_user"
                        value={config.sftp?.username || ''}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            sftp: {
                              host: config.sftp?.host || '',
                              port: config.sftp?.port || 22,
                              password: config.sftp?.password || '',
                              remote_path: config.sftp?.remote_path || '/backups',
                              username: e.target.value,
                            },
                          })
                        }
                        className="h-10 w-full px-3 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                        {t('backup.sftp_password', 'SSH Password')}
                      </label>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        value={config.sftp?.password || ''}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            sftp: {
                              host: config.sftp?.host || '',
                              port: config.sftp?.port || 22,
                              username: config.sftp?.username || '',
                              remote_path: config.sftp?.remote_path || '/backups',
                              password: e.target.value,
                            },
                          })
                        }
                        className="h-10 w-full px-3 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                      {t('backup.sftp_remote_path', 'Remote Directory')}
                    </label>
                    <Input
                      type="text"
                      placeholder="/var/backups/label-inspection"
                      value={config.sftp?.remote_path || ''}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          sftp: {
                            host: config.sftp?.host || '',
                            port: config.sftp?.port || 22,
                            username: config.sftp?.username || '',
                            password: config.sftp?.password || '',
                            remote_path: e.target.value,
                          },
                        })
                      }
                      className="h-10 w-full px-3 text-sm"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                <Button
                  type="button"
                  variant="info-soft-outline"
                  size="sm"
                  className="w-full"
                  onClick={() => handleTestConnection({ silent: false })}
                  disabled={isTestingConnection}
                >
                  {isTestingConnection
                    ? t('backup.testing_connection', 'Testing Access...')
                    : t('backup.test_connection_btn', 'Verify Username, Password & Storage Path')}
                </Button>
                {config.storage_target_type !== 'local' && (
                  <Button
                    type="button"
                    variant="primary-soft-outline"
                    size="sm"
                    className="w-full flex items-center justify-center gap-1.5"
                    onClick={handleSyncRemote}
                    disabled={isSyncingRemote || !canManageBackup}
                  >
                    <CloudUpload className={`w-3.5 h-3.5 ${isSyncingRemote ? 'animate-bounce' : ''}`} />
                    {isSyncingRemote
                      ? t('backup.syncing_remote', 'กำลังซิงค์ไฟล์ไปยังปลายทาง...')
                      : t('backup.sync_remote_btn', 'ซิงค์ไฟล์ไปยังปลายทาง')}
                  </Button>
                )}
              </div>

              {connectionTestResult && (
                <div className="space-y-3 mt-1">
                  {/* Status Banner */}
                  <div
                    className={`rounded-xl border px-4 py-3 text-sm flex items-start gap-2.5 ${
                      connectionTestResult.status === 'success'
                        ? 'border-success-200 bg-success-50 text-success-700 dark:border-success-700/40 dark:bg-success-950/30 dark:text-success-300'
                        : 'border-error-200 bg-error-50 text-error-800 dark:border-error-700/40 dark:bg-error-950/30 dark:text-error-300'
                    }`}
                  >
                    {connectionTestResult.status === 'success' ? (
                      <CheckCircle2 className="w-5 h-5 text-success-600 dark:text-success-400 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-5 h-5 text-error-600 dark:text-error-400 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium leading-relaxed">
                        {connectionTestResult.status === 'success'
                          ? `Verified 100%! Authenticated as User '${connectionTestResult.details?.auth_user || config.network_share?.username || 'Administrator'}'. Read & Write test passed.`
                          : connectionTestResult.message}
                      </p>
                    </div>
                  </div>

                  {/* แสดงเฉพาะ tabbar แบบ 0-100gb ใช้ไปแล้ว 15gb */}
                  {connectionTestResult.status === 'success' &&
                    connectionTestResult.details?.total_gb !== undefined &&
                    Number(connectionTestResult.details.total_gb) > 0 &&
                    (() => {
                      const totalGb = Number(connectionTestResult.details.total_gb) || 0;
                      const freeGb = Number(connectionTestResult.details.free_gb) || 0;
                      const usedGb =
                        connectionTestResult.details.used_gb !== undefined
                          ? Number(connectionTestResult.details.used_gb)
                          : Math.max(0, totalGb - freeGb);
                      const usedPercent =
                        connectionTestResult.details.used_percent !== undefined
                          ? Number(connectionTestResult.details.used_percent)
                          : totalGb > 0
                            ? (usedGb / totalGb) * 100
                            : 0;

                      const gradientBg =
                        usedPercent >= 90
                          ? 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)'
                          : usedPercent >= 75
                            ? 'linear-gradient(90deg, #f59e0b 0%, #ea580c 100%)'
                            : 'linear-gradient(90deg, #3b82f6 0%, #10b981 100%)';

                      const pctWidth = Math.min(100, Math.max(3, usedPercent));

                      return (
                        <div className="rounded-xl border border-gray-200 bg-gray-50/90 p-4 shadow-theme-xs dark:border-gray-800 dark:bg-gray-900/60 space-y-2.5">
                          <div className="flex justify-between pb-1 items-center text-xs font-semibold text-gray-700 dark:text-gray-300">
                            <span className="flex items-center gap-1.5">
                              <HardDrive className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                              {t('backup.storage_capacity_title', 'Destination Storage')}
                            </span>
                            <span className="text-blue-600 dark:text-blue-400 font-bold">
                              {t('backup.storage_used', 'ใช้ไปแล้ว')} {usedGb.toFixed(1)} GB / {totalGb.toFixed(0)} GB ({usedPercent.toFixed(1)}%)
                            </span>
                          </div>

                          {/* Tabbar Track: 0 - 100 GB (ส่วนที่ใช้เป็น Gradient สีสดใส, ส่วนที่เหลือเป็นสีเทาชัดเจน) */}
                          <div
                            className="w-full rounded-full h-4 overflow-hidden relative shadow-inner flex mb-1"
                            style={{
                              backgroundColor: '#bfc8da',
                              background: 'linear-gradient(90deg, #9ca3af 0%, #a0aabe 100%)',
                            }}
                          >
                            {/* ส่วนที่ใช้ไปแล้ว (Gradient สีสดใส) */}
                            <div
                              className="h-full transition-all duration-500 ease-out shadow-sm"
                              style={{
                                width: `${pctWidth}%`,
                                background: gradientBg,
                              }}
                            />
                            {/* ส่วนที่เหลือจากที่ใช้ไปแล้ว (สีเทาชัดเจน) */}
                            <div
                              className="h-full flex-1 transition-all duration-500 ease-out"
                              style={{
                                background: 'linear-gradient(90deg, #d7e1f3 0%, #ccd7ec 100%)',
                              }}
                            />
                          </div>

                          {/* Range Markers: 0 GB ... ใช้ไปแล้ว & ว่าง ... Total GB */}
                          <div className="flex justify-between items-center text-[11px] font-medium text-gray-500 dark:text-gray-400 px-0.5">
                            <span>0 GB</span>
                            <div className="flex items-center gap-3">
                              <span className="flex items-center gap-1 text-gray-800 dark:text-gray-200 font-semibold">
                                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#3b82f6' }} />
                                {t('backup.storage_used', 'ใช้ไปแล้ว')} {usedGb.toFixed(1)} GB
                              </span>
                              <span className="flex items-center gap-1 text-gray-600 dark:text-gray-300 font-medium">
                                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: '#6b7280' }} />
                                {t('backup.storage_free', 'ว่าง')} {freeGb.toFixed(1)} GB
                              </span>
                            </div>
                            <span>{totalGb.toFixed(0)} GB</span>
                          </div>
                        </div>
                      );
                    })()}
                </div>
              )}
            </div>

            {/* Section C: Retention Rules */}
            <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/40">
              <h4 className="font-semibold text-sm text-gray-800 dark:text-white/90 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-brand-500" />
                {t('backup.retention_policies', 'Retention Policies')}
              </h4>

              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                  {t('backup.retention_days', 'Retention Days (Expire older than)')}
                </label>
                <Input
                  type="number"
                  min="1"
                  max="3650"
                  value={config.retention_days}
                  onChange={(e) => setConfig({ ...config, retention_days: parseInt(e.target.value)})}
                  onBlur={(e) => setConfig({ ...config, retention_days: parseInt(e.target.value) || 30 })}
                  disabled={!canManageBackup}
                  className="h-10 w-full px-3 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                  {t('backup.max_backup_count', 'Maximum Backup Count')}
                </label>
                <Input
                  type="number"
                  min="1"
                  max="1000"
                  value={config.max_backup_count}
                  onChange={(e) => setConfig({ ...config, max_backup_count: parseInt(e.target.value)})}
                  onBlur={(e) => setConfig({ ...config, max_backup_count: parseInt(e.target.value) || 50 })}
                  disabled={!canManageBackup}
                  className="h-10 w-full px-3 text-sm"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <label htmlFor="config-retain-local-copy" className="text-xs font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
                  {t('backup.retain_local_copy', 'Retain Local Copy when Uploading (Recommended)')}
                </label>
                <Switch
                  id="config-retain-local-copy"
                  checked={config.retain_local_copy ?? true}
                  onCheckedChange={(checked) => setConfig({ ...config, retain_local_copy: !!checked })}
                  disabled={!canManageBackup}
                />
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. Backup History Table & Filter                                          */}
      {/* ========================================================================= */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-theme-lg dark:border-gray-800 dark:bg-white/[0.03] overflow-hidden">
        <div className="flex flex-col lg:flex-row gap-4 p-5 border-b border-gray-200 dark:border-gray-800 items-center justify-between lg:p-6">
          <div className="text-center sm:text-left">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">{t('backup.history_table_title', 'Backup Archives')}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('backup.total_archives_available', 'Total {{count}} archives available', { count: totalCount })}
            </p>
          </div>
          {/* Filter and Search */}
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 p-1 bg-gray-50 dark:bg-gray-900/60 text-xs">
              {[
                { key: 'all', label: t('backup.filter_all', 'All') },
                { key: 'full', label: t('backup.filter_full', 'Full') },
                { key: 'differential', label: t('backup.filter_diff', 'Differential') },
                { key: 'incremental', label: t('backup.filter_inc', 'Incremental') },
              ].map(({ key, label }) => (
                <Button
                  key={key}
                  size="sm"
                  variant={selectedTypeFilter === key ? 'primary' : 'primary-soft-outline'}
                  onClick={() => setSelectedTypeFilter(key)}
                  className={`!h-7 !px-3 !py-1 text-xs !rounded-md font-medium transition-colors ${
                    selectedTypeFilter === key
                      ? 'shadow-theme-xs font-semibold'
                      : '!border-transparent !bg-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white'
                  }`}
                >
                  {label}
                </Button>
              ))}
            </div>

            <form onSubmit={handleSearchSubmit} className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400 dark:text-gray-500 z-10 pointer-events-none" />
              <Input
                type="text"
                placeholder={t('backup.search_placeholder', 'Search backup ID or filename...')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-4 text-sm"
              />
            </form>

            {config?.storage_target_type && config.storage_target_type !== 'local' && (
              <div title={t('backup.sync_remote_tooltip', 'ซิงค์ไฟล์สำรองทั้งหมดที่ยังไม่ได้ส่งไปยังปลายทาง')}>
                <Button
                  type="button"
                  variant="primary-soft-outline"
                  size="sm"
                  className="!h-10 !px-3 text-xs flex items-center gap-1.5 shrink-0"
                  onClick={handleSyncRemote}
                  disabled={isSyncingRemote || !canManageBackup}
                >
                  <CloudUpload className={`w-4 h-4 ${isSyncingRemote ? 'animate-bounce text-brand-500' : ''}`} />
                  <span className="hidden sm:inline">
                    {isSyncingRemote ? t('backup.syncing', 'กำลังซิงค์...') : t('backup.sync_remote_short', 'ซิงค์ปลายทาง')}
                  </span>
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-700 dark:text-gray-300">
            <thead className="bg-gray-50 dark:bg-gray-900/60 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800">
              <tr>
                <th className="px-5 py-3.5">{t('backup.col_archive_file', 'Archive File / ID')}</th>
                <th className="px-5 py-3.5">{t('backup.col_type', 'Type')}</th>
                <th className="px-5 py-3.5">{t('backup.col_records', 'Database Records')}</th>
                <th className="px-5 py-3.5">{t('backup.col_files', 'Files')}</th>
                <th className="px-5 py-3.5">{t('backup.col_storage_path', 'Storage Path')}</th>
                <th className="px-5 py-3.5">{t('backup.col_size', 'Size')}</th>
                <th className="px-5 py-3.5">{t('backup.col_created', 'Created Date / Operator')}</th>
                <th className="px-5 py-3.5 text-right">{t('backup.col_actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
              {backups.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-gray-400 dark:text-gray-500">
                    <div className="max-w-xs mx-auto text-center space-y-2">
                      <FileArchive className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600" />
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        {t('backup.no_backups_found', 'No backup archives found.')}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                backups.map((item) => (
                  <tr key={item.backup_id} className="hover:bg-gray-50/60 dark:hover:bg-gray-900/40 transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-gray-800 dark:text-white/90 flex items-center gap-2">
                        <FileArchive className="w-4 h-4 text-brand-500 shrink-0" />
                        <span className="truncate max-w-[220px]" title={item.filename}>
                          {item.filename}
                        </span>
                      </div>
                      {item.note && (
                        <span className="text-xs text-gray-400 dark:text-gray-500 block truncate max-w-[220px] mt-0.5" title={item.note}>
                          {item.note}
                        </span>
                      )}
                    </td>

                    <td className="px-5 py-4">
                      {item.backup_type === 'full' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                          Full
                        </span>
                      ) : item.backup_type === 'differential' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                          Differential
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          Incremental
                        </span>
                      )}
                    </td>

                    <td className="px-5 py-4 text-xs font-medium text-gray-700 dark:text-gray-300">
                      {item.records_count?.toLocaleString() ?? 0} {t('backup.records_unit', 'records')}
                    </td>

                    <td className="px-5 py-4 text-xs font-medium text-gray-700 dark:text-gray-300">
                      {item.files_count?.toLocaleString() ?? 0} {t('backup.files_unit', 'files')}
                    </td>

                    <td className="px-5 py-4 font-mono text-xs text-gray-600 dark:text-gray-300">
                      <div
                        className="flex items-center gap-1.5 max-w-[260px] truncate"
                        title={item.storage_path || item.remote_destination || `storage/backups/${item.filename}`}
                      >
                        <HardDrive className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span className="truncate">{item.storage_path || item.remote_destination || `storage/backups/${item.filename}`}</span>
                      </div>
                    </td>

                    <td className="px-5 py-4 font-mono text-xs text-gray-600 dark:text-gray-300">
                      {(item.size_bytes / (1024 * 1024)).toFixed(2)} MB
                    </td>

                    <td className="px-5 py-4 text-xs text-gray-500 dark:text-gray-400">
                      <div>{new Date(item.created_at).toLocaleString()}</div>
                      <div className="text-[11px] text-gray-400 dark:text-gray-500">
                        {t('backup.by_operator', 'by')} {item.created_by}
                      </div>
                    </td>

                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Download Archive */}
                        <Button
                          size="sm"
                          variant="info-soft-outline"
                          onClick={() => handleDownloadBackup(item)}
                          disabled={Boolean(downloadingId)}
                          // title={t('backup.download_archive', 'Download Archive')}
                          className="!h-8 !w-8 !p-0 flex items-center justify-center !rounded-lg"
                        >
                          <Download className="w-4 h-4" />
                        </Button>

                        {/* Restore */}
                        {canManageBackup && (
                          <Button
                            size="sm"
                            variant="warning-soft-outline"
                            onClick={() => handleOpenRestoreModal(item)}
                            disabled={isJobRunning}
                            // title={t('backup.restore_backup', 'Restore Backup')}
                            className="!h-8 !w-8 !p-0 flex items-center justify-center !rounded-lg"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </Button>
                        )}

                        {/* Delete */}
                        {canManageBackup && (
                          <Button
                            size="sm"
                            variant="error-soft-outline"
                            onClick={() => handleDeleteBackup(item)}
                            disabled={isJobRunning}
                            // title={t('backup.delete_archive', 'Delete Archive')}
                            className="!h-8 !w-8 !p-0 flex items-center justify-center !rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <div>
              {t('backup.page_indicator', 'Page {{page}} of {{totalPages}} ({{totalCount}} total archives)', {
                page,
                totalPages,
                totalCount,
              })}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="primary-soft-outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                {t('backup.btn_previous', 'Previous')}
              </Button>
              <Button
                size="sm"
                variant="primary-soft-outline"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                {t('backup.btn_next', 'Next')}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 6. Modal: Create Backup                                                   */}
      {/* ========================================================================= */}
      <Modal isOpen={isCreateModalOpen} size='xl' onClose={() => setIsCreateModalOpen(false)}>
        <div className="p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
              <Play className="w-6 h-6 fill-current" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">{t('backup.modal_create_title', 'Create System Backup')}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('backup.modal_create_desc', 'Select backup type and options to capture data.')}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-semibold text-gray-800 dark:text-white/90 block">{t('backup.select_backup_type', 'Backup Type')}</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div
                onClick={() => setCreateType('full')}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  createType === 'full'
                    ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-950/30 ring-2 ring-brand-500/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className="font-semibold text-sm text-gray-800 dark:text-white/90">{t('backup.card_full_title', 'Full Backup')}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t('backup.card_full_desc', 'Complete system & database snapshot (Base point)')}
                </div>
              </div>

              <div
                onClick={() => setCreateType('differential')}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  createType === 'differential'
                    ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-950/30 ring-2 ring-brand-500/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className="font-semibold text-sm text-gray-800 dark:text-white/90">{t('backup.card_diff_title', 'Differential')}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('backup.card_diff_desc', 'Changes since latest Full backup')}</div>
              </div>

              <div
                onClick={() => setCreateType('incremental')}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  createType === 'incremental'
                    ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-950/30 ring-2 ring-brand-500/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className="font-semibold text-sm text-gray-800 dark:text-white/90">{t('backup.card_inc_title', 'Incremental')}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t('backup.card_inc_desc', 'Changes since last backup of any type')}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch id="create_inc_files" checked={createIncludeFiles} onCheckedChange={(checked) => setCreateIncludeFiles(!!checked)} />
            <label htmlFor="create_inc_files" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
              {t('backup.include_files_checkbox', 'Include Image Storage Files (/storage/uploads & profile)')}
            </label>
          </div>

          <div>
            <label htmlFor="create_note_input" className="text-sm font-semibold text-gray-800 dark:text-white/90 block mb-1">
              {t('backup.note_label', 'Backup Note (Optional)')}
            </label>
            <Input
              id="create_note_input"
              type="text"
              placeholder={t('backup.note_placeholder', 'e.g. Pre-Deployment Snapshot, Weekly Backup...')}
              value={createNote}
              onChange={(e) => setCreateNote(e.target.value)}
              className="h-10 w-full px-3 text-sm"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200 dark:border-gray-800">
            <Button variant="primary-soft-outline" onClick={() => setIsCreateModalOpen(false)}>
              {t('backup.btn_cancel', 'Cancel')}
            </Button>
            <Button variant="primary" onClick={handleCreateBackup} disabled={isCreating}>
              {isCreating ? t('backup.initiating', 'Initiating...') : t('backup.btn_start_create', 'Start Backup')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* 7. Modal: Restore Confirmation                                            */}
      {/* ========================================================================= */}
      <Modal isOpen={isRestoreModalOpen} onClose={() => setIsRestoreModalOpen(false)}>
        <div className="p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-warning-50 text-warning-600 dark:bg-warning-950/30 dark:text-warning-400">
              <RotateCcw className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">{t('backup.modal_restore_title', 'Restore System Data')}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('backup.modal_restore_desc', 'Restore database and images from selected archive chain.')}
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-warning-200 bg-warning-50 text-xs leading-relaxed text-warning-700 flex items-start gap-2.5 dark:border-warning-700/40 dark:bg-warning-950/20 dark:text-warning-300">
            <AlertTriangle className="w-5 h-5 shrink-0 text-warning-600 dark:text-warning-400 mt-0.5" />
            <div>
              <strong className="block font-semibold mb-0.5">{t('backup.restore_caution_title', 'Caution: Destructive Restore Operation')}</strong>
              {t('backup.restore_caution_text', 'Restoring will replace current PostgreSQL tables and storage images.')}
            </div>
          </div>

          {selectedRestoreBackup && (
            <div className="space-y-3 p-3.5 rounded-xl bg-gray-50 border border-gray-200 text-xs dark:bg-gray-900/40 dark:border-gray-800">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">{t('backup.target_archive', 'Target Archive:')}</span>
                <span className="font-semibold text-gray-800 dark:text-white/90">{selectedRestoreBackup.filename}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">{t('backup.restore_chain', 'Restore Chain:')}</span>
                <span className="font-semibold text-brand-600 dark:text-brand-400">
                  {restoreChainInfo.map((c) => c.backup_type).join(' -> ')} ({restoreChainInfo.length} {t('backup.steps_count', 'step(s)')})
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200 dark:border-gray-800">
            <Button variant="primary-soft-outline" onClick={() => setIsRestoreModalOpen(false)}>
              {t('backup.btn_cancel', 'Cancel')}
            </Button>
            <Button variant="warning-soft-outline" onClick={handleExecuteRestore} disabled={isRestoring}>
              {isRestoring ? t('backup.restoring_spinner', 'Initiating Restore...') : t('backup.btn_confirm_restore', 'Confirm & Start Restore')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* 8. Modal: Upload Backup Archive                                           */}
      {/* ========================================================================= */}
      <Modal isOpen={isUploadModalOpen} onClose={() => setIsUploadModalOpen(false)}>
        <form onSubmit={handleUploadBackup} className="p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
                {t('backup.modal_upload_title', 'Upload External Backup Archive')}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t('backup.modal_upload_desc', 'Upload a valid .tar.gz archive generated from this system.')}
              </p>
            </div>
          </div>

          <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-6 text-center hover:border-brand-500 transition-colors">
            <Input
              type="file"
              accept=".tar.gz,.tar"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              className="hidden"
              id="backup_file_input_orig"
            />
            <label htmlFor="backup_file_input_orig" className="cursor-pointer block space-y-2">
              <FileArchive className="w-10 h-10 text-gray-400 dark:text-gray-500 mx-auto" />
              <div className="text-sm font-medium text-gray-800 dark:text-white/90">
                {uploadFile ? uploadFile.name : t('backup.click_to_select_archive', 'Click to select .tar.gz archive')}
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">{t('backup.supported_formats', 'Supported formats: .tar.gz, .tar')}</p>
            </label>
          </div>

          {config && (
            <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-xs dark:bg-gray-900/40 dark:border-gray-800">
              <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                <HardDrive className="w-4 h-4 text-brand-500 shrink-0" />
                {t('backup.destination_target', 'Destination Target')}:
              </span>
              <span className="font-semibold text-gray-800 dark:text-white/90 truncate max-w-[280px]" title={
                config.storage_target_type === 'custom_local'
                  ? config.custom_local?.directory_path || 'Custom Local'
                  : config.storage_target_type === 'network_share'
                    ? config.network_share?.share_path || 'Network Share (SMB)'
                    : config.storage_target_type === 'sftp'
                      ? `${config.sftp?.host || 'SFTP'}:${config.sftp?.remote_path || '/backups'}`
                      : t('backup.storage_local', 'Server Default (storage/backups)')
              }>
                {config.storage_target_type === 'custom_local'
                  ? config.custom_local?.directory_path || 'Custom Local'
                  : config.storage_target_type === 'network_share'
                    ? config.network_share?.share_path || 'Network Share (SMB)'
                    : config.storage_target_type === 'sftp'
                      ? `${config.sftp?.host || 'SFTP'}:${config.sftp?.remote_path || '/backups'}`
                      : t('backup.storage_local', 'Server Default (storage/backups)')}
              </span>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-200 dark:border-gray-800">
            <Button variant="primary-soft-outline" onClick={() => setIsUploadModalOpen(false)}>
              {t('backup.btn_cancel', 'Cancel')}
            </Button>
            <Button variant="primary" type="submit" disabled={!uploadFile || isUploading}>
              {isUploading ? t('backup.uploading_spinner', 'Uploading...') : t('backup.btn_upload_confirm', 'Upload & Catalog Archive')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
