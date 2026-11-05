import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { DEFAULT_TANK_CONFIG } from '@/lib/tankCalculations';
import type { TankConfig } from '@/types/waterSupply.types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  config: TankConfig;
  onSave: (config: TankConfig) => void;
}

export default function TankConfigModal({ isOpen, onClose, config, onSave }: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState<TankConfig>(config);

  if (!isOpen) return null;

  const cap1_l = form.tank1.width_m * form.tank1.length_m * form.tank1.height_m * 1000;
  const cap2_l = form.tank2.width_m * form.tank2.length_m * form.tank2.height_m * 1000;
  const total_cap_l = cap1_l + cap2_l;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
    onClose();
  };

  const handleReset = () => {
    setForm(DEFAULT_TANK_CONFIG);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in">
      <div
        className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-850">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              {t('water_supply.tank_settings_title')}
            </h3>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {t('water_supply.tank_settings_desc')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            aria-label={t('water_supply.close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Tank 1 Config */}
            <div className="rounded-xl border border-sky-100 bg-sky-50/40 p-4 dark:border-sky-900/30 dark:bg-sky-950/20">
              <div className="flex items-center justify-between mb-3">
                <span className="font-bold text-sm text-sky-800 dark:text-sky-300">
                  {t('water_supply.tank1_title')}
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300">
                  {(cap1_l / 1000).toFixed(2)} m³
                </span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                    {t('water_supply.tank_width_label')}
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0.5"
                    max="50"
                    required
                    value={form.tank1.width_m}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        tank1: { ...form.tank1, width_m: parseFloat(e.target.value) || 0 },
                      })
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 shadow-xs focus:border-brand-500 focus:outline-hidden dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                    {t('water_supply.tank_length_label')}
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0.5"
                    max="50"
                    required
                    value={form.tank1.length_m}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        tank1: { ...form.tank1, length_m: parseFloat(e.target.value) || 0 },
                      })
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 shadow-xs focus:border-brand-500 focus:outline-hidden dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                    {t('water_supply.tank_height_label')}
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0.2"
                    max="20"
                    required
                    value={form.tank1.height_m}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        tank1: { ...form.tank1, height_m: parseFloat(e.target.value) || 0 },
                      })
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 shadow-xs focus:border-brand-500 focus:outline-hidden dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                <div className="pt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t('water_supply.tank_capacity_calc')}:{' '}
                  <span className="font-bold text-sky-600 dark:text-sky-400">
                    {Math.round(cap1_l).toLocaleString()} {t('water_supply.liters_unit')}
                  </span>
                </div>
              </div>
            </div>

            {/* Tank 2 Config */}
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 dark:border-indigo-900/30 dark:bg-indigo-950/20">
              <div className="flex items-center justify-between mb-3">
                <span className="font-bold text-sm text-indigo-800 dark:text-indigo-300">
                  {t('water_supply.tank2_title')}
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
                  {(cap2_l / 1000).toFixed(2)} m³
                </span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                    {t('water_supply.tank_width_label')}
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0.5"
                    max="50"
                    required
                    value={form.tank2.width_m}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        tank2: { ...form.tank2, width_m: parseFloat(e.target.value) || 0 },
                      })
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 shadow-xs focus:border-brand-500 focus:outline-hidden dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                    {t('water_supply.tank_length_label')}
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0.5"
                    max="50"
                    required
                    value={form.tank2.length_m}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        tank2: { ...form.tank2, length_m: parseFloat(e.target.value) || 0 },
                      })
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 shadow-xs focus:border-brand-500 focus:outline-hidden dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                    {t('water_supply.tank_height_label')}
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0.2"
                    max="20"
                    required
                    value={form.tank2.height_m}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        tank2: { ...form.tank2, height_m: parseFloat(e.target.value) || 0 },
                      })
                    }
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 shadow-xs focus:border-brand-500 focus:outline-hidden dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                <div className="pt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t('water_supply.tank_capacity_calc')}:{' '}
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">
                    {Math.round(cap2_l).toLocaleString()} {t('water_supply.liters_unit')}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Elevation Offset & Sensor Configuration */}
          <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 dark:border-gray-800 dark:bg-gray-800/40 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-gray-800 dark:text-gray-200">
                  {t('water_supply.tank2_offset_label')}
                </label>
                <span className="text-xs font-mono font-semibold text-brand-600 dark:text-brand-400">
                  {form.tank2_offset_cm > 0 ? `+${form.tank2_offset_cm} cm` : '0 cm (ระดับเดียวกัน)'}
                </span>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">
                {t('water_supply.tank2_offset_help')}
              </p>
              <input
                type="number"
                step="1"
                min="0"
                max="300"
                required
                value={form.tank2_offset_cm}
                onChange={(e) =>
                  setForm({
                    ...form,
                    tank2_offset_cm: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 shadow-xs focus:border-brand-500 focus:outline-hidden dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-800 dark:text-gray-200 mb-1">
                {t('water_supply.sensor_tank_label')}
              </label>
              <div className="grid grid-cols-2 gap-3 mt-1.5">
                <label
                  className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition ${
                    form.sensor_tank === 1
                      ? 'border-brand-500 bg-brand-50/60 text-brand-700 dark:border-brand-500 dark:bg-brand-950/40 dark:text-brand-300 font-semibold'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="sensor_tank"
                    checked={form.sensor_tank === 1}
                    onChange={() => setForm({ ...form, sensor_tank: 1 })}
                    className="accent-brand-600"
                  />
                  <span className="text-xs">{t('water_supply.sensor_tank1')}</span>
                </label>

                <label
                  className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition ${
                    form.sensor_tank === 2
                      ? 'border-brand-500 bg-brand-50/60 text-brand-700 dark:border-brand-500 dark:bg-brand-950/40 dark:text-brand-300 font-semibold'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="sensor_tank"
                    checked={form.sensor_tank === 2}
                    onChange={() => setForm({ ...form, sensor_tank: 2 })}
                    className="accent-brand-600"
                  />
                  <span className="text-xs">{t('water_supply.sensor_tank2')}</span>
                </label>
              </div>
            </div>
          </div>

          {/* Total Capacity Summary Callout */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/30 flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
                {t('water_supply.total_storage_title')}
              </span>
              <p className="text-base font-bold text-emerald-900 dark:text-emerald-200 mt-0.5">
                {Math.round(total_cap_l).toLocaleString()} {t('water_supply.liters_unit')}
                <span className="ml-2 text-xs font-normal text-emerald-700 dark:text-emerald-400">
                  ({(total_cap_l / 1000).toFixed(2)} m³)
                </span>
              </p>
            </div>
            <div className="text-right">
              <span className="inline-block px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300">
                {t('water_supply.communicating_vessels_note')}
              </span>
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-800">
            <button
              type="button"
              onClick={handleReset}
              className="rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-750 transition"
            >
              {t('water_supply.reset_defaults')}
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 transition"
              >
                {t('water_supply.close')}
              </button>
              <button
                type="submit"
                className="rounded-lg bg-brand-500 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-brand-600 active:scale-95 transition"
              >
                {t('water_supply.save_settings')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
