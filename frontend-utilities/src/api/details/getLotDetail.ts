import { api, API_URL } from '@/api';
import { GetLotsParams, GetLotsDetailsParams } from '@_types/table';

export async function getLotsPage({ page, limit, search, sortKey, sortDirection }: GetLotsParams) {
  const res = await api.get(API_URL.LOTS, {
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

export async function getLotDetail({ lot, mfg, exp, page, limit, search, sortKey, sortDirection }: GetLotsDetailsParams) {
  const res = await api.get(`${API_URL.LOTS}/${lot}`, {
    params: {
      mfg,
      exp,
      page,
      limit,
      search,
      sort_key: sortKey,
      sort_dir: sortDirection,
    },
  });

  return res.data;
}

export async function getDetailAndState(lot: string, mfg: string = '', exp: string = '') {
  // 1. แตกตัวแปรออกมาจาก Array [อันที่ 1, อันที่ 2] ตามลำดับที่ยิงไป
  const [statsRes, timingRes] = await Promise.all([
    api.get(`${API_URL.LOTS}/${lot}/stats`, { params: { mfg, exp } }), // แก้สะกดจาก /states เป็น /stats ตามที่ตั้งใน FastAPI
    api.get(`${API_URL.LOTS}/${lot}/timing`, { params: { mfg, exp } }),
  ]);

  // 2. ดึง .data ของแต่ละตัวมัดก้อนส่งกลับไป
  return {
    stats: statsRes.data,
    timing: timingRes.data,
  };
}

export const getScanDetail = (id: number) => api.get(`${API_URL.SCANS}/${id}`).then((r) => r.data);
