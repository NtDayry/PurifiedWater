import { useTranslation } from 'react-i18next';
import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import PageMeta from '@/components/common/PageMeta';
import BackupSettingsPanel from '../SettingsPage/BackupSettingsPanel';

export default function BackupRestorePage() {
  const { t } = useTranslation();

  return (
    <>
      <PageMeta
        title={t('backup.meta_title', 'System Backup & Recovery | PurifiedWater')}
        description={t('backup.panel_subtitle', 'Manage Full, Differential, and Incremental backups, automated schedules, and disaster recovery.')}
      />
      <PageBreadcrumb
        pageTitle={t('backup.panel_title', 'System Backup & Recovery')}
        pageSubTitle={t('backup.panel_subtitle', 'Manage Full, Differential, and Incremental backups, automated schedules, and disaster recovery.')}
      />
      <BackupSettingsPanel />
    </>
  );
}
