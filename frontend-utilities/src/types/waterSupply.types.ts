export interface TankData {
  water_level: {
    level_cm: number;
    volumn: number; // ชื่อ key ตามที่ firmware ส่งมา (สะกด volumn)
    flow_rate: number;
    tank_capacity_cm: number;
  };
  controls: {
    valve_on: boolean;
    pump1_on: boolean;
    pump2_on: boolean;
    pump1_overload?: boolean;
    pump2_overload?: boolean;
    alarm_on: boolean;
    auto_mode: boolean;
    auto_pump1: boolean;
    auto_pump2: boolean;
    manual_pump1: boolean;
    manual_pump2: boolean;
    manual_valve: boolean;
    pressure_switch: boolean;
  };
  local_io: { di0: boolean; di1: boolean; do0: boolean; do1: boolean };
  rs485_io: {
    status_ok: boolean;
    input: Record<string, boolean>;
    output: Record<string, boolean>;
  };
  system: {
    wifi_rssi: number;
    ip: string;
    sensor_comm_ok: boolean;
    uptime_sec: number;
  };
}

export type ConnStatus = 'connecting' | 'connected' | 'offline';

export interface LevelPoint {
  t: number;
  cm: number;
}

export type DisplayUnit = 'cm' | 'liter';

export interface TankDimensions {
  width_m: number;
  length_m: number;
  height_m: number;
}

export interface TankConfig {
  tank1: TankDimensions;
  tank2: TankDimensions;
  tank2_offset_cm: number; // บ่อ 2 อยู่ต่ำกว่าบ่อ 1 กี่ ซม.
  sensor_tank: 1 | 2; // เซนเซอร์วัดอยู่ที่บ่อ 1 หรือ บ่อ 2
}

export interface SingleTankCalc {
  level_cm: number;
  height_cm: number;
  volume_l: number;
  capacity_l: number;
  percent: number;
  width_m: number;
  length_m: number;
  height_m: number;
}

export interface TankCalculations {
  tank1: SingleTankCalc;
  tank2: SingleTankCalc;
  total: {
    volume_l: number;
    capacity_l: number;
    percent: number;
  };
}
