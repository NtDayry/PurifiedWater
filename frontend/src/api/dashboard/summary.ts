import { api, API_URL } from '@/api';

// Dashboard
export  const getLots = () =>
  api.get(API_URL.LOTS).then((r) => r.data)

export  const getTimings = () =>
  api.get(API_URL.TIMINGS).then((r) => r.data)

export  const getDefects = () =>
  api.get(API_URL.DEFECTS).then((r) => r.data)
