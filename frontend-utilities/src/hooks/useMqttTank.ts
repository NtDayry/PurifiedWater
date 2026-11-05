import { useEffect, useState } from 'react';
import mqtt from 'mqtt';
import type { ConnStatus, LevelPoint, TankData } from '@/types/waterSupply.types';

const MAX_HISTORY = 120;

export interface MqttOptions {
  username?: string;
  password?: string;
  clientId?: string;
}

export function parseTankData(raw: any): TankData {
  return {
    water_level: {
      level_cm: Number(raw.water_level?.level_cm ?? raw.level_cm ?? raw.level ?? 0),
      volumn: Number(raw.water_level?.volumn ?? raw.volumn ?? raw.volume ?? 0),
      flow_rate: Number(raw.water_level?.flow_rate ?? raw.flow_rate ?? 0),
      tank_capacity_cm: Number(raw.water_level?.tank_capacity_cm ?? raw.tank_capacity_cm ?? 160),
    },
    controls: {
      valve_on: Boolean(raw.controls?.valve_on ?? raw.valve_on ?? raw.valve),
      pump1_on: Boolean(raw.controls?.pump1_on ?? raw.pump1_on ?? raw.pump1),
      pump2_on: Boolean(raw.controls?.pump2_on ?? raw.pump2_on ?? raw.pump2),
      pump1_overload: Boolean(
        raw.controls?.pump1_overload ??
        raw.pump1_overload ??
        raw.controls?.overload_pump1 ??
        raw.overload_pump1 ??
        raw.controls?.pump1_ol ??
        raw.pump1_ol ??
        raw.controls?.ol_pump1 ??
        raw.ol_pump1 ??
        raw.controls?.pump1_trip ??
        raw.pump1_trip ??
        false
      ),
      pump2_overload: Boolean(
        raw.controls?.pump2_overload ??
        raw.pump2_overload ??
        raw.controls?.overload_pump2 ??
        raw.overload_pump2 ??
        raw.controls?.pump2_ol ??
        raw.pump2_ol ??
        raw.controls?.ol_pump2 ??
        raw.ol_pump2 ??
        raw.controls?.pump2_trip ??
        raw.pump2_trip ??
        false
      ),
      alarm_on: Boolean(raw.controls?.alarm_on ?? raw.alarm_on ?? raw.alarm),
      auto_mode: Boolean(raw.controls?.auto_mode ?? raw.auto_mode ?? true),
      auto_pump1: Boolean(raw.controls?.auto_pump1 ?? raw.auto_pump1 ?? false),
      auto_pump2: Boolean(raw.controls?.auto_pump2 ?? raw.auto_pump2 ?? false),
      manual_pump1: Boolean(raw.controls?.manual_pump1 ?? raw.manual_pump1 ?? false),
      manual_pump2: Boolean(raw.controls?.manual_pump2 ?? raw.manual_pump2 ?? false),
      manual_valve: Boolean(raw.controls?.manual_valve ?? raw.manual_valve ?? false),
      pressure_switch: Boolean(raw.controls?.pressure_switch ?? raw.pressure_switch ?? false),
    },
    local_io: raw.local_io || { di0: false, di1: false, do0: false, do1: false },
    rs485_io: raw.rs485_io || { status_ok: true, input: {}, output: {} },
    system: {
      wifi_rssi: Number(raw.system?.wifi_rssi ?? raw.wifi_rssi ?? -60),
      ip: String(raw.system?.ip ?? raw.ip ?? '192.168.12.77'),
      sensor_comm_ok: Boolean(raw.system?.sensor_comm_ok ?? raw.sensor_comm_ok ?? true),
      uptime_sec: Number(raw.system?.uptime_sec ?? raw.uptime_sec ?? 0),
    },
  };
}

export function useMqttTank(url: string, topic: string, options?: MqttOptions) {
  const [data, setData] = useState<TankData | null>(null);
  const [status, setStatus] = useState<ConnStatus>('connecting');
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [history, setHistory] = useState<LevelPoint[]>([]);

  useEffect(() => {
    let client: mqtt.MqttClient | null = null;
    let isConnectedViaBridge = false;

    // 1. ตรวจสอบและดักฟังผ่าน Vite Dev Server Bridge (สำหรับ Raw TCP MQTT)
    if (import.meta.hot) {
      const handleBridgeData = (raw: any) => {
        try {
          isConnectedViaBridge = true;
          const parsed = parseTankData(raw);

          const now = Date.now();
          setData(parsed);
          setStatus('connected');
          setLastUpdate(now);
          setHistory((h) => [...h, { t: now, cm: parsed.water_level.level_cm }].slice(-MAX_HISTORY));
        } catch (e) {
          console.warn('[MQTT Bridge] Parse error:', e);
        }
      };

      import.meta.hot.on('water-system-data', handleBridgeData);

      // ส่งสัญญาณขอข้อมูลล่าสุดถ้ามี
      import.meta.hot.send('water-system-request', {});
    }

    // 2. พยายามเชื่อมต่อผ่าน WebSocket over MQTT ตรงไปยัง URL ที่กำหนด (ถ้า URL เป็น ws:// หรือ wss://)
    if (url && (url.startsWith('ws://') || url.startsWith('wss://'))) {
      try {
        const clientId = options?.clientId || `water_client_${Math.random().toString(16).substring(2, 10)}`;

        client = mqtt.connect(url, {
          reconnectPeriod: 5000,
          username: options?.username,
          password: options?.password,
          clientId,
          clean: true,
          connectTimeout: 5000,
        });

        client.on('connect', () => {
          console.log(`[MQTT Web] Connected directly to ${url}`);
          setStatus('connected');
          client?.subscribe(topic);
        });

        client.on('message', (_t, payload) => {
          try {
            const raw = JSON.parse(payload.toString());
            const parsed = parseTankData(raw);
            const now = Date.now();
            setData(parsed);
            setStatus('connected');
            setLastUpdate(now);
            if (parsed.water_level.level_cm !== undefined) {
              setHistory((h) => [...h, { t: now, cm: parsed.water_level.level_cm }].slice(-MAX_HISTORY));
            }
          } catch (e) {
            console.warn('[MQTT Web] Payload error:', e);
          }
        });

        client.on('error', (err) => {
          // ถ้ามี Vite bridge รับข้อมูลอยู่แล้ว ไม่ต้องแสดงเป็น offline
          if (!isConnectedViaBridge) {
            console.warn('[MQTT Web] WebSocket connect error (using fallback/bridge):', err.message);
          }
        });
      } catch (err) {
        console.warn('[MQTT Web] Client error:', err);
      }
    }

    return () => {
      if (client) {
        client.end(true);
      }
    };
  }, [url, topic, options?.username, options?.password, options?.clientId]);

  return { data, setData, status, lastUpdate, history, setHistory };
}
