import { useTranslation } from 'react-i18next';
import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import PageMeta from '@/components/common/PageMeta';
import PermissionsSettingsPanel from './PermissionsSettingsPanel';

export default function SettingsPage() {
  const { t } = useTranslation();

  return (
    <>
      <PageMeta title={t('page.settings.meta_title')} description={t('page.settings.meta_description')} />
      <PageBreadcrumb pageTitle={t('page.settings.title')} pageSubTitle={t('page.settings.subtitle')} />
      <PermissionsSettingsPanel />
    </>
  );
}
