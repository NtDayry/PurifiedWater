import { useFullScreen } from '@/context/FullScreenContext';
import { FullscreenIcon, ExitFullscreenIcon } from '@/icons';

export const FullscreenToggleButton: React.FC = () => {
  const { fullScreen, toggleFullScreen } = useFullScreen();

  return (
    <button
      onClick={toggleFullScreen}
      className="relative flex items-center justify-center text-gray-500 transition-colors rounded-full border hover:text-dark-900 h-11 w-11 hover:bg-gray-100 hover:text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
    >
      {fullScreen ? <ExitFullscreenIcon className="w-5 h-5" /> : <FullscreenIcon className="w-5 h-5" />}
    </button>
  );
};
