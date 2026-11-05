import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Droplet,
  Layers,
  Ruler,
  Settings,
  AlertTriangle,
  Zap,
  Activity,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { useMqttTank } from '@/hooks/useMqttTank';
import PumpSystem from '../../components/water-supply/PumpSystem';
import PumpSystem3D from '../../components/water-supply/PumpSystem3D';
import TankSummaryCards from '../../components/water-supply/TankSummaryCards';
import TankConfigModal from '../../components/water-supply/TankConfigModal';
import {
  calculateTanks,
  loadDisplayUnit,
  loadTankConfig,
  saveDisplayUnit,
  saveTankConfig,
} from '@/lib/tankCalculations';
import type { DisplayUnit, TankConfig, TankData } from '@/types/waterSupply.types';

const MQTT_URL = import.meta.env.VITE_MQTT_WATER_URL || 'ws://192.168.12.77:1884';
const MQTT_TOPIC = import.meta.env.VITE_MQTT_WATER_TOPIC || 'water-system';
const MQTT_USERNAME = import.meta.env.VITE_MQTT_WATER_USERNAME || 'polipharm';
const MQTT_PASSWORD = import.meta.env.VITE_MQTT_WATER_PASSWORD || '12345678';

// ค่าเริ่มต้นเมื่อยังไม่มีข้อมูล MQTT เข้ามา (สถานะปิด/ว่าง)
const DEFAULT_TANK_DATA: TankData = {
  water_level: {
    level_cm: 0,
    volumn: 0,
    flow_rate: 0,
    tank_capacity_cm: 160.0,
  },
  controls: {
    valve_on: false,
    pump1_on: false,
    pump2_on: false,
    pump1_overload: false,
    pump2_overload: false,
    alarm_on: false,
    auto_mode: false,
    auto_pump1: false,
    auto_pump2: false,
    manual_pump1: false,
    manual_pump2: false,
    manual_valve: false,
    pressure_switch: false,
  },
  local_io: { di0: false, di1: false, do0: false, do1: false },
  rs485_io: {
    status_ok: false,
    input: { di1: false, di2: false, di3: false, di4: false },
    output: { ch1: false, ch2: false, ch3: false, ch4: false },
  },
  system: {
    wifi_rssi: 0,
    ip: '-',
    sensor_comm_ok: false,
    uptime_sec: 0,
  },
};

const LOW_PCT = 20;
const HIGH_PCT = 95;
const STALE_MS = 15_000;

export default function WaterSupplyDashboard() {
  const { t } = useTranslation();
  const { data: mqttData, status, lastUpdate } = useMqttTank(MQTT_URL, MQTT_TOPIC, {
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
  });
  const [now, setNow] = useState(Date.now());
  const [view3d, setView3d] = useState(true); // สลับผัง 3D / 2D (ค่าเริ่มต้น 3D)
  const [tankConfig, setTankConfig] = useState<TankConfig>(loadTankConfig);
  const [displayUnit, setDisplayUnit] = useState<DisplayUnit>(loadDisplayUnit);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const handleUnitToggle = (unit: DisplayUnit) => {
    setDisplayUnit(unit);
    saveDisplayUnit(unit);
  };

  const handleSaveConfig = (cfg: TankConfig) => {
    setTankConfig(cfg);
    saveTankConfig(cfg);
  };

  const isLive = status === 'connected';
  const stale = lastUpdate === null || now - lastUpdate > STALE_MS;

  const connCls = isLive && !stale
    ? 'bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-400 border border-success-200 dark:border-success-800'
    : status === 'connecting'
    ? 'bg-warning-50 text-warning-600 dark:bg-warning-500/10 dark:text-warning-400 border border-warning-200 dark:border-warning-800'
    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700';

  const connText = isLive
    ? (stale ? t('water_supply.stale_data') : t('water_supply.live'))
    : status === 'connecting'
    ? t('water_supply.connecting')
    : t('water_supply.offline');

  const conn = { text: connText, cls: connCls };

  const displayData = mqttData || DEFAULT_TANK_DATA;
  const { water_level: wl, controls: c } = displayData;

  const tankCalculations = calculateTanks(wl.level_cm, tankConfig);

  const percent = tankCalculations.total.percent;
  const low = percent < LOW_PCT;
  const high = percent > HIGH_PCT;

  return (
    <div className="space-y-6 pb-12">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white sm:text-2xl">
            {t('water_supply.dashboard_title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('water_supply.last_updated')}:{' '}
            <span className="font-medium text-gray-700 dark:text-gray-200">
              {lastUpdate ? new Date(lastUpdate).toLocaleTimeString() : new Date().toLocaleTimeString()}
            </span>{' '}
            · {t('water_supply.broker')}:{' '}
            <span className="font-mono text-xs text-gray-600 dark:text-gray-300 font-medium">{MQTT_URL}</span>
            {' '}· {t('water_supply.topic')}:{' '}
            <span className="font-mono text-xs text-brand-600 dark:text-brand-400 font-semibold">{MQTT_TOPIC}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {c.alarm_on && (
            <span className="inline-flex items-center gap-1.5 animate-pulse rounded-full bg-error-600 px-3.5 py-1 text-xs font-bold text-white shadow-sm">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>{t('water_supply.alarm_active')}</span>
            </span>
          )}

          {/* Overload Alert Badge เมื่อพบปั๊มมีปัญหา Overload */}
          {(c.pump1_overload || c.pump2_overload) && (
            <span className="inline-flex items-center gap-1.5 animate-pulse rounded-full bg-error-600 px-3.5 py-1 text-xs font-bold text-white shadow-sm ring-2 ring-error-400/40">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>
                {c.pump1_overload && c.pump2_overload
                  ? t('water_supply.both_pumps_overload', 'OVERLOAD: PUMP 1 & 2')
                  : c.pump1_overload
                  ? t('water_supply.pump1_overload_alert', 'OVERLOAD: PUMP 1')
                  : t('water_supply.pump2_overload_alert', 'OVERLOAD: PUMP 2')}
              </span>
            </span>
          )}

          {/* ปุ่มสลับหน่วยแสดงผล cm / Lite */}
          <div className="inline-flex rounded-lg border border-gray-300 bg-gray-100 p-0.5 dark:border-gray-700 dark:bg-gray-800">
            <button
              type="button"
              onClick={() => handleUnitToggle('cm')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition ${
                displayUnit === 'cm'
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
              }`}
            >
              <Ruler className="h-3.5 w-3.5" />
              <span>{t('water_supply.unit_cm')}</span>
            </button>
            <button
              type="button"
              onClick={() => handleUnitToggle('liter')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition ${
                displayUnit === 'liter'
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
              }`}
            >
              <Droplet className="h-3.5 w-3.5" />
              <span>{t('water_supply.unit_liter')}</span>
            </button>
          </div>

          {/* สลับมุมมอง 3D / 2D */}
          <div className="inline-flex rounded-lg border border-gray-300 bg-gray-100 p-0.5 dark:border-gray-700 dark:bg-gray-800">
            <button
              type="button"
              onClick={() => setView3d(true)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition ${
                view3d
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
              }`}
            >
              <Box className="h-3.5 w-3.5" />
              <span>{t('water_supply.view_3d')}</span>
            </button>
            <button
              type="button"
              onClick={() => setView3d(false)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition ${
                !view3d
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>{t('water_supply.view_2d')}</span>
            </button>
          </div>

          {/* ปุ่มกำหนดขนาดบ่อ */}
          <button
            type="button"
            onClick={() => setIsConfigModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-750"
            title={t('water_supply.tank_settings_title')}
          >
            <Settings className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
            <span>{t('water_supply.tank_settings_btn')}</span>
          </button>
        </div>
      </div>

      {/* การ์ดสรุปขนาดบ่อ ปริมาตรลิตร และระดับน้ำ */}
      <TankSummaryCards
        calculations={tankCalculations}
        config={tankConfig}
        unit={displayUnit}
        onOpenSettings={() => setIsConfigModalOpen(true)}
      />

      {/* การ์ดสถานะกราฟฟิกการทำงานและ Overload ของปั๊ม 1, ปั๊ม 2 และอุปกรณ์หลัก */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Pump 1 Status Card */}
        <div
          className={`relative overflow-hidden rounded-2xl border p-4.5 shadow-xs transition hover:shadow-md ${
            c.pump1_overload
              ? 'border-error-500 bg-error-50/40 dark:border-error-600 dark:bg-error-950/20 ring-1 ring-error-500/30'
              : c.pump1_on
              ? 'border-emerald-300 bg-emerald-50/30 dark:border-emerald-800 dark:bg-emerald-950/20'
              : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                  c.pump1_overload
                    ? 'bg-error-500 text-white animate-pulse'
                    : c.pump1_on
                    ? 'bg-emerald-500 text-white shadow-xs'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                }`}
              >
                <Zap className="h-4.5 w-4.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                  {t('water_supply.pump_1', 'Water Pump 1')}
                </h3>
                <span className="text-[11px] text-gray-500 dark:text-gray-400">
                  {c.auto_pump1 ? t('water_supply.auto', 'AUTO') : t('water_supply.manual', 'MANUAL')}
                </span>
              </div>
            </div>

            {/* Run / Stop / Overload Badge */}
            {c.pump1_overload ? (
              <span className="inline-flex items-center gap-1 animate-pulse rounded-full bg-error-600 px-2.5 py-0.5 text-xs font-black text-white shadow-xs">
                <AlertTriangle className="h-3 w-3" />
                <span>OVERLOAD</span>
              </span>
            ) : c.pump1_on ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                <span>{t('water_supply.pump_run', 'RUN')}</span>
              </span>
            ) : (
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                {t('water_supply.pump_stop', 'STOP')}
              </span>
            )}
          </div>

          {/* Overload Status Indicator */}
          <div className="mt-3.5 flex items-center justify-between border-t border-gray-100 pt-3 dark:border-gray-800/80">
            <span className="text-xs text-gray-500 dark:text-gray-400">{t('water_supply.overload_status', 'Overload Protection')}</span>
            <div className="flex items-center gap-1.5">
              {c.pump1_overload ? (
                <>
                  <ShieldAlert className="h-3.5 w-3.5 text-error-600 dark:text-error-400 animate-bounce" />
                  <span className="text-xs font-bold text-error-600 dark:text-error-400">
                    {t('water_supply.tripped', 'TRIPPED (Fault)')}
                  </span>
                </>
              ) : (
                <>
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    {t('water_supply.normal', 'Normal')}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Pump 2 Status Card */}
        <div
          className={`relative overflow-hidden rounded-2xl border p-4.5 shadow-xs transition hover:shadow-md ${
            c.pump2_overload
              ? 'border-error-500 bg-error-50/40 dark:border-error-600 dark:bg-error-950/20 ring-1 ring-error-500/30'
              : c.pump2_on
              ? 'border-emerald-300 bg-emerald-50/30 dark:border-emerald-800 dark:bg-emerald-950/20'
              : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                  c.pump2_overload
                    ? 'bg-error-500 text-white animate-pulse'
                    : c.pump2_on
                    ? 'bg-emerald-500 text-white shadow-xs'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                }`}
              >
                <Zap className="h-4.5 w-4.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                  {t('water_supply.pump_2', 'Water Pump 2')}
                </h3>
                <span className="text-[11px] text-gray-500 dark:text-gray-400">
                  {c.auto_pump2 ? t('water_supply.auto', 'AUTO') : t('water_supply.manual', 'MANUAL')}
                </span>
              </div>
            </div>

            {/* Run / Stop / Overload Badge */}
            {c.pump2_overload ? (
              <span className="inline-flex items-center gap-1 animate-pulse rounded-full bg-error-600 px-2.5 py-0.5 text-xs font-black text-white shadow-xs">
                <AlertTriangle className="h-3 w-3" />
                <span>OVERLOAD</span>
              </span>
            ) : c.pump2_on ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                <span>{t('water_supply.pump_run', 'RUN')}</span>
              </span>
            ) : (
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                {t('water_supply.pump_stop', 'STOP')}
              </span>
            )}
          </div>

          {/* Overload Status Indicator */}
          <div className="mt-3.5 flex items-center justify-between border-t border-gray-100 pt-3 dark:border-gray-800/80">
            <span className="text-xs text-gray-500 dark:text-gray-400">{t('water_supply.overload_status', 'Overload Protection')}</span>
            <div className="flex items-center gap-1.5">
              {c.pump2_overload ? (
                <>
                  <ShieldAlert className="h-3.5 w-3.5 text-error-600 dark:text-error-400 animate-bounce" />
                  <span className="text-xs font-bold text-error-600 dark:text-error-400">
                    {t('water_supply.tripped', 'TRIPPED (Fault)')}
                  </span>
                </>
              ) : (
                <>
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    {t('water_supply.normal', 'Normal')}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Inlet Valve Status Card */}
        <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-4.5 shadow-xs transition hover:shadow-md dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                  c.valve_on
                    ? 'bg-cyan-500 text-white shadow-xs'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                }`}
              >
                <Droplet className="h-4.5 w-4.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                  {t('water_supply.inlet_valve', 'Inlet Valve')}
                </h3>
                <span className="text-[11px] text-gray-500 dark:text-gray-400">
                  {c.manual_valve ? t('water_supply.manual', 'MANUAL') : t('water_supply.auto', 'AUTO')}
                </span>
              </div>
            </div>

            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                c.valve_on
                  ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-800'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
              }`}
            >
              {c.valve_on ? t('water_supply.valve_open', 'OPEN') : t('water_supply.valve_closed', 'CLOSED')}
            </span>
          </div>

          <div className="mt-3.5 flex items-center justify-between border-t border-gray-100 pt-3 dark:border-gray-800/80">
            <span className="text-xs text-gray-500 dark:text-gray-400">{t('water_supply.flow_rate', 'Flow Rate')}</span>
            <span className="text-xs font-bold text-cyan-600 dark:text-cyan-400">
              {wl.flow_rate.toFixed(2)} m³/h
            </span>
          </div>
        </div>

        {/* Pressure Switch Status Card */}
        <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-4.5 shadow-xs transition hover:shadow-md dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                  c.pressure_switch
                    ? 'bg-emerald-500 text-white shadow-xs'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                }`}
              >
                <Activity className="h-4.5 w-4.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                  {t('water_supply.pressure_switch', 'Pressure Switch')}
                </h3>
                <span className="text-[11px] text-gray-500 dark:text-gray-400">
                  {c.auto_mode ? t('water_supply.auto', 'AUTO') : t('water_supply.manual', 'MANUAL')}
                </span>
              </div>
            </div>

            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                c.pressure_switch
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
              }`}
            >
              {c.pressure_switch ? 'ON' : 'OFF'}
            </span>
          </div>

          <div className="mt-3.5 flex items-center justify-between border-t border-gray-100 pt-3 dark:border-gray-800/80">
            <span className="text-xs text-gray-500 dark:text-gray-400">{t('water_supply.mode', 'System Mode')}</span>
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
              {c.auto_mode ? t('water_supply.auto', 'AUTO') : t('water_supply.manual', 'MANUAL')}
            </span>
          </div>
        </div>
      </div>

      {/* Process Diagram: แสดงผัง 3D หรือ 2D ตามที่เลือก */}
      {view3d ? (
        <PumpSystem3D
          data={displayData}
          percent={percent}
          low={low}
          high={high}
          conn={conn}
          tankConfig={tankConfig}
          displayUnit={displayUnit}
          tankCalculations={tankCalculations}
        />
      ) : (
        <PumpSystem
          data={displayData}
          percent={percent}
          low={low}
          high={high}
          conn={conn}
          tankConfig={tankConfig}
          displayUnit={displayUnit}
          tankCalculations={tankCalculations}
        />
      )}

      {/* Modal กำหนดขนาดบ่อ */}
      <TankConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        config={tankConfig}
        onSave={handleSaveConfig}
      />
    </div>
  );
}
