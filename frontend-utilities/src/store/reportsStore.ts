import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(isoWeek);
dayjs.extend(customParseFormat);

export type AGGREGATE = '30m' | '1h' | '1d' | '1mo' | '1y';
export type ViewMode = 'table' | 'charts';

export interface PERIOD_TIME {
  label: string;
  value: AGGREGATE;
}

export const PERIOD_OPTIONS: PERIOD_TIME[] = [
  { label: '30 minute', value: '30m' },
  { label: '1 hour', value: '1h' },
  { label: '1 day', value: '1d' },
  { label: '1 month', value: '1mo' },
  { label: '1 year', value: '1y' },
];

export interface DateRange {
  api: {
    start_time: string;
    stop_time: string;
  };
  display: {
    start_time: string;
    stop_time: string;
  };
  aggregate: AGGREGATE;
}

export const getDefaultDateRange = (): DateRange => {
  const start = dayjs().startOf('day');
  const stop = dayjs().endOf('day');
  return {
    api: {
      start_time: start.toISOString(),
      stop_time: stop.toISOString(),
    },
    display: {
      start_time: start.toISOString(),
      stop_time: stop.toISOString(),
    },
    aggregate: '30m',
  };
};

interface ReportsState {
  viewMode: ViewMode;
  dateRange: DateRange;
  setViewMode: (mode: ViewMode) => void;
  setDateRange: (dateRange: DateRange | ((prev: DateRange) => DateRange)) => void;
  handleDateRangeChange: (id: string, val: string | AGGREGATE) => void;
  resetFilter: () => void;
}

export const useReportsStore = create<ReportsState>()(
  persist(
    (set, get) => ({
      viewMode: 'table',
      dateRange: getDefaultDateRange(),

      setViewMode: (viewMode) => set({ viewMode }),

      setDateRange: (updater) =>
        set((state) => ({
          dateRange: typeof updater === 'function' ? updater(state.dateRange) : updater,
        })),

      handleDateRangeChange: (id, val) => {
        if (id === 'aggregate') {
          const agg = val as AGGREGATE;
          let start = dayjs().startOf('day');
          let stop = dayjs().endOf('day');

          if (agg === '1d') {
            // รายวันของสัปดาห์ปัจจุบัน (Current week), cap stop to today
            start = dayjs().startOf('isoWeek');
            const endOfWeek = dayjs().endOf('isoWeek');
            const endOfToday = dayjs().endOf('day');
            stop = endOfWeek.isAfter(endOfToday) ? endOfToday : endOfWeek;
          } else if (agg === '1mo') {
            // รายเดือนของปีปัจจุบัน (Current year), cap stop to today
            start = dayjs().startOf('year');
            const endOfYear = dayjs().endOf('year');
            const endOfToday = dayjs().endOf('day');
            stop = endOfYear.isAfter(endOfToday) ? endOfToday : endOfYear;
          } else if (agg === '1y') {
            // รายปีของข้อมูลทั้งหมด (All data), cap stop to today
            start = dayjs('2020-01-01').startOf('year');
            stop = dayjs().endOf('day');
          } else {
            // 30m, 1h -> ของวันนี้เริ่ม 0:00-23:59
            start = dayjs().startOf('day');
            stop = dayjs().endOf('day');
          }

          set({
            dateRange: {
              aggregate: agg,
              api: {
                start_time: start.toISOString(),
                stop_time: stop.toISOString(),
              },
              display: {
                start_time: start.toISOString(),
                stop_time: stop.toISOString(),
              },
            },
          });
          return;
        }

        const newDate = dayjs(val as string, 'DD/MM/YYYY');
        const current = get().dateRange;
        let start = dayjs(current.api.start_time);
        let stop = dayjs(current.api.stop_time);

        if (!start.isValid()) start = dayjs().startOf('day');
        if (!stop.isValid()) stop = dayjs().endOf('day');

        if (id === 'start_time') {
          start = newDate.startOf('day');
          if (start.isAfter(stop)) stop = start.endOf('day');
        } else if (id === 'stop_time') {
          stop = newDate.endOf('day');
          if (stop.isBefore(start)) start = stop.startOf('day');
        }

        set({
          dateRange: {
            ...current,
            api: {
              start_time: start.toISOString(),
              stop_time: stop.toISOString(),
            },
            display: {
              start_time: start.toISOString(),
              stop_time: stop.toISOString(),
            },
          },
        });
      },

      resetFilter: () => set({ dateRange: getDefaultDateRange() }),
    }),
    {
      name: 'reports-filter-storage',
    }
  )
);
