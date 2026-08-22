import PageMeta from '@/components/common/PageMeta';
import Dashboard  from '@/components/dashboard/Dashboard';
import { useOutletContext } from 'react-router';

type DashboardOutletContext = {
  isHmiMode?: boolean;
};

export default function Home() {
  const { isHmiMode = false } = useOutletContext<DashboardOutletContext>();

  return (
    <>
      <PageMeta
        title="Purified Water HMI Dashboard"
        description="Full-screen HMI dashboard for purified water monitoring"
      />
      <div className={`grid min-h-full grid-cols-12 ${isHmiMode ? 'h-full items-stretch gap-3 xl:gap-4' : 'gap-4 md:gap-6'}`}>
        <Dashboard hmiMode={isHmiMode} />
      </div>
    </>
  );
}
