import { api, API_URL } from '@/api';
import { User } from '@_types/user';
import useSwalAlert from '@/hooks/useSwalAlert';
import { SwalResult } from '@_types/utils';
import { useTranslation } from 'react-i18next';

export const UseRow = (
  reload: () => void,
  perms: {
    canResetPassword: boolean;
    canResetAttempts: boolean;
    canEditStatus: boolean;
    canEditRole: boolean;
    canEditUser: boolean;
    canDeleteUser: boolean;
  },
  rolesList: string[] = []
) => {
  const { t } = useTranslation();
  const SwalAlert = useSwalAlert();

  // รีเซ็ตรหัสผ่าน
  const handleResetPassword = (row: User) => {
    if (!perms.canResetPassword) {
      SwalAlert.error({ text: t('page.users_management.toast.no_permission_reset_password') });
      return;
    }
    SwalAlert.confirm({
      title: t('page.users_management.dialog.reset_password.title'),
      text: t('page.users_management.dialog.reset_password.text').replace('[fullname]', row.fullname || ''),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: t('page.users_management.dialog.reset_password.confirm'),
      cancelButtonText: t('page.users_management.dialog.reset_password.cancel'),
    })
      .then(async (result) => {
        if (result.isConfirmed) {
          // สุ่มรหัสผ่าน 4 หลัก
          const randomPassword = Math.floor(1000 + Math.random() * 9000).toString();
          api.defaults.timeout = 500;
          const formData = new FormData();
          formData.append('password', randomPassword);
          await api.patch(`${API_URL.USERS}/${row.id}`, formData, {
            headers: API_URL.CONTENT_TYPE_FORMDATA,
          });

          SwalAlert.success({
            timer: undefined,
            showConfirmButton: true,
            title: t('page.users_management.toast.reset_password_success'),
            text: t('page.users_management.toast.new_password_text')
              .replace('[fullname]', row.fullname || '')
              .replace('[password]', randomPassword),
          });
        }
      })
      .catch((error) => {
        console.error('Error in Swal:', error);
        SwalAlert.error({ text: t('page.users_management.toast.reset_password_failed') });
      });
  };

  // รีเซ็ตจำนวนการป้อนรหัสผ่านผิด
  const handleResetAttempts = (row: User) => {
    if (!perms.canResetAttempts) {
      SwalAlert.error({ text: t('page.users_management.toast.no_permission_reset_attempts') });
      return;
    }
    if (!row.sign_in_attempts) {
      return;
    }

    SwalAlert.confirm({
      title: t('page.users_management.dialog.reset_attempts.title'),
      text: t('page.users_management.dialog.reset_attempts.text').replace('[fullname]', row.fullname || ''),
    })
      .then(async (result) => {
        if (result.isConfirmed) {
          api.defaults.timeout = 500;
          const formData = new FormData();
          formData.append('sign_in_attempts', '0');
          await api.patch(`${API_URL.USERS}/${row.id}`, formData, {
            headers: API_URL.CONTENT_TYPE_FORMDATA,
          });

          SwalAlert.Toast({ title: t('page.users_management.toast.reset_attempts_success') });
          reload();
        }
      })
      .catch((error) => {
        console.error('Error in Swal:', error);
        SwalAlert.error({ text: t('page.users_management.toast.reset_attempts_failed') });
      });
  };

  // แก้ไขสถานะผู้ใช้งาน
  const handleEditStatus = (row: User) => {
    if (!perms.canEditStatus) {
      SwalAlert.error({ text: t('page.users_management.toast.no_permission_edit_status') });
      return;
    }
    SwalAlert.custom({
      title: t('page.users_management.dialog.edit_status.title'),
      icon: 'warning',
      html: `
      <p>${t('page.users_management.dialog.edit_status.text')
        .replace('[fullname]', row.fullname || '')
        .replace('[status]', row.status || '')}</p>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <button id="btn-admin" class="swal2-confirm swal2-styled status-active">${t('page.users_management.dialog.edit_status.active')}</button>
        <button id="btn-editor" class="swal2-confirm swal2-styled status-pending">${t('page.users_management.dialog.edit_status.pending')}</button>
        <button id="btn-operator" class="swal2-confirm swal2-styled status-blocked">${t('page.users_management.dialog.edit_status.blocked')}</button>
        <button id="btn-cancel" class="swal2-confirm swal2-styled" style="background-color:#f83e4b">${t('page.users_management.dialog.edit_status.cancel')}</button>
      </div>
    `,
      showConfirmButton: false,
      didOpen: () => {
        const swal = SwalAlert.Swal.getPopup();
        swal?.querySelector('#btn-admin')?.addEventListener('click', () => SwalAlert.Swal.close({ value: 'active' }));
        swal?.querySelector('#btn-admin')?.addEventListener('click', () => SwalAlert.Swal.close({ value: 'active' }));
        swal?.querySelector('#btn-editor')?.addEventListener('click', () => SwalAlert.Swal.close({ value: 'pending' }));
        swal?.querySelector('#btn-operator')?.addEventListener('click', () => SwalAlert.Swal.close({ value: 'blocked' }));
        swal?.querySelector('#btn-cancel')?.addEventListener('click', () => SwalAlert.Swal.close({ isDismissed: true }));
      },
    })
      .then(async (result: SwalResult) => {
        if (result.isDismissed) return;

        const selectedStatus = result.value;
        if (selectedStatus == row.status) return;
        if (!selectedStatus) throw new Error('ไม่พบสถานะที่เลือก');

        api.defaults.timeout = 500;
        const formData = new FormData();
        formData.append('status', selectedStatus);
        await api.patch(`${API_URL.USERS}/${row.id}`, formData, {
          headers: API_URL.CONTENT_TYPE_FORMDATA,
        });

        SwalAlert.Toast({ title: t('page.users_management.toast.edit_status_success') });
        reload();
      })
      .catch((error) => {
        console.error('Error in Swal:', error);
        SwalAlert.error({ text: t('page.users_management.toast.edit_status_failed') });
      });
  };

  // แก้ไขสิทธิ์ผู้ใช้งาน (ข้อมูลปุ่มมาจาก backend)
  const handleEditRole = (row: User) => {
    if (!perms.canEditRole) {
      SwalAlert.error({ text: t('page.users_management.toast.no_permission_edit_role') });
      return;
    }

    const rolesToShow = rolesList ? rolesList : ['super admin', 'admin', 'operator', 'viewer'];

    const buttonsHtml = rolesToShow
      .map((r) => `<button id="btn-${r.replace(' ', '_')}" class="swal2-confirm swal2-styled role-${r}">${r}</button>`)
      .join('');

    SwalAlert.confirm({
      title: t('page.users_management.dialog.edit_role.title'),
      icon: 'warning',
      html: `
      <p>${t('page.users_management.dialog.edit_role.text')
        .replace('[fullname]', row.fullname || '')
        .replace('[role]', (row.role || '').toUpperCase())}</p>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        ${buttonsHtml}
        <button id="btn-cancel" class="swal2-cancel swal2-styled" style="background-color:#f83e4b">${t('page.users_management.dialog.edit_role.cancel')}</button>
      </div>
    `,
      showConfirmButton: false,
      showCancelButton: false,
      didOpen: () => {
        const swal = SwalAlert.Swal.getPopup();
        rolesToShow.forEach((r) => {
          const id = r.replace(' ', '_');
          swal?.querySelector(`#btn-${id}`)?.addEventListener('click', () => SwalAlert.Swal.close({ value: r }));
        });
        swal?.querySelector('#btn-cancel')?.addEventListener('click', () => SwalAlert.Swal.close({ isDismissed: true }));
      },
    })
      .then(async (result: SwalResult) => {
        if (result.isDismissed) return;

        let selectedRole = result.value;
        if (selectedRole == row.role) return;
        if (!selectedRole) throw new Error('ไม่พบสิทธิ์ที่เลือก');

        selectedRole = selectedRole.replace('_', ' ');
        api.defaults.timeout = 500;
        const formData = new FormData();
        formData.append('role', selectedRole);
        await api.patch(`${API_URL.USERS}/${row.id}`, formData, {
          headers: API_URL.CONTENT_TYPE_FORMDATA,
        });

        SwalAlert.Toast({ title: t('page.users_management.toast.edit_role_success') });
        reload();
      })
      .catch((error) => {
        console.error('Error in Swal:', error);
        SwalAlert.error({ text: t('page.users_management.toast.edit_role_failed') });
      });
  };

  // แก้ไขข้อมูลผู้ใช้งาน
  const handleEditUserData = (row: User, setSelectedUser: (user: User | null) => void, setIsModalOpen: (isOpen: boolean) => void) => {
    if (!perms.canEditUser) {
      SwalAlert.error({ text: t('page.users_management.toast.no_permission_edit_user') });
      return;
    }
    setSelectedUser(row);
    setIsModalOpen(true);
  };

  // ลบข้อมูลผู้ใช้งาน
  const deleteUser = (row: User) => {
    if (!perms.canDeleteUser) {
      SwalAlert.error({ text: t('page.users_management.toast.no_permission_delete_user') });
      return;
    }
    SwalAlert.confirm({
      title: t('page.users_management.dialog.delete_user.title'),
      text: t('page.users_management.dialog.delete_user.text')
        .replace('[username]', row.username || '')
        .replace('[fullname]', row.fullname || ''),
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: t('page.users_management.dialog.reset_password.confirm'),
      cancelButtonText: t('page.users_management.dialog.reset_password.cancel'),
    })
      .then(async (result: SwalResult) => {
        if (result.isDismissed) return;
        api.defaults.timeout = 500;
        const response = await api.delete(`${API_URL.USERS}/${row.id}`);

        SwalAlert.Toast({ title: response.data.message });
        reload();
      })
      .catch((error) => {
        console.error('Error in Swal:', error);
        SwalAlert.error({ text: t('page.users_management.toast.delete_user_failed') });
      });
  };

  return {
    handleResetPassword,
    handleResetAttempts,
    handleEditStatus,
    handleEditRole,
    handleEditUserData,
    deleteUser,
  };
};
