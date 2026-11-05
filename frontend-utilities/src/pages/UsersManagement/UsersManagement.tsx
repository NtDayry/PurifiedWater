import PageBreadcrumb from '@/components/common/PageBreadCrumb';
import PageMeta from '@/components/common/PageMeta';
import UsersManagement from '@/components/users-management/UsersManagement';
import { useTranslation } from 'react-i18next'
import { UserCircleIcon } from '@/icons';

export default function UsersManagementPage() {
  const { t } = useTranslation();

  return (
    <>
      <PageMeta
        title={t("page.users_management.title")}
        description={t("page.users_management.subtitle")}
      />
      <PageBreadcrumb
        pageTitle={t("page.users_management.title")}
        pageSubTitle={t("page.users_management.subtitle")}
        icon={<UserCircleIcon className="inline-block mr-1 text-sky-500" width={50} height={50} />}
      />
      <div className="space-y-6">
        <UsersManagement />
      </div>
    </>
  );
}
