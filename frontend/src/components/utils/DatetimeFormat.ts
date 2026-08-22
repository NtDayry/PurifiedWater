// utils/dateUtils.ts
import dayjs, { Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import relativeTime from 'dayjs/plugin/relativeTime';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import localizedFormat from 'dayjs/plugin/localizedFormat';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);
dayjs.extend(localizedFormat);

const TIMEZONE = 'Asia/Bangkok';

export const dateUtils = {
  /**
   * แสดงวันที่แบบ compact เช่น "19/05/2025"
   */
  formatCompactDate: (isoDate: string): string => (!isoDate ? '' : dayjs.utc(isoDate).tz(TIMEZONE).format('DD/MM/YYYY')),

  /**
   * แสดงวันที่แบบ compact เช่น "19/05/2025 10:54"
   */
  formatCompactDateTime: (isoDate: string): string => (!isoDate ? '' : dayjs.utc(isoDate).tz(TIMEZONE).format('DD/MM/YYYY HH:mm')),

  /**,
   * แปลง ISO string เป็นวันที่แบบอ่านง่าย เช่น "17 Sep 2025, 07:39"
   */
  formatDateTime: (isoDate: string): string => (!isoDate ? '' : dayjs.utc(isoDate).tz(TIMEZONE).format('DD MMM YYYY, HH:mm')),

  /**
   * แปลง ISO ไปเป็น timezone ที่กำหนด (return dayjs object)
   */
  toTimezone: (isoDate: string) => dayjs.utc(isoDate).tz(TIMEZONE),

  /**
   * แปลง ISO ไปเป็น timezone แล้วคืนค่าเป็น ISO string ใหม่
   */
  toTimezoneISO: (isoDate: string): string => (!isoDate ? '' : dayjs.utc(isoDate).tz(TIMEZONE).format()), // ได้ ISO ใน timezone นั้น

  toUTCISO: (date: string): string => (!date ? '' : dayjs.utc(date, TIMEZONE).utc().format()),

  /**
   * แปลง ISO string เป็นวันที่แบบไทย เช่น "17 กันยายน 2025"
   */
  formatThaiDate: (isoDate: string): string => dayjs.utc(isoDate).tz(TIMEZONE).format('D MMMM YYYY'),

  /**
   * แสดงเวลาที่ผ่านมา เช่น "2 hours ago", "3 days ago"
   */
  fromNow: (isoDate: string): string => (!isoDate ? '' : dayjs.utc(isoDate).tz(TIMEZONE).fromNow()),

  /**
   * เช็คว่า A ก่อนหรือเท่ากับ B
   */
  isSameOrBefore: (a: string, b: string): boolean => dayjs.utc(a).tz(TIMEZONE).isSameOrBefore(dayjs.utc(b).tz(TIMEZONE)),

  /**
   * เช็คว่า A หลังหรือเท่ากับ B
   */
  isSameOrAfter: (a: string, b: string): boolean => dayjs.utc(a).tz(TIMEZONE).isSameOrAfter(dayjs.utc(b).tz(TIMEZONE)),

  /**
   * แปลงเป็น timestamp (milliseconds)
   */
  toTimestamp: (isoDate: string): number => dayjs.utc(isoDate).tz(TIMEZONE).valueOf(),

  /**
   * แปลง timestamp กลับเป็น ISO string
   */
  fromTimestamp: (timestamp: number): string => dayjs(timestamp).tz(TIMEZONE).toISOString(),

  /**
   * แสดงวันที่แบบ locale-aware เช่น "Wednesday, September 17, 2025"
   */
  formatFullLocale: (isoDate: string): string => dayjs.utc(isoDate).tz(TIMEZONE).format('dddd, MMMM D, YYYY'),

  /**
   * แสดงเวลาแบบ HH:mm:ss
   */
  formatTimeOnly: (isoDate: string): string => dayjs.utc(isoDate).tz(TIMEZONE).format('HH:mm:ss'),

  /**
   * แสดงวันที่แบบ HH:mm:ss เวลา 00:00 อัตโนมัติ
   */
  startOfDay: (dateStr: string): Dayjs => dayjs(dateStr).tz(TIMEZONE).startOf('day'),
};
