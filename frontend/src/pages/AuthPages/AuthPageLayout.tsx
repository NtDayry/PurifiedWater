import React from 'react';
import GridShape from '@/components/common/GridShape';
import ThemeTogglerTwo from '@/components/common/ThemeTogglerTwo';
import { LanguageToggleButton } from '@/components/common/LanguageToggleButton';

const COPYRIGHT = import.meta.env.VITE_COPYRIGHT;

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative p-6 bg-white z-1 dark:bg-gray-900 sm:p-0">
      <div className="relative flex flex-col justify-center w-full h-screen lg:flex-row dark:bg-gray-900 sm:p-0">
        {children}

        <div className="items-center hidden w-full h-full lg:w-1/2 bg-brand-950 dark:bg-white/5 lg:grid">
          <div className="relative flex items-center justify-center z-1">
            {/* <!-- ===== Common Grid Shape Start ===== --> */}
            <GridShape />
            <div className="flex flex-col items-center max-w-xs">
              <img width={150} height={150} src="/engineering.png" alt="Logo" className="border-0 rounded-xl mb-4" />
              <p className="text-center text-gray-400 dark:text-white/60">{COPYRIGHT}</p>
            </div>
          </div>
        </div>

        <div
          className="
            fixed top-2 right-4 z-50 
            p-1.5 rounded-xl
            scale-90 origin-top-right
            sm:top-5 sm:right-6 sm:p-0 sm:bg-transparent sm:dark:bg-transparent sm:backdrop-blur-none sm:border-0 sm:scale-100
            sm:opacity-50 hover:sm:opacity-100 transition-all duration-300
          "
        >
          <div className="flex items-center gap-3 sm:gap-2">
            <LanguageToggleButton size={10} />
            <ThemeTogglerTwo size={10} />
          </div>
        </div>
      </div>
    </div>
  );
}
