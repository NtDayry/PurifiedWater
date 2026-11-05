import { api, API_URL } from '@/api';

export const logoutApi = async () => {
  const res = await api.post(API_URL.LOGOUT, {}, { withCredentials: true });
  return res.data;
};
