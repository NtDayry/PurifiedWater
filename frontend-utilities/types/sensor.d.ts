// ==========================
// Websocket event
// ==========================
export type WsEvent = 'data' | 'config_updated' | 'sensor_offline' | 'alarm_triggered';

// ==========================
// Group Key
// ==========================
export type SubGroupKey = 'water_meter' | 'flow_rate' | 'ro1' | 'ro2' | 'edi' | 'uv3' | 'toc' | 'dis_loop_conduct' | 'flow_meter' | 'water_level';

// ==========================
// Sub Group Key
// ==========================
export type GroupKey = 'distribution_loop' | 'pw_tank' | 'ro_system' | 'water_meter';

// ==========================
// Sensor Key
// ==========================
export type SensorKey =
  | 'water_meter'
  | 'flow_rate'
  | 'ro1_conduct'
  | 'ro1_temp'
  | 'ro2_conduct'
  | 'ro2_temp'
  | 'edi_conduct'
  | 'edi_temp'
  | 'analog1_input6'
  | 'analog1_input7'
  | 'analog1_input8'
  | 'dis_loop_conduct'
  | 'dis_loop_temp'
  | 'toc'
  | 'toc_temp'
  | 'water_level'
  | 'uv3'
  | 'analog2_input7'
  | 'analog2_input8'
  | 'instant_flow_rate'
  | 'fluid_velocity';

// ==========================
// Sensor Data
// ==========================
export type SensorsData = Record<SensorKey, number>;

export interface SensorConfigsApiResponse {
  sensor_id: number;
  sensor_name: string;
  unit: string;
  alert: boolean;
  set_min: number;
  set_max: number;
  offset_value: number;
  group_name: string | null;
  sensor_key_name: string;
  decimal_places: number;
  scale: number;
  min_range: number;
  max_range: number;
}

// ==========================
// Sensor Config
// ==========================
export interface SensorConfig {
  id: number;
  sensor_key: SensorKey;
  sensor_name: string;
  unit: string;
  color: string;
  enable: boolean;
  alert: boolean;
  decimal_places: number;
  threshold?: {
    min?: number;
    max?: number;
  };
  calibration?: {
    raw?: { min?: number; max?: number };
    actual?: { min?: number; max?: number };
    fine_offset?: number;
    use_calibration: boolean;
  };

  min_range?: number;
  max_range?: number;

  group_name?: string;
}

// ==========================
// Config Map
// ==========================
export type SensorsConfigMap = Record<SensorKey, SensorConfig>;

// ==========================
// Config Map
// ==========================
export type GroupsConfigMap = Record<GroupKey, SensorsConfigMap>;

export type ReadingStatus = 'OK' | 'UNDER_RANGE' | 'OVER_RANGE' | 'NO_SIGNAL' | 'ERROR';

// ==========================
// WebSocket
// ==========================
export interface SensorWsDataResponse {
  timestamp: string;
  type?: WsEvent;
  data: {
    adjusted: SensorsData;
    raw: SensorsData;
  };
  statuses?: Partial<Record<SensorKey, ReadingStatus>>;
  configs?: GroupsConfigMap;
}

// ==========================
// Dashboard
// ==========================
export interface SensorDashboardData {
  timestamp: string;
  type?: WsEvent;
  values: SensorsData;
  statuses?: Partial<Record<SensorKey, ReadingStatus>>;
}

// ==========================
// Influx
// ==========================
export interface SensorInfluxRow {
  result: string;
  table: number;
  _start: string;
  _stop: string;
  _time: string;
  _measurement: string;
  values: Partial<SensorsData>;
}

// ==========================
// Report
// ==========================
// สถิติเบื้องต้นของ sensor ในช่วงเวลาที่ดึงรายงาน
export interface SensorStatistics {
  min: number | null;
  max: number | null;
  avg?: number | null;
}

// รายละเอียดของ Sensor แต่ละตัวใน Report
export interface ReportSensor {
  id: number;
  key: string; // ตรงกับ sensor_key
  name: string; // ตรงกับ sensor_name
  unit: string;
  color: string | null;
  decimal_places: number;
  values: number[]; // Array ของข้อมูลตามลำดับ timestamps
  statistics: SensorStatistics;
  alert_min?: number | null;
  alert_max?: number | null;
}

// โครงสร้าง Group แบบ Recursive
export interface ReportGroup {
  group_key: string;    // เช่น "distribution_loop" หรือ "distribution_loop.toc"
  group_index: number | null;
  group_name: string | null;
  sub_group_name: string | null;
  sensors: ReportSensor[];
  children: ReportGroup[]; // สำหรับกลุ่มย่อยๆ ลงไป
}

export interface ReportMeta {
  result: string;
  table: number;
  time_range: {
    start: string;
    stop: string;
  };
  timestamps: string[]; // แกน X สำหรับทำกราฟ
  total_count?: number;
  page?: number;
  page_size?: number;
  total_pages?: number;
}

export interface SensorReportResponse {
  status: 'success' | 'error';
  meta: ReportMeta;
  data: ReportGroup[]; // List ของ Root Groups เช่น ro_system, distribution_loop
  message?: string;    // สำหรับกรณี error
}