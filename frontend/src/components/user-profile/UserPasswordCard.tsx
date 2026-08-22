import { useState, SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../ui/button/Button';
import Input from '../form/input/InputField';
import Label from '../form/Label';
import { axios, api, API_URL, parseFetchError } from '@/api';
import { EyeCloseIcon, EyeIcon, MdiSaveAllIcon, EditIcon, CloseIcon, EosThreeDotsLoadingIcon } from '@/icons';
import useSwalAlert from '@/hooks/useSwalAlert';
import { ProfilePasswordForm } from '@_types/forms';

interface FormErrors {
  password?: boolean;
  newPassword?: boolean;
  confirmPassword?: boolean;
}

interface FormHints {
  password?: string;
  newPassword?: string;
  confirmPassword?: string;
}

export default function UserPasswordCard() {
  const { t } = useTranslation();
  const SwalAlert = useSwalAlert();
  const [showPassword, setShowPassword] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [form, setForm] = useState<ProfilePasswordForm>({
    password: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [errors, setErrors] = useState<FormErrors>({});

  const [hints, setHints] = useState<FormHints>({});

  // reset form
  const resetForm = () => {
    setForm({
      password: '',
      newPassword: '',
      confirmPassword: '',
    });

    setErrors({});
    setHints({});
  };

  // handle input
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;

    const regex = /^[A-Za-z0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]*$/;

    if (!(regex.test(value) || value === '')) {
      setHints((prev) => ({
        ...prev,
        [name]: 'อนุญาตเฉพาะตัวอังกฤษ ตัวเลข และอักขระพิเศษ ห้ามเว้นวรรค',
      }));

      setErrors((prev) => ({
        ...prev,
        [name]: true,
      }));

      return;
    }

    setHints((prev) => ({
      ...prev,
      [name]: '',
    }));

    setErrors((prev) => ({
      ...prev,
      [name]: false,
    }));

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // submit
  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    setIsSending(true);

    try {
      const newErrors = {
        password: !form.password,
        newPassword: !form.newPassword,
        confirmPassword: !form.confirmPassword || form.confirmPassword !== form.newPassword,
      };

      setErrors(newErrors);

      // validate confirm password
      if (form.confirmPassword && form.confirmPassword !== form.newPassword) {
        setHints((prev) => ({
          ...prev,
          confirmPassword: 'รหัสผ่านไม่ตรงกัน',
        }));
      }

      const hasError = Object.values(newErrors).some(Boolean);

      if (hasError) {
        return;
      }

      await api.patch(API_URL.USERS_ME, {
        current_password: form.password,
        new_password: form.newPassword,
      });

      SwalAlert.Toast();
      setIsEdit(false);

      resetForm();
    } catch (error) {
      parseFetchError({
        error,

        onBadRequest: (err) => {
          if (axios.isAxiosError(err)) {
            const errorMsg =
              err.response?.data?.detail ||
              err.response?.data?.message ||
              'รหัสผ่านปัจจุบันไม่ถูกต้อง';
            setHints((prev) => ({
              ...prev,
              password: errorMsg,
            }));
            setErrors((prev) => ({
              ...prev,
              password: true,
            }));
          }
        },

        onOtherError: () => SwalAlert.error(),
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="w-full rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
      {/* Header */}
      <h4 className="mb-2 text-2xl font-semibold text-gray-800 dark:text-white/90">{t('page.users_profile.password_card.title')}</h4>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400 lg:mb-7">{t('page.users_profile.password_card.subtitle')}</p>

      {/* Form */}
      <form className="flex flex-col" onSubmit={handleSubmit}>
        <div className="pb-8">
          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            {/* Current Password */}
            <div className="col-span-2">
              <Label>
                {t('page.users_profile.password_card.field.old_password')}
                <span className="text-error-500">*</span>
              </Label>

              <div className="relative">
                <Input
                  placeholder={t('page.users_profile.password_card.field.place_old_password')}
                  name="password"
                  value={form.password}
                  error={errors.password || !!hints.password}
                  hint={hints.password}
                  type={showPassword ? 'text' : 'password'}
                  passwordContext="new"
                  onChange={handleChange}
                  readOnly={!isEdit}
                  endIcon={
                    <span onClick={() => setShowPassword(!showPassword)} className="absolute top-1/2 right-4 z-30 -translate-y-1/2 cursor-pointer">
                      {showPassword ? (
                        <EyeIcon className="size-5 text-gray-500 dark:text-gray-400" />
                      ) : (
                        <EyeCloseIcon className="size-5 text-gray-500 dark:text-gray-400" />
                      )}
                    </span>
                  }
                />
              </div>
            </div>

            {/* New Password */}
            <div className="col-span-2">
              <Label>
                {t('page.users_profile.password_card.field.new_password')}
                <span className="text-error-500">*</span>
              </Label>

              <Input
                name="newPassword"
                placeholder={t('page.users_profile.password_card.field.place_new_password')}
                value={form.newPassword}
                error={errors.newPassword || !!hints.newPassword}
                hint={hints.newPassword}
                type={showPassword ? 'text' : 'password'}
                passwordContext="new"
                onChange={handleChange}
                readOnly={!isEdit}
              />
            </div>

            {/* Confirm Password */}
            <div className="col-span-2">
              <Label>
                {t('page.users_profile.password_card.field.confirm_password')}
                <span className="text-error-500">*</span>
              </Label>

              <Input
                name="confirmPassword"
                placeholder={t('page.users_profile.password_card.field.place_confirm_password')}
                value={form.confirmPassword}
                error={errors.confirmPassword || !!hints.confirmPassword}
                hint={hints.confirmPassword}
                type={showPassword ? 'text' : 'password'}
                passwordContext="new"
                onChange={handleChange}
                readOnly={!isEdit}
              />
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-3 lg:justify-end">
          {isEdit ? (
            <>
              {!isSending && (
                <Button
                  size="sm"
                  type="button"
                  variant={{
                    light: 'error',
                    dark: 'error-soft-outline',
                  }}
                  onClick={() => {
                    setIsEdit(false);
                    resetForm();
                  }}
                  startIcon={<CloseIcon className="size-5" />}
                >
                  {t('page.users_profile.password_card.button.cancel')}
                </Button>
              )}

              <Button
                size="sm"
                type="submit"
                variant={{
                  light: 'success',
                  dark: 'success-soft-outline',
                }}
                startIcon={<MdiSaveAllIcon className="size-5" />}
              >
                {isSending ? t('page.users_profile.password_card.button.wait') : t('page.users_profile.password_card.button.submit')}

                {isSending && <EosThreeDotsLoadingIcon className="size-8" />}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              type="button"
              variant={{
                light: 'warning',
                dark: 'warning-soft-outline',
              }}
              onClick={() => setIsEdit(true)}
              startIcon={<EditIcon className="size-5" />}
            >
              {t('page.users_profile.password_card.button.edit')}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
