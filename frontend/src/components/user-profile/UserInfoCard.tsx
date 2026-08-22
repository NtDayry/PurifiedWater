import { useEffect, useState, SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../ui/button/Button';
import Input from '../form/input/InputField';
import Label from '../form/Label';
import { axios, api, API_URL, parseFetchError } from '@/api';
import useSwalAlert from '@/hooks/useSwalAlert';
import { MdiSaveAllIcon, EditIcon, CloseIcon, EosThreeDotsLoadingIcon } from '@/icons';
import { User } from '@_types/user';
import { ProfileUpdateForm } from '@_types/forms';

interface UserInfoCardProps {
  post?: User;
  reload?: () => void;
  className?: string;
}

type FormErrors = Record<string, boolean>;
type FormHints = Record<string, string>;

export default function UserInfoCard({ post, reload, className }: UserInfoCardProps) {
  const SwalAlert = useSwalAlert();
  const { t } = useTranslation();

  const [form, setForm] = useState<ProfileUpdateForm>({
    id: 0,
    username: '',
    fullname: '',
    fname: '',
    lname: '',
    department: '',
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [hints, setHints] = useState<FormHints>({});

  const [isEdit, setIsEdit] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // โหลดข้อมูลเริ่มต้น
  useEffect(() => {
    if (!post) return;

    const fullname = post.fullname?.trim() || '';
    const [fname = '', ...rest] = fullname.split(' ');

    setForm({
      id: post.id,
      username: post.username,
      fullname,
      fname,
      lname: rest.join(' '),
      department: post.department,
    });
  }, [post]);

  // reset form
  const resetForm = () => {
    if (!post) return;

    const fullname = post.fullname?.trim() || '';
    const [fname = '', ...rest] = fullname.split(' ');

    setForm({
      id: post.id,
      username: post.username,
      fullname,
      fname,
      lname: rest.join(' '),
      department: post.department,
    });

    setErrors({});
    setHints({});
  };

  // เปลี่ยนค่า input
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;

    let regex: RegExp;
    let hintMessage = '';

    if (name === 'fname' || name === 'lname') {
      regex = /^[\u0E00-\u0E7Fa-zA-Z]*$/;

      hintMessage = 'อนุญาตเฉพาะตัวอักษรไทยและอังกฤษ ห้ามเว้นวรรค';
    } else if (name === 'username') {
      regex = /^[a-zA-Z0-9._-]*$/;

      hintMessage = 'อนุญาตเฉพาะ a-z A-Z 0-9 และ . _ -';
    } else {
      regex = /^[A-Za-z0-9ก-๙\s]*$/;
    }

    // validate
    if (!(regex.test(value) || value === '')) {
      setHints((prev) => ({
        ...prev,
        [name]: hintMessage,
      }));

      return;
    }

    setHints((prev) => ({
      ...prev,
      [name]: '',
    }));

    // update form
    setForm((prev) => {
      const updated = {
        ...prev,
        [name]: value,
      };

      // update fullname อัตโนมัติ
      updated.fullname = `${updated.fname || ''} ${updated.lname || ''}`.trim();

      return updated;
    });
  };

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();

    setIsSending(true);

    try {
      const newErrors = {
        fname: !form.fname,
        lname: !form.lname,
        username: !form.username,
        department: !form.department,
      };

      setErrors(newErrors);

      const hasError = Object.values(newErrors).some(Boolean);

      if (hasError) return;

      // =========================
      // FormData (IMPORTANT)
      // =========================
      const formData = new FormData();
      formData.append('fullname', `${form.fname} ${form.lname}`.trim());
      formData.append('username', form.username);
      formData.append('department', form.department);

      await api.patch(API_URL.USERS_ME, formData, {
        headers: API_URL.CONTENT_TYPE_FORMDATA,
      });

      SwalAlert.Toast();
      setIsEdit(false);

      reload?.();
    } catch (error) {
      parseFetchError({
        error,
        onConflict: (err) => {
          if (axios.isAxiosError(err)) {
            setHints((prev) => ({
              ...prev,
              username: err.response?.data?.message || '',
            }));
          }
        },

        onOtherError: () => {
          SwalAlert.error();
        },
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className={`w-full rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-800 dark:bg-white/[0.03] lg:p-6 ${className || ''}`}>
      {/* Header */}
      <h4 className="mb-2 text-2xl font-semibold text-gray-800 dark:text-white/90">{t('page.users_profile.profile_card.title')}</h4>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400 lg:mb-7">{t('page.users_profile.profile_card.subtitle')}</p>

      {/* Form */}
      <form className="flex flex-col" onSubmit={handleSubmit}>
        <div className="pb-8">
          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            {/* fname */}
            <div className="relative col-span-1">
              <Label>{t('page.users_profile.profile_card.field.fname')}</Label>

              <Input
                type="text"
                name="fname"
                placeholder={t('page.users_profile.profile_card.field.place_fname')}
                value={form.fname || ''}
                error={errors.fname}
                hint={hints.fname}
                onChange={handleChange}
                readOnly={!isEdit}
              />
            </div>

            {/* lname */}
            <div className="col-span-1">
              <Label>{t('page.users_profile.profile_card.field.lname')}</Label>

              <Input
                type="text"
                name="lname"
                placeholder={t('page.users_profile.profile_card.field.place_lname')}
                value={form.lname || ''}
                error={errors.lname}
                hint={hints.lname}
                onChange={handleChange}
                readOnly={!isEdit}
              />
            </div>

            {/* username */}
            <div className="col-span-2">
              <Label>{t('page.users_profile.profile_card.field.username')}</Label>

              <Input
                type="text"
                name="username"
                placeholder={t('page.users_profile.profile_card.field.place_username')}
                value={form.username || ''}
                error={errors.username || !!hints.username}
                hint={hints.username}
                onChange={handleChange}
                readOnly={!isEdit}
              />
            </div>

            {/* department */}
            <div className="col-span-2">
              <Label>{t('page.users_profile.profile_card.field.department')}</Label>

              <Input
                type="text"
                name="department"
                placeholder={t('page.users_profile.profile_card.field.place_department')}
                value={form.department || ''}
                error={errors.department}
                hint={hints.department}
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
                    resetForm();
                    setIsEdit(false);
                  }}
                  startIcon={<CloseIcon className="size-5" />}
                >
                  {t('page.users_profile.profile_card.button.cancel')}
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
                {isSending ? t('page.users_profile.profile_card.button.submit') : t('page.users_profile.profile_card.button.submit')}

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
              {t('page.users_profile.profile_card.button.edit')}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
