import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import PageMeta from '@/components/common/PageMeta';
import AlarmReports from '@/components/alarm-reports/AlarmReports';
import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function AlarmReportsPage() {
  const { t } = useTranslation();

  return (
    <>
      <PageMeta
        title={t('page.alarm_reports.meta_title')}
        description={t('page.alarm_reports.meta_description')}
      />
      <PageBreadcrumb
        pageTitle={t('page.alarm_reports.title')}
        pageSubTitle={t('page.alarm_reports.subtitle')}
        icon={<Bell className="inline-block mr-1 text-rose-500" width={40} height={40} />}
      />
      <div className="space-y-6">
        <AlarmReports />
      </div>
    </>
  );
}
