import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebounce } from 'use-debounce';
import { Search, Package } from 'lucide-react';
import { AnimateArrowUpIcon, AnimateArrowDownIcon, EditIcon, SolarKeyIcon, DeleteIcon } from '@/icons';
import { api, API_URL, getUsers } from '@/api';
import { useDragScroll } from '@/hooks/useScroll';
import { useLoading } from '@/context/LoadingContext';
import { useReload } from '@/hooks/useReload';
import useSwalAlert from '@/hooks/useSwalAlert';
import { useTableState } from '@/hooks/useTableState';
import { useUsersTableStore } from '@/store/usersTable';
import { usePermissions } from '@/hooks/usePermission';
import { PermissionConfig } from '@/config/permission.config';
import { getPageNumbers } from '@/components/utils/getPageNumbers';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/radixUI/input';
import Pagination from '@/components/table-pagination/Pagination';
import Tooltip from '@/components/ui/tooltip/Tooltip';
import Badge, { BadgeColor } from '@/components/ui/badge/Badge';
import Button from '@/components/ui/button/Button';
import { User } from '@_types/user';
import { imagePath } from '@/components/utils/formatImagePath';
import { UseRow } from './UserRow';
import UpdateUserDataModal from '@/components/users-management/UpdateUserDataModal';

// ฟังก์ชันที่ใช้ในการกำหนด header ของตาราง
interface TableHeaderType {
  label: string;
  key: string;
  align?: 'left' | 'right' | 'center';
}

// คอมโพเนนต์หลักของตารางการตรวจสอบ
export default function UsersManagement() {
  const [dataTable, setDataTable] = useState<User[]>([]); // สถานะสำหรับเก็บข้อมูลตาราง
  const [total, setTotal] = useState(0); // สถานะสำหรับเก็บจำนวนรายการทั้งหมด
  const [totalPages, setTotalPages] = useState(1); // สถานะสำหรับเก็บจำนวนหน้าทั้งหมด
  const { scrollRef, onPointerMove, onPointerUp, onPointerDown } = useDragScroll<HTMLDivElement>(); // ใช้สำหรับการลากเลื่อนตาราง
  const { loading, setLoading } = useLoading(); // สถานะโหลด
  const SwalAlert = useSwalAlert(); // ใช้สำหรับแสดง alert แบบ Swal
  const { t } = useTranslation(); // ใช้สำหรับแปลภาษา
  const { isReload, reload } = useReload();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null); // เก็บข้อมูล User ที่เลือกจะแก้ไข

  // ใช้ store สำหรับจัดการ state ของตาราง
  const {
    searchTerm,
    setSearchTerm,

    currentPage,
    setCurrentPage,

    rowsPerPage,
    setRowsPerPage,

    sortKey,
    sortDirection,
    setSort,
  } = useTableState(useUsersTableStore);

  // ใช้ debounce สำหรับการค้นหา
  const [debouncedSearch] = useDebounce(searchTerm, 500);

  // Roles loaded from backend (used to render edit-role options)
  const [rolesList, setRolesList] = useState<string[]>([]);

  // Permission booleans (centralized via hook)
  const canResetPassword = usePermissions([PermissionConfig.Modules.UsersManagement.actions.resetPassword]);
  const canResetAttempts = usePermissions([PermissionConfig.Modules.UsersManagement.actions.resetAttempts]);
  const canEditStatus = usePermissions([PermissionConfig.Modules.UsersManagement.actions.editStatus]);
  const canEditRole = usePermissions([PermissionConfig.Modules.UsersManagement.actions.editRole]);
  const canEditUser = usePermissions([PermissionConfig.Modules.UsersManagement.actions.editUser]);
  const canDeleteUser = usePermissions([PermissionConfig.Modules.UsersManagement.actions.deleteUser]);

  const { handleResetPassword, handleResetAttempts, handleEditStatus, handleEditRole, handleEditUserData, deleteUser } = UseRow(
    reload,
    { canResetPassword, canResetAttempts, canEditStatus, canEditRole, canEditUser, canDeleteUser },
    rolesList
  );

  // ฟังก์ชัน useEffect สำหรับโหลดข้อมูลตารางเมื่อมีการเปลี่ยนแปลง
  useEffect(() => {
    setLoading(true, 'before', 500);
    getUsers({
      page: currentPage,
      limit: rowsPerPage,
      search: debouncedSearch,
      sortKey: sortKey,
      sortDirection: sortDirection,
    })
      .then((d) => {
        setDataTable(d.users);
        setTotal(d.total);
        setTotalPages(d.total_pages);
      })
      .catch(SwalAlert.error)
      .finally(() => setLoading(false));
  }, [isReload, currentPage, rowsPerPage, debouncedSearch, sortKey, sortDirection]);

  // Load role list from backend once on mount
  useEffect(() => {
    let mounted = true;

    const fetchRoles = async () => {
      try {
        const res = await api.get(API_URL.ROLES);
        const r = res.data?.roles || [];
        if (mounted) setRolesList(r);
      } catch (err) {
        // fallback to defaults if backend not available
        if (mounted) setRolesList(['super admin', 'admin', 'operator', 'viewer']);
      }
    };

    fetchRoles();

    return () => {
      mounted = false;
    };
  }, []);

  // ฟังก์ชันจัดการการเรียงข้อมูลเมื่อกดที่ header ของตาราง
  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSort(key, sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(key, 'asc');
    }
  };

  const getBadgeColorByRole = (role: string): BadgeColor => {
    switch (role?.toLowerCase()) {
      case 'super admin':
        return 'success';
      case 'admin':
        return 'primary';
      case 'operator':
        return 'warning';
      case 'viewer':
        return 'info';
      default:
        return 'error';
    }
  };

  const getBadgeColorByStatus = (status: string): BadgeColor => {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'success';
      case 'pending':
        return 'light';
      case 'blocked':
        return 'error';
      default:
        return 'primary';
    }
  };

  // โครงสร้าง header ของตาราง
  const tableHeader: TableHeaderType[] = [
    { label: t('page.users_management.table.header.user_information'), key: 'id' },
    { label: t('page.users_management.table.header.departments'), key: 'departments' },
    { label: t('page.users_management.table.header.permissions'), key: 'permissions', align: 'center' },
    { label: t('page.users_management.table.header.status'), key: 'status', align: 'center' },
    { label: t('page.users_management.table.header.menu'), key: 'menu', align: 'center' },
  ];

  // ข้อความสำหรับแสดงจำนวนรายการ
  const detail = t('page.users_management.table.detail');

  return (
    <div className="bg-white shadow-xl rounded-xl border dark:bg-white/[0.03] dark:border-white/[0.05]">
      {/* แสดง search bar และจำนวนรายการ */}
      <div className="flex justify-between items-center px-4 py-5">
        <p className="text-lg font-bold text-gray-600 dark:text-white/[0.8]">
          {detail.replace('[ci]', dataTable.length.toLocaleString()).replace('[ti]', total.toLocaleString())}
        </p>

        <div className="relative w-60">
          <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />

          <Input
            placeholder={t('page.users_management.table.search')}
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
            }}
            className={`pl-9 pr-3 ${searchTerm ? '!text-success' : 'text-muted-foreground'}`}
          />
        </div>
      </div>

      <div className="border border-1 dark:border-gray-800"></div>

      {/* ตารางข้อมูล */}
      <div
        ref={scrollRef}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerMove={onPointerMove}
        className="max-w-full overflow-x-auto select-none custom-scrollbar"
      >
        <Table className="min-w-220">
          {/* Header ของตาราง */}
          <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
            <TableRow>
              {tableHeader.map((header) => (
                <TableCell
                  key={header.label}
                  isHeader
                  onClick={() => handleSort(header.key)}
                  className={`px-4 py-3 bg-gray-200/30 dark:bg-gray-800 font-medium text-gray-500 text-start text-theme-lg dark:text-white/[0.8] ${
                    header.key ? 'cursor-pointer select-none' : ''
                  }`}
                >
                  <h4 className={`flex items-center gap-1 justify-${header.align || 'start'} ${sortKey !== header.key ? 'w-full' : ''}`}>
                    {header.label}

                    <span className={`${sortKey === header.key ? 'visible' : 'invisible'}`}>
                      {sortDirection === 'asc' ? <AnimateArrowUpIcon className="size-4" /> : <AnimateArrowDownIcon className="size-4" />}
                    </span>
                  </h4>
                </TableCell>
              ))}
            </TableRow>
          </TableHeader>

          {/* Body ของตาราง */}
          <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
            {dataTable.map((row) => (
              <TableRow key={row.registered_date} className="hover:bg-primary/10 dark:hover:bg-gray-800/60 animate-slideDown">
                <TableCell className="px-5 py-4 sm:px-6 text-start">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 overflow-hidden rounded-full border border-gray-500/[0.1] bg-gray-700/[0.3] flex items-center justify-center">
                      <img
                        width={40}
                        height={40}
                        src={imagePath(row.profile_image)}
                        alt={row.username}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = '/polipharm.png';
                        }}
                      />
                    </div>
                    <div>
                      <span className="block font-medium text-gray-800 text-theme-sm dark:text-white/90">{row.fullname}</span>
                      <span className="block text-gray-500 text-theme-xs dark:text-gray-400">{row.username}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="px-4 py-3 text-gray-500 text-start text-theme-sm dark:text-gray-400">{row.department}</TableCell>
                <TableCell className="px-4 pl-0 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                  {canEditRole ? (
                    <span className="flex justify-center cursor-pointer hover:scale-110 duration-300" onClick={() => handleEditRole(row)}>
                      <Tooltip text={t('page.users_management.table.tooltip.edit_role')}>
                        <Badge size="sm" color={getBadgeColorByRole(row.role || '')}>
                          {row.role}
                        </Badge>
                      </Tooltip>
                    </span>
                  ) : (
                    <span className="flex justify-center">
                      <Tooltip text={t('page.users_management.table.tooltip.no_permission_role')}>
                        <Badge size="sm" color={getBadgeColorByRole(row.role || '')}>
                          {row.role}
                        </Badge>
                      </Tooltip>
                    </span>
                  )}
                </TableCell>
                <TableCell className="px-4 pl-0 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                  {canEditStatus ? (
                    <span className="flex justify-center cursor-pointer hover:scale-110 duration-300" onClick={() => handleEditStatus(row)}>
                      <Tooltip text={t('page.users_management.table.tooltip.edit_status')}>
                        <Badge size="sm" color={getBadgeColorByStatus(row.status || '')}>
                          {row.status}
                        </Badge>
                      </Tooltip>
                    </span>
                  ) : (
                    <span className="flex justify-center">
                      <Tooltip text={t('page.users_management.table.tooltip.no_permission_status')}>
                        <Badge size="sm" color={getBadgeColorByStatus(row.status || '')}>
                          {row.status}
                        </Badge>
                      </Tooltip>
                    </span>
                  )}
                </TableCell>

                {/* Menu */}
                <TableCell className="px-4 py-3 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                  <div>
                    {canResetPassword || canResetAttempts || canEditUser || canDeleteUser ? (
                      <span className="flex justify-center items-center gap-2">
                        {canResetPassword && (
                          <Tooltip text={t('page.users_management.table.tooltip.reset_password')}>
                            <Button
                              size="sm"
                              variant={{ light: 'info-soft', dark: 'info-soft-outline' }}
                              className="!rounded-full !w-10 !h-10"
                              startIcon={<SolarKeyIcon className="size-5 text-info" />}
                              onClick={() => handleResetPassword(row)}
                              children
                            />
                          </Tooltip>
                        )}

                        {canResetAttempts && (
                          <Tooltip text={t('page.users_management.table.tooltip.reset_attempts')}>
                            <Button
                              size="sm"
                              variant={{ light: 'success-soft', dark: 'success-soft-outline' }}
                              className="!rounded-full !w-10 !h-10"
                              onClick={() => handleResetAttempts(row)}
                            >
                              <h4 className="text-2xl pt-[3px] font-bolder">{row.sign_in_attempts || 0}</h4>
                            </Button>
                          </Tooltip>
                        )}

                        {canEditUser && (
                          <Tooltip text={t('page.users_management.table.tooltip.edit_user')}>
                            <Button
                              size="sm"
                              variant={{ light: 'warning-soft', dark: 'warning-soft-outline' }}
                              className="!rounded-full !w-10 !h-10"
                              startIcon={<EditIcon className="size-5 text-warning" />}
                              onClick={() => handleEditUserData(row, setSelectedUser, setIsModalOpen)}
                              children
                            />
                          </Tooltip>
                        )}

                        {canDeleteUser && (
                          <Tooltip text={t('page.users_management.table.tooltip.delete_user')}>
                            <Button
                              size="sm"
                              variant={{ light: 'error-soft', dark: 'error-soft-outline' }}
                              className="!rounded-full !w-10 !h-10"
                              startIcon={<DeleteIcon className="size-5 text-error" />}
                              onClick={() => deleteUser(row)}
                              children
                            />
                          </Tooltip>
                        )}
                      </span>
                    ) : (
                      <div className="flex justify-center items-center">
                        <div className="bg-gray-200 dark:bg-gray-600 cursor-not-allowed px-3 py-2 rounded-xl">{t('page.users_management.table.no_permission')}</div>
                      </div>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}

            {/* แสดงข้อความเมื่อไม่มีข้อมูล */}
            {!loading && dataTable.length === 0 && (
              <TableRow className="animate-fadeIn">
                <TableCell colSpan={12} className="px-5 py-4 sm:px-6 text-start">
                  <div className="border dark:border-gray-800 bg-gray-400/[0.1] dark:bg-gray-800 rounded-lg">
                    <div className="text-center py-12">
                      <Package className="w-12 h-12 text-muted-foreground dark:text-white/[0.5] mx-auto mb-4" />

                      <h3 className="text-lg font-medium text-muted-foreground dark:text-white/[0.5] mb-2">
                        {t('page.users_management.table.empty.title')}
                      </h3>

                      <p className="text-muted-foreground dark:text-white/[0.5] mb-4">{t('page.users_management.table.empty.subtitle')}</p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* แสดง pagination */}
      <div className="border border-1 dark:border-gray-800"></div>

      <Pagination
        filteredData={Array(total)}
        totalPages={totalPages}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        pagesLists={getPageNumbers(currentPage, totalPages)}
        rowsPerPage={rowsPerPage}
        setRowsPerPage={setRowsPerPage}
        rowPerPageText={{
          display: t('page.users_management.table.row_per_page.display'),
          row: t('page.users_management.table.row_per_page.row'),
        }}
      />

      <UpdateUserDataModal
        userId={selectedUser?.id}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          reload?.();
        }}
      />
    </div>
  );
}
