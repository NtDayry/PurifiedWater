import PageMeta from "@/components/common/PageMeta";
import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import SystemMonitor from "@/components/system-monitor/SystemMonitor";
import { Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function SystemMonitorPage() {
  const { t } = useTranslation();

  return (
    <>
      <PageMeta
        title="System Monitor"
        description="Real-time host hardware metrics and active container scaling details"
      />
      <PageBreadcrumb
        pageTitle={t('page.system_monitor.title')}
        pageSubTitle={t('page.system_monitor.subtitle')}
        icon={<Activity className="inline-block mr-1 text-sky-500" width={50} height={50} />}
      />
      <div className="space-y-6">
        {/* System Monitor Dashboard */}
        <SystemMonitor />
      </div>
    </>
  );
}
