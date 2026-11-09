import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { URL } from '@/api';

// Permission helpers
import { useAuthStore } from '@/store/auth';
import { PermissionConfig } from '@/config/permission.config';
import { checkPermission } from '@/hooks/usePermission';

// Assume these icons are imported from an icon library
import { ChevronDownIcon, IxDashboardIcon, UiSetting, GridIcon, HorizontalDotsIcon, PlugInIcon, UserLineIcon } from '@/icons';
import { FileClock, Activity, Bell, HardDriveDownload, Droplets, Waves, Zap, Box } from 'lucide-react';
import { useSidebar } from '@/context/SidebarContext';

const PROJECT_NAME = import.meta.env.VITE_PROJECT_NAME;
const CREDITE = import.meta.env.VITE_CREDITE;

type NavItem = {
  id: string;
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
  const { isExpanded: sidebarExpanded, isMobileOpen, toggleMobileSidebar } = useSidebar();
  // ในโหมด HMI (floating) ให้เมนูกางเต็มเสมอ เพื่อให้เข้าถึง submenu ได้ทุกหน้า
  const isExpanded = presentation === 'floating' || sidebarExpanded;
  const location = useLocation();
  const navigate = useNavigate();

  // read user permissions & role from store
  const userPermissions = useAuthStore((s) => s.permissions) || [];
  const role = useAuthStore((s) => s.role);

  // Unified permission checker
  const hasPermission = (permissionKeys?: string[] | string | undefined) => {
    return checkPermission(role, userPermissions, permissionKeys);
  };

  // 1. ระบบ Utilities หลัก (แต่ละระบบแยกเป็น Submenu)
  const utilitiesItems: NavItem[] = [
    {
      id: 'factory-layout',
      icon: <Box className="size-5" />,
      name: t('navbar.factory_layout'),
      path: URL.HOME,
      permission: PermissionConfig.Routes.dashboard[0],
    },
    {
      id: 'purified-water',
      name: t('navbar.purified_water'),
      icon: <Droplets className="size-5" />,
      subItems: [
        {
          name: t('navbar.pw_dashboard'),
          path: URL.PURIFIED_WATER_DASHBOARD,
          icon: <GridIcon />,
          permission: PermissionConfig.Routes.dashboard[0],
        },
        {
          name: t('navbar.reports'),
          path: URL.PURIFIED_WATER_REPORTS,
          icon: <IxDashboardIcon />,
          permission: PermissionConfig.Routes.reports[0],
        },
        {
          name: t('navbar.alarm_reports'),
          path: URL.PURIFIED_WATER_ALARMS,
          icon: <Bell className="size-4" />,
          permission: PermissionConfig.Routes.alarm_reports[0],
        },
        {
          name: t('navbar.settings_devices'),
          path: URL.PURIFIED_WATER_SETTINGS,
          icon: <UiSetting />,
          permission: PermissionConfig.Routes.device[0],
        },
      ],
    },
    {
      id: 'water-supply',
      name: t('navbar.water_supply'),
      icon: <Waves className="size-5" />,
      subItems: [
        {
          name: t('navbar.water_supply_dashboard'),
          path: '/water-supply/dashboard',
          icon: <GridIcon />,
        },
        {
          name: t('navbar.water_supply_reports'),
          path: '/water-supply/reports',
          icon: <IxDashboardIcon />,
        },
        {
          name: t('navbar.water_supply_alarms'),
          path: '/water-supply/alarms',
          icon: <Bell className="size-4" />,
        },
        {
          name: t('navbar.water_supply_settings'),
          path: '/water-supply/settings',
          icon: <UiSetting />,
        },
      ],
    },
    {
      id: 'electrical-system',
      name: t('navbar.electrical_system'),
      icon: <Zap className="size-5" />,
      subItems: [
        {
          name: t('navbar.electrical_dashboard'),
          path: '/electricity/dashboard',
          icon: <GridIcon />,
        },
        {
          name: t('navbar.electrical_reports'),
          path: '/electricity/reports',
          icon: <IxDashboardIcon />,
        },
        {
          name: t('navbar.electrical_alarms'),
          path: '/electricity/alarms',
          icon: <Bell className="size-4" />,
        },
        {
          name: t('navbar.electrical_settings'),
          path: '/electricity/settings',
          icon: <UiSetting />,
        },
      ],
    },
  ];

  // 2. เมนูระบบส่วนกลาง / เมนูที่ใช้ร่วมกัน
  const systemItems: NavItem[] = [
    {
      id: 'system-monitor',
      icon: <Activity className="size-5" />,
      name: t('navbar.system_monitor'),
      path: URL.SYSTEM_MONITOR,
      permission: PermissionConfig.Routes.system_monitor[0],
    },
    {
      id: 'audit-logs',
      icon: <FileClock />,
      name: t('navbar.audit_logs'),
      path: URL.AUDIT_LOGS,
      permission: PermissionConfig.Routes.audit_logs[0],
    },
    {
      id: 'backup-restore',
      icon: <HardDriveDownload className="size-5" />,
      name: t('navbar.backup_restore'),
      path: URL.BACKUP_RESTORE,
      permission: PermissionConfig.Routes.backup_restore[0],
    },
    {
      id: 'user-management',
      icon: <UserLineIcon />,
      name: t('navbar.user_managment'),
      path: URL.USERS_MANAGEMENT,
      permission: PermissionConfig.Routes.users_management[0],
    },
    {
      id: 'logout',
      icon: <PlugInIcon />,
      name: t('navbar.logout'),
      path: URL.LOGOUT,
      replace: true,
    },
  ];

  // เริ่มต้นไม่เปิดเมนูย่อย: หน้าแรก (/) คือแผนผังโรงงาน 3 มิติ — เปิดเมนูย่อยเฉพาะเมื่ออยู่ในหน้าของกลุ่มนั้น (useEffect ด้านล่าง)
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);

  const isActive = useCallback((path: string) => location.pathname === path, [location.pathname]);

  useEffect(() => {
    let matchedId: string | null = null;
    const allMenuWithSubs = [...utilitiesItems, ...systemItems];

    for (const nav of allMenuWithSubs) {
      if (nav.subItems) {
        for (const subItem of nav.subItems) {
          if (isActive(subItem.path)) {
            matchedId = nav.id;
            break;
          }
        }
      }
      if (matchedId) break;
    }

    if (matchedId) {
      setOpenSubmenu(matchedId);
    } else if (location.pathname === URL.HOME) {
      setOpenSubmenu(null); // กลับมาหน้าแรก (แผนผังโรงงาน 3 มิติ) → หุบเมนูย่อย ไม่ให้กลุ่มอื่นดู active
    } else if (location.pathname.startsWith(URL.PURIFIED_WATER) || location.pathname.startsWith('/dashboard')) {
      setOpenSubmenu('purified-water');
    }
  }, [location, isActive]);

  const handleSubmenuToggle = (id: string) => {
    setOpenSubmenu((prev) => (prev === id ? null : id));
  };

  const handleSubmenuClick = (nav: NavItem, visibleSubItems?: NavItem['subItems']) => {
    if (!isExpanded && !isMobileOpen) {
      if (visibleSubItems && visibleSubItems.length > 0) {
        setOpenSubmenu(nav.id);
        navigate(visibleSubItems[0].path, { replace: visibleSubItems[0].replace });
        handleNavigate();
      }
      return;
    }
    handleSubmenuToggle(nav.id);
  };

  const handleNavigate = () => {
    if (isMobileOpen) toggleMobileSidebar();
    onNavigate?.();
  };

  const renderMenuItems = (items: NavItem[]) => (
    <ul className="flex flex-col gap-3">
      {items.map((nav) => {
        // If the top-level item has a permission and user lacks it, skip the item entirely
        if (!hasPermission(nav.permission)) return null;

        // For items with subItems, filter subItems by permission so we only show allowed ones
        const visibleSubItems = nav.subItems ? nav.subItems.filter((si) => hasPermission(si.permission)) : undefined;

        // If item has subItems but none are visible, skip rendering the parent (unless parent has its own path)
        if (nav.subItems && (!visibleSubItems || visibleSubItems.length === 0) && !nav.path) return null;

        const isSubmenuOpen = openSubmenu === nav.id;
        const hasActiveChild = nav.subItems?.some((si) => isActive(si.path));

        return (
          <li key={nav.id}>
            {visibleSubItems && visibleSubItems.length > 0 ? (
              <>
                <button
                  type="button"
                  onClick={() => handleSubmenuClick(nav, visibleSubItems)}
                  className={`menu-item group justify-center ${
                    hasActiveChild ? 'menu-item-active' : 'menu-item-inactive'
                  } cursor-pointer ps-5 ${!isExpanded ? 'lg:justify-center' : 'lg:justify-start'}`}
                >
                  <span
                    className={`menu-item-icon-size ${
                      hasActiveChild ? 'menu-item-icon-active' : 'menu-item-icon-inactive'
                    }`}
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
                      className={`ml-auto w-5 h-5 transition-transform duration-300 ${
                        isSubmenuOpen ? 'rotate-180 text-brand-500' : ''
                      }`}
                    />
                  )}
                </button>

                {(isExpanded || isMobileOpen) && (
                  <div
                    className={`grid transition-all duration-300 ease-in-out ${
                      isSubmenuOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <ul className="mt-2 space-y-1 ml-9">
                        {visibleSubItems.map((subItem) => (
                          <li key={subItem.path + subItem.name}>
                            <Link
                              to={subItem.path}
                              replace={subItem.replace}
                              onClick={handleNavigate}
                              className={`menu-dropdown-item ${isActive(subItem.path) ? 'menu-dropdown-item-active' : 'menu-dropdown-item-inactive'}`}
                            >
                              {subItem.icon && <span className="size-4 flex items-center justify-center">{subItem.icon}</span>}
                              <span>{subItem.name}</span>
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
                  </div>
                )}
              </>
            ) : (
              nav.path && (
                <Link
                  to={nav.path}
                  replace={nav.replace}
                  onClick={handleNavigate}
                  className={`menu-item group ps-5 ${!isExpanded ? 'lg:justify-center' : 'lg:justify-start'} ${
                    isActive(nav.path) ? 'menu-item-active' : 'menu-item-inactive'
                  }`}
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
          <div className="flex flex-col gap-6">
            <div>
              <h2 className={`mb-3 text-xs uppercase font-semibold tracking-wider flex leading-[20px] text-gray-400 ${!isExpanded ? 'lg:justify-center' : 'justify-start'}`}>
                {isExpanded || isMobileOpen ? t('navbar.utilities_menu') : <HorizontalDotsIcon />}
              </h2>
              {renderMenuItems(utilitiesItems)}
            </div>
            <div>
              <h2 className={`mb-3 text-xs uppercase font-semibold tracking-wider flex leading-[20px] text-gray-400 ${!isExpanded ? 'lg:justify-center' : 'justify-start'}`}>
                {isExpanded || isMobileOpen ? t('navbar.system_menu') : <HorizontalDotsIcon />}
              </h2>
              {renderMenuItems(systemItems)}
            </div>
          </div>
        </nav>
      </div>
    </aside>
  );
};

export default AppSidebar;
