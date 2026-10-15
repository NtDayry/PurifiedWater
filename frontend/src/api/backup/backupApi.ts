import { api, API_URL } from '@/api';

export type BackupType = 'full' | 'differential' | 'incremental';

export interface BackupItem {
  backup_id: string;
  backup_type: BackupType;
  filename: string;
  size_bytes: number;
  records_count: number;
  files_count: number;
  created_at: string;
  created_by: string;
  base_id?: string | null;
  parent_id?: string | null;
  from_timestamp?: string | null;
  to_timestamp?: string | null;
  include_files?: boolean;
  table_stats?: Record<string, number>;
  note?: string;
  sha256?: string;
  status: string;
  storage_path?: string;
  remote_synced?: boolean;
  remote_destination?: string;
}

export interface BackupStats {
  total_backups: number;
  full_backups: number;
  differential_backups: number;
  incremental_backups: number;
  total_size_bytes: number;
  total_size_formatted: string;
  last_backup_at?: string | null;
  last_full_backup_at?: string | null;
  last_differential_backup_at?: string | null;
  last_incremental_backup_at?: string | null;
}

export interface CustomLocalConfig {
  directory_path: string;
}

export interface NetworkShareConfig {
  share_path: string;
  username?: string;
  password?: string;
  domain?: string;
}

export interface SFTPConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  remote_path: string;
}

export type StorageTargetType = 'local' | 'custom_local' | 'network_share' | 'sftp';

export interface BackupConfig {
  enabled: boolean;
  schedule_interval_hours: number;
  full_backup_interval_days: number;
  auto_backup_type: 'incremental' | 'differential';
  retention_days: number;
  max_backup_count: number;
  include_files: boolean;
  last_run_at?: string | null;
  storage_target_type: StorageTargetType;
  retain_local_copy: boolean;
  custom_local?: CustomLocalConfig;
  network_share?: NetworkShareConfig;
  sftp?: SFTPConfig;
}

export interface TestStorageConnectionPayload {
  storage_target_type: StorageTargetType;
  custom_local?: CustomLocalConfig;
  network_share?: NetworkShareConfig;
  sftp?: SFTPConfig;
}

export interface StorageTestDetails {
  path?: string;
  share_path?: string;
  host?: string;
  port?: number;
  remote_path?: string;
  auth_user?: string;
  total_gb?: number;
  free_gb?: number;
  used_gb?: number;
  used_percent?: number;
  write_read_verified?: boolean;
}

export interface TestStorageConnectionResult {
  status: 'success' | 'error';
  target_type: string;
  latency_ms: number;
  message: string;
  details?: StorageTestDetails;
}

export interface BackupListResponse {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  items: BackupItem[];
}

export interface RestoreResponse {
  status: string;
  target_backup_id: string;
  restored_by: string;
  chain_steps: Array<{
    step: number;
    backup_id: string;
    backup_type: BackupType;
    records: number;
    files: number;
  }>;
  total_records: number;
  total_files: number;
  completed_at: string;
}

export interface BackupJobState {
  status: 'idle' | 'running' | 'cancelling' | 'completed' | 'failed' | 'cancelled';
  job_id?: string | null;
  job_type?: 'backup' | 'restore' | null;
  backup_type?: BackupType | null;
  operator_username?: string | null;
  stage?: string;
  progress_percent: number;
  records_processed: number;
  total_records: number;
  files_processed: number;
  total_files: number;
  started_at?: string | null;
  elapsed_seconds: number;
  estimated_remaining_seconds: number;
  error_message?: string | null;
}

export const getBackupStats = async (): Promise<BackupStats> => {
  const res = await api.get<BackupStats>(API_URL.BACKUP_STATS);
  return res.data;
};

export const getCurrentBackupJob = async (): Promise<BackupJobState> => {
  const res = await api.get<BackupJobState>(API_URL.BACKUP_CURRENT_JOB);
  return res.data;
};

export const cancelBackup = async (reason?: string) => {
  const res = await api.post(API_URL.BACKUP_CANCEL, { reason: reason || 'User requested stop' });
  return res.data;
};

export const getBackupList = async (params: {
  page?: number;
  limit?: number;
  search?: string;
  type?: string;
}): Promise<BackupListResponse> => {
  const res = await api.get<BackupListResponse>(API_URL.BACKUP_LIST, { params });
  return res.data;
};

export const getBackupInfo = async (backupId: string) => {
  const res = await api.get(`${API_URL.BACKUP_INFO}/${backupId}`);
  return res.data;
};

export const createBackup = async (data: {
  backup_type: BackupType;
  include_files: boolean;
  note?: string;
}) => {
  const res = await api.post(API_URL.BACKUP_CREATE, data, {
    timeout: 600000,
  });
  return res.data;
};

export const restoreBackup = async (data: {
  backup_id: string;
  restore_chain?: boolean;
}): Promise<RestoreResponse> => {
  const res = await api.post<RestoreResponse>(API_URL.BACKUP_RESTORE, data, {
    timeout: 600000,
  });
  return res.data;
};

export const deleteBackup = async (backupId: string) => {
  const res = await api.delete(`${API_URL.BACKUP}/${backupId}`);
  return res.data;
};

export const getBackupConfig = async (): Promise<BackupConfig> => {
  const res = await api.get<BackupConfig>(API_URL.BACKUP_CONFIG);
  return res.data;
};

export const updateBackupConfig = async (config: Partial<BackupConfig>) => {
  const res = await api.put(API_URL.BACKUP_CONFIG, config);
  return res.data;
};

export const uploadBackupFile = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await api.post(API_URL.BACKUP_UPLOAD, formData, {
    headers: API_URL.CONTENT_TYPE_FORMDATA,
    timeout: 600000,
  });
  return res.data;
};

export const downloadBackupArchiveDirect = (backupId: string, filename: string) => {
  const downloadUrl = `${API_URL.BASE_URL}${API_URL.BACKUP_DOWNLOAD}/${backupId}`;
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.setAttribute('download', filename);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  // Keep the anchor in the document until the browser has handled the click.
  // This is important in WebKit-based browsers, particularly when a navigation
  // or refresh immediately follows the download action.
  window.setTimeout(() => link.remove(), 0);
};

export const downloadBackupArchive = async (
  backupId: string,
  filename: string,
  options?: {
    signal?: AbortSignal;
    onProgress?: (percent: number, loaded: number, total?: number) => void;
  },
) => {
  const res = await api.get(`${API_URL.BACKUP_DOWNLOAD}/${backupId}`, {
    responseType: 'blob',
    timeout: 600000,
    signal: options?.signal,
    onDownloadProgress: (progressEvent) => {
      if (progressEvent.total) {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        options?.onProgress?.(percent, progressEvent.loaded, progressEvent.total);
      } else {
        options?.onProgress?.(0, progressEvent.loaded);
      }
    },
  });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Allow the browser to consume the object URL before releasing it. Immediate
  // revocation can cancel a retry after an earlier aborted download.
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
};

export const getDownloadUrl = (backupId: string) => {
  return `${API_URL.BASE_URL}${API_URL.BACKUP_DOWNLOAD}/${backupId}`;
};

export const testBackupStorageConnection = async (
  payload: TestStorageConnectionPayload,
): Promise<TestStorageConnectionResult> => {
  const res = await api.post<TestStorageConnectionResult>(
    `${API_URL.BACKUP_CONFIG}/test-connection`,
    payload,
    { timeout: 15000 },
  );
  return res.data;
};

export const syncBackupRemoteStorage = async (): Promise<{
  status: string;
  message: string;
  synced_count: number;
  total_checked: number;
  target_type: string;
  errors?: string[];
}> => {
  const res = await api.post(API_URL.BACKUP_SYNC_REMOTE, {}, { timeout: 300000 });
  return res.data;
};
