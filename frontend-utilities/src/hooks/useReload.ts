import { useState, useCallback } from 'react';

export const useReload = (initialState: boolean = false) => {
  const [isReload, setIsReload] = useState(initialState);

  const reload = useCallback(() => {
    setIsReload((prev) => !prev);
  }, []);

  return { isReload, setIsReload, reload };
};
