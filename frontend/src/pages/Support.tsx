import { useEffect, useState } from 'react';
import GridShape from '@/components/common/GridShape';
import PageMeta from '@/components/common/PageMeta';
import ThemeTogglerTwo from '@/components/common/ThemeTogglerTwo';
import { LanguageToggleButton } from '@/components/common/LanguageToggleButton';
import { api, API_URL, URL } from '@/api';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { HomeIcon, CallIcon } from '@/icons';
import type { SupportTeamMember } from '@_types/support_team';
import SupportTeamAutoScrollList from '@/components/support/SupportTeamAutoScrollList';

export default function Support() {
  const { t, i18n } = useTranslation();
  const isEnglish = (i18n.resolvedLanguage || i18n.language || 'th').startsWith('en');
  const [supportTeam, setSupportTeam] = useState<SupportTeamMember[]>([]);

  useEffect(() => {
    // Fetch support team members from the API
    const fetchSupportTeam = async () => {
      try {
        const response = await api.get(API_URL.SUPPORT_TEAM);
        setSupportTeam(response.data);
      } catch (error) {
        console.error('Error fetching support team:', error);
      }
    };

    fetchSupportTeam();
  }, []);

  return (
    <>
      <PageMeta title={t('page.support.meta_title')} description={t('page.support.meta_description')} />

      <div className="relative p-0 bg-white z-1 dark:bg-gray-900">
        <div className="relative flex flex-col justify-center w-full lg:flex-row dark:bg-gray-900 sm:p-0">
          {/* Support Team Members */}
          <div className="flex min-h-screen flex-col items-center justify-center overflow-hidden z-1 md:p-8">
            <GridShape />
            <div className="mx-auto w-full max-w-7xl shadow-theme-xl rounded-3xl">
              <div className="overflow-hidden lg:rounded-3xl border border-gray-200 bg-white/95 shadow-theme-xl backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/95">
                <div className="grid gap-0 lg:grid-cols-2">
                  <div className="relative p-8 sm:p-10 lg:p-12">
                    <div className="relative">
                      <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200">
                        <span className="h-2 w-2 rounded-full bg-brand-500" />
                        {t('page.support.badge')}
                      </div>

                      <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl xl:text-5xl">
                        {t('page.support.title')}
                      </h1>

                      <p className="mt-5 max-w-2xl text-base leading-7 text-gray-600 dark:text-gray-300 sm:text-lg">{t('page.support.subtitle')}</p>

                      <div className="mt-8 grid gap-4 sm:grid-cols-2">
                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-white/[0.03]">
                          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('page.support.contact.label')}</p>
                          <p className="mt-2 text-xl font-bold text-gray-900 dark:text-white">
                            <CallIcon className="inline-block mr-2" />
                            {t('page.support.call_button')}
                          </p>
                          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{t('page.support.contact.description')}</p>
                        </div>

                        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-white/[0.03]">
                          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('page.support.status.label')}</p>
                          <p className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">{t('page.support.status.value')}</p>
                          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{t('page.support.status.description')}</p>
                        </div>
                      </div>

                      <div className="mt-8 flex flex-wrap gap-3">
                        <Link
                          to={URL.HOME}
                          className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-theme-xs transition hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.03] dark:hover:text-white"
                        >
                          <HomeIcon children={undefined} className="mr-2 text-sky-300" width={25} height={25} />
                          <span className="pt-1">{t('page.support.home_button')}</span>
                        </Link>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-200 bg-gray-50/70 p-8 dark:border-gray-800 dark:bg-white/[0.02] sm:p-10 lg:border-t-0 lg:border-l">
                    <div className="mb-6">
                      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t('page.support.members.title')}</h2>
                      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{t('page.support.members.subtitle')}</p>
                    </div>

                    <SupportTeamAutoScrollList members={supportTeam} isEnglish={isEnglish} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Language and Theme Togglers */}
          <div
            className="
            fixed top-2 right-4 z-50 
            p-1.5 rounded-xl
            scale-90 origin-top-right
            sm:top-5 md:right-10 sm:p-0 sm:bg-transparent sm:dark:bg-transparent sm:backdrop-blur-none sm:border-0 sm:scale-100
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
    </>
  );
}
