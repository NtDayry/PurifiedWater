import type React from 'react';
import { ReactNode } from 'react';
import type { FC } from 'react';

interface InputProps extends React.DetailedHTMLProps<React.InputHTMLAttributes<HTMLInputElement>, HTMLInputElement> {
  type?: React.HTMLInputTypeAttribute;
  inputMode?: 'none' | 'text' | 'tel' | 'url' | 'email' | 'numeric' | 'decimal' | 'search';
  id?: string;
  name?: string;
  placeholder?: string;
  autoComplete?: string;
  passwordContext?: 'current' | 'new'; // 🆕 เพิ่ม context สำหรับ password
  value?: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  min?: string;
  max?: string;
  step?: number;
  disabled?: boolean;
  success?: boolean;
  warning?: boolean;
  error?: boolean;
  hint?: string;
  required?: boolean;
  readOnly?: boolean;
  startIcon?: ReactNode;
  endIcon?: ReactNode;
}

const Input: FC<InputProps> = ({
  type = 'text',
  inputMode,
  id,
  name,
  placeholder,
  autoComplete,
  passwordContext,
  value,
  onChange,
  onBlur,
  className = '',
  min,
  max,
  step,
  disabled = false,
  success = false,
  warning = false,
  error = false,
  hint,
  required = false,
  readOnly = false,
  startIcon,
  endIcon,
}) => {
  let inputClasses = `h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 ${className}`;

  if (disabled) {
    inputClasses += ` text-gray-500 border-gray-300 opacity-40 bg-gray-100 cursor-not-allowed dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700`;
  } else if (error) {
    inputClasses += ` border-error-500 focus:border-error-300 focus:ring-error-500/20 dark:text-error-400 dark:border-error-500 dark:focus:border-error-800`;
  } else if (success) {
    inputClasses += ` border-success-500 focus:border-success-300 focus:ring-success-500/20 dark:text-success-400 dark:border-success-500 dark:focus:border-success-800`;
  } else if (warning) {
    inputClasses += ` border-warning-500 focus:border-warning-300 focus:ring-warning-500/20 dark:text-warning-400 dark:border-warning-500 dark:focus:border-warning-800`;
  } else {
    inputClasses += ` bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 focus:ring-brand-500/20 dark:border-gray-700 dark:text-white/90 dark:focus:border-brand-800`;
  }

  // 🧠 กำหนดค่า autoComplete อัตโนมัติ
  const resolvedAutoComplete =
    autoComplete ??
    (type === 'password'
      ? passwordContext === 'new'
        ? 'new-password'
        : 'current-password'
      : undefined);

  return (
    <>
      <div className="relative">
        {startIcon}
        <input
          type={type}
          inputMode={inputMode}
          id={id}
          name={name}
          placeholder={placeholder}
          autoComplete={resolvedAutoComplete}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          className={inputClasses}
          required={required}
          readOnly={readOnly}
        />
        {endIcon}
      </div>
      {hint && (
        <p
          className={`mt-1.5 text-xs animate-fadeIn ${
            error
              ? 'text-error-500'
              : warning
              ? 'text-warning-500'
              : success
              ? 'text-success-500'
              : 'text-gray-500'
          }`}
        >
          {hint}
        </p>
      )}
    </>
  );
};

export default Input;