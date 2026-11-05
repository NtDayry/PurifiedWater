import { api, API_URL } from '@/api';
import { GetLotsParams } from '@_types/table';

export async function getUsers({ page, limit, search, sortKey, sortDirection }: GetLotsParams) {
  const res = await api.get(API_URL.USERS, {
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


export const getUser = (id: number) => api.get(`${API_URL.USERS}/${id}`).then((r) => r.data);
