import { useEffect, useRef, useState } from 'react';
import { SidebarProvider, useSidebar } from '../context/SidebarContext';
import { Outlet, useLocation, useNavigate } from 'react-router';
import AppHeader from './AppHeader';
import Backdrop from './Backdrop';
import AppSidebar from './AppSidebar';
import { useLoading } from '@/context/LoadingContext';
import Loading from '@/components/loading/MatrixLoading';
import { useInspectionTableStore } from '@/store/useInspectionTable';
import { useLotDetailStore } from '@/store/useLotDetailStore';
import { useAuditLogsTableStore } from '@/store/useAuditLogsTable';
import { FullscreenToggleButton } from '@/components/common/FullscreenToggleButton';
import { CloseIcon, MenuIcon, VideosIcon } from '@/icons';
import { URL } from '@/api';

const COPYRIGHT = import.meta.env.VITE_COPYRIGHT;

const LayoutContent: React.FC = () => {
  const { loading } = useLoading();
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const [isHmiMode, setIsHmiMode] = useState(false);
  const [isHmiMenuOpen, setIsHmiMenuOpen] = useState(false);
  const previousPathRef = useRef(location.pathname);
  const isHmiRoute = location.pathname === URL.HMI;
  const isHmiDashboard = location.pathname === URL.HOME || isHmiRoute;

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

  useEffect(() => {
    if (isHmiRoute) {
      setIsHmiMode(true);
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } else {
      setIsHmiMode(false);
    }
    setIsHmiMenuOpen(false);
  }, [location.pathname, isHmiRoute]);

  useEffect(() => {
    if (!isHmiDashboard || !isHmiMode) return;

    const handleFirstUserClick = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    };

    window.addEventListener('click', handleFirstUserClick, { once: true });
    return () => {
      window.removeEventListener('click', handleFirstUserClick);
    };
  }, [isHmiDashboard, isHmiMode]);

  const handleExitHmi = () => {
    setIsHmiMode(false);
    if (isHmiRoute) {
      navigate(URL.HOME);
    }
  };

  if (isHmiDashboard && isHmiMode) {
    return (
      <div className="relative flex h-screen min-h-screen flex-col overflow-hidden bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-white">
        {isHmiMenuOpen && (
          <>
            <div className="fixed inset-0 z-10 bg-gray-950/45 backdrop-blur-[2px]" onClick={() => setIsHmiMenuOpen(false)} />
            <AppSidebar presentation="floating" onNavigate={() => setIsHmiMenuOpen(false)} />
          </>
        )}

        <div className="fixed right-4 top-4 z-20 flex items-center gap-2 rounded-full border border-gray-200/70 bg-white/35 p-1 opacity-35 shadow-lg shadow-gray-900/10 backdrop-blur-md transition-all duration-200 hover:bg-white/90 hover:opacity-100 focus-within:bg-white/90 focus-within:opacity-100 dark:border-white/10 dark:bg-gray-950/35 dark:hover:bg-gray-900/95 dark:focus-within:bg-gray-900/95">
          <button
            type="button"
            onClick={() => setIsHmiMenuOpen((open) => !open)}
            aria-label={isHmiMenuOpen ? 'Close menu' : 'Open menu'}
            title={isHmiMenuOpen ? 'Close menu' : 'Open menu'}
            className="relative flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500/40 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
          >
            {isHmiMenuOpen ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={handleExitHmi}
            aria-label="Exit HMI"
            title="Exit HMI"
            className="relative flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500/40 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
          >
            <VideosIcon className="h-5 w-5" />
          </button>
          <FullscreenToggleButton />
        </div>

        {loading && (
          <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-white/30 backdrop-blur-[5px] dark:bg-black/80">
            <Loading />
          </div>
        )}

        <main className="min-h-0 w-screen flex-1 overflow-hidden p-2 md:p-3">
          <Outlet context={{ isHmiMode }} />
        </main>
        <footer className="shrink-0 px-3 pb-2 text-center text-xs font-medium text-gray-500 dark:text-green-500">
          {COPYRIGHT}
        </footer>
      </div>
    );
  }

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
        <AppHeader showHmiButton={isHmiDashboard} onEnterHmi={() => setIsHmiMode(true)} />
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
            <Outlet context={{ isHmiMode: false }} />
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
