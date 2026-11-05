import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import PageMeta from '@/components/common/PageMeta';
import UserMetaCard from '@/components/user-profile/UserMetaCard';
import UserInfoCard from '@/components/user-profile/UserInfoCard';
import UserPasswordCard from '@/components/user-profile/UserPasswordCard';
import { useLoading } from '@/context/LoadingContext';
import { api, API_URL, parseFetchError } from '@/api';
import { useAuthStore } from '@/store/auth';
import { User } from '@_types/user';
import { UserCircleIcon } from '@/icons';
import useSwalAlert from '@/hooks/useSwalAlert';
import { useReload } from '@/hooks/useReload';

export default function UserProfiles() {
  const { t } = useTranslation();
  const setAuth = useAuthStore((s) => s.setAuth);
  const { setLoading } = useLoading();
  const SwalAlert = useSwalAlert();
  const { isReload, reload } = useReload();
  const [data, setData] = useState<User>();

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true, 'before', 500);
        const response = await api.get(`${API_URL.USERS_ME}`);
        const data: User = response.data;
        setAuth(data.id, data.fullname, data.profile_image, data.username, data.role, data.permissions || []);
        setData(data);
      } catch (error) {
        parseFetchError({
          error,
          onOtherError: () => SwalAlert.error(),
        });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isReload]);

  return (
    <>
      <PageMeta title={t('page.users_profile.title')} description={t('page.users_profile.subtitle')} />
      <PageBreadcrumb
        pageTitle={t('page.users_profile.title')}
        pageSubTitle={t('page.users_profile.subtitle')}
        icon={<UserCircleIcon className="inline-block mr-1 text-sky-500" width={50} height={50} />}
      />

      <div className="flex gap-5 flex-col lg:flex-row">
        <UserMetaCard post={data} reload={reload} />

        <div className="flex flex-col items-center w-full gap-6">
          <UserInfoCard post={data} reload={reload} />
          <UserPasswordCard/>
        </div>
      </div>
    </>
  );
}
