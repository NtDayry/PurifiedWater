import { useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, Variants } from 'framer-motion';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
  showCloseButton?: boolean;
  isFullscreen?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  animation?: 'fade' | 'slideUp' | 'zoom'; // ✅ เพิ่ม prop animation
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  className,
  showCloseButton = true,
  isFullscreen = false,
  size = 'md',
  animation = 'fade', // default
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  const sizeClasses: Record<string, string> = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
  };

  const contentClasses = isFullscreen
    ? 'w-full h-full'
    : `relative w-full ${sizeClasses[size]} rounded-3xl bg-white dark:bg-gray-900`;

  // ✅ define animation variants
  const animationVariants: Record<string, Variants> = {
    fade: {
      hidden: { opacity: 0 },
      visible: { opacity: 1 },
      exit: { opacity: 0 },
    },
    slideUp: {
      hidden: { opacity: 0, y: 20 },
      visible: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: 20 },
    },
    zoom: {
      hidden: { opacity: 0, scale: 0.8 },
      visible: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 0.8 },
    },
  };

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <div data-hermes-modal-open="true" className="fixed inset-0 flex items-center justify-center overflow-y-auto z-[9999]">
          {!isFullscreen && (
            <motion.div
              className="fixed inset-0 h-full w-full bg-white/[0.5] dark:bg-black/[0.8] backdrop-blur-[10px] dark:backdrop-blur-[20px] shadow-lg"
              onClick={onClose}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />
          )}

          <motion.div
            ref={modalRef}
            className={`${contentClasses} ${className}`}
            onClick={(e) => e.stopPropagation()}
            variants={animationVariants[animation]}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            {showCloseButton && (
              <button
                onClick={onClose}
                className="absolute right-3 top-3 z-[10000] flex h-9.5 w-9.5 items-center justify-center rounded-full bg-gray-100 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white sm:right-6 sm:top-6 sm:h-11 sm:w-11"
              >
                ✕
              </button>
            )}
            <div className="no-scrollbar relative w-full overflow-y-auto custom-scrollbar rounded-2xl bg-white p-0 max-sm:px-5 dark:bg-gray-900">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
};
