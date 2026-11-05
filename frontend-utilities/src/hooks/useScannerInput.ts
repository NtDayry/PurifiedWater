// hooks/useScannerInput.ts
import { useEffect, useState } from 'react';

export const useScannerInput = () => {
  const [scannedValue, setScannedValue] = useState<string>('');

  useEffect(() => {
    let buffer = '';

    const handleKeyDown = (e: KeyboardEvent) => {
      // ตรวจว่าไม่โฟกัส input หรือ textarea
      const activeElement = document.activeElement;
      const isTypingInInput =
        activeElement &&
        (activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          (activeElement as HTMLElement).isContentEditable);

      if (isTypingInInput) return;

      if (e.key === 'Enter') {
        setScannedValue(buffer);
        buffer = '';
        return;
      }

      if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return scannedValue;
};
