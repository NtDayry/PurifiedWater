import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

type FullScreenType = {
  fullScreen: boolean;
  toggleFullScreen: () => Promise<void>;
};

export const FullScreenContext =
  createContext<FullScreenType | undefined>(
    undefined
  );

export const FullScreenProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [fullScreen, setFullScreen] = useState(
    () => document.fullscreenElement !== null
  );

  /**
   * Sync React state กับสถานะ Fullscreen จริงของ Browser
   */
  const syncFullScreenState = useCallback(() => {
    setFullScreen(
      document.fullscreenElement !== null
    );
  }, []);

  /**
   * เข้า / ออกจาก Fullscreen
   */
  const toggleFullScreen = useCallback(
    async () => {
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        } else {
          await document.documentElement.requestFullscreen();
        }
      } catch (error) {
        console.error(
          'Fullscreen error:',
          error
        );

        // Sync สถานะจริงอีกครั้ง
        syncFullScreenState();
      }
    },
    [syncFullScreenState]
  );

  /**
   * ตรวจจับการเปลี่ยนสถานะ Fullscreen
   *
   * รองรับ:
   * - requestFullscreen()
   * - exitFullscreen()
   * - F11
   * - Esc
   * - Browser เปลี่ยนสถานะเอง
   */
  useEffect(() => {
    const handleFullscreenChange = () => {
      syncFullScreenState();
    };

    document.addEventListener(
      'fullscreenchange',
      handleFullscreenChange
    );

    // ตรวจสถานะจริงทันทีหลัง mount
    syncFullScreenState();

    return () => {
      document.removeEventListener(
        'fullscreenchange',
        handleFullscreenChange
      );
    };
  }, [syncFullScreenState]);

  return (
    <FullScreenContext.Provider
      value={{
        fullScreen,
        toggleFullScreen,
      }}
    >
      {children}
    </FullScreenContext.Provider>
  );
};

export const useFullScreen = (): FullScreenType => {
  const context = useContext(
    FullScreenContext
  );

  if (!context) {
    throw new Error(
      'useFullScreen must be used within a FullScreenProvider'
    );
  }

  return context;
};