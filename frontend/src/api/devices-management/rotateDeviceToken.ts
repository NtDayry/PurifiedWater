import { api, API_URL } from '@/api';

export async function rotateDeviceToken(deviceCode: string) {
  const res = await api.post(`${API_URL.DEVICES}/${encodeURIComponent(deviceCode)}/rotate`);
  return res.data;
}
