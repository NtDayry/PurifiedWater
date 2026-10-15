import { useEffect, useState, SubmitEvent } from 'react';
import { useLoading } from '@/context/LoadingContext';
import { axios, api, API_URL, parseFetchError } from '@/api';
import { User } from '@_types/user';
import useSwalAlert from '@/hooks/useSwalAlert';
import { useReload } from '@/hooks/useReload';
import { Modal } from '@/components/ui/modal';
import { useTranslation } from 'react-i18next';
import Button from '../ui/button/Button';
import Input from '../form/input/InputField';
import Label from '../form/Label';
import { MdiSaveAllIcon, CloseIcon, EosThreeDotsLoadingIcon } from '@/icons';
import { ProfileUpdateForm } from '@_types/forms';

type FormErrors = Record<string, boolean>;
type FormHints = Record<string, string>;

interface UpdateUserDataModalProps {
  userId?: number | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function UpdateUserDataModal({ userId, isOpen, onClose }: UpdateUserDataModalProps) {
  const { setLoading } = useLoading();
  const SwalAlert = useSwalAlert();
  const { isReload, reload } = useReload();
  const [data, setData] = useState<User>();
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
  const [isSending, setIsSending] = useState(false);

  // โหลดข้อมูลเริ่มต้น
  useEffect(() => {
    if (!data) return;

    const fullname = data.fullname?.trim() || '';
    const [fname = '', ...rest] = fullname.split(' ');

    setForm({
      id: data.id,
      username: data.username,
      fullname,
      fname,
      lname: rest.join(' '),
      department: data.department,
    });
  }, [data]);

  // เปลี่ยนค่า input
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;

    let regex: RegExp;
    let hintMessage = '';

    if (name === 'fname' || name === 'lname') {
      regex = /^[\u0E00-\u0E7Fa-zA-Z]*$/;

      hintMessage = t('page.users_management.validation.alpha_space');
    } else if (name === 'username') {
      regex = /^[a-zA-Z0-9._-]*$/;

      hintMessage = t('page.users_management.validation.username_allowed');
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
      formData.append('fullname', `${form.fullname}`.trim());
      formData.append('username', form.username);
      formData.append('department', form.department);

      await api.patch(`${API_URL.USERS}/${form.id}`, formData, {
        headers: API_URL.CONTENT_TYPE_FORMDATA,
      });

      onClose();
      SwalAlert.Toast();

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

  useEffect(() => {
    if (!userId) return;

    const fetchData = async () => {
      try {
        setLoading(true, 'before', 500);
        const response = await api.get(`${API_URL.USERS}/${userId}`);
        const getData: User = response.data;
        setData(getData);
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
  }, [isOpen, isReload]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} animation="slideUp" size="lg">
      <div className="w-full rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
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
                />
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-3 lg:justify-end">
            {!isSending && (
              <Button
                size="sm"
                type="button"
                variant={{
                  light: 'error',
                  dark: 'error-soft-outline',
                }}
                onClick={onClose}
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
              {isSending ? t('page.users_profile.profile_card.button.wait') : t('page.users_profile.profile_card.button.submit')}

              {isSending && <EosThreeDotsLoadingIcon className="size-8" />}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
