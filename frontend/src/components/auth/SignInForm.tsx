import { useState, SubmitEvent } from 'react';
import { Link } from 'react-router';
import { useNavigate } from 'react-router-dom';
import { EyeCloseIcon, EyeIcon, EosThreeDotsLoadingIcon } from '@/icons';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import Checkbox from '@/components/form/input/Checkbox';
import Button from '@/components/ui/button/Button';
import { axios, LoginApi, URL } from '@/api';
import { LoginForm } from '@_types/forms';
import useSwalAlert from '@/hooks/useSwalAlert';
import { useAuthStore } from '@/store/auth';
import { useTranslation } from 'react-i18next';
import GridShape from '@/components/common/GridShape';

export default function SignInForm() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isChecked, setIsChecked] = useState(false);
  const swalAlert = useSwalAlert({
    useModal: false,
    useSidebar: false,
  });

  const [form, setForm] = useState<LoginForm>({
    username: '',
    password: '',
  });

  const [formError, setFormError] = useState({
    username: false,
    password: false,
  });

  const [hintMessage, setHintMessage] = useState<{
    username?: string;
    password?: string;
  }>({
    username: '',
    password: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value,
    }));

    setFormError((prev) => ({
      ...prev,
      [name]: false,
    }));

    setHintMessage((prev) => ({
      ...prev,
      [name]: '',
    }));
  };

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const newFormError = {
      username: form.username?.trim() === '',
      password: form.password?.trim() === '',
    };

    setFormError(newFormError);
    const hasError = Object.values(newFormError).some(Boolean);

    if (hasError) {
      return;
    }

    setLoading(true);

    try {
      const data = await LoginApi(form);

      // Cookie ถูก backend set ให้แล้ว
      // Frontend เก็บข้อมูล user รวม permissions ถ้ามี
      console.log('Login successful:', data);
      setAuth(data.id, data.fullname, data.profile_image, data.username, data.role, data.permissions || []);

      navigate(URL.HOME, {
        replace: true,
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status;

        const message = error.response?.data?.detail || error.response?.data?.message || 'เกิดข้อผิดพลาด';

        if (statusCode === 403) {
          setHintMessage({
            password: message,
          });
        } else if (statusCode === 401 || statusCode === 429) {
          setHintMessage({
            username: message,
          });
        } else {
          swalAlert.error(message);
        }
      } else {
        swalAlert.error();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`animate-slideDown flex flex-col flex-1 ${(hintMessage.username || hintMessage.password) && 'bg-error/10'}`}>
      <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto">
        <div className="border border-gray-300 px-6 py-8 rounded-xl bg-gray-100/[0.3] shadow-lg dark:bg-white/[0.03] dark:border-white/[0.05]">
          <div className="mb-5 sm:mb-8">
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">{t('auth.login.title')}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('auth.login.subtitle')}</p>
          </div>
          <div className="block lg:hidden">
            <GridShape />
          </div>
          <div>
            <form onSubmit={handleSubmit}>
              <div className="space-y-6">
                <div>
                  <Label>
                    {t('auth.login.field.username')}
                    <span className="text-error-500">*</span>
                  </Label>

                  <Input
                    name="username"
                    placeholder={t('auth.login.field.place_username')}
                    autoComplete="username"
                    value={form.username}
                    onChange={handleChange}
                    hint={hintMessage.username}
                    error={formError.username || !!hintMessage.username}
                  />
                </div>

                <div>
                  <Label>
                    {t('auth.login.field.password')}
                    <span className="text-error-500">*</span>
                  </Label>

                  <div className="relative">
                    <Input
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder={t('auth.login.field.place_password')}
                      passwordContext="current"
                      autoComplete="current-password"
                      value={form.password}
                      onChange={handleChange}
                      hint={hintMessage.password}
                      error={formError.password || !!hintMessage.password}
                      endIcon={
                        <span
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute z-30 -translate-y-1/2 cursor-pointer right-4 top-1/2"
                        >
                          {showPassword ? (
                            <EyeIcon className="text-gray-500 dark:text-gray-400 size-5" />
                          ) : (
                            <EyeCloseIcon className="text-gray-500 dark:text-gray-400 size-5" />
                          )}
                        </span>
                      }
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Checkbox checked={isChecked} onChange={setIsChecked} />

                    <span className="block font-normal text-gray-700 text-theme-sm dark:text-gray-400">{t('auth.login.keep_logged_in')}</span>
                  </div>

                  <Link to="/reset-password" className="text-sm text-brand-500 hover:text-brand-600 dark:text-brand-400">
                    {t('auth.login.forgot_password')}
                  </Link>
                </div>

                <div>
                  <Button
                    className="w-full"
                    size="sm"
                    type="submit"
                    disabled={loading}
                    endIcon={loading && <EosThreeDotsLoadingIcon className="w-10 h-10" />}
                  >
                    {loading ? t('auth.login.button.wait') : t('auth.login.button.submit')}
                  </Button>
                </div>
              </div>
            </form>

            <div className="mt-5">
              <p className="text-sm font-normal text-center text-gray-700 dark:text-gray-400 sm:text-start">
                {t('auth.login.no_account')}{' '}
                <Link to={URL.REGISTER} className="text-brand-500 hover:text-brand-600 dark:text-brand-400">
                  {t('auth.login.register')}
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
