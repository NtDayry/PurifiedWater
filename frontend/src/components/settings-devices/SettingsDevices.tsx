import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLoading } from '@/context/LoadingContext';
import { SectionHeader } from '@/components/ui/widget';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import Input from '@/components/form/input/InputField';
import Button from '@/components/ui/button/Button';
import useSwalAlert from '@/hooks/useSwalAlert';
import {
  API_URL,
  getSensorConfigs,
  updateSensorConfig,
  getSensorGroups,
  getSensorRegistry,
  reorderSensorGroups,
  reorderSensors,
  getNotificationSettings,
  updateNotificationSettings,
  testNotificationSettings,
  type SensorConfig,
  type SensorConfigUpdate,
  type SensorGroup,
  type SensorRegistryItem,
  type NotificationSettingsPayload,
  type NotificationTestResponse,
} from '@/api';
import { parseFetchError } from '@/api';
import { Analog420mAAdjustModal } from './Analog420mAAdjustModal';
import { SensorAlarmModal } from './SensorAlarmModal';

// ─── Types ────────────────────────────────────────────────────────────────────
type EditMap = Record<number, Partial<SensorConfigUpdate>>;

type DeviceGroup = {
  id?: number;
  device_name: string;
  display_name: string;
  color: string;
  sort_order: number;
  configs: SensorConfig[];
};

// ─── Device colour palette ────────────────────────────────────────────────────
const DEVICE_COLORS: Record<string, string> = {
  water_flow:         '#34d399',
  ro_system:          '#818cf8',
  distribution_loop:  '#f43f5e',
  flow_metrics:       '#fb923c',
};

const DECODE_TYPES = ['analog_4_20ma', 'bcd_hex', 'float32_cdab'];

function colorForDevice(name: string, customColor?: string | null): string {
  if (customColor) return customColor;
  return DEVICE_COLORS[name] ?? '#60a5fa';
}

function deviceLabel(name: string, customDisplay?: string | null): string {
  if (customDisplay) return customDisplay;
  return name
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function metricLabel(name: string, registryItem?: SensorRegistryItem): string {
  if (registryItem?.display_name) return registryItem.display_name;
  return name
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function splitLineTargets(value: string): string[] {
  return value.split(/[,;\n\r]+/).map((target) => target.trim()).filter(Boolean);
}

function maskLineTargetLabel(target: string): string {
  const [channelAccessToken, recipientId] = target.split('|').map((part) => part.trim());
  if (!recipientId) return channelAccessToken.length > 12 ? `${channelAccessToken.slice(0, 12)}...` : channelAccessToken;
  return `${channelAccessToken.slice(0, 12)}... | ${recipientId}`;
}

// ─── Reducer for local edits ─────────────────────────────────────────────────
type EditAction =
  | { type: 'SET'; id: number; field: keyof SensorConfigUpdate; value: string | number | null }
  | { type: 'INIT'; configs: SensorConfig[] }
  | { type: 'COMMIT'; id: number; fresh: SensorConfig };

function buildEdit(c: SensorConfig): Partial<SensorConfigUpdate> {
  return {
    decode_type:    c.decode_type,
    raw_min:        c.raw_min,
    raw_max:        c.raw_max,
    range_min:      c.range_min,
    range_max:      c.range_max,
    unit:           c.unit,
    decimal_places: c.decimal_places,
  };
}

function editReducer(state: EditMap, action: EditAction): EditMap {
  switch (action.type) {
    case 'INIT':
      return Object.fromEntries(action.configs.map((c) => [c.id, buildEdit(c)]));
    case 'SET':
      return { ...state, [action.id]: { ...state[action.id], [action.field]: action.value } };
    case 'COMMIT':
      return { ...state, [action.fresh.id]: buildEdit(action.fresh) };
    default:
      return state;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function SettingsDevices() {
  const { t } = useTranslation();
  const { setLoading } = useLoading();
  const swal = useSwalAlert();

  const [configs, setConfigs] = useState<SensorConfig[]>([]);
  const [sensorGroups, setSensorGroups] = useState<SensorGroup[]>([]);
  const [sensorRegistry, setSensorRegistry] = useState<SensorRegistryItem[]>([]);
  const [fetching, setFetching] = useState(true);
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());
  const [reordering, setReordering] = useState(false);
  const [edits, dispatch] = useReducer(editReducer, {} as EditMap);

  // Global Notification Settings state
  const [notifyLine, setNotifyLine] = useState(false);
  const [lineToken, setLineToken] = useState('');
  const [lineChannelAccessToken, setLineChannelAccessToken] = useState('');
  const [lineRecipientId, setLineRecipientId] = useState('');
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [emailRecipients, setEmailRecipients] = useState('');
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifTesting, setNotifTesting] = useState<'line' | 'email' | 'all' | null>(null);
  const [notifCollapsed, setNotifCollapsed] = useState(true);

  // Realtime WebSocket state
  const [liveValues, setLiveValues] = useState<Record<string, number>>({});
  const [liveRawValues, setLiveRawValues] = useState<Record<string, any>>({});
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Adjust Modal state
  const [adjustModalState, setAdjustModalState] = useState<{
    config: SensorConfig;
    metricLabel: string;
    groupName: string;
  } | null>(null);

  // Alarm Modal state
  const [alarmModalState, setAlarmModalState] = useState<{
    config: SensorConfig;
    metricLabel: string;
    groupName: string;
  } | null>(null);

  // track dirty state per config (id → dirty)
  const dirtyRef = useRef<Record<number, boolean>>({});

  // ─── Fetch ──────────────────────────────────────────────────────────────────
  const fetchConfigs = useCallback(async (showLoading = false) => {
    if (showLoading) setFetching(true);
    try {
      const [configsData, groupsData, registryData] = await Promise.all([
        getSensorConfigs(),
        getSensorGroups().catch(() => []),
        getSensorRegistry().catch(() => []),
      ]);
      setConfigs(configsData);
      setSensorGroups(groupsData);
      setSensorRegistry(registryData);
      dispatch({ type: 'INIT', configs: configsData });
      dirtyRef.current = {};
    } catch (err) {
      parseFetchError({
        error: err,
        onUnauthorized: () => swal.error({ title: t('page.settings_devices.swal.unauthorized_title'), message: t('page.settings_devices.swal.unauthorized_msg') }),
        onForbidden:    () => swal.error({ title: t('page.settings_devices.swal.forbidden_title'),     message: t('page.settings_devices.swal.forbidden_msg') }),
        onOtherError:   () => swal.error({ title: t('page.settings_devices.swal.error_title'),         message: t('page.settings_devices.swal.error_msg') }),
      });
    } finally {
      if (showLoading) setFetching(false);
      setLoading(false);
    }
  }, []);

  // ─── Fetch Global Notification Settings ────────────────────────────────────
  const fetchNotifSettings = useCallback(async () => {
    try {
      const ns = await getNotificationSettings();
      setNotifyLine(ns.notify_line);
      setLineToken(ns.line_token ?? '');
      setNotifyEmail(ns.notify_email);
      setEmailRecipients(ns.email_recipients ?? '');
    } catch { /* silent */ }
  }, []);

  const handleSaveNotifSettings = useCallback(async () => {
    setNotifSaving(true);
    try {
      const payload: NotificationSettingsPayload = {
        notify_line: notifyLine,
        line_token: lineToken || null,
        notify_email: notifyEmail,
        email_recipients: emailRecipients || null,
      };
      await updateNotificationSettings(payload);
      swal.Toast({ title: t('page.settings_devices.notifications.swal.save_success'), icon: 'success' });
    } catch (err) {
      parseFetchError({
        error: err,
        onForbidden: () =>
          swal.error({
            title: t('page.settings_devices.notifications.swal.save_forbidden_title'),
            message: t('page.settings_devices.notifications.swal.save_forbidden_msg'),
          }),
        onOtherError: () =>
          swal.error({
            title: t('page.settings_devices.notifications.swal.save_error_title'),
            message: t('page.settings_devices.notifications.swal.save_error_msg'),
          }),
      });
    } finally {
      setNotifSaving(false);
    }
  }, [notifyLine, lineToken, notifyEmail, emailRecipients, t]);

  const handleAddLineTarget = useCallback(() => {
    const channelAccessToken = lineChannelAccessToken.trim();
    const recipientId = lineRecipientId.trim();
    if (!channelAccessToken || !recipientId) return;

    const nextTarget = `${channelAccessToken}|${recipientId}`;
    const existing = splitLineTargets(lineToken);
    if (!existing.includes(nextTarget)) {
      setLineToken([...existing, nextTarget].join(','));
    }
    setLineChannelAccessToken('');
    setLineRecipientId('');
  }, [lineChannelAccessToken, lineRecipientId, lineToken]);

  // ─── Test Notification ─────────────────────────────────────────────────────
  const handleTestNotification = useCallback(async (channel: 'line' | 'email' | 'all') => {
    setNotifTesting(channel);
    try {
      const res: NotificationTestResponse = await testNotificationSettings({
        channel,
        line_token: lineToken || null,
        email_recipients: emailRecipients || null,
      });

      const lineMessages = res.line_result?.details?.map((d) => `• LINE [${d.target ?? d.token ?? 'Target'}]: ${d.message}`) ?? [];
      const emailMessages = res.email_result?.details?.map((d) => `• Email [${d.recipient ?? 'Email'}]: ${d.message}`) ?? [];
      const allLines = [...lineMessages, ...emailMessages].join('\n');

      if (res.success) {
        swal.success({
          title: t('page.settings_devices.notifications.swal.test_success_title'),
          message: allLines || t('page.settings_devices.notifications.swal.test_success_default_msg'),
        });
      } else {
        swal.warning({
          title: t('page.settings_devices.notifications.swal.test_result_title'),
          message: allLines || t('page.settings_devices.notifications.swal.test_result_warning'),
        });
      }
    } catch (err) {
      parseFetchError({
        error: err,
        onForbidden: () =>
          swal.error({
            title: t('page.settings_devices.notifications.swal.test_forbidden_title'),
            message: t('page.settings_devices.notifications.swal.test_forbidden_msg'),
          }),
        onOtherError: () =>
          swal.error({
            title: t('page.settings_devices.notifications.swal.test_error_title'),
            message: t('page.settings_devices.notifications.swal.test_error_msg'),
          }),
      });
    } finally {
      setNotifTesting(null);
    }
  }, [lineToken, emailRecipients, t]);

  useEffect(() => { fetchConfigs(true); fetchNotifSettings(); }, []);

  // ─── Realtime WebSocket Connection ──────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;

    function connectWs() {
      if (
        wsRef.current &&
        (wsRef.current.readyState === WebSocket.OPEN ||
          wsRef.current.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }

      const wsUrl =
        API_URL.WS ||
        `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/sensor-data`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (isMounted) setWsConnected(true);
      };

      ws.onmessage = (event) => {
        if (!isMounted) return;
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'config_updated') {
            fetchConfigs(false);
          }

          if (msg.type === 'data') {
            const nextValues: Record<string, number> = {};
            const nextRawValues: Record<string, any> = {};

            // Parse raw values
            if (msg.raw && typeof msg.raw === 'object') {
              Object.assign(nextRawValues, msg.raw);
            }
            if (msg.data && msg.data.raw && typeof msg.data.raw === 'object') {
              Object.assign(nextRawValues, msg.data.raw);
            }
            if (msg.raw_data && typeof msg.raw_data === 'object') {
              Object.entries(msg.raw_data).forEach(([deviceKey, devVal]: [string, any]) => {
                if (typeof devVal === 'object' && devVal !== null) {
                  Object.entries(devVal).forEach(([metricKey, val]: [string, any]) => {
                    nextRawValues[metricKey] = val;
                    nextRawValues[`${deviceKey}_${metricKey}`] = val;
                  });
                }
              });
            }

            // Parse adjusted values
            if (msg.data && typeof msg.data === 'object') {
              if (msg.data.adjusted && typeof msg.data.adjusted === 'object') {
                Object.assign(nextValues, msg.data.adjusted);
              }
              Object.entries(msg.data).forEach(([deviceKey, devVal]: [string, any]) => {
                if (deviceKey !== 'adjusted' && deviceKey !== 'raw' && typeof devVal === 'object' && devVal !== null) {
                  Object.entries(devVal).forEach(([metricKey, val]: [string, any]) => {
                    nextValues[metricKey] = val;
                    nextValues[`${deviceKey}_${metricKey}`] = val;
                  });
                } else if (typeof devVal === 'number') {
                  nextValues[deviceKey] = devVal;
                }
              });
            }

            if (Object.keys(nextValues).length > 0) {
              setLiveValues((prev) => ({ ...prev, ...nextValues }));
            }
            if (Object.keys(nextRawValues).length > 0) {
              setLiveRawValues((prev) => ({ ...prev, ...nextRawValues }));
            }
          }
        } catch (err) {
          console.error('WebSocket parse error in SettingsDevices:', err);
        }
      };

      ws.onerror = () => {
        if (isMounted) setWsConnected(false);
      };

      ws.onclose = () => {
        if (isMounted) {
          setWsConnected(false);
          wsRef.current = null;
        }
      };
    }

    connectWs();

    const interval = setInterval(() => {
      if (isMounted && (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED)) {
        connectWs();
      }
    }, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [fetchConfigs]);

  const getLiveRawValue = useCallback(
    (c: SensorConfig) => {
      const v =
        liveRawValues[c.metric_name] ??
        liveRawValues[`${c.device_name}_${c.metric_name}`];
      if (v === undefined || v === null) return '-';
      if (Array.isArray(v)) {
        const edit = edits[c.id];
        const dt = edit?.decode_type ?? c.decode_type;
        if (dt === 'bcd_hex' && v.length === 2) {
          const hex1 = (v[0] & 0xffff).toString(16).padStart(4, '0').toUpperCase();
          const hex2 = (v[1] & 0xffff).toString(16).padStart(4, '0').toUpperCase();
          const num = parseFloat(`${hex1}.${hex2}`);
          return isNaN(num) ? `${hex1}.${hex2}` : String(num);
        }
        return v[0] !== undefined ? String(v[0]) : JSON.stringify(v);
      }
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v);
    },
    [liveRawValues, edits]
  );

  const getLiveValue = useCallback(
    (c: SensorConfig) => {
      const v =
        liveValues[c.metric_name] ??
        liveValues[`${c.device_name}_${c.metric_name}`];
      if (v === undefined || v === null || typeof v !== 'number') return '-';
      const edit = edits[c.id];
      const dec = edit?.decimal_places ?? c.decimal_places ?? 2;
      const formatted = v.toFixed(dec);
      return formatted;
    },
    [liveValues, edits]
  );

  // Map sensor_id to SensorRegistryItem for fast lookup
  const registryMap = useRef<Record<string, SensorRegistryItem>>({});
  registryMap.current = Object.fromEntries(
    sensorRegistry.map((r) => [`${r.group_name}_${r.metric_name}`, r])
  );

  // ─── Field change ────────────────────────────────────────────────────────────
  const handleChange = useCallback(
    (id: number, field: keyof SensorConfigUpdate, raw: string) => {
      dirtyRef.current[id] = true;
      let value: string | number | null = raw;
      if (field !== 'decode_type' && field !== 'unit') {
        value = raw === '' ? 0 : Number(raw);
      }
      dispatch({ type: 'SET', id, field, value });
    },
    [],
  );

  // ─── Save single row ─────────────────────────────────────────────────────────
  const handleSaveRow = useCallback(
    async (config: SensorConfig) => {
      const edit = edits[config.id];
      if (!edit) return;

      const payload: SensorConfigUpdate = {
        decode_type:    edit.decode_type    ?? config.decode_type,
        raw_min:        edit.raw_min        ?? config.raw_min,
        raw_max:        edit.raw_max        ?? config.raw_max,
        range_min:      edit.range_min      ?? config.range_min,
        range_max:      edit.range_max      ?? config.range_max,
        unit:           edit.unit           !== undefined ? edit.unit : config.unit,
        decimal_places: edit.decimal_places ?? config.decimal_places,
      };

      setSavingIds((s) => new Set(s).add(config.id));
      try {
        await updateSensorConfig(config.id, payload);
        const updatedConfig: SensorConfig = { ...config, ...payload };
        setConfigs((prev) =>
          prev.map((c) => (c.id === config.id ? updatedConfig : c))
        );
        dispatch({ type: 'COMMIT', id: config.id, fresh: updatedConfig });
        dirtyRef.current[config.id] = false;
        swal.Toast({ title: `Saved — ${metricLabel(config.metric_name, registryMap.current[`${config.device_name}_${config.metric_name}`])}`, icon: 'success' });
      } catch (err) {
        parseFetchError({
          error: err,
          onForbidden:  () => swal.error({ title: 'Forbidden', message: 'You do not have permission to edit sensor configs.' }),
          onBadRequest: () => swal.error({ title: 'Invalid data', message: 'Check the values and try again.' }),
          onOtherError: () => swal.error({ title: 'Save failed', message: 'Could not save sensor configuration.' }),
        });
      } finally {
        setSavingIds((s) => { const n = new Set(s); n.delete(config.id); return n; });
      }
    },
    [edits],
  );

  // ─── Save 4-20mA Adjust Modal ─────────────────────────────────────────────
  const handleSaveModalAdjust = useCallback(
    async (payload: SensorConfigUpdate) => {
      if (!adjustModalState) return;
      const { config, metricLabel: label } = adjustModalState;
      try {
        await updateSensorConfig(config.id, payload);
        const updatedConfig: SensorConfig = { ...config, ...payload };
        setConfigs((prev) =>
          prev.map((c) => (c.id === config.id ? updatedConfig : c))
        );
        dispatch({ type: 'COMMIT', id: config.id, fresh: updatedConfig });
        dirtyRef.current[config.id] = false;
        swal.Toast({ title: `Saved calibration — ${label}`, icon: 'success' });
      } catch (err) {
        parseFetchError({
          error: err,
          onForbidden:  () => swal.error({ title: 'Forbidden', message: 'You do not have permission to edit sensor configs.' }),
          onBadRequest: () => swal.error({ title: 'Invalid data', message: 'Check the calibration values and try again.' }),
          onOtherError: () => swal.error({ title: 'Save failed', message: 'Could not save sensor calibration.' }),
        });
        throw err;
      }
    },
    [adjustModalState],
  );

  // ─── Save entire device group ─────────────────────────────────────────────
  const handleSaveGroup = useCallback(
    async (group: DeviceGroup) => {
      const dirty = group.configs.filter((c) => dirtyRef.current[c.id]);
      if (!dirty.length) {
        swal.Toast({ title: 'No changes to save', icon: 'info' });
        return;
      }
      for (const c of dirty) {
        await handleSaveRow(c);
      }
    },
    [handleSaveRow],
  );

  // ─── Group configs by device ──────────────────────────────────────────────
  const groups: DeviceGroup[] = (() => {
    // Build map of device_name -> group metadata
    const groupMetaMap = new Map<string, SensorGroup>();
    sensorGroups.forEach((g) => groupMetaMap.set(g.name, g));

    const map = new Map<string, SensorConfig[]>();
    for (const c of configs) {
      if (!map.has(c.device_name)) map.set(c.device_name, []);
      map.get(c.device_name)!.push(c);
    }

    // Convert map to DeviceGroup array
    const groupList: DeviceGroup[] = [];
    
    // First include groups in sensorGroups order
    sensorGroups.forEach((sg) => {
      if (map.has(sg.name)) {
        groupList.push({
          id: sg.id,
          device_name: sg.name,
          display_name: sg.display_name,
          color: colorForDevice(sg.name, sg.color),
          sort_order: sg.sort_order,
          configs: map.get(sg.name)!,
        });
        map.delete(sg.name);
      }
    });

    // Add remaining unmapped groups
    Array.from(map.entries()).forEach(([device_name, cfgs], idx) => {
      groupList.push({
        device_name,
        display_name: deviceLabel(device_name),
        color: colorForDevice(device_name),
        sort_order: 999 + idx,
        configs: cfgs,
      });
    });

    return groupList;
  })();

  // ─── Group reordering ──────────────────────────────────────────────────────
  const handleMoveGroup = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= groups.length) return;

    const newGroups = [...groups];
    const temp = newGroups[index];
    newGroups[index] = newGroups[targetIndex];
    newGroups[targetIndex] = temp;

    // Prepare reorder items
    const reorderItems = newGroups
      .filter((g) => g.id !== undefined)
      .map((g, idx) => ({ id: g.id!, sort_order: idx + 1 }));

    if (!reorderItems.length) return;

    setReordering(true);
    try {
      await reorderSensorGroups(reorderItems);
      await fetchConfigs(false);
      swal.Toast({ title: 'Group order updated', icon: 'success' });
    } catch (err) {
      swal.error({ title: 'Reorder failed', message: 'Failed to update group order.' });
    } finally {
      setReordering(false);
    }
  };

  // ─── Metric reordering within group ────────────────────────────────────────
  const handleMoveMetric = async (group: DeviceGroup, metricIndex: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? metricIndex - 1 : metricIndex + 1;
    if (targetIndex < 0 || targetIndex >= group.configs.length) return;

    const cfgs = group.configs;
    const currentCfg = cfgs[metricIndex];
    const targetCfg = cfgs[targetIndex];

    const currentReg = registryMap.current[`${group.device_name}_${currentCfg.metric_name}`];
    const targetReg = registryMap.current[`${group.device_name}_${targetCfg.metric_name}`];

    if (!currentReg || !targetReg) {
      swal.error({ title: 'Reorder unavailable', message: 'Sensor registry entries not found for these metrics.' });
      return;
    }

    setReordering(true);
    try {
      await reorderSensors([
        { id: currentReg.id, sort_order: targetReg.sort_order },
        { id: targetReg.id, sort_order: currentReg.sort_order },
      ]);
      await fetchConfigs(false);
      swal.Toast({ title: 'Metric order updated', icon: 'success' });
    } catch (err) {
      swal.error({ title: 'Reorder failed', message: 'Failed to update metric order.' });
    } finally {
      setReordering(false);
    }
  };

  // ─── Table header ──────────────────────────────────────────────────────────
  const HEADERS = [
    { label: 'Order',          align: 'center' },
    { label: 'Metric',         align: 'left'   },
    { label: 'Raw Value',      align: 'center' },
    { label: 'Live Value',     align: 'center' },
    { label: 'Decode Type',    align: 'center' },
    { label: 'Raw Min',        align: 'center' },
    { label: 'Raw Max',        align: 'center' },
    { label: 'Range Min',      align: 'center' },
    { label: 'Range Max',      align: 'center' },
    { label: 'Unit',           align: 'center' },
    { label: 'Decimal Places', align: 'center' },
    { label: 'Adjust 4-20mA',   align: 'center' },
    { label: 'Alarm Config',   align: 'center' },
    { label: '',               align: 'center' },
  ] as const;

  // ─── Render ────────────────────────────────────────────────────────────────
  if (fetching) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400 dark:text-gray-500 text-sm">
        <span className="animate-pulse">Loading sensor configurations…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Realtime WS Indicator Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full border transition-colors ${
              wsConnected
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                : 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                wsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
              }`}
            />
            {wsConnected ? 'WebSocket Live Stream Connected' : 'WebSocket Disconnected'}
          </span>
        </div>
      </div>

      {/* ─── Global Notification Settings ──────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] overflow-hidden transition-all duration-200 shadow-sm">
        <button
          type="button"
          onClick={() => setNotifCollapsed(!notifCollapsed)}
          className="w-full flex items-center justify-between px-5 py-4 md:px-6 bg-gray-50/50 dark:bg-gray-900/30 border-b border-gray-100 dark:border-white/[0.05] hover:bg-gray-100/60 dark:hover:bg-gray-900/50 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </span>
            <div className="text-left">
              <span className="text-sm font-bold text-gray-900 dark:text-white block leading-tight">
                {t('page.settings_devices.notifications.title')}
              </span>
              <span className="text-[11px] text-gray-400">
                {t('page.settings_devices.notifications.subtitle')}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(notifyLine || notifyEmail) && (
              <div className="flex items-center gap-1.5">
                {notifyLine && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    LINE
                  </span>
                )}
                {notifyEmail && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-600 dark:text-blue-400">
                    Email
                  </span>
                )}
              </div>
            )}
            <svg className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${notifCollapsed ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {!notifCollapsed && (
          <div className="p-5 md:p-6 space-y-6 animate-[fadeIn_0.2s_ease-out]">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* LINE Messaging API Section */}
              <div className="space-y-4">
                <div className={`flex items-center gap-3 p-3 rounded-xl border ${
                  notifyLine
                    ? 'bg-emerald-500/5 border-emerald-500/20'
                    : 'bg-gray-50 dark:bg-gray-800/30 border-gray-200 dark:border-gray-700'
                }`}>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={notifyLine}
                      onChange={(e) => setNotifyLine(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-emerald-500 dark:peer-checked:bg-emerald-500"></div>
                  </label>
                  <div>
                    <span className={`text-xs font-bold block ${notifyLine ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-500'}`}>
                      {notifyLine
                        ? t('page.settings_devices.notifications.line_enabled')
                        : t('page.settings_devices.notifications.line_disabled')}
                    </span>
                    <span className="text-[11px] text-gray-400">
                      {notifyLine
                        ? t('page.settings_devices.notifications.line_enabled_desc')
                        : t('page.settings_devices.notifications.line_disabled_desc')}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 block">
                      {t('page.settings_devices.notifications.line_token_label')}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!!notifTesting || splitLineTargets(lineToken).length === 0}
                        onClick={() => handleTestNotification('line')}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50 border border-emerald-300/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        title={t('page.settings_devices.notifications.test_line_title')}
                      >
                        {notifTesting === 'line' ? (
                          <span className="animate-pulse">{t('page.settings_devices.notifications.testing')}</span>
                        ) : (
                          <>
                            <span>{t('page.settings_devices.notifications.test_line_btn', {
                            count: splitLineTargets(lineToken).length,
                          })}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 min-h-[32px]">
                    {splitLineTargets(lineToken).map((token, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 group transition-all hover:bg-emerald-500/20"
                      >
                        <svg className="w-3.5 h-3.5 text-emerald-500 opacity-60 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                        <span className="max-w-[260px] truncate" title={token}>{maskLineTargetLabel(token)}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const arr = splitLineTargets(lineToken);
                            arr.splice(idx, 1);
                            setLineToken(arr.join(','));
                          }}
                          className="ml-0.5 p-0.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-gray-400 hover:text-red-500 transition-all"
                          title={t('page.settings_devices.notifications.delete_token_title')}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] gap-2">
                    <input
                      type="password"
                      value={lineChannelAccessToken}
                      placeholder={t('page.settings_devices.notifications.line_channel_access_token_placeholder')}
                      className="w-full text-xs font-mono rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 placeholder:text-gray-400"
                      onChange={(e) => setLineChannelAccessToken(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddLineTarget();
                        }
                      }}
                    />
                    <input
                      type="text"
                      value={lineRecipientId}
                      placeholder={t('page.settings_devices.notifications.line_recipient_id_placeholder')}
                      className="w-full text-xs font-mono rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 placeholder:text-gray-400"
                      onChange={(e) => setLineRecipientId(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddLineTarget();
                        }
                      }}
                    />
                    <button
                      type="button"
                      disabled={!lineChannelAccessToken.trim() || !lineRecipientId.trim()}
                      onClick={handleAddLineTarget}
                      className="inline-flex items-center justify-center px-4 py-2.5 text-xs font-semibold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {t('page.settings_devices.notifications.line_add_target_btn')}
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400">{t('page.settings_devices.notifications.line_hint')}</p>
                </div>
              </div>

              {/* Email Section */}
              <div className="space-y-4">
                <div className={`flex items-center gap-3 p-3 rounded-xl border ${
                  notifyEmail
                    ? 'bg-blue-500/5 border-blue-500/20'
                    : 'bg-gray-50 dark:bg-gray-800/30 border-gray-200 dark:border-gray-700'
                }`}>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={notifyEmail}
                      onChange={(e) => setNotifyEmail(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-500 dark:peer-checked:bg-blue-500"></div>
                  </label>
                  <div>
                    <span className={`text-xs font-bold block ${notifyEmail ? 'text-blue-700 dark:text-blue-300' : 'text-gray-500'}`}>
                      {notifyEmail
                        ? t('page.settings_devices.notifications.email_enabled')
                        : t('page.settings_devices.notifications.email_disabled')}
                    </span>
                    <span className="text-[11px] text-gray-400">
                      {notifyEmail
                        ? t('page.settings_devices.notifications.email_enabled_desc')
                        : t('page.settings_devices.notifications.email_disabled_desc')}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 block">
                      {t('page.settings_devices.notifications.email_recipients_label')}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!!notifTesting || emailRecipients.split(/[,;\s]+/).filter(Boolean).length === 0}
                        onClick={() => handleTestNotification('email')}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50 border border-blue-300/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        title={t('page.settings_devices.notifications.test_email_title')}
                      >
                        {notifTesting === 'email' ? (
                          <span className="animate-pulse">{t('page.settings_devices.notifications.testing')}</span>
                        ) : (
                          <>
                            <span>{t('page.settings_devices.notifications.test_email_btn', {
                            count: emailRecipients.split(/[,;\s]+/).filter(Boolean).length,
                          })}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 min-h-[32px]">
                    {emailRecipients.split(/[,;\s]+/).filter(Boolean).map((email, idx) => {
                      const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
                      return (
                        <span
                          key={idx}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-mono border group transition-all hover:shadow-sm ${
                            isValid
                              ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20 hover:bg-blue-500/20'
                              : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30 hover:bg-red-500/20'
                          }`}
                        >
                          <svg className={`w-3.5 h-3.5 opacity-60 shrink-0 ${isValid ? 'text-blue-500' : 'text-red-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                          </svg>
                          <span className="max-w-[180px] truncate" title={email}>{email}</span>
                          {!isValid && <span className="text-[9px] text-red-500 font-semibold" title={t('page.settings_devices.notifications.invalid_email')}>⚠</span>}
                          <button
                            type="button"
                            onClick={() => {
                              const arr = emailRecipients.split(/[,;\s]+/).filter(Boolean);
                              arr.splice(idx, 1);
                              setEmailRecipients(arr.join(','));
                            }}
                            className="ml-0.5 p-0.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-gray-400 hover:text-red-500 transition-all"
                            title={t('page.settings_devices.notifications.delete_email_title')}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </span>
                      );
                    })}
                  </div>
                  <input
                    type="text"
                    placeholder={t('page.settings_devices.notifications.email_placeholder')}
                    className="w-full text-xs font-mono rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/40 placeholder:text-gray-400"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        const inputVal = e.currentTarget.value;
                        const emails = inputVal.split(/[,;\s]+/).map((t) => t.trim()).filter(Boolean);
                        if (emails.length > 0) {
                          const existing = emailRecipients.split(/[,;\s]+/).filter(Boolean);
                          const unique = emails.filter((t) => !existing.includes(t));
                          if (unique.length > 0) setEmailRecipients([...existing, ...unique].join(','));
                          e.currentTarget.value = '';
                        }
                      }
                    }}
                    onBlur={(e) => {
                      const inputVal = e.currentTarget.value;
                      const emails = inputVal.split(/[,;\s]+/).map((t) => t.trim()).filter(Boolean);
                      if (emails.length > 0) {
                        const existing = emailRecipients.split(/[,;\s]+/).filter(Boolean);
                        const unique = emails.filter((t) => !existing.includes(t));
                        if (unique.length > 0) setEmailRecipients([...existing, ...unique].join(','));
                        e.currentTarget.value = '';
                      }
                    }}
                    onPaste={(e) => {
                      e.preventDefault();
                      const pasted = e.clipboardData.getData('text');
                      const emails = pasted.split(/[,;\s]+/).map((t) => t.trim()).filter(Boolean);
                      if (emails.length > 0) {
                        const existing = emailRecipients.split(/[,;\s]+/).filter(Boolean);
                        const unique = emails.filter((t) => !existing.includes(t));
                        if (unique.length > 0) setEmailRecipients([...existing, ...unique].join(','));
                        e.currentTarget.value = '';
                      }
                    }}
                  />
                  <p className="text-[10px] text-gray-400">{t('page.settings_devices.notifications.email_hint')}</p>
                </div>
              </div>
            </div>

            {/* Footer Buttons: Test & Save */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 dark:border-gray-800 pt-4">
              <button
                type="button"
                disabled={!!notifTesting || (!lineToken.trim() && !emailRecipients.trim())}
                onClick={() => handleTestNotification('all')}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-amber-700 bg-amber-500/10 hover:bg-amber-500/20 dark:text-amber-300 border border-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                title={t('page.settings_devices.notifications.test_all_title')}
              >
                {notifTesting === 'all' ? (
                  <span className="animate-pulse">{t('page.settings_devices.notifications.test_all_running')}</span>
                ) : (
                  <>
                    <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                    <span>{t('page.settings_devices.notifications.test_all_btn')}</span>
                  </>
                )}
              </button>

              <Button
                variant={{ light: 'primary', dark: 'primary' }}
                onClick={handleSaveNotifSettings}
                disabled={notifSaving || !!notifTesting}
                className="text-xs min-w-[160px]"
              >
                {notifSaving ? t('page.settings_devices.notifications.saving') : t('page.settings_devices.notifications.save_btn')}
              </Button>
            </div>
          </div>
        )}
      </div>

      {groups.map((group, groupIdx) => (
        <div
          key={group.device_name}
          className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] overflow-hidden transition-all duration-200 shadow-sm hover:shadow-md"
        >
          {/* Card header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-4 md:px-6 bg-gray-50/50 dark:bg-gray-900/30 border-b border-gray-100 dark:border-white/[0.05]">
            <div className="flex items-center gap-3">
              {/* Group Up/Down Controls */}
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  disabled={groupIdx === 0 || reordering}
                  onClick={() => handleMoveGroup(groupIdx, 'up')}
                  className="p-1 rounded text-gray-400 hover:text-primary hover:bg-gray-200 dark:hover:bg-gray-800 disabled:opacity-30 disabled:hover:text-gray-400 disabled:hover:bg-transparent transition-colors"
                  title="Move Group Up"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                <button
                  type="button"
                  disabled={groupIdx === groups.length - 1 || reordering}
                  onClick={() => handleMoveGroup(groupIdx, 'down')}
                  className="p-1 rounded text-gray-400 hover:text-primary hover:bg-gray-200 dark:hover:bg-gray-800 disabled:opacity-30 disabled:hover:text-gray-400 disabled:hover:bg-transparent transition-colors"
                  title="Move Group Down"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              <SectionHeader
                title={group.display_name}
                subtitle={`${group.configs.length} metric${group.configs.length !== 1 ? 's' : ''}`}
                accent={group.color}
                className="!mb-0"
              />
            </div>

            <Button
              variant={{ light: 'success', dark: 'success-soft-outline' }}
              className="min-w-[90px]"
              onClick={() => handleSaveGroup(group)}
            >
              Save All
            </Button>
          </div>

          {/* Table */}
          <div className="max-w-full overflow-x-auto custom-scrollbar">
            <Table className="min-w-[1100px]">
              <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                <TableRow>
                  {HEADERS.map((h, i) => (
                    <TableCell
                      key={i}
                      isHeader
                      className={`px-4 py-3 bg-gray-500/10 dark:bg-gray-800/80 font-medium text-gray-500 text-theme-sm dark:text-white/70 text-${h.align}`}
                    >
                      {h.label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHeader>

              <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                {group.configs.map((config, metricIdx) => {
                  const edit = edits[config.id] ?? buildEdit(config);
                  const saving = savingIds.has(config.id);
                  const currentDecodeType = edit.decode_type ?? config.decode_type;
                  const isAnalog = currentDecodeType === 'analog_4_20ma';
                  const regItem = registryMap.current[`${config.device_name}_${config.metric_name}`];

                  return (
                    <TableRow
                      key={config.id}
                      className="hover:bg-primary/5 dark:hover:bg-gray-800/60 transition-colors"
                    >
                      {/* Metric Up/Down buttons */}
                      <TableCell className="px-2 py-2 text-center w-12">
                        <div className="flex items-center justify-center gap-0.5">
                          <button
                            type="button"
                            disabled={metricIdx === 0 || reordering}
                            onClick={() => handleMoveMetric(group, metricIdx, 'up')}
                            className="p-1 rounded text-gray-400 hover:text-primary hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-20 disabled:hover:text-gray-400 disabled:hover:bg-transparent transition-colors"
                            title="Move Metric Up"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            disabled={metricIdx === group.configs.length - 1 || reordering}
                            onClick={() => handleMoveMetric(group, metricIdx, 'down')}
                            className="p-1 rounded text-gray-400 hover:text-primary hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-20 disabled:hover:text-gray-400 disabled:hover:bg-transparent transition-colors"
                            title="Move Metric Down"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        </div>
                      </TableCell>

                      {/* Metric name */}
                      <TableCell className="px-4 py-2 text-start">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                          {metricLabel(config.metric_name, regItem)}
                        </span>
                        <br />
                        <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                          {config.metric_name}
                        </span>
                      </TableCell>

                      {/* Live Raw Value */}
                      <TableCell className="px-4 py-2 text-center">
                        <span className="text-xs font-mono px-2 py-1 rounded bg-amber-500/10 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 font-semibold border border-amber-500/20 inline-block min-w-[60px]">
                          {getLiveRawValue(config)}
                        </span>
                      </TableCell>

                      {/* Live Processed Value */}
                      <TableCell className="px-4 py-2 text-center">
                        <span className="text-xs font-mono px-2 py-1 rounded bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold border border-emerald-500/20 inline-block min-w-[70px]">
                          {getLiveValue(config)}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-2 text-center">
                        <select
                          value={currentDecodeType}
                          disabled={saving}
                          onChange={(e) => handleChange(config.id, 'decode_type', e.target.value)}
                          className="
                            text-xs font-mono rounded-lg border border-gray-200 dark:border-gray-700
                            bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200
                            px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40
                            disabled:opacity-50 cursor-pointer
                          "
                        >
                          {DECODE_TYPES.map((dt) => (
                            <option key={dt} value={dt}>{dt}</option>
                          ))}
                        </select>
                      </TableCell>

                      {/* Raw Min */}
                      <TableCell className="px-4 py-2 text-center">
                        {isAnalog ? (
                          <Input
                            type="number"
                            value={String(edit.raw_min ?? config.raw_min)}
                            disabled={saving}
                            onChange={(e) => handleChange(config.id, 'raw_min', e.target.value)}
                            className="text-center min-w-[70px] max-w-[90px] !text-amber-600 dark:!text-amber-400 text-xs"
                          />
                        ) : (
                          <span className="text-xs text-gray-400 font-mono">-</span>
                        )}
                      </TableCell>

                      {/* Raw Max */}
                      <TableCell className="px-4 py-2 text-center">
                        {isAnalog ? (
                          <Input
                            type="number"
                            value={String(edit.raw_max ?? config.raw_max)}
                            disabled={saving}
                            onChange={(e) => handleChange(config.id, 'raw_max', e.target.value)}
                            className="text-center min-w-[70px] max-w-[90px] !text-amber-600 dark:!text-amber-400 text-xs"
                          />
                        ) : (
                          <span className="text-xs text-gray-400 font-mono">-</span>
                        )}
                      </TableCell>

                      {/* Range Min */}
                      <TableCell className="px-4 py-2 text-center">
                        {isAnalog ? (
                          <Input
                            type="number"
                            value={String(edit.range_min ?? config.range_min)}
                            disabled={saving}
                            onChange={(e) => handleChange(config.id, 'range_min', e.target.value)}
                            className="text-center min-w-[70px] max-w-[90px] !text-sky-600 dark:!text-sky-400 text-xs"
                          />
                        ) : (
                          <span className="text-xs text-gray-400 font-mono">-</span>
                        )}
                      </TableCell>

                      {/* Range Max */}
                      <TableCell className="px-4 py-2 text-center">
                        {isAnalog ? (
                          <Input
                            type="number"
                            value={String(edit.range_max ?? config.range_max)}
                            disabled={saving}
                            onChange={(e) => handleChange(config.id, 'range_max', e.target.value)}
                            className="text-center min-w-[70px] max-w-[90px] !text-sky-600 dark:!text-sky-400 text-xs"
                          />
                        ) : (
                          <span className="text-xs text-gray-400 font-mono">-</span>
                        )}
                      </TableCell>

                      {/* Unit */}
                      <TableCell className="px-4 py-2 text-center">
                        <Input
                          type="text"
                          value={edit.unit ?? config.unit ?? ''}
                          disabled={saving}
                          onChange={(e) =>
                            handleChange(config.id, 'unit', e.target.value)
                          }
                          className="text-center min-w-[70px] max-w-[70px] text-xs"
                        />
                      </TableCell>

                      {/* Decimal Places */}
                      <TableCell className="px-4 py-2 text-center">
                        <Input
                          type="number"
                          value={String(edit.decimal_places ?? config.decimal_places)}
                          disabled={saving}
                          min="0"
                          max="6"
                          onChange={(e) => handleChange(config.id, 'decimal_places', e.target.value)}
                          className="text-center max-w-[60px] text-xs"
                        />
                      </TableCell>

                      {/* Adjust 4-20mA Button */}
                      <TableCell className="px-3 py-2 text-center">
                        {isAnalog ? (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() =>
                              setAdjustModalState({
                                config,
                                metricLabel: metricLabel(config.metric_name, regItem),
                                groupName: group.display_name,
                              })
                            }
                            className="
                              inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg
                              bg-amber-500/10 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300
                              hover:bg-amber-500/20 dark:hover:bg-amber-500/30 border border-amber-500/30
                              transition-all cursor-pointer disabled:opacity-50
                            "
                            title="Open Analog 4-20mA Calibration & Adjust Menu"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                              />
                            </svg>
                            Adjust
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400 font-mono">-</span>
                        )}
                      </TableCell>

                      {/* Alarm Config Button */}
                      <TableCell className="px-3 py-2 text-center">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() =>
                            setAlarmModalState({
                              config,
                              metricLabel: metricLabel(config.metric_name, regItem),
                              groupName: group.display_name,
                            })
                          }
                          className="
                            inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg
                            bg-rose-500/10 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300
                            hover:bg-rose-500/20 dark:hover:bg-rose-500/30 border border-rose-500/30
                            transition-all cursor-pointer disabled:opacity-50
                          "
                          title="Open Sensor Alarm Rule Configuration (alert_rules table)"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                            />
                          </svg>
                          Alarm
                        </button>
                      </TableCell>

                      {/* Save row button */}
                      <TableCell className="px-4 py-2 text-center">
                        <Button
                          size="sm"
                          variant={{ light: 'primary-soft', dark: 'primary-soft-outline' }}
                          disabled={saving}
                          onClick={() => handleSaveRow(config)}
                          className="min-w-[70px] text-xs"
                        >
                          {saving ? (
                            <span className="flex items-center gap-1">
                              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                              </svg>
                              Saving
                            </span>
                          ) : (
                            'Save'
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      ))}

      {/* Adjust 4-20mA Modal */}
      <Analog420mAAdjustModal
        isOpen={!!adjustModalState}
        onClose={() => setAdjustModalState(null)}
        config={adjustModalState?.config ?? null}
        metricLabel={adjustModalState?.metricLabel ?? ''}
        groupName={adjustModalState?.groupName ?? ''}
        onSave={handleSaveModalAdjust}
      />

      {/* Sensor Alarm Rule Modal */}
      <SensorAlarmModal
        isOpen={!!alarmModalState}
        onClose={() => setAlarmModalState(null)}
        config={alarmModalState?.config ?? null}
        metricLabel={alarmModalState?.metricLabel ?? ''}
        groupName={alarmModalState?.groupName ?? ''}
        onSaveSuccess={fetchConfigs}
      />
    </div>
  );
}
