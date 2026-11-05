import { api, API_URL } from '@/api';
import { LoginForm } from '@_types/forms';
import { LoginResponse } from '@_types/auth';

export const LoginApi = async (form: LoginForm) => {
  const res = await api.post<LoginResponse>(API_URL.LOGIN, form, {
    withCredentials: true,
  });
  return res.data;
};
