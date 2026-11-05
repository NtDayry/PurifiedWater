import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMqttTank } from '@/hooks/useMqttTank';
import { Badge, Card, Stat } from '../../components/water-supply/WaterSupplyUI';
import AreaChart from '@/components/charts/area';
import { ColorPickerPopover } from '@/components/reports/ReportCharts';
import type { TankData } from '@/types/waterSupply.types';

const MQTT_URL = import.meta.env.VITE_MQTT_WATER_URL || 'ws://192.168.12.77:1884';
const MQTT_TOPIC = import.meta.env.VITE_MQTT_WATER_TOPIC || 'water-system';
const MQTT_USERNAME = import.meta.env.VITE_MQTT_WATER_USERNAME || 'polipharm';
const MQTT_PASSWORD = import.meta.env.VITE_MQTT_WATER_PASSWORD || '12345678';

// ค่าจำลองเริ่มต้นสำหรับแสดงตัวอย่างเมื่อยังไม่มีข้อมูล MQTT เข้ามา
const INITIAL_DEMO_DATA: TankData = {
  water_level: {
    level_cm: 96.8,
    volumn: 24.5,
    flow_rate: 15.2,
    tank_capacity_cm: 160.0,
  },
  controls: {
    valve_on: true,
    pump1_on: true,
    pump2_on: false,
    pump1_overload: false,
    pump2_overload: false,
    alarm_on: false,
    auto_mode: true,
    auto_pump1: true,
    auto_pump2: true,
    manual_pump1: false,
    manual_pump2: false,
    manual_valve: false,
    pressure_switch: true,
  },
  local_io: { di0: true, di1: false, do0: true, do1: false },
  rs485_io: {
    status_ok: true,
    input: { di1: true, di2: false, di3: false, di4: false },
    output: { ch1: true, ch2: true, ch3: false, ch4: false },
  },
  system: {
    wifi_rssi: -67,
    ip: '192.168.12.77',
    sensor_comm_ok: true,
    uptime_sec: 106433,
  },
};

const LOW_PCT = 20;
const HIGH_PCT = 95;
const STALE_MS = 15_000;

function formatUptime(sec: number) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

export default function WaterSupplyReports() {
  const { t } = useTranslation();
  const { data: mqttData, status, lastUpdate, history, setHistory } = useMqttTank(MQTT_URL, MQTT_TOPIC, {
    username: MQTT_USERNAME,
    password: MQTT_PASSWORD,
  });
  const [now, setNow] = useState(Date.now());
  const [useDemo, setUseDemo] = useState(false);
  const [chartColor, setChartColor] = useState('#0284c7');

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // สร้าง mock history เริ่มต้นถ้ายังไม่มีข้อมูล history
  useEffect(() => {
    if (history.length === 0) {
      const baseTime = Date.now();
      const mockPoints = Array.from({ length: 25 }, (_, i) => ({
        t: baseTime - (25 - i) * 6000,
        cm: 95 + Math.sin(i / 2) * 5 + (Math.random() * 2 - 1),
      }));
      setHistory(mockPoints);
    }
  }, [history.length, setHistory]);

  const activeData = mqttData || (useDemo || status === 'offline' ? INITIAL_DEMO_DATA : null);

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
    : `${t('water_supply.offline')} (${t('water_supply.use_demo')})`;

  const displayData = activeData || INITIAL_DEMO_DATA;
  const { water_level: wl, controls: c, local_io, rs485_io, system } = displayData;
  const percent = Math.max(0, Math.min(100, (wl.level_cm / wl.tank_capacity_cm) * 100));

  const rssiLabel = (rssi: number) => {
    if (rssi > -60) return { text: t('water_supply.rssi_good'), cls: 'text-success-600 dark:text-success-400' };
    if (rssi > -70) return { text: t('water_supply.rssi_fair'), cls: 'text-warning-600 dark:text-warning-400' };
    return { text: t('water_supply.rssi_weak'), cls: 'text-error-600 dark:text-error-400' };
  };

  const rssi = rssiLabel(system.wifi_rssi);

  // คำนวณข้อมูลสำหรับ AreaChart
  const categories = history.map((p) => new Date(p.t).toISOString());
  const seriesData = history.map((p) => Number(p.cm.toFixed(1)));
  const dataValues = seriesData.filter((v) => Number.isFinite(v));
  const minValue = dataValues.length > 0 ? Math.min(...dataValues) : wl.level_cm;
  const maxValue = dataValues.length > 0 ? Math.max(...dataValues) : wl.level_cm;
  const avgValue = dataValues.length > 0 ? dataValues.reduce((a, b) => a + b, 0) / dataValues.length : wl.level_cm;

  const warningMin = (LOW_PCT / 100) * wl.tank_capacity_cm;
  const warningMax = (HIGH_PCT / 100) * wl.tank_capacity_cm;

  return (
    <div className="space-y-6 pb-12">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white sm:text-2xl">
            {t('water_supply.reports_title')}
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
            <span className="animate-pulse rounded-full bg-error-600 px-3.5 py-1 text-xs font-bold text-white shadow-sm">
              {t('water_supply.alarm_active')}
            </span>
          )}
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${connCls}`}>
            ● {connText}
          </span>
          <button
            type="button"
            onClick={() => setUseDemo(!useDemo)}
            className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-750"
          >
            {useDemo ? t('water_supply.use_live') : t('water_supply.use_demo')}
          </button>
        </div>
      </div>

      {/* Main Grid: Chart & Controls */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: AreaChart (เหมือน ReportCharts.tsx) & Quick Stats */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white px-3 ps-0 dark:border-gray-800 dark:bg-gray-900 shadow-sm">
            <AreaChart
              id="water-level-history"
              categories={categories}
              series={[
                {
                  name: `${t('water_supply.water_level_trend')} (cm)`,
                  data: seriesData,
                },
              ]}
              height={300}
              avg={avgValue.toFixed(1)}
              warningMin={warningMin}
              warningMax={warningMax}
              options={{
                colors: [chartColor],
                xaxis: {
                  type: 'datetime',
                  labels: {
                    datetimeUTC: false,
                    format: 'HH:mm:ss',
                  },
                },
                tooltip: {
                  x: {
                    format: 'HH:mm:ss',
                  },
                },
              }}
              label={
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center p-4 sm:p-5 pb-0 gap-3 sm:gap-0">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm sm:text-base font-bold text-gray-800 dark:text-white/[0.9]">
                        {t('water_supply.water_level_trend')}
                      </h3>
                      <ColorPickerPopover
                        currentColor={chartColor}
                        onChange={(c) => setChartColor(c)}
                        onReset={() => setChartColor('#0284c7')}
                      />
                    </div>
                    <div className="flex flex-wrap gap-3 mt-1.5">
                      <span className="text-xs sm:text-sm text-warning-500 font-semibold">
                        {t('water_supply.min')}: {minValue.toFixed(1)} cm
                      </span>
                      <span className="text-xs sm:text-sm text-error-500 font-semibold">
                        {t('water_supply.max')}: {maxValue.toFixed(1)} cm
                      </span>
                      <span className="text-xs sm:text-sm text-blue-500 font-semibold">
                        {t('water_supply.avg')}: {avgValue.toFixed(1)} cm
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/60 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700/60">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('water_supply.live')}</span>
                    <h3 className="text-sm sm:text-base font-bold tracking-tight" style={{ color: chartColor }}>
                      {wl.level_cm.toFixed(1)}{' '}
                      <span className="text-xs sm:text-sm font-normal text-gray-500 dark:text-gray-400">
                        cm ({percent.toFixed(1)}%)
                      </span>
                    </h3>
                  </div>
                </div>
              }
            />
          </div>

          {/* Quick Stat Cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <Stat label={t('water_supply.current_level')} value={wl.level_cm.toFixed(1)} unit="cm" />
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <Stat label={t('water_supply.tank_capacity')} value={wl.tank_capacity_cm.toFixed(0)} unit="cm" />
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <Stat label={t('water_supply.accumulated_volume')} value={wl.volumn.toFixed(2)} unit="m³" />
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <Stat label={t('water_supply.flow_rate')} value={wl.flow_rate.toFixed(2)} unit="m³/h" />
            </div>
          </div>
        </div>

        {/* Right 1 Col: Status Badges */}
        <div className="space-y-6">
          <Card title={t('water_supply.equipments')}>
            <div className="space-y-2.5">
              <Badge label={t('water_supply.inlet_valve')} on={c.valve_on} />
              <Badge label={t('water_supply.pump_1')} on={c.pump1_on} />
              {c.pump1_overload && <Badge label={t('water_supply.pump1_overload_alert')} on={true} tone="red" />}
              <Badge label={t('water_supply.pump_2')} on={c.pump2_on} />
              {c.pump2_overload && <Badge label={t('water_supply.pump2_overload_alert')} on={true} tone="red" />}
              <Badge label={t('water_supply.alarm')} on={c.alarm_on} tone="red" />
              <Badge label={t('water_supply.pressure_switch')} on={c.pressure_switch} />
            </div>
          </Card>

          <Card title={t('water_supply.control_mode')}>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs text-gray-500 dark:text-gray-400">{t('water_supply.control_status')}:</span>
              <span className="inline-block rounded-md bg-brand-50 px-3 py-1 text-xs font-bold text-brand-600 dark:bg-brand-500/20 dark:text-brand-400">
                {c.auto_mode ? t('water_supply.auto') : t('water_supply.manual')}
              </span>
            </div>
            <div className="space-y-2">
              <Badge label={t('water_supply.auto_pump1')} on={c.auto_pump1} />
              <Badge label={t('water_supply.auto_pump2')} on={c.auto_pump2} />
              <Badge label={t('water_supply.manual_pump1')} on={c.manual_pump1} />
              <Badge label={t('water_supply.manual_pump2')} on={c.manual_pump2} />
              <Badge label={t('water_supply.manual_valve')} on={c.manual_valve} />
            </div>
          </Card>
        </div>

        {/* Local I/O */}
        <Card title={t('water_supply.local_io')}>
          <div className="grid grid-cols-2 gap-2.5">
            {Object.entries(local_io).map(([k, v]) => (
              <Badge key={k} label={k.toUpperCase()} on={v} />
            ))}
          </div>
        </Card>

        {/* RS485 I/O */}
        <Card title={`${t('water_supply.rs485_io')} ${rs485_io.status_ok ? '' : '(Error)'}`}>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">Digital Input</div>
              {Object.entries(rs485_io.input).map(([k, v]) => (
                <Badge key={k} label={k.toUpperCase()} on={v} />
              ))}
            </div>
            <div className="space-y-2">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">Digital Output</div>
              {Object.entries(rs485_io.output).map(([k, v]) => (
                <Badge key={k} label={k.toUpperCase()} on={v} />
              ))}
            </div>
          </div>
        </Card>

        {/* System & Telemetry */}
        <Card title={t('water_supply.controller_system')}>
          <div className="grid grid-cols-2 gap-4">
            <Stat label={t('water_supply.ip_address')} value={system.ip} />
            <Stat label={t('water_supply.uptime')} value={formatUptime(system.uptime_sec)} />
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{t('water_supply.wifi_rssi')}</div>
              <div className="text-2xl font-bold tabular-nums text-gray-800 dark:text-white/90">
                {system.wifi_rssi}{' '}
                <span className="text-sm font-normal text-gray-500 dark:text-gray-400">dBm</span>
              </div>
              <div className={`text-xs font-medium mt-0.5 ${rssi.cls}`}>{rssi.text}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{t('water_supply.sensor_status')}</div>
              <div className={`text-lg font-bold mt-1 ${system.sensor_comm_ok ? 'text-success-600 dark:text-success-400' : 'text-error-600 dark:text-error-400'}`}>
                {system.sensor_comm_ok ? t('water_supply.sensor_normal') : t('water_supply.sensor_lost')}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
