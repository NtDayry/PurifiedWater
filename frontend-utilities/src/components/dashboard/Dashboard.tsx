import { useCallback, useEffect, useRef, useState } from 'react';
import { SensorKey, SensorDashboardData } from '@_types/sensor';
import { INITIAL_SENSOR_DATA } from '@/constants/sensor';
import { WaterTank } from '@/components/ui/watertank';
import { SectionHeader, StatusBadge, MetricCard } from '@/components/ui/widget';
import Gradient from '@/components/charts/gauge';
import { useTheme } from '@/context/ThemeContext';
import { useSidebar } from '@/context/SidebarContext';
import { useFullScreen } from '@/context/FullScreenContext';
import { API_URL, getSensorConfigs, getAlertRules, type AlertRule } from '@/api';

const WS_HEARTBEAT_INTERVAL_MS = 10000;
const WS_STALE_TIMEOUT_MS = 25000;
const WS_RECONNECT_BASE_DELAY_MS = 2000;
const WS_RECONNECT_MAX_DELAY_MS = 30000;

type DashboardProps = {
  hmiMode?: boolean;
};

export default function Dashboard({ hmiMode = false }: DashboardProps) {
  const { theme } = useTheme();
  const { isMobile } = useSidebar();
  const { fullScreen } = useFullScreen();
  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const lastMessageAtRef = useRef(Date.now());
  const [loadingConfigs, setLoadingConfigs] = useState<boolean>(true);
  const [loadedSensors, setLoadedSensors] = useState<Set<string>>(new Set());
  const [scfgs, setScfgs] = useState<Record<string, Record<string, any>>>({});
  const [alertRulesMap, setAlertRulesMap] = useState<Record<string, Record<string, AlertRule>>>({});
  const [data, setData] = useState<SensorDashboardData>(INITIAL_SENSOR_DATA);
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);

  // Fetch sensor configurations and alarm rules from backend
  const loadConfigs = useCallback(() => {
    Promise.all([
      getSensorConfigs(),
      getAlertRules().catch(() => []),
    ])
      .then(([configs, rules]) => {
        const cfgMap: Record<string, Record<string, any>> = {};
        configs.forEach((c) => {
          if (!cfgMap[c.device_name]) cfgMap[c.device_name] = {};
          cfgMap[c.device_name][c.metric_name] = c;
        });
        setScfgs(cfgMap);

        const ruleMap: Record<string, Record<string, AlertRule>> = {};
        rules.forEach((r) => {
          if (!ruleMap[r.device_name]) ruleMap[r.device_name] = {};
          ruleMap[r.device_name][r.metric_name] = r;
        });
        setAlertRulesMap(ruleMap);
      })
      .catch((err) => console.error('Failed to load sensor configs/rules in Dashboard:', err))
      .finally(() => setLoadingConfigs(false));
  }, []);


  useEffect(() => {
    loadConfigs();
    // Periodically sync configs every 3 seconds so edits take effect immediately
    const interval = setInterval(loadConfigs, 3000);
    return () => clearInterval(interval);
  }, [loadConfigs]);

  useEffect(() => {
    if (!hmiMode) return;

    const syncViewportHeight = () => setViewportHeight(window.innerHeight);
    syncViewportHeight();
    window.addEventListener('resize', syncViewportHeight);

    return () => window.removeEventListener('resize', syncViewportHeight);
  }, [hmiMode]);

  // WebSocket connection management
  useEffect(() => {
    let isMounted = true;

    const clearReconnectTimeout = () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    const clearHeartbeat = () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (!isMounted || reconnectTimeoutRef.current) return;

      const delay = Math.min(
        WS_RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttemptRef.current,
        WS_RECONNECT_MAX_DELAY_MS
      );

      reconnectAttemptRef.current += 1;
      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectTimeoutRef.current = null;
        connectWs();
      }, delay);
    };

    const startHeartbeat = (ws: WebSocket) => {
      clearHeartbeat();

      heartbeatRef.current = setInterval(() => {
        if (!isMounted || wsRef.current !== ws) return;

        if (ws.readyState !== WebSocket.OPEN) {
          ws.close();
          return;
        }

        const staleMs = Date.now() - lastMessageAtRef.current;
        if (staleMs > WS_STALE_TIMEOUT_MS) {
          console.warn('Sensor WebSocket stale. Reconnecting...');
          ws.close(4000, 'stale connection');
          return;
        }

        try {
          ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
        } catch (err) {
          console.error('Sensor WebSocket heartbeat failed:', err);
          ws.close();
        }
      }, WS_HEARTBEAT_INTERVAL_MS);
    };

    function connectWs() {
      if (
        wsRef.current &&
        (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }

      clearReconnectTimeout();

      const ws = new WebSocket(API_URL.WS);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMounted) return;

        console.log('✅ Sensor WebSocket connected');
        reconnectAttemptRef.current = 0;
        lastMessageAtRef.current = Date.now();
        startHeartbeat(ws);
      };

      ws.onmessage = (event) => {
        if (!isMounted) return;
        lastMessageAtRef.current = Date.now();

        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'pong') {
            return;
          }

          if (msg.type === 'config_updated') {
            loadConfigs();
          }

          if (msg.type === 'data' && msg.data) {
            const flatValues: Record<string, number> = {};
            const incomingKeys: string[] = [];

            Object.values(msg.data).forEach((deviceData: any) => {
              if (typeof deviceData === 'object' && deviceData !== null) {
                Object.assign(flatValues, deviceData);
                Object.keys(deviceData).forEach((k) => incomingKeys.push(k));
              }
            });

            if (msg.data.adjusted && typeof msg.data.adjusted === 'object') {
              Object.keys(msg.data.adjusted).forEach((k) => incomingKeys.push(k));
            }

            setLoadedSensors((prev) => {
              const next = new Set(prev);
              incomingKeys.forEach((k) => next.add(k));
              return next;
            });

            setData((prev) => ({
              ...prev,
              timestamp: msg.timestamp || new Date().toISOString(),
              values: {
                ...prev.values,
                ...flatValues,
                ...(msg.data.adjusted || {}),
              },
              statuses: {
                ...prev.statuses,
                ...(msg.statuses || {}),
              },
            }));
          }
        } catch (err) {
          console.error('WebSocket parse error:', err);
        }
      };

      ws.onerror = (err) => {
        if (isMounted) console.error('❌ WebSocket error:', err);
      };

      ws.onclose = () => {
        if (!isMounted || wsRef.current !== ws) return;

        console.log('🔌 Sensor WebSocket closed. Reconnecting...');
        wsRef.current = null;
        clearHeartbeat();
        scheduleReconnect();
      };
    }

    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED)
      ) {
        connectWs();
      }
    };

    connectWs();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearHeartbeat();
      clearReconnectTimeout();
      if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [loadConfigs]);

  const isSensorLoading = useCallback(
    (sKey: string) => {
      return loadingConfigs || !loadedSensors.has(sKey);
    },
    [loadingConfigs, loadedSensors]
  );

  const getUnit = useCallback(
    (gKey: string, sKey: string) => {
      const cfg = scfgs?.[gKey]?.[sKey];
      if (cfg && cfg.unit !== null && cfg.unit !== undefined) {
        return cfg.unit;
      }
      return '';
    },
    [scfgs]
  );

  const getDecimals = useCallback(
    (gKey: string, sKey: string, fallback = 2) => {
      const cfg = scfgs?.[gKey]?.[sKey];
      if (cfg && typeof cfg.decimal_places === 'number') {
        return cfg.decimal_places;
      }
      return fallback;
    },
    [scfgs]
  );

  const compareWithConfig = (gKey: string, sKey: string) => {
    const rawStatus = data?.statuses?.[sKey as SensorKey];
    if (rawStatus && rawStatus !== 'OK') {
      if (rawStatus === 'NO_SIGNAL') return 'no_signal';
      if (rawStatus === 'UNDER_RANGE') return 'under_range';
      if (rawStatus === 'OVER_RANGE') return 'over_range';
      if (rawStatus === 'ERROR') return 'inactive';
    }

    const value = data?.values?.[sKey as SensorKey];
    if (value === undefined) return 'normal';

    const rule = alertRulesMap?.[gKey]?.[sKey];
    const cfg = scfgs?.[gKey]?.[sKey];

    const min = rule?.threshold_min ?? cfg?.alert_min;
    const max = rule?.threshold_max ?? cfg?.alert_max;

    if (min !== null && min !== undefined && value < min) return 'warning';
    if (max !== null && max !== undefined && value > max) return 'warning';

    return 'normal';
  };

  if (!data) return null;

  const isHmiActive = hmiMode && fullScreen;
  const hmiScale = isHmiActive ? Math.min(1, Math.max(0.66, (viewportHeight - 56) / 940)) : 1;
  const fit = (value: number) => Math.round(value * hmiScale);
  const sectionCardClass = isHmiActive
    ? 'rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-white/[0.03] xl:p-5'
    : 'rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] md:p-6';
  const hmiLeftCardClass = `${sectionCardClass} flex h-full flex-col`;
  const hmiTopCardClass = `${sectionCardClass} flex min-h-0 flex-1 flex-col`;
  const hmiBottomCardClass = `${sectionCardClass} shrink-0`;
  const innerCardPadding = isHmiActive ? `${fit(16)}px ${fit(14)}px` : '16px 14px';
  const innerCardRadius = isHmiActive ? 16 : 14;
  const metricGapClass = isHmiActive ? 'gap-3' : 'gap-2';
  const tankWidth = isHmiActive ? (isMobile ? fit(260) : fit(500)) : isMobile ? 250 : 350;
  const tankHeight = isHmiActive ? (isMobile ? fit(360) : fit(700)) : isMobile ? 400 : 560;
  const gaugeSize = isHmiActive ? fit(205) : 180;

  return (
    <>
      {/* PW Tank */}
      <div className={`col-span-12 md:col-span-12 ${isHmiActive ? 'h-full space-y-0 xl:col-span-5' : 'space-y-6 lg:col-span-4'}`}>
        <div className={isHmiActive ? hmiLeftCardClass : sectionCardClass}>
          <SectionHeader title="PW Tank" subtitle="Purified Water" accent="#22c55e" hmi={isHmiActive} />

          {/* Water Tank */}
          <div className={`flex flex-col items-center ${isHmiActive ? 'min-h-0 flex-1 justify-center gap-2' : 'gap-4'}`}>
            <WaterTank
              level={data?.values?.water_level ?? 0}
              loading={isSensorLoading('water_level')}
              minLevel={
                alertRulesMap.distribution_loop?.water_level?.threshold_min ??
                scfgs.distribution_loop?.water_level?.alert_min ??
                350
              }
              maxLevel={
                alertRulesMap.distribution_loop?.water_level?.threshold_max ??
                scfgs.distribution_loop?.water_level?.alert_max ??
                1800
              }
              capacity={
                scfgs.distribution_loop?.water_level?.max_range ??
                scfgs.distribution_loop?.water_level?.range_max ??
                2000
              }
              unit={getUnit('distribution_loop', 'water_level') || 'mm'}
              width={tankWidth}
              height={tankHeight}
              color="#0081fa"
              isDark={theme === 'dark'}
            />

            <div className="w-full px-3">
              <div
                style={{
                  height: isHmiActive ? fit(9) : 8,
                  background: `rgba(${false ? '255,255,255' : '0,0,0'},0.05)`,
                  borderRadius: 4,
                  overflow: 'hidden',
                  marginBottom: 6,
                }}
              >
                {isSensorLoading('water_level') ? (
                  <div className="h-full w-full bg-gray-200 dark:bg-gray-700/60 animate-pulse" />
                ) : (
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(100, Math.max(0, ((data?.values?.water_level ?? 0) / 2000) * 100))}%`,
                      background: 'linear-gradient(90deg,#22c55e,#4ade80)',
                      transition: 'width 0.8s ease',
                      boxShadow: '0 0 8px #22c55e44',
                    }}
                  />
                )}
              </div>
              <div className="flex justify-between font-medium text-gray-500 dark:text-gray-400">
                <span style={{ fontSize: isHmiActive ? fit(16) : 12 }}>Empty</span>
                <span style={{ fontSize: isHmiActive ? fit(16) : 12 }}>Full</span>
              </div>
            </div>
          </div>

          <div className={`flex justify-between grid-cols-1 md:grid-cols-2 border-gray-800 ${isHmiActive ? 'shrink-0 gap-3 pt-3' : 'pt-5'}`}>
            <MetricCard
              label="Water Meter"
              value={data?.values?.water_meter ?? 0}
              loading={isSensorLoading('water_meter')}
              unit={getUnit('water_flow', 'water_meter')}
              decimals={getDecimals('water_flow', 'water_meter', 2)}
              className="text-sky-500 dark:text-sky-400"
              small
              hmi={isHmiActive}
            />
            <MetricCard
              label="Flow Rate"
              value={data?.values?.flow_rate ?? 0}
              loading={isSensorLoading('flow_rate')}
              unit={getUnit('water_flow', 'flow_rate')}
              decimals={getDecimals('water_flow', 'flow_rate', 2)}
              className="text-sky-500 dark:text-sky-400"
              small
              hmi={isHmiActive}
            />
          </div>
        </div>
      </div>

      {/* Distribution Loop & RO Systems */}
      <div className={`col-span-12 md:col-span-12 ${isHmiActive ? 'flex h-full min-h-0 flex-col gap-4 xl:col-span-7' : 'space-y-5 lg:col-span-8'}`}>
        {/* Distribution Loop */}
        <div className={isHmiActive ? hmiTopCardClass : sectionCardClass}>
          <SectionHeader title="Distribution Loop" subtitle="Circulation & Quality" accent="#f43f5e" hmi={isHmiActive} />
          <div className={`grid grid-cols-1 ${isHmiActive ? 'min-h-0 flex-1 content-start gap-4' : 'gap-5'}`}>
            <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 ${isHmiActive ? 'gap-4' : 'gap-5'}`}>
              {/* UV */}
              <div
                className="bg-violet-50 dark:bg-violet-300/[0.05] border-gray-800"
                style={{
                  border: '1px solid rgba(121, 3, 255, 0.47)',
                  borderRadius: innerCardRadius,
                  padding: innerCardPadding,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: isHmiActive ? fit(12) : 12,
                  alignItems: 'center',
                }}
              >
                <div className="flex justify-between items-start w-full">
                  <span style={{ fontSize: isHmiActive ? fit(19) : 16, fontWeight: 800, color: '#603ff4' }}>UV Index</span>
                  <StatusBadge
                    status={compareWithConfig('distribution_loop', 'uv3')}
                    loading={isSensorLoading('uv3')}
                    hmi={isHmiActive}
                  />
                </div>
                <Gradient
                  value={data?.values?.uv3 ?? 0}
                  loading={isSensorLoading('uv3')}
                  decimal={getDecimals('distribution_loop', 'uv3', 2)}
                  label="UV Index"
                  color="#7050fd"
                  unit={getUnit('distribution_loop', 'uv3')}
                  size={gaugeSize}
                />
              </div>

              {/* TOC */}
              <div
                className="bg-yellow-50 dark:bg-yellow-400/10 border-gray-800"
                style={{
                  border: '1px solid rgba(251, 190, 36, 0.72)',
                  borderRadius: innerCardRadius,
                  padding: innerCardPadding,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: isHmiActive ? fit(10) : 10,
                }}
              >
                <div className="flex justify-between items-start w-full">
                  <span style={{ fontSize: isHmiActive ? fit(19) : 16, fontWeight: 800, color: '#fcb900' }}>TOC</span>
                  <StatusBadge
                    status={compareWithConfig('distribution_loop', 'toc')}
                    loading={isSensorLoading('toc')}
                    hmi={isHmiActive}
                  />
                </div>
                <div className={`flex flex-row justify-between md:flex-col sm:justify-start ${metricGapClass}`}>
                  <MetricCard
                    label="TOC Value"
                    value={data?.values?.toc ?? 0}
                    loading={isSensorLoading('toc')}
                    unit={getUnit('distribution_loop', 'toc')}
                    decimals={getDecimals('distribution_loop', 'toc', 2)}
                    className="text-yellow-500 dark:text-yellow-400"
                    small
                    hmi={isHmiActive}
                  />
                  <MetricCard
                    label="Temperature"
                    value={data?.values?.toc_temp ?? 0}
                    loading={isSensorLoading('toc_temp')}
                    unit={getUnit('distribution_loop', 'toc_temp')}
                    decimals={getDecimals('distribution_loop', 'toc_temp', 2)}
                    className="text-orange-500 dark:text-orange-400"
                    small
                    hmi={isHmiActive}
                  />
                </div>
              </div>

              {/* Conductivity */}
              <div
                className="bg-sky-100 dark:bg-sky-400/10"
                style={{
                  border: '1px solid rgba(16, 216, 247, 0.43)',
                  borderRadius: innerCardRadius,
                  padding: innerCardPadding,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: isHmiActive ? fit(10) : 10,
                }}
              >
                <div className="flex justify-between items-start w-full">
                  <span style={{ fontSize: isHmiActive ? fit(19) : 16, fontWeight: 800, color: '#22d3ee' }}>Conductivity</span>
                  <StatusBadge
                    status={compareWithConfig('distribution_loop', 'dis_loop_conduct')}
                    loading={isSensorLoading('dis_loop_conduct')}
                    hmi={isHmiActive}
                  />
                </div>
                <div className={`flex flex-row justify-between md:flex-col sm:justify-start ${metricGapClass}`}>
                  <MetricCard
                    label="Conductivity"
                    value={data?.values?.dis_loop_conduct ?? 0}
                    loading={isSensorLoading('dis_loop_conduct')}
                    unit={getUnit('distribution_loop', 'dis_loop_conduct')}
                    decimals={getDecimals('distribution_loop', 'dis_loop_conduct', 2)}
                    className="text-sky-500 dark:text-sky-400"
                    small
                    hmi={isHmiActive}
                  />
                  <MetricCard
                    label="Temperature"
                    value={data?.values?.dis_loop_temp ?? 0}
                    loading={isSensorLoading('dis_loop_temp')}
                    unit={getUnit('distribution_loop', 'dis_loop_temp')}
                    decimals={getDecimals('distribution_loop', 'dis_loop_temp', 2)}
                    className="text-orange-500 dark:text-orange-400"
                    small
                    hmi={isHmiActive}
                  />
                </div>
              </div>
            </div>

            {/* Flow Metrics */}
            <div className={`grid grid-cols-1 md:grid-cols-2 ${isHmiActive ? 'gap-4' : 'gap-5'}`}>
              <div
                className="bg-sky-50 dark:bg-sky-300/10 border-gray-800"
                style={{
                  border: '1px solid rgba(63, 81, 244, 0.28)',
                  borderRadius: innerCardRadius,
                  padding: innerCardPadding,
                }}
              >
                <div className="flex justify-between items-start w-full">
                  <MetricCard
                    label="Instant flow rate"
                    value={data?.values?.instant_flow_rate ?? 0}
                    loading={isSensorLoading('instant_flow_rate')}
                    unit={getUnit('flow_metrics', 'instant_flow_rate')}
                    decimals={getDecimals('flow_metrics', 'instant_flow_rate', 2)}
                    className="text-sky-500 dark:text-sky-400"
                    small
                    hmi={isHmiActive}
                  />
                  <StatusBadge
                    status={compareWithConfig('flow_metrics', 'instant_flow_rate')}
                    loading={isSensorLoading('instant_flow_rate')}
                    hmi={isHmiActive}
                  />
                </div>
              </div>
              <div
                className="bg-sky-50 dark:bg-sky-300/10 border-gray-800"
                style={{
                  border: '1px solid rgba(63, 81, 244, 0.28)',
                  borderRadius: innerCardRadius,
                  padding: innerCardPadding,
                }}
              >
                <div className="flex justify-between items-start w-full">
                  <MetricCard
                    label="Fluid velocity"
                    value={data?.values?.fluid_velocity ?? 0}
                    loading={isSensorLoading('fluid_velocity')}
                    unit={getUnit('flow_metrics', 'fluid_velocity')}
                    decimals={getDecimals('flow_metrics', 'fluid_velocity', 2)}
                    className="text-sky-500 dark:text-sky-400"
                    small
                    hmi={isHmiActive}
                  />
                  <StatusBadge
                    status={compareWithConfig('flow_metrics', 'fluid_velocity')}
                    loading={isSensorLoading('fluid_velocity')}
                    hmi={isHmiActive}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RO System */}
        <div className={isHmiActive ? hmiBottomCardClass : sectionCardClass}>
          <SectionHeader title="RO System" subtitle="Reverse Osmosis + EDI" accent="#818cf8" hmi={isHmiActive} />
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit,minmax(${isHmiActive ? fit(180) : 180}px,1fr))`, gap: isHmiActive ? fit(14) : 16 }}>
            {[
              {
                name: 'RO 1',
                label: 'RO 1',
                gKey: 'ro_system',
                sKeyConduct: 'ro1_conduct',
                sKeyTemp: 'ro1_temp',
                conductVal: data?.values?.ro1_conduct ?? 0,
                tempVal: data?.values?.ro1_temp ?? 0,
              },
              {
                name: 'RO 2',
                label: 'RO 2',
                gKey: 'ro_system',
                sKeyConduct: 'ro2_conduct',
                sKeyTemp: 'ro2_temp',
                conductVal: data?.values?.ro2_conduct ?? 0,
                tempVal: data?.values?.ro2_temp ?? 0,
              },
              {
                name: 'EDI',
                label: 'EDI',
                gKey: 'ro_system',
                sKeyConduct: 'edi_conduct',
                sKeyTemp: 'edi_temp',
                conductVal: data?.values?.edi_conduct ?? 0,
                tempVal: data?.values?.edi_temp ?? 0,
              },
            ].map(({ name, label, gKey, sKeyConduct, sKeyTemp, conductVal, tempVal }) => (
              <div
                key={name}
                className="bg-violet-50 dark:bg-violet-200/10 border-gray-800"
                style={{
                  border: `1px solid #a78bfa44`,
                  borderRadius: innerCardRadius,
                  padding: isHmiActive ? `${fit(14)}px ${fit(12)}px` : '20px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: isHmiActive ? fit(12) : 14,
                }}
              >
                <div className="flex justify-between items-start w-full">
                  <span className="text-violet-500 dark:text-violet-400" style={{ fontSize: isHmiActive ? fit(20) : 18, fontWeight: 800, letterSpacing: '0em' }}>
                    {label}
                  </span>
                  <StatusBadge
                    status={compareWithConfig(gKey, sKeyConduct)}
                    loading={isSensorLoading(sKeyConduct)}
                    hmi={isHmiActive}
                  />
                </div>
                <div className={`flex flex-row justify-between md:flex-col sm:justify-start ${metricGapClass}`}>
                  <MetricCard
                    label="Conductivity"
                    value={conductVal}
                    loading={isSensorLoading(sKeyConduct)}
                    unit={getUnit(gKey, sKeyConduct)}
                    decimals={getDecimals(gKey, sKeyConduct, 2)}
                    className="text-violet-500 dark:text-violet-400"
                    small
                    hmi={isHmiActive}
                  />
                  <MetricCard
                    label="Temperature"
                    value={tempVal}
                    loading={isSensorLoading(sKeyTemp)}
                    unit={getUnit(gKey, sKeyTemp)}
                    decimals={getDecimals(gKey, sKeyTemp, 2)}
                    className="text-orange-500 dark:text-orange-400"
                    small
                    hmi={isHmiActive}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
