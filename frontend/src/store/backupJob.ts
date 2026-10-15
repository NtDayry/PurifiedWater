import { create } from 'zustand';
import { BackupJobState, getCurrentBackupJob, cancelBackup } from '@/api';

interface BackupJobStore {
  currentJob: BackupJobState | null;
  isConnected: boolean;
  isCancelling: boolean;
  initWs: () => () => void;
  setOptimisticJob: (job: Partial<BackupJobState>) => void;
  cancelActiveJob: (reason?: string) => Promise<any>;
}

let wsInstance: WebSocket | null = null;
let reconnectTimeout: number | null = null;
let timerInterval: number | null = null;
let subscriberCount = 0;

const getBackupWsUrl = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/backup`;
};

export const useBackupJobStore = create<BackupJobStore>((set, get) => ({
  currentJob: null,
  isConnected: false,
  isCancelling: false,

  setOptimisticJob: (job) => {
    const fullJob: BackupJobState = {
      status: 'running',
      job_id: null,
      job_type: 'backup',
      backup_type: 'full',
      operator_username: 'admin',
      stage: 'initializing',
      progress_percent: 5,
      records_processed: 0,
      total_records: 0,
      files_processed: 0,
      total_files: 0,
      started_at: new Date().toISOString(),
      elapsed_seconds: 0,
      estimated_remaining_seconds: 30,
      error_message: null,
      ...job,
    };
    set({ currentJob: fullJob });
  },

  cancelActiveJob: async (reason?: string) => {
    set({ isCancelling: true });
    try {
      const res = await cancelBackup(reason || 'User aborted');
      return res;
    } finally {
      set({ isCancelling: false });
    }
  },

  initWs: () => {
    subscriberCount += 1;

    // 1. Fetch initial status from REST API
    getCurrentBackupJob()
      .then((res: any) => {
        if (res) {
          const job = res.current_job !== undefined ? res.current_job : res;
          set({ currentJob: job });
        }
      })
      .catch(() => {});

    // 2. Setup 1-second accurate ticker for elapsed and estimated remaining time
    if (!timerInterval) {
      timerInterval = window.setInterval(() => {
        const { currentJob } = get();
        if (!currentJob) return;

        if (currentJob.status === 'running') {
          let elapsed = currentJob.elapsed_seconds || 0;
          if (currentJob.started_at) {
            const startMs = new Date(currentJob.started_at).getTime();
            if (!isNaN(startMs)) {
              elapsed = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
            } else {
              elapsed += 1;
            }
          } else {
            elapsed += 1;
          }

          const pct = currentJob.progress_percent || 0;
          let rem = currentJob.estimated_remaining_seconds ?? 15;
          if (rem > 1) {
            rem -= 1;
          }

          set({
            currentJob: {
              ...currentJob,
              elapsed_seconds: elapsed,
              estimated_remaining_seconds: rem,
            },
          });

          // Real-time browser document.title
          const typeLabel = currentJob.job_type === 'restore' ? 'Restoring' : 'Backup';
          document.title = `[${pct}%] ${typeLabel} (${rem}s) - PurifiedWater`;
        } else if (currentJob.status === 'completed') {
          document.title = `[✓ 100%] Backup Completed - PurifiedWater`;
        }
      }, 1000);
    }

    // 3. Connect WebSocket if not already connected
    const connect = () => {
      if (wsInstance && (wsInstance.readyState === WebSocket.OPEN || wsInstance.readyState === WebSocket.CONNECTING)) {
        return;
      }

      try {
        const ws = new WebSocket(getBackupWsUrl());
        wsInstance = ws;

        ws.onopen = () => {
          set({ isConnected: true });
          if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
            reconnectTimeout = null;
          }
        };

        ws.onmessage = (event) => {
          try {
            const raw = JSON.parse(event.data);
            const data = (raw?.type === 'backup_status' && raw?.data ? raw.data : raw);
            const payload = (data && data.current_job !== undefined ? data.current_job : data) as BackupJobState;
            if (!payload || !payload.status || payload.status === 'idle') {
              set({ currentJob: null });
              return;
            }

            let elapsed = payload.elapsed_seconds || 0;
            if (payload.started_at) {
              const startMs = new Date(payload.started_at).getTime();
              if (!isNaN(startMs)) {
                elapsed = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
              }
            }

            let rem = payload.estimated_remaining_seconds ?? 15;
            const currentRem = get().currentJob?.estimated_remaining_seconds;
            if (currentRem !== undefined && currentRem > 0 && rem > currentRem + 3) {
              rem = currentRem;
            }

            set({
              currentJob: {
                ...payload,
                elapsed_seconds: elapsed,
                estimated_remaining_seconds: rem,
              },
            });
          } catch (e) {
            console.error('Failed to parse backup WS payload:', e);
          }
        };

        ws.onclose = () => {
          set({ isConnected: false });
          if (subscriberCount > 0) {
            reconnectTimeout = window.setTimeout(() => {
              connect();
            }, 3000);
          }
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch (err) {
        console.error('WebSocket connection error:', err);
      }
    };

    connect();

    return () => {
      subscriberCount = Math.max(0, subscriberCount - 1);
      if (subscriberCount === 0) {
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
          reconnectTimeout = null;
        }
        if (timerInterval) {
          clearInterval(timerInterval);
          timerInterval = null;
        }
        if (wsInstance) {
          try {
            wsInstance.close();
          } catch {}
          wsInstance = null;
        }
      }
    };
  },
}));
