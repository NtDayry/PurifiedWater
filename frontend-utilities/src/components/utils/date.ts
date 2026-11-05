import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import relativeTime from 'dayjs/plugin/relativeTime';

import 'dayjs/locale/th';
import 'dayjs/locale/en';

dayjs.extend(localizedFormat);
dayjs.extend(relativeTime);

export const DATE_FORMAT = {
  FULL: 'DD/MM/YYYY HH:mm',
  DATE_ONLY: 'DD/MM/YYYY',
  TIME_ONLY: 'HH:mm:ss',
};

export function formatDate(date?: string | Date | null, locale: 'th' | 'en' = 'th') {
  if (!date) return '-';
  return dayjs(date).locale(locale).format('DD/MM/YYYY HH:mm:ss');
};

export function formatDateOnly(date?: string | Date | null, locale: 'th' | 'en' = 'th') {
  if (!date) return '-';
  return dayjs(date).locale(locale).format('DD/MM/YYYY');
};

export function fromNow(date?: string | Date | null, locale: 'th' | 'en' = 'th') {
  if (!date) return '-';
  return dayjs(date).locale(locale).fromNow();
};