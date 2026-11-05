import { api, API_URL } from '@/api';
import { GetLotsParams } from '@_types/table';

export async function getDeviceTokens({ page, limit, search, sortKey, sortDirection }: GetLotsParams) {
  const res = await api.get(API_URL.DEVICES, {
    params: {
      page,
      limit,
      search,
      sort_key: sortKey,
      sort_dir: sortDirection,
    },
  });

  return res.data;
}
