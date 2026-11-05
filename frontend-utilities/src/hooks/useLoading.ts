import { useRef, useState } from "react";

type DelayMode = "none" | "before" | "after";

export const useLoading = (
  initialState: boolean = false,
  defaultDelay: number = 500
) => {
  const [isLoading, _setLoading] = useState(initialState);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastStartTimeRef = useRef<number | null>(null);

  const setLoading = (
    value: boolean,
    mode: DelayMode = "none",
    delay: number = defaultDelay
  ) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (mode === "none") {
      _setLoading(value);
      lastStartTimeRef.current = value ? Date.now() : null;
      return;
    }

    if (mode === "before") {
      if (value) {
        timeoutRef.current = setTimeout(() => {
          _setLoading(true);
          timeoutRef.current = null;
          lastStartTimeRef.current = Date.now();
        }, delay);
      } else {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }

        _setLoading(false);
      }

      return;
    }

    if (mode === "after") {
      if (value) {
        _setLoading(true);
        lastStartTimeRef.current = Date.now();
      } else {
        if (lastStartTimeRef.current) {
          const elapsed = Date.now() - lastStartTimeRef.current;

          const remaining = Math.max(delay - elapsed, 0);

          if (remaining > 0) {
            timeoutRef.current = setTimeout(() => {
              _setLoading(false);
              timeoutRef.current = null;
            }, remaining);
          } else {
            _setLoading(false);
          }
        } else {
          _setLoading(false);
        }
      }
    }
  };

  const setBeforeLoading = (
    value: boolean,
    delay?: number
  ) => setLoading(value, "before", delay);

  const setAfterLoading = (
    value: boolean,
    delay?: number
  ) => setLoading(value, "after", delay);

  return {
    isLoading,
    setLoading,
    setBeforeLoading,
    setAfterLoading,
  };
};