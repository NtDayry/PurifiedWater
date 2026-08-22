import Swal, { SweetAlertOptions } from 'sweetalert2';
import { useSidebarOptional } from '@/context/SidebarContext';
import { useModalContextOptional } from '@/context/ModalContext';

type AlertOptions = {
  title?: string;
  message?: string;
} & SweetAlertOptions;

const mergeClassNames = (...classes: Array<string | undefined | null | false>) =>
  classes.filter(Boolean).join(' ');

const buildCustomClass = (
  baseClass: Record<string, string>,
  customClass: SweetAlertOptions['customClass'],
  fullscreenBackdrop: boolean
) => {
  const merged = { ...baseClass, ...(customClass as Record<string, string> | undefined) };

  merged.container = mergeClassNames(
    baseClass.container,
    (customClass as Record<string, string> | undefined)?.container,
    fullscreenBackdrop && 'swal2-fullscreen-container'
  );

  return merged;
};

const hasOpenModalOverlay = () =>
  typeof document !== 'undefined' && Boolean(document.querySelector('[data-hermes-modal-open="true"]'));

export default function useSwalAlert(
  config: { useSidebar?: boolean; useModal?: boolean } = { useSidebar: true, useModal: true }
) {
  const sidebarContext = useSidebarOptional();
  const modalContext = useModalContextOptional();
  const sidebar = config?.useSidebar === false ? null : sidebarContext;
  const modal = config?.useModal === false ? null : modalContext;

  const sidebarClass = `
    ${sidebar?.isExpanded || sidebar?.isHovered ? 'lg:ml-[290px]' : 'lg:ml-[90px]'}
  `;

  const baseClass = {
    popup: 'dark:!bg-gray-800 dark:!text-white z-50',
    cancelButton: '!bg-error',
    confirmButton: '!bg-success',
    container: modal?.isOpenModal || sidebar?.isMobileOpen ? 'ml-0' : sidebarClass,
  };

  const fullscreenBackdropOptions = {
    backdrop: true,
    heightAuto: false,
    scrollbarPadding: false,
  };

  const fireWithBackdrop = (options: AlertOptions) => {
    const fullscreenBackdrop = Boolean(modal?.isOpenModal || hasOpenModalOverlay());
    const { didOpen, customClass, ...rest } = options;

    return Swal.fire({
      ...rest,
      ...(fullscreenBackdrop ? fullscreenBackdropOptions : {}),
      customClass: buildCustomClass(baseClass, customClass, fullscreenBackdrop),
      didOpen: (popup) => {
        didOpen?.(popup);
      },
    });
  };

  return {
    Swal,
    // ✅ Success Alert
    success(options?: AlertOptions) {
      return fireWithBackdrop({
        title: options?.title || 'สำเร็จ!',
        text: options?.message || 'ดำเนินการเสร็จสิ้น',
        icon: 'success',
        showConfirmButton: false,
        confirmButtonText: options?.confirmButtonText || 'ตกลง',
        timer: 1500,
        ...options,
      });
    },

    // ❌ Error Alert
    error(options?: AlertOptions) {
      return fireWithBackdrop({
        title: options?.title || 'เกิดข้อผิดพลาด',
        text: options?.message || 'มีบางอย่างผิดพลาด กรุณาลองอีกครั้ง',
        icon: 'error',
        confirmButtonText: options?.confirmButtonText || 'ตกลง',
        showConfirmButton: false,
        showCancelButton: true,
        ...options,
      });
    },

    // ⚠️ Warning Alert
    warning(options?: AlertOptions) {
      return fireWithBackdrop({
        title: options?.title || 'คำเตือน',
        text: options?.message || 'กรุณาตรวจสอบข้อมูลอีกครั้ง',
        icon: 'warning',
        confirmButtonText: options?.confirmButtonText || 'ตกลง',
        ...options,
      });
    },

    // ❓ Confirm Dialog
    confirm(options?: AlertOptions) {
      return fireWithBackdrop({
        title: options?.title || 'ยืนยันการดำเนินการ',
        text: options?.message || 'คุณแน่ใจหรือไม่?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: options?.confirmButtonText || 'ยืนยัน',
        cancelButtonText: options?.cancelButtonText || 'ยกเลิก',
        ...options,
      });
    },

    Toast(options?: AlertOptions) {
      return Swal.fire({
        title: options?.title || 'ดำเนินการเรียบร้อยแล้ว',
        text: options?.message,
        toast: true,
        position: 'bottom-end',
        showConfirmButton: false,
        icon: 'success',
        timer: 3000,
        ...options,
        customClass: buildCustomClass(baseClass, options?.customClass, false),
      });
    },

    // 🎨 Custom Alert
    custom(options?: AlertOptions) {
      return fireWithBackdrop({
        ...options,
      });
    },
  };
}
