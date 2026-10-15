import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, Database } from 'lucide-react';
import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import PageMeta from '@/components/common/PageMeta';
import Badge from '@/components/ui/badge/Badge';
import { useBackupJobStore } from '@/store/backupJob';
import PermissionsSettingsPanel from './PermissionsSettingsPanel';
import BackupSettingsPanel from './BackupSettingsPanel';

export default function SettingsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'permissions' | 'backup'>('permissions');

  const currentJob = useBackupJobStore((state) => state.currentJob);
  const initWs = useBackupJobStore((state) => state.initWs);

  useEffect(() => {
    const cleanup = initWs();
    return () => cleanup();
  }, [initWs]);

  const isRunning = currentJob?.status === 'running' || currentJob?.status === 'cancelling';
  const isCompleted = currentJob?.status === 'completed';

  return (
    <>
      <PageMeta title={t('page.settings.meta_title')} description={t('page.settings.meta_description')} />
      <PageBreadcrumb pageTitle={t('page.settings.title')} pageSubTitle={t('page.settings.subtitle')} />

      {/* Tabs Navigation */}
      <div className="flex border-b border-gray-200 dark:border-gray-800 mb-6 gap-2">
        <button
          onClick={() => setActiveTab('permissions')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
            activeTab === 'permissions'
              ? 'border-brand-500 text-brand-500 dark:border-brand-400 dark:text-brand-400 font-semibold'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
        >
          <Shield className="w-4 h-4" />
          {t('page.settings.tabs.permissions', 'Permissions & Access Control')}
        </button>

        <button
          onClick={() => setActiveTab('backup')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
            activeTab === 'backup'
              ? 'border-brand-500 text-brand-500 dark:border-brand-400 dark:text-brand-400 font-semibold'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>{t('page.settings.tabs.backup', 'System Backup & Recovery')}</span>
          {isRunning && (
            <Badge color="warning" size="sm" variant="solid" className="animate-pulse font-mono text-[10px] ml-1">
              {currentJob?.progress_percent || 0}%
            </Badge>
          )}
          {isCompleted && (
            <Badge color="success" size="sm" variant="solid" className="font-mono text-[10px] ml-1">
              ✓ 100%
            </Badge>
          )}
        </button>
      </div>

      {/* Tab Panels */}
      {activeTab === 'permissions' && <PermissionsSettingsPanel />}
      {activeTab === 'backup' && <BackupSettingsPanel />}
    </>
  );
}
