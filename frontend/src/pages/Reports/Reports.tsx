import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import PageMeta from '@/components/common/PageMeta';
import Reports from '@/components/reports/reports';
import { StreamlineFileReportIcon } from '@/icons';
import { useTranslation } from 'react-i18next';

export default function ReportsPage() {
  const { t } = useTranslation();

  return (
    <>
      <PageMeta title={t('page.reports.meta_title')} description={t('page.reports.meta_description')} />
      <PageBreadcrumb
        pageTitle={t('page.reports.title')}
        pageSubTitle={t('page.reports.subtitle')}
        icon={<StreamlineFileReportIcon className="inline-block mr-1 text-sky-500" width={50} height={50} />}
      />
      <div className="space-y-6">
        <Reports />
      </div>
    </>
  );
}
