import { ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import PageMeta from '@/components/common/PageMeta';
import AuditLogsTable from '@/components/audit-logs/AuditLogsTable';

export default function AuditLogsPage() {
  const { t } = useTranslation();

  return (
    <>
      <PageMeta title={t('page.audit_logs.title')} description={t('page.audit_logs.subtitle')} />
      <PageBreadcrumb
        pageTitle={t('page.audit_logs.title')}
        pageSubTitle={t('page.audit_logs.subtitle')}
        icon={<ShieldAlert className="inline-block mr-1 text-sky-500" width={50} height={50} />}
      />
      <div className="space-y-6">
        <AuditLogsTable />
      </div>
    </>
  );
}
