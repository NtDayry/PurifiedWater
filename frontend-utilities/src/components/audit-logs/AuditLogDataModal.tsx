import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Database, FileJson2, Rows3 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { formatDate } from '@/components/utils/date';
import type { AuditLogItem } from '@_types/audit_log';

interface AuditLogDataModalProps {
  log: AuditLogItem | null;
  isOpen: boolean;
  onClose: () => void;
}

function formatLabel(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

export default function AuditLogDataModal({ log, isOpen, onClose }: AuditLogDataModalProps) {
  const { t } = useTranslation();

  const formatJson = (data: Record<string, unknown> | null) => {
    if (!data) return t('page.audit_logs.modal.no_data');

    try {
      const formatted = JSON.stringify(data, null, 2);
      return formatted || t('page.audit_logs.modal.no_data');
    } catch {
      return t('page.audit_logs.modal.cannot_display');
    }
  };

  const oldData = useMemo(() => formatJson(log?.old_data ?? null), [log?.old_data, t]);
  const newData = useMemo(() => formatJson(log?.new_data ?? null), [log?.new_data, t]);

  if (!log) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} animation="slideUp" size="3xl">
      <div className="flex max-h-[calc(100vh-3rem)] w-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <div className="mb-5 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
            <Database className="size-6" />
          </div>

          <div className="min-w-0 flex-1">
            <h4 className="text-2xl font-semibold text-gray-800 dark:text-white/90">{t('page.audit_logs.modal.title')}</h4>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {formatLabel(log.action)} · {formatLabel(log.entity)}
              {log.entity_id ? ` · ID ${log.entity_id}` : ''}
            </p>
          </div>
        </div>

        <div className="mb-5 grid gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-300 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('page.audit_logs.modal.user')}</p>
            <p className="mt-1 font-medium text-gray-800 dark:text-white/90">{formatLabel(log.username)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('page.audit_logs.modal.date')}</p>
            <p className="mt-1 font-medium text-gray-800 dark:text-white/90">{formatDate(formatLabel(log.created_at))}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('page.audit_logs.modal.ip')}</p>
            <p className="mt-1 font-medium text-gray-800 dark:text-white/90">{formatLabel(log.ip_address)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{t('page.audit_logs.modal.user_agent')}</p>
            <p className="mt-1 line-clamp-2 font-medium text-gray-800 dark:text-white/90">{formatLabel(log.user_agent)}</p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="flex min-h-[22rem] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/60">
              <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                <Rows3 className="size-4 text-gray-500 dark:text-gray-400" />
                <div>
                  <h5 className="text-sm font-semibold text-gray-800 dark:text-white/90">{t('page.audit_logs.modal.old_data_title')}</h5>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('page.audit_logs.modal.old_data_subtitle')}</p>
                </div>
              </div>
              <pre className="min-h-0 flex-1 overflow-auto p-4 font-mono text-[12px] leading-5 text-gray-800 whitespace-pre-wrap break-words dark:text-gray-200 custom-scrollbar">
                {oldData}
              </pre>
            </section>

            <section className="flex min-h-[22rem] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/60">
              <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                <FileJson2 className="size-4 text-gray-500 dark:text-gray-400" />
                <div>
                  <h5 className="text-sm font-semibold text-gray-800 dark:text-white/90">{t('page.audit_logs.modal.new_data_title')}</h5>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('page.audit_logs.modal.new_data_subtitle')}</p>
                </div>
              </div>
              <pre className="min-h-0 flex-1 overflow-auto p-4 font-mono text-[12px] leading-5 text-gray-800 whitespace-pre-wrap break-words dark:text-gray-200 custom-scrollbar">
                {newData}
              </pre>
            </section>
          </div>
        </div>
      </div>
    </Modal>
  );
}
