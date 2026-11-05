import { useState, useRef } from 'react';
import Input from '@/components/form/input/InputField';
import Label from '@/components/form/Label';

export interface AutocompleteProps<T> {
  label?: string;
  placeholder?: string;
  items: T[];
  getLabel: (item: T) => string;
  value?: string;
  error?: boolean;
  onChange: (value: string) => void;
}

export function Autocomplete<T>({
  label,
  placeholder,
  items,
  getLabel,
  value = "",
  error=false,
  onChange,
}: AutocompleteProps<T>) {
  const [filtered, setFiltered] = useState<T[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    onChange(query);

    if (query.trim() === "") {
      setFiltered([]);
      setIsOpen(false);
    } else {
      const result = items.filter((item) =>
        getLabel(item).toLowerCase().includes(query.toLowerCase())
      );
      setFiltered(result);
      setIsOpen(true);
    }
  };

  const handleSelect = (item: T) => {
    onChange(getLabel(item));
    setIsOpen(false);
  };

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    // ถ้า focus ออกนอก container ให้ปิด dropdown
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setIsOpen(false);
    }
  };

  return (
    <div
      className="relative w-full"
      ref={containerRef}
      onBlur={handleBlur}
    >
      {label && <Label>{label}</Label>}

      <Input
        value={value}
        error={error}
        placeholder={placeholder}
        onChange={handleChange}
      />

      {isOpen && filtered.length > 0 && (
        <ul className="absolute z-10 bg-white border text-sm dark:border-gray-800 mt-1 w-full rounded-md shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((item, idx) => (
            <li
              key={idx}
              onClick={() => handleSelect(item)}
              tabIndex={0} // ทำให้ li focusable
              className="px-3 py-2 cursor-pointer hover:!bg-primary hover:text-white text-gray-800 dark:text-white dark:bg-gray-700"
            >
              {getLabel(item)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}