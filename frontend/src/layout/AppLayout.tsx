import { useEffect, useRef } from 'react';
import { SidebarProvider, useSidebar } from '../context/SidebarContext';
import { Outlet, useLocation } from 'react-router';
import AppHeader from './AppHeader';
import Backdrop from './Backdrop';
import AppSidebar from './AppSidebar';
import { useLoading } from '@/context/LoadingContext';
import Loading from '@/components/loading/MatrixLoading';
import { useInspectionTableStore } from '@/store/useInspectionTable';
import { useLotDetailStore } from '@/store/useLotDetailStore';
import { useAuditLogsTableStore } from '@/store/useAuditLogsTable';

const COPYRIGHT = import.meta.env.VITE_COPYRIGHT;

const LayoutContent: React.FC = () => {
  const { loading } = useLoading();
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const location = useLocation();
  const previousPathRef = useRef(location.pathname);

  useEffect(() => {
    const previousPath = previousPathRef.current;
    const currentPath = location.pathname;
    const routeResetRules = [
      {
        prefix: '/inspection-lists',
        reset: () => useInspectionTableStore.getState().reset(),
      },
      {
        prefix: '/dashboard/lots/',
        reset: () => useLotDetailStore.getState().reset(),
      },
      {
        prefix: '/audit-logs',
        reset: () => useAuditLogsTableStore.getState().reset(),
      },
    ];

    routeResetRules.forEach(({ prefix, reset }) => {
      if (previousPath.startsWith(prefix) && !currentPath.startsWith(prefix)) {
        reset();
      }
    });

    previousPathRef.current = currentPath;
  }, [location.pathname]);
  return (
    <div className="min-h-screen xl:flex">
      <div>
        <AppSidebar />
        <Backdrop />
      </div>
      <div
        className={`flex-1 transition-all duration-300 ease-in-out ${
          isExpanded || isHovered ? 'lg:ml-[320px]' : 'lg:ml-[90px]'
        } ${isMobileOpen ? 'ml-0' : ''}`}
      >
        <AppHeader />
        <div className="min-h-[calc(100vh-5rem)] flex flex-col p-4 pb-0 mx-auto max-w-(--breakpoint-2xl) md:p-6 md:pb-0">
          <div className="flex-grow">
            {loading && (
              <div
                className={`fixed top-0 bottom-0 left-0 top-19 right-0 z-[99999] flex items-center justify-center bg-white/30 dark:bg-black/80 backdrop-blur-[5px]  
                   transition-all duration-300 ease-in-out
                  ${isExpanded || isHovered ? 'lg:ml-[290px]' : 'lg:ml-[90px]'} ${isMobileOpen ? 'ml-0' : ''}`}
              >
                <Loading />
              </div>
            )}
            <Outlet />
          </div>
          <footer className="footer text-center sm:footer-horizontal footer-center text-base-content text-gray-500 p-4 mt-5 dark:text-white-500 dark:text-green-500">
            <aside>
              <p>{COPYRIGHT}</p>
            </aside>
          </footer>
        </div>
      </div>
    </div>
  );
};

const AppLayout: React.FC = () => {
  return (
    <SidebarProvider>
      <LayoutContent />
    </SidebarProvider>
  );
};

export default AppLayout;
