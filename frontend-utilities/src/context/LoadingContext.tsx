import { createContext, useContext, useState, ReactNode, useRef } from 'react';

type DelayMode = 'none' | 'before' | 'after';

interface LoadingContextType {
  loading: boolean;
  setLoading: (value: boolean, mode?: DelayMode, delay?: number) => void;
  setBeforeLoading: (value: boolean, delay?: number) => void;
  setAfterLoading: (value: boolean, delay?: number) => void;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

interface LoadingProviderProps {
  children: ReactNode;
  defaultDelay?: number; // ค่า delay เริ่มต้น (ms)
}

export const LoadingProvider: React.FC<LoadingProviderProps> = ({ children, defaultDelay = 500 }) => {
  const [loading, _setLoadingState] = useState(false); // set false is bypass
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastStartTimeRef = useRef<number | null>(null);

  const setLoading = (value: boolean, mode: DelayMode = 'none', delay: number = defaultDelay) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    if (mode === 'none') {
      _setLoadingState(value);
      lastStartTimeRef.current = value ? Date.now() : null;
      return;
    }

    if (mode === 'before') {
      if (value) {
        timeoutRef.current = setTimeout(() => {
          _setLoadingState(true);
          timeoutRef.current = null;
          lastStartTimeRef.current = Date.now();
        }, delay);
      } else {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        _setLoadingState(false);
      }
    }

    if (mode === 'after') {
      if (value) {
        _setLoadingState(true);
        lastStartTimeRef.current = Date.now();
      } else {
        if (lastStartTimeRef.current) {
          const elapsed = Date.now() - lastStartTimeRef.current;
          const remaining = Math.max(delay - elapsed, 0);
          if (remaining > 0) {
            timeoutRef.current = setTimeout(() => {
              _setLoadingState(false);
              timeoutRef.current = null;
            }, remaining);
          } else {
            _setLoadingState(false);
          }
        } else {
          _setLoadingState(false);
        }
      }
    }
  };

  const setBeforeLoading = (value: boolean, delay?: number) => setLoading(value, 'before', delay);
  const setAfterLoading = (value: boolean, delay?: number) => setLoading(value, 'after', delay);

  return (
    <LoadingContext.Provider value={{ loading, setLoading, setBeforeLoading, setAfterLoading }}>
      {children}
    </LoadingContext.Provider>
  );
};

export const useLoading = (): LoadingContextType => {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error('useLoading must be used within a LoadingProvider');
  }
  return context;
};
