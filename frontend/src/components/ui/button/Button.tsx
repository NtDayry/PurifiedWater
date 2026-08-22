import { ReactNode } from 'react';
import clsx from 'clsx'; // ใช้ merge className

type Variant =
  // solid
  | 'primary'
  | 'error'
  | 'success'
  | 'warning'
  | 'info'
  | 'secondary'
  | 'neutral'
  | 'black'
  | 'white'
  | 'link'
  // outline
  | 'primary-outline'
  | 'error-outline'
  | 'success-outline'
  | 'warning-outline'
  | 'info-outline'
  | 'secondary-outline'
  | 'neutral-outline'
  | 'black-outline'
  | 'white-outline'
  | 'link-outline'
  // soft
  | 'primary-soft'
  | 'error-soft'
  | 'success-soft'
  | 'warning-soft'
  | 'info-soft'
  | 'secondary-soft'
  | 'neutral-soft'
  | 'black-soft'
  | 'white-soft'
  | 'link-soft'
  // soft-outline
  | 'primary-soft-outline'
  | 'error-soft-outline'
  | 'success-soft-outline'
  | 'warning-soft-outline'
  | 'info-soft-outline'
  | 'secondary-soft-outline'
  | 'neutral-soft-outline'
  | 'black-soft-outline'
  | 'white-soft-outline'
  | 'link-soft-outline';

interface ButtonProps {
  children: ReactNode;
  size?: 'sm' | 'md';
  type?: 'button' | 'submit' | 'reset';
  /** ใช้ string หรือ object { light, dark } ก็ได้ */
  variant?: Variant | { light: Variant; dark?: Variant };
  startIcon?: ReactNode;
  endIcon?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

const Button: React.FC<ButtonProps> = ({
  children,
  size = 'sm',
  type = 'button',
  variant = 'primary',
  startIcon,
  endIcon,
  onClick,
  className = '',
  disabled = false,
}) => {
  // Size
  const sizeClasses = {
    sm: 'px-3 py-3 text-sm h-10',
    md: 'px-5 py-3.5 text-md',
  };

  /** Light Variants */
  const lightVariants: Record<Variant, string> = {
    // Solid
    primary: `bg-primary text-white shadow-theme-xs hover:bg-primary-hover active:bg-primary-dark disabled:bg-primary/50`,
    error: `bg-error text-white shadow-theme-xs hover:bg-error-hover active:bg-error-dark disabled:bg-error/50`,
    success: `bg-success text-white shadow-theme-xs hover:bg-success-hover active:bg-success-dark disabled:bg-success/50`,
    warning: `bg-warning-500 text-white shadow-theme-xs hover:bg-warning-hover active:bg-warning-600 disabled:bg-warning-300`,
    info: `bg-info text-white shadow-theme-xs hover:bg-info-hover active:bg-info-dark disabled:bg-info/50`,
    secondary: `bg-secondary text-white shadow-theme-xs hover:bg-secondary-hover active:bg-secondary-dark disabled:bg-secondary/50`,
    neutral: `bg-gray-500 text-white shadow-theme-xs hover:bg-gray-600 active:bg-gray-700 disabled:bg-gray-400`,
    black: `bg-black text-white shadow-theme-xs hover:bg-gray-900 active:bg-gray-800 disabled:bg-gray-700`,
    white: `bg-white text-black shadow-theme-xs hover:bg-gray-100 active:bg-gray-200 disabled:bg-gray-50`,
    link: `bg-transparent text-primary underline hover:text-primary-dark active:text-primary-dark disabled:opacity-50`,

    // Outline
    'primary-outline': `bg-transparent text-primary ring-1 ring-inset ring-primary hover:bg-primary/10 active:bg-primary/20 disabled:opacity-50`,
    'error-outline': `bg-transparent text-error ring-1 ring-inset ring-error hover:bg-error/10 active:bg-error/20 disabled:opacity-50`,
    'success-outline': `bg-transparent text-success ring-1 ring-inset ring-success hover:bg-success/10 active:bg-success/20 disabled:opacity-50`,
    'warning-outline': `bg-transparent text-warning-500 ring-1 ring-inset ring-warning-500 hover:bg-warning-50 active:bg-warning-100 disabled:opacity-50`,
    'info-outline': `bg-transparent text-info ring-1 ring-inset ring-info hover:bg-info/10 active:bg-info/20 disabled:opacity-50`,
    'secondary-outline': `bg-transparent text-secondary ring-1 ring-inset ring-secondary hover:bg-secondary/10 active:bg-secondary/20 disabled:opacity-50`,
    'neutral-outline': `bg-transparent text-gray-500 ring-1 ring-inset ring-gray-500 hover:bg-gray-100 active:bg-gray-200 disabled:opacity-50`,
    'black-outline': `bg-transparent text-black ring-1 ring-inset ring-black hover:bg-gray-100 active:bg-gray-200 disabled:opacity-50`,
    'white-outline': `bg-transparent text-white ring-1 ring-inset ring-white hover:bg-gray-100 active:bg-gray-200 disabled:opacity-50`,
    'link-outline': `bg-transparent text-primary underline hover:text-primary-dark active:text-primary-dark disabled:opacity-50`,

    // Soft
    'primary-soft': `bg-primary/10 text-primary hover:bg-primary/20 active:bg-primary/30 disabled:opacity-50`,
    'error-soft': `bg-error/10 text-error hover:bg-error/20 active:bg-error/30 disabled:opacity-50`,
    'success-soft': `bg-success/10 text-success hover:bg-success/20 active:bg-success/30 disabled:opacity-50`,
    'warning-soft': `bg-warning-100 text-warning-700 hover:bg-warning-200 active:bg-warning-300 disabled:opacity-50`,
    'info-soft': `bg-info/10 text-info hover:bg-info/20 active:bg-info/30 disabled:opacity-50`,
    'secondary-soft': `bg-secondary/10 text-secondary hover:bg-secondary/20 active:bg-secondary/30 disabled:opacity-50`,
    'neutral-soft': `bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300 disabled:opacity-50`,
    'black-soft': `bg-gray-900 text-white hover:bg-gray-800 active:bg-gray-700 disabled:opacity-50`,
    'white-soft': `bg-gray-50 text-black hover:bg-gray-100 active:bg-gray-200 disabled:opacity-50`,
    'link-soft': `bg-transparent text-primary underline hover:text-primary-dark active:text-primary-dark disabled:opacity-50`,

    // Soft-Outline
    'primary-soft-outline': `bg-primary/10 text-primary ring-1 ring-inset ring-primary/50 hover:bg-primary/30 active:bg-primary/20 disabled:opacity-50`,
    'error-soft-outline': `bg-error/10 text-error ring-1 ring-inset ring-error/50 hover:bg-error/30 active:bg-error/20 disabled:opacity-50`,
    'success-soft-outline': `bg-success/10 text-success ring-1 ring-inset ring-success/50 hover:bg-success/30 active:bg-success/20 disabled:opacity-50`,
    'warning-soft-outline': `bg-warning-50 text-warning-700 ring-1 ring-inset ring-warning-300 hover:bg-warning-100 active:bg-warning-200 disabled:opacity-50`,
    'info-soft-outline': `bg-info/10 text-info ring-1 ring-inset ring-info/50 hover:bg-info/30 active:bg-info/20 disabled:opacity-50`,
    'secondary-soft-outline': `bg-secondary/10 text-secondary ring-1 ring-inset ring-secondary/50 hover:bg-secondary/30 active:bg-secondary/20 disabled:opacity-50`,
    'neutral-soft-outline': `bg-gray-100 text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-200 active:bg-gray-300 disabled:opacity-50`,
    'black-soft-outline': `bg-gray-900 text-white ring-1 ring-inset ring-gray-700 hover:bg-gray-800 active:bg-gray-700 disabled:opacity-50`,
    'white-soft-outline': `bg-gray-50 text-black ring-1 ring-inset ring-gray-200 hover:bg-gray-100 active:bg-gray-200 disabled:opacity-50`,
    'link-soft-outline': `bg-transparent text-primary underline hover:text-primary-dark active:text-primary-dark disabled:opacity-50`,
  };

  /** Dark Variants */
  const darkVariants: Record<Variant, string> = {
    // Solid
    primary: `dark:bg-primary dark:text-white dark:shadow-theme-xs dark:hover:bg-primary-hover dark:active:bg-primary-dark dark:disabled:bg-primary/50`,
    error: `dark:bg-error dark:text-white dark:shadow-theme-xs dark:hover:bg-error-hover dark:active:bg-error-dark dark:disabled:bg-error/50`,
    success: `dark:bg-success dark:text-white dark:shadow-theme-xs dark:hover:bg-success-hover dark:active:bg-success-dark dark:disabled:bg-success/50`,
    warning: `dark:bg-warning-500 dark:text-white dark:shadow-theme-xs dark:hover:bg-warning-hover dark:active:bg-warning-600 dark:disabled:bg-warning-300`,
    info: `dark:bg-info dark:text-white dark:shadow-theme-xs dark:hover:bg-info-hover dark:active:bg-info-dark dark:disabled:bg-info/50`,
    secondary: `dark:bg-secondary dark:text-white dark:shadow-theme-xs dark:hover:bg-secondary-hover dark:active:bg-secondary-dark dark:disabled:bg-secondary/50`,
    neutral: `dark:bg-gray-500 dark:text-white dark:shadow-theme-xs dark:hover:bg-gray-600 dark:active:bg-gray-700 dark:disabled:bg-gray-400`,
    black: `dark:bg-black dark:text-white dark:shadow-theme-xs dark:hover:bg-gray-900 dark:active:bg-gray-800 dark:disabled:bg-gray-700`,
    white: `dark:bg-white dark:text-black dark:shadow-theme-xs dark:hover:bg-gray-100 dark:active:bg-gray-200 dark:disabled:bg-gray-50`,
    link: `dark:bg-transparent dark:text-primary dark:underline dark:hover:text-primary-hover dark:active:text-primary-dark dark:disabled:opacity-50`,

    // Outline
    'primary-outline': `dark:bg-transparent dark:text-primary dark:ring-1 dark:ring-inset dark:ring-primary dark:hover:bg-primary/10 dark:active:bg-primary/20 dark:disabled:opacity-50`,
    'error-outline': `dark:bg-transparent dark:text-error dark:ring-1 dark:ring-inset dark:ring-error dark:hover:bg-error/10 dark:active:bg-error/20 dark:disabled:opacity-50`,
    'success-outline': `dark:bg-transparent dark:text-success dark:ring-1 dark:ring-inset dark:ring-success dark:hover:bg-success/10 dark:active:bg-success/20 dark:disabled:opacity-50`,
    'warning-outline': `dark:bg-transparent dark:text-warning-500 dark:ring-1 dark:ring-inset dark:ring-warning-500 dark:hover:bg-warning-50 dark:active:bg-warning-100 dark:disabled:opacity-50`,
    'info-outline': `dark:bg-transparent dark:text-info dark:ring-1 dark:ring-inset dark:ring-info dark:hover:bg-info/10 dark:active:bg-info/20 dark:disabled:opacity-50`,
    'secondary-outline': `dark:bg-transparent dark:text-secondary dark:ring-1 dark:ring-inset dark:ring-secondary dark:hover:bg-secondary/10 dark:active:bg-secondary/20 dark:disabled:opacity-50`,
    'neutral-outline': `dark:bg-transparent dark:text-gray-300 dark:ring-1 dark:ring-inset dark:ring-gray-400 dark:hover:bg-gray-700 dark:active:bg-gray-600 dark:disabled:opacity-50`,
    'black-outline': `dark:bg-transparent dark:text-white dark:ring-1 dark:ring-inset dark:ring-white dark:hover:bg-gray-800 dark:active:bg-gray-700 dark:disabled:opacity-50`,
    'white-outline': `dark:bg-transparent dark:text-white dark:ring-1 dark:ring-inset dark:ring-white dark:hover:bg-gray-100 dark:active:bg-gray-200 dark:disabled:opacity-50`,
    'link-outline': `dark:bg-transparent dark:text-primary dark:underline dark:hover:text-primary-hover dark:active:text-primary-dark dark:disabled:opacity-50`,

    // Soft
    'primary-soft': `dark:bg-primary/10 dark:text-primary dark:hover:bg-primary/20 dark:active:bg-primary/30 dark:disabled:opacity-50`,
    'error-soft': `dark:bg-error/10 dark:text-error dark:hover:bg-error/20 dark:active:bg-error/30 dark:disabled:opacity-50`,
    'success-soft': `dark:bg-success/10 dark:text-success dark:hover:bg-success/20 dark:active:bg-success/30 dark:disabled:opacity-50`,
    'warning-soft': `dark:bg-warning-100 dark:text-warning-700 dark:hover:bg-warning-200 dark:active:bg-warning-300 dark:disabled:opacity-50`,
    'info-soft': `dark:bg-info/10 dark:text-info dark:hover:bg-info/20 dark:active:bg-info/30 dark:disabled:opacity-50`,
    'secondary-soft': `dark:bg-secondary/10 dark:text-secondary dark:hover:bg-secondary/20 dark:active:bg-secondary/30 dark:disabled:opacity-50`,
    'neutral-soft': `dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 dark:active:bg-gray-500 dark:disabled:opacity-50`,
    'black-soft': `dark:bg-gray-900 dark:text-white dark:hover:bg-gray-800 dark:active:bg-gray-700 dark:disabled:opacity-50`,
    'white-soft': `dark:bg-gray-100 dark:text-black dark:hover:bg-gray-200 dark:active:bg-gray-300 dark:disabled:opacity-50`,
    'link-soft': `dark:bg-transparent dark:text-primary dark:underline dark:hover:text-primary-hover dark:active:text-primary-dark dark:disabled:opacity-50`,

    // Soft-Outline
    'primary-soft-outline': `dark:bg-primary/15 dark:text-primary dark:ring-1 dark:ring-inset dark:ring-primary/50 dark:hover:bg-primary/10 dark:active:bg-primary/20 dark:disabled:opacity-50`,
    'error-soft-outline': `dark:bg-error/15 dark:text-error dark:ring-1 dark:ring-inset dark:ring-error/50 dark:hover:bg-error/30 dark:active:bg-error/20 dark:disabled:opacity-50`,
    'success-soft-outline': `dark:bg-success/15 dark:text-success dark:ring-1 dark:ring-inset dark:ring-success/50 dark:hover:bg-success/30 dark:active:bg-success/20 dark:disabled:opacity-50`,
    'warning-soft-outline': `dark:bg-warning/20 dark:text-warning-400 dark:ring-1 dark:ring-inset dark:ring-warning/40 dark:hover:bg-warning/30 dark:hover:text-warning-300  dark:active:bg-warning-200 dark:disabled:opacity-50`,
    'info-soft-outline': `dark:bg-info/15 dark:text-info dark:ring-1 dark:ring-inset dark:ring-info/50 dark:hover:bg-info/30 dark:active:bg-info/20 dark:disabled:opacity-50`,
    'secondary-soft-outline': `dark:bg-secondary/15 dark:text-secondary dark:ring-1 dark:ring-inset dark:ring-secondary/50 dark:hover:bg-secondary/30 dark:active:bg-secondary/20 dark:disabled:opacity-50`,
    'neutral-soft-outline': `dark:bg-gray-700 dark:text-gray-200 dark:ring-1 dark:ring-inset dark:ring-gray-500 dark:hover:bg-gray-600 dark:active:bg-gray-500 dark:disabled:opacity-50`,
    'black-soft-outline': `dark:bg-gray-900 dark:text-white dark:ring-1 dark:ring-inset dark:ring-gray-700 dark:hover:bg-gray-800 dark:active:bg-gray-700 dark:disabled:opacity-50`,
    'white-soft-outline': `dark:bg-gray-100 dark:text-black dark:ring-1 dark:ring-inset dark:ring-gray-200 dark:hover:bg-gray-200 dark:active:bg-gray-300 dark:disabled:opacity-50`,
    'link-soft-outline': `dark:bg-transparent dark:text-primary dark:underline dark:hover:text-primary-hover dark:active:text-primary-dark dark:disabled:opacity-50`,
  };

  // รวมคลาสตามรูปแบบ variant ที่ส่งมา
  let variantClass = '';
  if (typeof variant === 'string') {
    variantClass = `${lightVariants[variant]} ${darkVariants[variant]}`;
  } else {
    const lightKey = variant.light;
    const darkKey = variant.dark ?? variant.light;
    variantClass = `${lightVariants[lightKey]} ${darkVariants[darkKey]}`;
  }

  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg transition',
        sizeClasses[size],
        variantClass,
        `${disabled && 'cursor-not-allowed opacity-50'}`,
        className
      )}
      onClick={onClick}
      disabled={disabled}
      type={type}
    >
      {startIcon && <span className="flex items-center justify-center">{startIcon}</span>}
      {children}
      {endIcon && <span className="flex items-center justify-center">{endIcon}</span>}
    </button>
  );
};

export default Button;
