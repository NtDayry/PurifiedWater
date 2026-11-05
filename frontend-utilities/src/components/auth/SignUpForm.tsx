import { useState, SubmitEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link } from 'react-router';
import { EyeCloseIcon, EyeIcon, EosThreeDotsLoadingIcon } from '@/icons';
import Label from '@/components/form/Label';
import Input from '@/components/form/input/InputField';
import { Autocomplete } from '@/components/form/input/Autocomplete';
import Checkbox from '@/components/form/input/Checkbox';
import Button from '@/components/ui/button/Button';
import { axios, api, API_URL, URL } from '@/api';
import { UserCreateForm } from '@_types/forms';
import useSwalAlert from '@/hooks/useSwalAlert';
import { useTranslation } from 'react-i18next';

interface SignUpFormProps extends UserCreateForm {
  fname: string;
  lname: string;
  confirmPassword: string;
}

export default function SignUpForm() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isChecked, setIsChecked] = useState(false);
  const [departmentLists, _setDepartmentLists] = useState<string[]>([]);
  const navigate = useNavigate();
  const form = UseSignUpForm();
  const swalAlert = useSwalAlert({ useModal: false, useSidebar: false });

  const getNotice = (key: string) => t(`auth.register.privacy_notice.${key}`);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;

    // กำหนด regex ตามฟิลด์
    let regex, hintMessage: string;
    if (name === 'fname' || name === 'lname') {
      // อนุญาตเฉพาะตัวอักษรไทยและอังกฤษ **ห้ามช่องว่าง**
      regex = /^[\u0E00-\u0E7Fa-zA-Z]*$/;
      hintMessage = 'อนุญาตเฉพาะตัวอักษรไทยและอังกฤษ **ห้ามช่องว่าง**';
    } else if (name === 'username') {
      regex = /^[a-zA-Z0-9]*$/;
      hintMessage = 'อนุญาตเฉพาะตัวอังกฤษตัวเลขและอักขระพิเศษ **ห้ามช่องว่าง**';
    } else {
      // สำหรับฟิลด์อื่น: อนุญาตอักขระทั่วไป (เดิม)
      regex = /^[A-Za-z0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]*$/;
    }

    // ถ้าไม่ตรงกับ regex และไม่ใช่ค่าว่าง => ไม่อัปเดตค่า
    if (!(regex.test(value) || value === '')) {
      form.setHintMessage((prev) => ({
        ...prev,
        [name]: hintMessage,
      }));
      return null;
    } else {
      form.setHintMessage((prev) => ({
        ...prev,
        [name]: '',
      }));
    }

    // อัปเดต fullname ถ้าเป็น firstname หรือ lastname
    if (name === 'fname') {
      form.setFormData((prevForm) => ({
        ...prevForm,
        fullname: `${value} ${form.formData.lname?.trim() || ''}`.trim(),
      }));
    } else if (name === 'lname') {
      form.setFormData((prevForm) => ({
        ...prevForm,
        fullname: `${form.formData.fname?.trim() || ''} ${value}`.trim(),
      }));
    }

    // อัปเดตค่าฟิลด์
    form.setFormData((prevForm) => ({
      ...prevForm,
      [name]: value,
    }));

    // ล้าง error ถ้ามี
    form.setFormError((formError) => ({
      ...formError,
      [name]: false,
    }));

    return null;
  };

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const fnameTrim = form.formData.fname?.trim() || '';
      const lnameTrim = form.formData.lname?.trim() || '';
      const usernameTrim = form.formData.username?.trim() || '';
      const computedFullname = `${fnameTrim} ${lnameTrim}`.trim();

      const newFormError = {
        fname: fnameTrim === '',
        lname: lnameTrim === '',
        fullname: computedFullname === '',
        department: false,
        username: usernameTrim === '',
        password: !form.formData.password || form.formData.password.length < 4,
        confirmPassword: !form.formData.confirmPassword || form.formData.password !== form.formData.confirmPassword,
        agree: !isChecked,
      };

      form.setFormError(newFormError);
      const hasError = Object.values(newFormError).some((error) => error);
      if (hasError) {
        console.info('Form submission failed, please correct the errors.');
        if (!isChecked) {
          swalAlert.error({ message: 'กรุณายอมรับเงื่อนไขและข้อตกลง' });
        }
      } else {
        setLoading(true);
        try {
          const formData = {
            fullname: computedFullname,
            username: usernameTrim,
            password: form.formData.password,
            department: form.formData.department || null,
          };

          await api.post(API_URL.REGISTER, formData);
          swalAlert.success({ message: t('auth.register.success_alert') }).then(() => navigate(URL.LOGIN));
        } catch (error: any) {
          if (axios.isAxiosError(error)) {
            const statusCode = error.response?.status;
            const errMsg = error.response?.data?.detail || error.response?.data?.message;
            if (statusCode === 409 || (statusCode === 400 && errMsg?.toLowerCase().includes('username'))) {
              form.setHintMessage((prev) => ({ ...prev, username: errMsg || 'ชื่อผู้ใช้นี้ถูกใช้งานแล้ว' }));
            } else {
              swalAlert.error({ message: errMsg || t('auth.register.error_alert') });
            }
          } else {
            swalAlert.error({ message: t('auth.register.error_alert') });
          }
        }
      }
    } catch (error) {
      swalAlert.error();
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-slideDown flex flex-col flex-1 w-full overflow-y-auto lg:w-1/2 no-scrollbar">
      <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto my-10">
        <div className="border border-gray-300 px-6 py-8 rounded-xl bg-gray-100/[0.3] shadow-lg dark:bg-white/[0.03] dark:border-white/[0.05]">
          <div className="mb-5 sm:mb-8">
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">{t('auth.register.title')}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('auth.register.subtitle')}</p>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {/* <!-- First Name --> */}
                <div className="sm:col-span-1">
                  <Label>
                    {t('auth.register.field.fname')}
                    <span className="text-error-500">*</span>
                  </Label>
                  <Input
                    type="text"
                    name="fname"
                    placeholder={t('auth.register.field.place_fname')}
                    value={form.formData.fname}
                    error={form.formError.fname || !!form.hintMessage.fname}
                    hint={form.hintMessage.fname}
                    onChange={handleChange}
                  />
                </div>
                {/* <!-- Last Name --> */}
                <div className="sm:col-span-1">
                  <Label>
                    {t('auth.register.field.lname')}
                    <span className="text-error-500">*</span>
                  </Label>
                  <Input
                    type="text"
                    name="lname"
                    placeholder={t('auth.register.field.place_lname')}
                    value={form.formData.lname}
                    error={form.formError.lname || !!form.hintMessage.lname}
                    hint={form.hintMessage.lname}
                    onChange={handleChange}
                  />
                </div>
              </div>
              {/* <!-- Username --> */}
              <div>
                <Autocomplete
                  label={t('auth.register.field.department')}
                  placeholder={t('auth.register.field.place_department')}
                  items={departmentLists}
                  getLabel={(s) => s || ''}
                  value={form.formData?.department}
                  error={!!form.formError.department}
                  onChange={(val) => {
                    form.setFormData((prev) => ({
                      ...prev,
                      department: val,
                    }));
                  }}
                />
              </div>
              {/* <!-- Username --> */}
              <div>
                <Label>
                  {t('auth.register.field.username')}
                  <span className="text-error-500">*</span>
                </Label>
                <Input
                  type="text"
                  name="username"
                  placeholder={t('auth.register.field.place_username')}
                  autoComplete="username"
                  value={form.formData.username}
                  error={form.formError.username || !!form.hintMessage.username}
                  hint={form.hintMessage.username}
                  onChange={handleChange}
                />
              </div>
              {/* <!-- Password --> */}
              <div>
                <Label>
                  {t('auth.register.field.password')}
                  <span className="text-error-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    placeholder={t('auth.register.field.place_password')}
                    name="password"
                    value={form.formData.password}
                    error={form.formError.password}
                    hint={form.hintMessage.password}
                    type={showPassword ? 'text' : 'password'}
                    passwordContext="new"
                    onChange={handleChange}
                  />
                  <span onClick={() => setShowPassword(!showPassword)} className="absolute z-30 -translate-y-1/2 cursor-pointer right-4 top-1/2">
                    {showPassword ? (
                      <EyeIcon className="text-gray-500 dark:text-gray-400 size-5" />
                    ) : (
                      <EyeCloseIcon className="text-gray-500 dark:text-gray-400 size-5" />
                    )}
                  </span>
                </div>
              </div>

              {/* <!-- Confirm Password --> */}
              <div>
                <Label>
                  {t('auth.register.field.confirm_password')}
                  <span className="text-error-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    name="confirmPassword"
                    placeholder={t('auth.register.field.place_confirm_password')}
                    value={form.formData.confirmPassword}
                    error={form.formError.confirmPassword || form.formError.password || !!form.hintMessage.confirmPassword}
                    hint={form.hintMessage.confirmPassword}
                    type={showPassword ? 'text' : 'password'}
                    passwordContext="new"
                    onChange={handleChange}
                  />
                  <span onClick={() => setShowPassword(!showPassword)} className="absolute z-30 -translate-y-1/2 cursor-pointer right-4 top-1/2">
                    {showPassword ? (
                      <EyeIcon className="text-gray-500 dark:text-gray-400 size-5" />
                    ) : (
                      <EyeCloseIcon className="text-gray-500 dark:text-gray-400 size-5" />
                    )}
                  </span>
                </div>
              </div>
              {/* <!-- Checkbox --> */}
              <div className="flex items-center gap-3">
                <Checkbox
                  className={`w-5 h-5 ${!isChecked && form.formError.agree && '!border-error'}`}
                  checked={isChecked}
                  onChange={setIsChecked}
                />
                <p className="flex flex-wrap items-center text-sm  gap-x-1 font-normal text-gray-500 dark:text-gray-400">
                  <span>{getNotice('prefix')}</span>
                  <span className="text-gray-800 dark:text-white/90 font-medium cursor-pointer hover:underline">{getNotice('terms')}</span>
                  <span>{getNotice('and')}</span>
                  <span className="text-gray-800 dark:text-white font-medium cursor-pointer hover:underline">{getNotice('privacy')}</span>
                  {getNotice('suffix') && <span>{getNotice('suffix')}</span>}
                </p>
              </div>
              {/* <!-- Button --> */}
              <div>
                <Button
                  className="w-full"
                  size="sm"
                  type="submit"
                  disabled={loading}
                  endIcon={loading && <EosThreeDotsLoadingIcon className="w-10 h-10" />}
                >
                  {loading ? t('auth.register.button.wait') : t('auth.register.button.submit')}
                </Button>
              </div>
            </div>
          </form>

          <div className="mt-5">
            <p className="text-sm font-normal text-center text-gray-700 dark:text-gray-400 sm:text-start">
              {t('auth.register.has_account')}{' '}
              <Link to={URL.LOGIN} className="text-brand-500 hover:text-brand-600 dark:text-brand-400">
                {t('auth.register.login')}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

const UseSignUpForm = () => {
  // กำหนดค่าเริ่มต้น
  const initialFormState = {
    formData: {
      fname: '',
      lname: '',
      fullname: '',
      username: '',
      department: '',
      password: '',
      confirmPassword: '',
    },
    formError: {
      fname: false,
      lname: false,
      username: false,
      department: false,
      password: false,
      confirmPassword: false,
      agree: false,
    },
    hintMessage: {
      fname: '',
      lname: '',
      fullname: '',
      username: '',
      department: '',
      password: '',
      confirmPassword: '',
    },
  };

  const [formData, setFormData] = useState<SignUpFormProps>(initialFormState.formData);
  const [formError, setFormError] = useState(initialFormState.formError);
  const [hintMessage, setHintMessage] = useState<SignUpFormProps>(initialFormState.hintMessage);

  return {
    initialFormState,
    formData,
    setFormData,
    formError,
    setFormError,
    hintMessage,
    setHintMessage,
  };
};
