import { useTranslation } from 'react-i18next';
import { Settings } from 'lucide-react';
import type { DisplayUnit, TankCalculations, TankConfig } from '@/types/waterSupply.types';

interface Props {
  calculations: TankCalculations;
  config: TankConfig;
  unit: DisplayUnit;
  onOpenSettings: () => void;
}

export default function TankSummaryCards({ calculations, config, unit, onOpenSettings }: Props) {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language === 'en';

  const { tank1, tank2, total } = calculations;

  const formatVal = (cm: number, liters: number) => {
    if (unit === 'liter') {
      return `${Math.round(liters).toLocaleString()} ${isEn ? 'Liters' : 'ลิตร'}`;
    }
    return `${cm.toFixed(1)} cm`;
  };

  const formatSubVal = (cm: number, liters: number) => {
    if (unit === 'liter') {
      return `${cm.toFixed(1)} cm`;
    }
    return `${Math.round(liters).toLocaleString()} ${isEn ? 'Liters' : 'ลิตร'}`;
  };

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {/* Tank 1 Card */}
      <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-4.5 shadow-xs transition hover:shadow-md dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-sky-500 animate-pulse" />
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                {t('water_supply.tank1_info_title')}
              </h3>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t('water_supply.tank_dims_format', {
                w: config.tank1.width_m,
                l: config.tank1.length_m,
                h: config.tank1.height_m,
              })}
            </p>
          </div>
          <span className="rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
            {tank1.percent.toFixed(1)}%
          </span>
        </div>

        <div className="mt-3.5 flex items-baseline justify-between">
          <div>
            <div className="text-2xl font-black tracking-tight text-sky-600 dark:text-sky-400">
              {formatVal(tank1.level_cm, tank1.volume_l)}
            </div>
            <div className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
              {formatSubVal(tank1.level_cm, tank1.volume_l)} · {t('water_supply.tank_capacity_calc')}:{' '}
              {Math.round(tank1.capacity_l).toLocaleString()} {t('water_supply.liters_unit')} (
              {(tank1.capacity_l / 1000).toFixed(1)} m³)
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-400 transition-all duration-700"
            style={{ width: `${Math.min(100, Math.max(0, tank1.percent))}%` }}
          />
        </div>
      </div>

      {/* Tank 2 Card */}
      <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-4.5 shadow-xs transition hover:shadow-md dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-indigo-500 animate-pulse" />
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                {t('water_supply.tank2_info_title')}
              </h3>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t('water_supply.tank_dims_format', {
                w: config.tank2.width_m,
                l: config.tank2.length_m,
                h: config.tank2.height_m,
              })}
              {config.tank2_offset_cm > 0 && (
                <>
                  {' '}·{' '}
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                    {t('water_supply.lower_by', { offset: config.tank2_offset_cm })}
                  </span>
                </>
              )}
            </p>
          </div>
          <span className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
            {tank2.percent.toFixed(1)}%
          </span>
        </div>

        <div className="mt-3.5 flex items-baseline justify-between">
          <div>
            <div className="text-2xl font-black tracking-tight text-indigo-600 dark:text-indigo-400">
              {formatVal(tank2.level_cm, tank2.volume_l)}
            </div>
            <div className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
              {formatSubVal(tank2.level_cm, tank2.volume_l)} · {t('water_supply.tank_capacity_calc')}:{' '}
              {Math.round(tank2.capacity_l).toLocaleString()} {t('water_supply.liters_unit')} (
              {(tank2.capacity_l / 1000).toFixed(1)} m³)
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-blue-400 transition-all duration-700"
            style={{ width: `${Math.min(100, Math.max(0, tank2.percent))}%` }}
          />
        </div>
      </div>

      {/* Total Storage Card */}
      <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-4.5 shadow-xs transition hover:shadow-md dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                {t('water_supply.total_storage_title')}
              </h3>
            </div>
            <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              {t('water_supply.communicating_vessels_note')}
            </p>
          </div>
          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              title={t('water_supply.tank_settings_title')}
            >
              <Settings className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="mt-3.5 flex items-baseline justify-between">
          <div>
            <div className="text-2xl font-black tracking-tight text-emerald-600 dark:text-emerald-400">
              {Math.round(total.volume_l).toLocaleString()} {t('water_supply.liters_unit')}
            </div>
            <div className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
              {(total.volume_l / 1000).toFixed(2)} m³ / {(total.capacity_l / 1000).toFixed(2)} m³ ·{' '}
              {total.percent.toFixed(1)}% {isEn ? 'Full' : 'ของความจุ'}
            </div>
          </div>
          <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            {total.percent.toFixed(1)}%
          </span>
        </div>

        {/* Progress Bar */}
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-700"
            style={{ width: `${Math.min(100, Math.max(0, total.percent))}%` }}
          />
        </div>
      </div>
    </div>
  );
}
