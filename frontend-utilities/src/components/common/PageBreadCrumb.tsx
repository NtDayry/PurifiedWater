import { Link } from "react-router";
import { useTranslation } from 'react-i18next'

interface BreadcrumbProps {
  pageTitle: string;
  pageSubTitle?: string;
  icon?: React.ReactNode;
}

const PageBreadcrumb: React.FC<BreadcrumbProps> = ({
  pageTitle,
  pageSubTitle,
  icon,
}) => {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div className="flex flex-wrap items-center justify-between">
        <span className="inline-block mr-2">{icon}</span>
        <h2
          className="text-xl font-semibold text-gray-800 dark:text-white/90"
          x-text="pageName"
        >
          {pageTitle}
          <p className="text-gray-500 text-theme-sm dark:text-gray-400">
            {pageSubTitle}
          </p>
        </h2>
      </div>
      <nav>
        <ol className="flex items-end gap-1.5">
          <li>
            <Link
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400"
              to="/"
            >
              {t('navbar.dashboard')}
              <svg
                className="stroke-current"
                width="17"
                height="16"
                viewBox="0 0 17 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M6.0765 12.667L10.2432 8.50033L6.0765 4.33366"
                  stroke=""
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
          </li>
          <li className="text-sm pb-[1px] text-gray-800 dark:text-white/90">
            {pageTitle}
          </li>
        </ol>
      </nav>
    </div>
  );
};

export default PageBreadcrumb;
