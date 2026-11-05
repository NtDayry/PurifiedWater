import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/modal';
import Input from '@/components/form/input/InputField';
import Button from '@/components/ui/button/Button';
import type { SensorConfig, SensorConfigUpdate } from '@/api';

interface Analog420mAAdjustModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: SensorConfig | null;
  metricLabel: string;
  groupName: string;
  onSave: (updated: SensorConfigUpdate) => Promise<void>;
}

export const Analog420mAAdjustModal: React.FC<Analog420mAAdjustModalProps> = ({ isOpen, onClose, config, metricLabel, groupName, onSave }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'tune' | 'test' | 'twopoint'>('tune');
  const [saving, setSaving] = useState(false);

  // Form State
  const [rawMin, setRawMin] = useState<number>(0);
  const [rawMax, setRawMax] = useState<number>(20000);
  const [rangeMin, setRangeMin] = useState<number>(0);
  const [rangeMax, setRangeMax] = useState<number>(100);
  const [unit, setUnit] = useState<string>('');
  const [decimalPlaces, setDecimalPlaces] = useState<number>(2);

  // Live Test State
  const [testRaw, setTestRaw] = useState<number>(12000);

  // 2-Point Calibration State
  const [p1Raw, setP1Raw] = useState<number>(4000);
  const [p1Val, setP1Val] = useState<number>(0);
  const [p2Raw, setP2Raw] = useState<number>(20000);
  const [p2Val, setP2Val] = useState<number>(100);

  useEffect(() => {
    if (config) {
      setRawMin(config.raw_min);
      setRawMax(config.raw_max);
      setRangeMin(config.range_min);
      setRangeMax(config.range_max);
      setUnit(config.unit ?? '');
      setDecimalPlaces(config.decimal_places ?? 2);

      const midRaw = Math.round((config.raw_min + config.raw_max) / 2);
      setTestRaw(midRaw);

      setP1Raw(config.raw_min);
      setP1Val(config.range_min);
      setP2Raw(config.raw_max);
      setP2Val(config.range_max);
    }
  }, [config, isOpen]);

  if (!config) return null;

  // Calculation formulas
  const calculateCurrent = (raw: number) => {
    if (!rawMax || rawMax === 0) return 0;
    return (raw * 20.0) / rawMax;
  };

  const calculateValue = (raw: number, rMin = rangeMin, rMax = rangeMax, _rMinRaw = rawMin, rMaxRaw = rawMax) => {
    if (!rMaxRaw || rMaxRaw === 0) return rMin;
    const current = (raw * 20.0) / rMaxRaw;
    const maSpan = 20.0 - 4.0;
    const val = rMin + ((current - 4.0) * (rMax - rMin)) / maSpan;
    return val;
  };

  const currentMA = calculateCurrent(testRaw);
  const testOutput = calculateValue(testRaw);

  // Apply 2-point calibration
  const handleApply2Point = () => {
    if (p1Raw === p2Raw) return;
    setRawMin(p1Raw);
    setRawMax(p2Raw);
    setRangeMin(p1Val);
    setRangeMax(p2Val);
    setActiveTab('tune');
  };

  // Quick Zero Trim (shift range_min & range_max)
  const handleOffsetTrim = (offset: number) => {
    setRangeMin((prev) => Number((prev + offset).toFixed(decimalPlaces)));
    setRangeMax((prev) => Number((prev + offset).toFixed(decimalPlaces)));
  };

  // Reset to default 4-20mA standards
  const handleResetDefault = () => {
    setRawMin(0);
    setRawMax(20000);
    setRangeMin(0);
    setRangeMax(100);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        decode_type: 'analog_4_20ma',
        raw_min: rawMin,
        raw_max: rawMax,
        range_min: rangeMin,
        range_max: rangeMax,
        unit: unit || null,
        decimal_places: decimalPlaces,
      });
      onClose();
    } catch (err) {
      // Handled by parent Toast
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl" animation="zoom">
      <div className="p-6 space-y-6 w-full rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-100 dark:border-gray-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-6z" />
                </svg>
                {t('page.settings_devices.analog_modal.badge')}
              </span>
              <span className="text-xs text-gray-400 font-mono">{groupName}</span>
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mt-1">
              {metricLabel} <span className="text-sm font-normal text-gray-500">({config.metric_name})</span>
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 border-b border-gray-100 dark:border-gray-800 pb-2">
          <button
            onClick={() => setActiveTab('tune')}
            className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all ${
              activeTab === 'tune'
                ? 'bg-primary text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            {t('page.settings_devices.analog_modal.tabs.tune')}
          </button>
          <button
            onClick={() => setActiveTab('test')}
            className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all ${
              activeTab === 'test'
                ? 'bg-primary text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            {t('page.settings_devices.analog_modal.tabs.test')}
          </button>
          <button
            onClick={() => setActiveTab('twopoint')}
            className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all ${
              activeTab === 'twopoint'
                ? 'bg-primary text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            {t('page.settings_devices.analog_modal.tabs.twopoint')}
          </button>
        </div>

        {/* TAB 1: Fine-Tune Parameters */}
        {activeTab === 'tune' && (
          <div className="space-y-5">
            {/* Range Mapping Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Raw Min / Max (ADC) */}
              <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-300">
                    {t('page.settings_devices.analog_modal.tune.modbus_adc_range')}
                  </span>
                  <span className="text-[10px] text-amber-600/70 dark:text-amber-400/70 font-mono">
                    {t('page.settings_devices.analog_modal.tune.ma_signal')}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-gray-500 dark:text-gray-400 block mb-1">
                      {t('page.settings_devices.analog_modal.tune.raw_min')}
                    </label>
                    <Input type="number" value={String(rawMin)} onChange={(e) => setRawMin(Number(e.target.value))} className="text-xs font-mono" />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-500 dark:text-gray-400 block mb-1">
                      {t('page.settings_devices.analog_modal.tune.raw_max')}
                    </label>
                    <Input type="number" value={String(rawMax)} onChange={(e) => setRawMax(Number(e.target.value))} className="text-xs font-mono" />
                  </div>
                </div>
              </div>

              {/* Range Min / Max (Engineering Unit) */}
              <div className="p-4 rounded-2xl bg-sky-500/5 border border-sky-500/20 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-sky-700 dark:text-sky-300">
                    {t('page.settings_devices.analog_modal.tune.scaled_output_range', { unit: unit || 'Unit' })}
                  </span>
                  <span className="text-[10px] text-sky-600/70 dark:text-sky-400/70 font-mono">
                    {t('page.settings_devices.analog_modal.tune.display_value')}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-gray-500 dark:text-gray-400 block mb-1">
                      {t('page.settings_devices.analog_modal.tune.range_min')}
                    </label>
                    <Input
                      type="number"
                      value={String(rangeMin)}
                      onChange={(e) => setRangeMin(Number(e.target.value))}
                      className="text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-500 dark:text-gray-400 block mb-1">
                      {t('page.settings_devices.analog_modal.tune.range_max')}
                    </label>
                    <Input
                      type="number"
                      value={String(rangeMax)}
                      onChange={(e) => setRangeMax(Number(e.target.value))}
                      className="text-xs font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Display Config */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-600 dark:text-gray-300 font-medium block mb-1">
                  {t('page.settings_devices.analog_modal.tune.unit_label')}
                </label>
                <Input
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder={t('page.settings_devices.analog_modal.tune.unit_placeholder')}
                  className="text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 dark:text-gray-300 font-medium block mb-1">
                  {t('page.settings_devices.analog_modal.tune.decimal_places_label')}
                </label>
                <Input
                  type="number"
                  min="0"
                  max="6"
                  value={String(decimalPlaces)}
                  onChange={(e) => setDecimalPlaces(Number(e.target.value))}
                  className="text-xs"
                />
              </div>
            </div>

            {/* Quick Zero Trim Buttons */}
            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-300 font-medium">
                <span>{t('page.settings_devices.analog_modal.tune.quick_zero_trim')}</span>
                <span className="font-mono text-gray-400">{t('page.settings_devices.analog_modal.tune.shift_range')}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {[-10, -1, -0.1, 0.1, 1, 10].map((step) => (
                  <button
                    key={step}
                    type="button"
                    onClick={() => handleOffsetTrim(step)}
                    className="px-3 py-1 text-xs font-mono rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 hover:border-primary text-gray-700 dark:text-gray-200 hover:text-primary transition-all"
                  >
                    {step > 0 ? `+${step}` : step}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleResetDefault}
                  className="px-3 py-1 text-xs font-semibold rounded-lg bg-red-500/10 text-red-600 hover:bg-red-500/20 ml-auto transition-all"
                >
                  {t('page.settings_devices.analog_modal.tune.reset_defaults')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Signal Simulator & Tester */}
        {activeTab === 'test' && (
          <div className="space-y-6">
            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 space-y-4">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-gray-700 dark:text-gray-200">
                  {t('page.settings_devices.analog_modal.test.simulate_signal')}
                </span>
                <span className="font-mono text-primary font-bold">
                  {t('page.settings_devices.analog_modal.test.raw_count', { raw: testRaw, ma: currentMA.toFixed(2) })}
                </span>
              </div>

              {/* Slider */}
              <input
                type="range"
                min={0}
                max={rawMax || 25000}
                step={10}
                value={testRaw}
                onChange={(e) => setTestRaw(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary"
              />

              <div className="flex justify-between text-[11px] font-mono text-gray-400">
                <span>0 (0mA)</span>
                <span>{rawMin} (4mA - Min)</span>
                <span>{Math.round((rawMin + rawMax) / 2)} (12mA - Mid)</span>
                <span>{rawMax} (20mA - Max)</span>
              </div>
            </div>

            {/* Calculated Output Card */}
            <div className="p-6 rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 text-center space-y-2">
              <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {t('page.settings_devices.analog_modal.test.simulated_output_value')}
              </span>
              <div className="text-4xl font-extrabold text-primary font-mono">
                {testOutput.toFixed(decimalPlaces)} <span className="text-lg font-medium">{unit}</span>
              </div>
              <div className="text-xs text-gray-400 font-mono">
                {t('page.settings_devices.analog_modal.test.current_label', { ma: currentMA.toFixed(2) })}
                {currentMA < 3.8 ? (
                  <span className="text-red-500 font-semibold">{t('page.settings_devices.analog_modal.test.status_sensor_fault_break')}</span>
                ) : currentMA < 4.0 ? (
                  <span className="text-amber-500 font-semibold">{t('page.settings_devices.analog_modal.test.status_under_range')}</span>
                ) : currentMA > 20.5 ? (
                  <span className="text-red-500 font-semibold">{t('page.settings_devices.analog_modal.test.status_sensor_fault_high')}</span>
                ) : currentMA > 20.0 ? (
                  <span className="text-amber-500 font-semibold">{t('page.settings_devices.analog_modal.test.status_over_range')}</span>
                ) : (
                  <span className="text-emerald-500 font-semibold">{t('page.settings_devices.analog_modal.test.status_normal')}</span>
                )}
              </div>
            </div>

            {/* Visual Bar Gauge */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-400 font-mono">
                <span>
                  {t('page.settings_devices.analog_modal.test.range_min_label', { val: rangeMin, unit })}
                </span>
                <span>
                  {t('page.settings_devices.analog_modal.test.range_max_label', { val: rangeMax, unit })}
                </span>
              </div>
              <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden p-0.5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-400 via-primary to-emerald-400 transition-all duration-150"
                  style={{
                    width: `${Math.min(100, Math.max(0, ((testOutput - rangeMin) / (rangeMax - rangeMin || 1)) * 100))}%`,
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: 2-Point Field Calibration */}
        {activeTab === 'twopoint' && (
          <div className="space-y-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('page.settings_devices.analog_modal.twopoint.desc')}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Point 1 (Low / Zero) */}
              <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 space-y-3">
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 block md:mb-7">
                  {t('page.settings_devices.analog_modal.twopoint.point1_title')}
                </span>
                <div>
                  <label className="text-[11px] text-gray-500 block mb-1">
                    {t('page.settings_devices.analog_modal.twopoint.measured_raw')}
                  </label>
                  <Input type="number" value={String(p1Raw)} onChange={(e) => setP1Raw(Number(e.target.value))} className="text-xs font-mono" />
                </div>
                <div>
                  <label className="text-[11px] text-gray-500 block mb-1">
                    {t('page.settings_devices.analog_modal.twopoint.target_val', { unit })}
                  </label>
                  <Input type="number" value={String(p1Val)} onChange={(e) => setP1Val(Number(e.target.value))} className="text-xs font-mono" />
                </div>
              </div>

              {/* Point 2 (High / Span) */}
              <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 space-y-3">
                <span className="text-xs font-bold text-sky-600 dark:text-sky-400 block">
                  {t('page.settings_devices.analog_modal.twopoint.point2_title')}
                </span>
                <div>
                  <label className="text-[11px] text-gray-500 block mb-1">
                    {t('page.settings_devices.analog_modal.twopoint.measured_raw')}
                  </label>
                  <Input type="number" value={String(p2Raw)} onChange={(e) => setP2Raw(Number(e.target.value))} className="text-xs font-mono" />
                </div>
                <div>
                  <label className="text-[11px] text-gray-500 block mb-1">
                    {t('page.settings_devices.analog_modal.twopoint.target_val', { unit })}
                  </label>
                  <Input type="number" value={String(p2Val)} onChange={(e) => setP2Val(Number(e.target.value))} className="text-xs font-mono" />
                </div>
              </div>
            </div>

            <Button variant="primary" onClick={handleApply2Point} disabled={p1Raw === p2Raw} className="w-full text-xs font-semibold py-2.5">
              {t('page.settings_devices.analog_modal.twopoint.apply_btn')}
            </Button>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 dark:border-gray-800 pt-4">
          <Button variant="error" onClick={onClose} disabled={saving} className="text-xs">
            {t('page.settings_devices.analog_modal.actions.cancel')}
          </Button>
          <Button variant={{ light: 'primary', dark: 'primary' }} onClick={handleSave} disabled={saving} className="text-xs min-w-[120px]">
            {saving ? t('page.settings_devices.analog_modal.actions.saving') : t('page.settings_devices.analog_modal.actions.save')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

