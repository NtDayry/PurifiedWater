import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import PageMeta from '@/components/common/PageMeta';
import Reports from '@/components/reports/reports';
import { StreamlineFileReportIcon } from '@/icons';

export default function ReportsPage() {
    return (
    <>
      <PageMeta title="Water System Data Report" description="Water System Data Report" />
      <PageBreadcrumb
        pageTitle="Data Report"
        pageSubTitle="Detailed Information of Purified Water System"
        icon={<StreamlineFileReportIcon className="inline-block mr-1 text-sky-500" width={50} height={50} />}
      />
      <div className="space-y-6">
        <Reports />
      </div>
    </>
  );
}
