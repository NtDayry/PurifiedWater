import PageMeta from '@/components/common/PageMeta';
import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import { DuoSettingsIcon } from '@/icons';
import Settings from '@/components/settings-devices/SettingsDevices';

export default function SettingsPage() {
  return (
    <>
      <PageMeta
        title="React.js Ecommerce Dashboard | TailAdmin - React.js Admin Dashboard Template"
        description="This is React.js Ecommerce Dashboard page for TailAdmin - React.js Tailwind CSS Admin Dashboard Template"
      />
      <PageBreadcrumb
        pageTitle="Sensor Calibration"
        pageSubTitle="Values displayed on the Dashboard = Raw + Offset · Red values = Outside the specified Min/Max"
        icon={
          <DuoSettingsIcon className="inline-block mr-1 text-sky-500 w-13 h-13" />
        }
      />
      <Settings />
    </>
  );
}
