import { useEffect, useMemo, useRef, useState } from 'react';
import { imagePath } from '@/components/utils/formatImagePath';
import type { SupportTeamMember } from '@_types/support_team';

type Props = {
  members: SupportTeamMember[];
  isEnglish: boolean;
};

export default function SupportTeamAutoScrollList({ members, isEnglish }: Props) {
  const pauseTimerRef = useRef<number | null>(null);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [manualPaused, setManualPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);

    updatePreference();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updatePreference);
      return () => mediaQuery.removeEventListener('change', updatePreference);
    }

    mediaQuery.addListener(updatePreference);
    return () => mediaQuery.removeListener(updatePreference);
  }, []);

  useEffect(() => {
    return () => {
      if (pauseTimerRef.current !== null) {
        window.clearTimeout(pauseTimerRef.current);
      }
    };
  }, []);

  const loopEnabled = members.length > 1 && !prefersReducedMotion;
  const marqueeMembers = useMemo(() => (loopEnabled ? [...members, ...members] : members), [loopEnabled, members]);
  const isPaused = hoverPaused || manualPaused || !loopEnabled;

  const pauseTemporarily = (ms = 1200) => {
    if (!loopEnabled) return;

    setManualPaused(true);

    if (pauseTimerRef.current !== null) {
      window.clearTimeout(pauseTimerRef.current);
    }

    pauseTimerRef.current = window.setTimeout(() => {
      setManualPaused(false);
    }, ms);
  };

  return (
    <div className="relative overflow-hidden rounded-3xl border border-gray-200 bg-white/80 shadow-sm dark:border-gray-800 dark:bg-gray-900/60">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-12 bg-gradient-to-b from-white via-white/80 to-transparent dark:from-gray-900 dark:via-gray-900/80" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-12 bg-gradient-to-t from-white via-white/80 to-transparent dark:from-gray-900 dark:via-gray-900/80" />

      <div
        className="max-h-[450px] overflow-hidden p-4 sm:p-6"
        onMouseEnter={() => setHoverPaused(true)}
        onMouseLeave={() => setHoverPaused(false)}
        onFocusCapture={() => setHoverPaused(true)}
        onBlurCapture={() => setHoverPaused(false)}
        onWheel={() => pauseTemporarily()}
        onTouchStart={() => pauseTemporarily()}
      >
        {marqueeMembers.length > 0 ? (
          <div
            className={`flex flex-col gap-3 will-change-transform ${loopEnabled ? 'animate-support-team-marquee-vertical' : ''}`}
            style={{ animationPlayState: isPaused ? 'paused' : 'running' }}
          >
            {marqueeMembers.map((member, index) => {
              const displayName = isEnglish ? member?.name_en || '' : member.name_th;
              const displayRole = isEnglish ? member?.role_en : member.role_th;
              const keyBase = member.name_en || member.name_th || `${index}`;

              return (
                <div
                  key={`${keyBase}-${index}`}
                  className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm transition duration-300 hover:-translate-y-0.5 hover:shadow-theme-sm dark:border-gray-800 dark:bg-gray-900"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-gray-500/[0.1] bg-gray-700/[0.3]">
                      <img
                        width={40}
                        height={40}
                        src={imagePath(member.profile_image)}
                        alt={member?.name_en || member.name_th || 'support team member'}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = '/polipharm.png';
                        }}
                      />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">{displayName}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{displayRole}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-[140px] items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 text-sm text-gray-500 dark:border-gray-800 dark:bg-white/[0.02] dark:text-gray-400">
            No support team members available
          </div>
        )}
      </div>
    </div>
  );
}
