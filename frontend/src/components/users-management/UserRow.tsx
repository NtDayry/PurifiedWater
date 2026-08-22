import { api, API_URL } from '@/api';
import { User } from '@_types/user';
import useSwalAlert from '@/hooks/useSwalAlert';
import { SwalResult } from '@_types/utils';

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
  const SwalAlert = useSwalAlert();

  // รีเซ็ตรหัสผ่าน
  const handleResetPassword = (row: User) => {
    if (!perms.canResetPassword) {
      SwalAlert.error({ text: 'คุณไม่มีสิทธิ์รีเซ็ตรหัสผ่าน' });
      return;
    }
    SwalAlert.confirm({
      title: 'รีเซ็ตรหัสผ่าน',
      text: `คุณต้องการรีเซ็ตรหัสผ่านของ ${row.fullname} หรือไม่?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'ยืนยัน!',
      cancelButtonText: 'ยกเลิก',
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
            title: 'รีเซ็ตรหัสผ่านเรียบร้อยแล้ว',
            text: `รหัสผ่านใหม่ของ ${row.fullname} คือ: ${randomPassword}`,
          });
        }
      })
      .catch((error) => {
        console.error('Error in Swal:', error);
        SwalAlert.error({ text: 'ไม่สามารถรีเซ็ตรหัสผ่านได้!' });
      });
  };

  // รีเซ็ตจำนวนการป้อนรหัสผ่านผิด
  const handleResetAttempts = (row: User) => {
    if (!perms.canResetAttempts) {
      SwalAlert.error({ text: 'คุณไม่มีสิทธิ์รีเซ็ตราการAttempts' });
      return;
    }
    if (!row.sign_in_attempts) {
      return;
    }

    SwalAlert.confirm({
      title: 'รีเซ็ตการเข้าสู่ระบบ',
      text: `คุณต้องการรีเซ็ต Sign in attempts ของ ${row.fullname} หรือไม่?`,
    })
      .then(async (result) => {
        if (result.isConfirmed) {
          api.defaults.timeout = 500;
          const formData = new FormData();
          formData.append('sign_in_attempts', '0');
          await api.patch(`${API_URL.USERS}/${row.id}`, formData, {
            headers: API_URL.CONTENT_TYPE_FORMDATA,
          });

          SwalAlert.Toast({ title: 'รีเซ็ต Sign in attempts เรียบร้อยแล้ว' });
          reload();
        }
      })
      .catch((error) => {
        console.error('Error in Swal:', error);
        SwalAlert.error({ text: 'ไม่สามารถรีเซ็ตรีเซ็ต Sign in attempts ได้!' });
      });
  };

  // แก้ไขสถานะผู้ใช้งาน
  const handleEditStatus = (row: User) => {
    if (!perms.canEditStatus) {
      SwalAlert.error({ text: 'คุณไม่มีสิทธิ์แก้ไขสถานะผู้ใช้งาน' });
      return;
    }
    SwalAlert.custom({
      title: 'เลือกสถานะผู้ใช้งาน',
      icon: 'warning',
      html: `
      <p>เปลี่ยนสถานะผู้ใช้งาน ${row.fullname} จาก ${row.status}</p>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <button id="btn-admin" class="swal2-confirm swal2-styled status-active">Active (อนุญาต)</button>
        <button id="btn-editor" class="swal2-confirm swal2-styled status-pending">Pending (รอดำเนินการ)</button>
        <button id="btn-operator" class="swal2-confirm swal2-styled status-blocked">Blocked (บล็อคการใช้งาน)</button>
        <button id="btn-cancel" class="swal2-confirm swal2-styled" style="background-color:#f83e4b">ยกเลิก</button>
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

        SwalAlert.Toast({ title: 'เปลี่ยนสถานะผู้ใช้งานเรียบร้อยแล้ว' });
        reload();
      })
      .catch((error) => {
        console.error('Error in Swal:', error);
        SwalAlert.error({ text: 'ไม่สามารถเปลี่ยนสถานะผู้ใช้งานได้!' });
      });
  };

  // แก้ไขสิทธิ์ผู้ใช้งาน (ข้อมูลปุ่มมาจาก backend)
  const handleEditRole = (row: User) => {
    if (!perms.canEditRole) {
      SwalAlert.error({ text: 'คุณไม่มีสิทธิ์แก้ไขสิทธิ์ผู้ใช้งาน' });
      return;
    }

    const rolesToShow = rolesList;

    if (!rolesToShow.length) {
      SwalAlert.error({ text: 'ไม่พบรายการสิทธิ์ผู้ใช้งานจากระบบ' });
      return;
    }

    const buttonsHtml = rolesToShow.map((r) => `<button id="btn-${r.replace(" ", "_")}" class="swal2-confirm swal2-styled role-${r}">${r}</button>`).join('');

    SwalAlert.confirm({
      title: 'เลือกสิทธิ์ผู้ใช้งาน',
      icon: 'warning',
      html: `
      <p>เปลี่ยนสิทธิ์ผู้ใช้งาน ${row.fullname} จาก ${row.role?.toUpperCase()}</p>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        ${buttonsHtml}
        <button id="btn-cancel" class="swal2-cancel swal2-styled" style="background-color:#f83e4b">ยกเลิก</button>
      </div>
    `,
      showConfirmButton: false,
      showCancelButton: false,
      didOpen: () => {
        const swal = SwalAlert.Swal.getPopup();
        rolesToShow.forEach((r) => {
          const id = r.replace(" ", "_");
          swal?.querySelector(`#btn-${id}`)?.addEventListener('click', () => SwalAlert.Swal.close({ value: r }));
        });
        swal?.querySelector('#btn-cancel')?.addEventListener('click', () => SwalAlert.Swal.close({ isDismissed: true }));
      },
    })
      .then(async (result: SwalResult) => {
        if (result.isDismissed) return;

        let selectedRole = result.value;
        if (selectedRole == row.role) return;
        if (!selectedRole) throw new Error('ไม่พบสถานะที่เลือก');

        selectedRole = selectedRole.replace("_", " ");
        api.defaults.timeout = 500;
        const formData = new FormData();
        formData.append('role', selectedRole);
        await api.patch(`${API_URL.USERS}/${row.id}`, formData, {
          headers: API_URL.CONTENT_TYPE_FORMDATA,
        });

        SwalAlert.Toast({ title: 'เปลี่ยนสิทธิ์ผู้ใช้งานเรียบร้อยแล้ว' });
        reload();
      })
      .catch((error) => {
        console.error('Error in Swal:', error);
        SwalAlert.error({ text: 'ไม่สามารถเปลี่ยนสิทธิ์ผู้ใช้งานได้!' });
      });
  };

  // แก้ไขข้อมูลผู้ใช้งาน
  const handleEditUserData = (row: User, setSelectedUser: (user: User | null) => void, setIsModalOpen: (isOpen: boolean) => void) => {
    if (!perms.canEditUser) {
      SwalAlert.error({ text: 'คุณไม่มีสิทธิ์แก้ไขข้อมูลผู้ใช้งาน' });
      return;
    }
    setSelectedUser(row);
    setIsModalOpen(true);
  };

  // ลบข้อมูลผู้ใช้งาน
  const deleteUser = (row: User) => {
    if (!perms.canDeleteUser) {
      SwalAlert.error({ text: 'คุณไม่มีสิทธิ์ลบผู้ใช้งาน' });
      return;
    }
    SwalAlert.confirm({
      title: 'ยืนยันการลบผู้ใช้งาน',
      text: `บัญชี: ${row.username} (${row.fullname})`,
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
        SwalAlert.error({ text: 'ไม่สามารถเปลี่ยนสิทธิ์ผู้ใช้งานได้!' });
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
