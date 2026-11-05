import { SensorDashboardData } from '@_types/sensor';

export const INITIAL_SENSOR_DATA: SensorDashboardData = {
  timestamp: '',
  values: {
    water_meter: 0,
    flow_rate: 0,
    ro1_conduct: 0,
    ro1_temp: 0,
    ro2_conduct: 0,
    ro2_temp: 0,
    edi_conduct: 0,
    edi_temp: 0,
    analog1_input6: 0,
    analog1_input7: 0,
    analog1_input8: 0,
    dis_loop_conduct: 0,
    dis_loop_temp: 0,
    toc: 0,
    toc_temp: 0,
    water_level: 0,
    uv3: 0,
    analog2_input7: 0,
    analog2_input8: 0,
    instant_flow_rate: 0,
    fluid_velocity: 0,
  },
} as const;
