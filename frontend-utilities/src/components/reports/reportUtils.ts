// ==========================
// Store (Real-time)
// ==========================
export const sensorStore = {
  data: {} as any,
  listeners: new Set<() => void>(),
  set(newData: any) {
    this.data = { ...this.data, ...newData };
    this.listeners.forEach((l) => l());
  },
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  },
  getSnapshot(key: string) {
    return this.data[key];
  },
};

// ==========================
// Default Sensor Colors
// ==========================
export const DEFAULT_SENSOR_COLORS: Record<string, string> = {
  water_meter: '#2b4aff',
  flow_rate: '#6366f1',
  ro1_conduct: '#f59e0b',
  ro2_conduct: '#f59e0b',
  edi_conduct: '#f59e0b',
  ro1_temp: '#ef4444',
  ro2_temp: '#ef4444',
  edi_temp: '#ef4444',
  toc: '#8b5cf6',
  dis_loop_conduct: '#f59e0b',
  water_level: '#2b4aff',
  uv3: '#8b5cf6',
  instant_flow_rate: '#2b4aff',
  fluid_velocity: '#6366f1',
};

export const getSensorColor = (sensorKey: string, customColors: Record<string, string>, sensorColorFromApi?: string) => {
  return customColors[sensorKey] || DEFAULT_SENSOR_COLORS[sensorKey] || sensorColorFromApi || '#2b4aff';
};

// ==========================
// Color Picker Presets
// ==========================
export const COLOR_PRESETS = [
  '#2b4aff', // Brand Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#8b5cf6', // Purple
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#f97316', // Orange
  '#14b8a6', // Teal
  '#6366f1', // Indigo
];

// ==========================
// Group Tree Sorting Helper
// ==========================
export const sortGroupTree = (group: any): any => {
  return {
    ...group,
    children: group.children ? [...group.children].map(sortGroupTree).sort((a: any, b: any) => a.group_index - b.group_index) : [],
    sensors: group.sensors ? [...group.sensors].sort((a: any, b: any) => (a.id ?? 0) - (b.id ?? 0)) : [],
  };
};
