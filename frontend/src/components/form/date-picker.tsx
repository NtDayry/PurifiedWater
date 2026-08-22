// https://flatpickr.js.org/
// https://flatpickr.js.org/options/
import Flatpickr, { OptionsType } from 'react-flatpickr';
import 'flatpickr/dist/flatpickr.css';
// import flatpickr from "flatpickr"
// import { Thai } from "flatpickr/dist/l10n/th.js"
import Label from './Label';
import { CalenderLineIcon } from '@/icons';

type PropsType = {
  id: string;
  label?: string;
  placeholder?: string;
  options?: OptionsType;
  value?: string;
  onChange: (id: string, label: string) => void;
};

export default function DatePicker({ id, label, placeholder, options, value, onChange }: PropsType) {
  return (
    <div>
      {label && <Label htmlFor={id}>{label}</Label>}

      <div className="relative">
        <Flatpickr
          id={id}
          options={{ enableTime: false, dateFormat: 'd/m/Y', monthSelectorType: "static", inline: false, ...options }}
          className="h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3  dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30  bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 focus:ring-brand-500/20 dark:border-gray-700  dark:focus:border-brand-800"
          value={value}
          placeholder={placeholder}
          onChange={onChange ? (_selectedDates, dateStr, _instance) => onChange(id, dateStr) : undefined}
          data-enable-time
        />
        <span className="absolute text-gray-500 -translate-y-1/2 pointer-events-none right-3 top-1/2 dark:text-gray-400">
          <CalenderLineIcon className="size-6" />
        </span>
      </div>
    </div>
  );
}
