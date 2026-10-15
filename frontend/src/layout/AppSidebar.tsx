import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { URL } from '@/api';

// Permission helpers
import { useAuthStore } from '@/store/auth';
import { PermissionConfig } from '@/config/permission.config';
import { checkPermission } from '@/hooks/usePermission';

// Assume these icons are imported from an icon library
import { ChevronDownIcon, IxDashboardIcon, UiSetting, GridIcon, HorizontalDotsIcon, PlugInIcon, UserLineIcon } from '@/icons';
import { FileClock, Activity, Bell, HardDriveDownload } from 'lucide-react';
import { useSidebar } from '@/context/SidebarContext';

const PROJECT_NAME = import.meta.env.VITE_PROJECT_NAME;
const CREDITE = import.meta.env.VITE_CREDITE;

type NavItem = {
  name: string;
  icon: React.ReactNode;
  path?: string;
  replace?: boolean;
  // permission key (single string) to control visibility of this menu item
  permission?: string;
  subItems?: {
    name: string;
    path: string;
    replace?: boolean;
    icon?: React.ReactNode;
    pro?: boolean;
    new?: boolean;
    permission?: string; // allow subitems to have their own permission
  }[];
};

type AppSidebarProps = {
  presentation?: 'default' | 'floating';
  onNavigate?: () => void;
};

const AppSidebar: React.FC<AppSidebarProps> = ({ presentation = 'default', onNavigate }) => {
  const { t } = useTranslation();
  const { isExpanded, isMobileOpen, toggleMobileSidebar } = useSidebar();
  const location = useLocation();

  // read user permissions & role from store
  const userPermissions = useAuthStore((s) => s.permissions) || [];
  const role = useAuthStore((s) => s.role);

  // Unified permission checker
  const hasPermission = (permissionKeys?: string[] | string | undefined) => {
    return checkPermission(role, userPermissions, permissionKeys);
  };

  const navItems: NavItem[] = [
    {
      icon: <GridIcon />,
      name: t('navbar.dashboard'),
      path: URL.HOME,
      permission: PermissionConfig.Routes.dashboard[0],
    },
    {
      icon: <IxDashboardIcon />,
      name: t('navbar.reports'),
      path: '/reports',
      permission: PermissionConfig.Routes.reports[0],
    },
    {
      icon: <Bell className="size-5" />,
      name: t('navbar.alarm_reports'),
      path: URL.ALARM_REPORTS,
      permission: PermissionConfig.Routes.alarm_reports[0],
    },
    {
      icon: <UiSetting />,
      name: t('navbar.settings_devices'),
      path: '/settings-devices',
      permission: PermissionConfig.Routes.device[0],
    },
    {
      icon: <FileClock />,
      name: t('navbar.audit_logs'),
      path: URL.AUDIT_LOGS,
      permission: PermissionConfig.Routes.audit_logs[0],
    },
    {
      icon: <Activity className="size-5" />,
      name: t('navbar.system_monitor'),
      path: URL.SYSTEM_MONITOR,
      permission: PermissionConfig.Routes.system_monitor[0],
    },
    {
      icon: <HardDriveDownload className="size-5" />,
      name: t('navbar.backup_restore'),
      path: URL.BACKUP_RESTORE,
      permission: PermissionConfig.Routes.backup_restore[0],
    },
  ];

  const othersItems: NavItem[] = [
    {
      icon: <UserLineIcon />,
      name: t('navbar.user_managment'),
      path: URL.USERS_MANAGEMENT,
      // Tie this menu entry to the same route-level permission used in routing
      permission: PermissionConfig.Routes.users_management[0],
    },
    {
      icon: <PlugInIcon />,
      name: t('navbar.logout'),
      path: URL.LOGOUT,
      replace: true,
    },
  ];

  const [openSubmenu, setOpenSubmenu] = useState<{
    type: 'main' | 'others';
    index: number;
  } | null>(null);
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>({});
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const isActive = useCallback((path: string) => location.pathname === path, [location.pathname]);

  useEffect(() => {
    let submenuMatched = false;
    ['main', 'others'].forEach((menuType) => {
      const items = menuType === 'main' ? navItems : othersItems;
      items.forEach((nav, index) => {
        if (nav.subItems) {
          nav.subItems.forEach((subItem) => {
            if (isActive(subItem.path)) {
              setOpenSubmenu({
                type: menuType as 'main' | 'others',
                index,
              });
              submenuMatched = true;
            }
          });
        }
      });
    });

    if (!submenuMatched) {
      setOpenSubmenu(null);
    }
  }, [location, isActive]);

  useEffect(() => {
    if (openSubmenu !== null) {
      const key = `${openSubmenu.type}-${openSubmenu.index}`;
      if (subMenuRefs.current[key]) {
        setSubMenuHeight((prevHeights) => ({
          ...prevHeights,
          [key]: subMenuRefs.current[key]?.scrollHeight || 0,
        }));
      }
    }
  }, [openSubmenu]);

  const handleSubmenuToggle = (index: number, menuType: 'main' | 'others') => {
    setOpenSubmenu((prevOpenSubmenu) => {
      if (prevOpenSubmenu && prevOpenSubmenu.type === menuType && prevOpenSubmenu.index === index) {
        return null;
      }
      return { type: menuType, index };
    });
  };

  const handleNavigate = () => {
    if (isMobileOpen) toggleMobileSidebar();
    onNavigate?.();
  };

  const renderMenuItems = (items: NavItem[], menuType: 'main' | 'others') => (
    <ul className="flex flex-col gap-3">
      {items.map((nav, index) => {
        // If the top-level item has a permission and user lacks it, skip the item entirely
        if (!hasPermission(nav.permission)) return null;

        // For items with subItems, filter subItems by permission so we only show allowed ones
        const visibleSubItems = nav.subItems ? nav.subItems.filter((si) => hasPermission(si.permission)) : undefined;

        // If item has subItems but none are visible, skip rendering the parent (unless parent has its own path)
        if (nav.subItems && (!visibleSubItems || visibleSubItems.length === 0) && !nav.path) return null;

        return (
          <li key={nav.name}>
            {visibleSubItems && visibleSubItems.length > 0 ? (
              <>
                <button
                  onClick={() => handleSubmenuToggle(index, menuType)}
                  className={`menu-item group justify-center ${
                    openSubmenu?.type === menuType && openSubmenu?.index === index ? 'menu-item-active' : 'menu-item-inactive'
                  } cursor-pointer ${!isExpanded ? 'lg:justify-center' : 'lg:justify-start'}`}
                >
                  <span
                    className={`menu-item-icon-size  ${openSubmenu?.type === menuType && openSubmenu?.index === index ? 'menu-item-icon-active' : 'menu-item-icon-inactive'}`}
                  >
                    {nav.icon}
                  </span>
                  <span
                    className={`
                      menu-item-text transition-all duration-300 whitespace-nowrap overflow-hidden
                        ${isExpanded || isMobileOpen ? 'opacity-100 max-w-[250px] ml-3' : 'opacity-0 max-w-0 pointer-events-none'}
                    `}
                  >
                    {nav.name}
                  </span>
                  {(isExpanded || isMobileOpen) && (
                    <ChevronDownIcon
                      className={`ml-auto w-5 h-5 transition-transform duration-300 ${openSubmenu?.type === menuType && openSubmenu?.index === index ? 'rotate-180 text-brand-500' : ''}`}
                    />
                  )}
                </button>

                {(isExpanded || isMobileOpen) && (
                  <div
                    ref={(el) => {
                      subMenuRefs.current[`${menuType}-${index}`] = el;
                    }}
                    className="overflow-hidden transition-all duration-300"
                    style={{
                      height: openSubmenu?.type === menuType && openSubmenu?.index === index ? `${subMenuHeight[`${menuType}-${index}`]}px` : '0px',
                    }}
                  >
                    <ul className="mt-2 space-y-1 ml-9">
                      {visibleSubItems.map((subItem) => (
                        <li key={subItem.name}>
                          <Link
                            to={subItem.path}
                            replace={subItem.replace}
                            onClick={handleNavigate}
                            className={`menu-dropdown-item ${isActive(subItem.path) ? 'menu-dropdown-item-active' : 'menu-dropdown-item-inactive'}`}
                          >
                            <span className="size-5">{subItem.icon}</span>
                            {subItem.name}
                            <span className="flex items-center gap-1 ml-auto">
                              {subItem.new && (
                                <span
                                  className={`ml-auto ${isActive(subItem.path) ? 'menu-dropdown-badge-active' : 'menu-dropdown-badge-inactive'} menu-dropdown-badge`}
                                >
                                  new
                                </span>
                              )}
                              {subItem.pro && (
                                <span
                                  className={`ml-auto ${isActive(subItem.path) ? 'menu-dropdown-badge-active' : 'menu-dropdown-badge-inactive'} menu-dropdown-badge`}
                                >
                                  pro
                                </span>
                              )}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              nav.path && (
                <Link
                  to={nav.path}
                  replace={nav.replace}
                  onClick={handleNavigate}
                  className={`menu-item group ps-6  ${!isExpanded ? 'lg:justify-center' : 'lg:justify-start'} ${isActive(nav.path) ? 'menu-item-active' : 'menu-item-inactive'}`}
                >
                  <span className={`menu-item-icon-size ${isActive(nav.path) ? 'menu-item-icon-active' : 'menu-item-icon-inactive'}`}>
                    {nav.icon}
                  </span>
                  <span
                    className={`
                      menu-item-text transition-all duration-300 whitespace-nowrap overflow-hidden
                        ${isExpanded || isMobileOpen ? 'opacity-100 max-w-[250px] ml-3' : 'opacity-0 max-w-0 pointer-events-none'}
                    `}
                  >
                    {nav.name}
                  </span>
                </Link>
              )
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <aside
      className={`fixed ${presentation === 'floating' ? 'mt-0 shadow-2xl' : 'mt-16 lg:mt-0'} flex flex-col top-0 px-5 left-0 bg-white dark:bg-gray-900 dark:border-gray-800 text-gray-900 h-screen transition-all duration-300 ease-in-out z-11 border-r border-gray-200 
        ${isExpanded || isMobileOpen ? 'w-[320px]' : 'w-[90px]'}
        ${presentation === 'floating' ? 'translate-x-0' : isMobileOpen ? 'translate-x-0 lg:translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      onMouseEnter={() => !isExpanded}
    >
      <div className={`py-8 flex ${!isExpanded ? 'lg:justify-center' : 'justify-start'}`}>
        <div className="flex items-center overflow-hidden">
          {isExpanded || isMobileOpen ? (
            <div className="w-full flex items-center gap-3 px-3 py-4 rounded-2xl bg-gray-200/50 dark:bg-gray-800/50 transition-all duration-300 whitespace-nowrap overflow-hidden">
              <img src="/polipharm.png" className="size-15 rounded-full border border-gray-600/20 dark:border-none" />
              <div className="w-full flex flex-col">
                <h4 className="text-primary dark:text-white/[0.8] text-2xl font-bold min-w-[150px] h-6 nowrap">{PROJECT_NAME}</h4>
                <p className="text-warning dark:text-warning/[0.8] text-sm font-bold min-w-[150px] nowrap">{CREDITE}</p>
              </div>
            </div>
          ) : (
            <img src="/polipharm.png" className="size-10 rounded-full border dark:border-none" />
          )}
        </div>
      </div>
      <div className="flex flex-col overflow-y-auto duration-300 ease-linear no-scrollbar">
        <nav className="mb-6">
          <div className="flex flex-col gap-4">
            <div>
              <h2 className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${!isExpanded ? 'lg:justify-center' : 'justify-start'}`}>
                {isExpanded || isMobileOpen ? 'Menu' : <HorizontalDotsIcon />}
              </h2>
              {renderMenuItems(navItems, 'main')}
            </div>
            <div className="">
              <h2 className={`mb-4 text-xs uppercase flex leading-[20px] text-gray-400 ${!isExpanded ? 'lg:justify-center' : 'justify-start'}`}>
                {isExpanded || isMobileOpen ? 'Others' : <HorizontalDotsIcon />}
              </h2>
              {renderMenuItems(othersItems, 'others')}
            </div>
          </div>
        </nav>
      </div>
    </aside>
  );
};

export default AppSidebar;
