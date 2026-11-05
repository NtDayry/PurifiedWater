import Chart from 'react-apexcharts';
import { ReactNode } from 'react';
import { ApexOptions } from 'apexcharts';

interface SeriesProps {
  name: string;
  data: number[];
}

interface AreaChartProps {
  id: string;
  categories: string[];
  series: SeriesProps[];
  label: ReactNode;
  height?: number;
  options?: ApexOptions;

  // =========================
  // Sensor Limits
  // =========================
  min?: number | string | null;
  max?: number | string | null;
  avg?: number | string | null;

  warningMin?: number | string | null;
  warningMax?: number | string | null;

  // =========================
  // Display
  // =========================
  showLimitLabel?: boolean;
}

export default function AreaChart({
  id,
  categories,
  series,
  label,
  options,
  height = 350,

  min,
  max,
  avg,
  warningMin,
  warningMax,

  showLimitLabel = true,
}: AreaChartProps) {
  // ============================================================
  // Normalize Number
  // ============================================================
  console.log('AreaChart ', {
    id,
    categories,
    series,
    min,
    max,
    avg,
    warningMin,
    warningMax,
  });

  const toNumber = (value: number | string | null | undefined): number | undefined => {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }

    const num = Number(value);

    return Number.isFinite(num) ? num : undefined;
  };

  const minValue = toNumber(min);
  const maxValue = toNumber(max);
  const avgValue = toNumber(avg);

  const warningMinValue = toNumber(warningMin);
  const warningMaxValue = toNumber(warningMax);
  const dataValues = series.flatMap((item) => item.data).filter((value) => Number.isFinite(value));
  const dataMinValue = dataValues.length > 0 ? Math.min(...dataValues) : undefined;
  const dataMaxValue = dataValues.length > 0 ? Math.max(...dataValues) : undefined;

  const getScalePadding = (lower: number, upper: number) => {
    const range = Math.abs(upper - lower);
    const roughPadding = range > 0 ? range * 0.1 : Math.max(Math.abs(upper) * 0.1, 1);
    const magnitude = Math.pow(10, Math.floor(Math.log10(roughPadding)));
    const normalized = roughPadding / magnitude;
    const niceStep = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;

    return niceStep * magnitude;
  };

  const yAxisMin =
    dataMinValue !== undefined && (warningMinValue !== undefined ? dataMinValue < warningMinValue : dataMinValue < 0)
      ? dataMinValue
      : 0;

  const yAxisMaxBase =
    dataMaxValue !== undefined && warningMaxValue !== undefined
      ? Math.max(dataMaxValue, warningMaxValue)
      : dataMaxValue ?? warningMaxValue;

  const yAxisMax = yAxisMaxBase !== undefined ? yAxisMaxBase + getScalePadding(yAxisMin, yAxisMaxBase) : undefined;

  // ============================================================
  // Y-Axis Annotations
  // ============================================================

  const yaxisAnnotations: NonNullable<ApexOptions['annotations']>['yaxis'] = [];

  // ============================================================
  // MIN
  // ============================================================

  if (minValue !== undefined) {
    yaxisAnnotations.push({
      y: minValue,

      borderColor: '#EFA544',
      strokeDashArray: 6,
      borderWidth: 1,

      label: showLimitLabel
        ? {
            text: `MIN ${minValue}`,
            position: 'right',

            style: {
              color: '#EFA544',
              background: 'transparent',
              fontSize: '11px',
              fontWeight: 500,
            },
          }
        : undefined,
    });
  }

  // ============================================================
  // MAX
  // ============================================================

  if (maxValue !== undefined) {
    yaxisAnnotations.push({
      y: maxValue,

      borderColor: '#EF4444',
      strokeDashArray: 6,
      borderWidth: 1,

      label: showLimitLabel
        ? {
            text: `MAX ${maxValue}`,
            position: 'right',

            style: {
              color: '#EF4444',
              background: 'transparent',
              fontSize: '11px',
              fontWeight: 500,
            },
          }
        : undefined,
    });
  }

  // ============================================================
  // WARNING MIN
  // ============================================================

  if (warningMinValue !== undefined) {
    yaxisAnnotations.push({
      y: warningMinValue,

      borderColor: '#F59E0B',
      strokeDashArray: 4,
      borderWidth: 1,

      label: showLimitLabel
        ? {
            text: `WARNING LOW ${warningMinValue}`,
            position: 'right',

            style: {
              color: '#F59E0B',
              background: 'transparent',
              fontSize: '10px',
              fontWeight: 500,
            },
          }
        : undefined,
    });
  }

  // ============================================================
  // WARNING MAX
  // ============================================================

  if (warningMaxValue !== undefined) {
    yaxisAnnotations.push({
      y: warningMaxValue,

      borderColor: '#EF4444',
      strokeDashArray: 4,
      borderWidth: 1,

      label: showLimitLabel
        ? {
            text: `WARNING HIGH ${warningMaxValue}`,
            position: 'right',

            style: {
              color: '#EF4444',
              background: 'transparent',
              fontSize: '10px',
              fontWeight: 500,
            },
          }
        : undefined,
    });
  }

  // ============================================================
  // AVG
  // ============================================================

  if (avgValue !== undefined) {
    yaxisAnnotations.push({
      y: avgValue,

      borderColor: '#3B82F6',
      strokeDashArray: 5,
      borderWidth: 1,

      label: showLimitLabel
        ? {
            text: `AVG ${avgValue.toFixed(2)}`,
            position: 'right',

            style: {
              color: '#3B82F6',
              background: 'transparent',
              fontSize: '10px',
              fontWeight: 600,
            },
          }
        : undefined,
    });
  }

  // ============================================================
  // Chart Options
  // ============================================================

  const _options: ApexOptions = {
    // สำคัญ:
    // options ต้องอยู่ก่อนค่าที่เราต้องการบังคับเอง
    ...options,

    legend: {
      show: true,
      position: 'top',
      horizontalAlign: 'left',

      ...(options?.legend ?? {}),
    },

    chart: {
      id: `${id}_report_chart`,
      fontFamily: 'Outfit, sans-serif',
      height: 310,
      type: 'area',

      toolbar: {
        show: false,
        ...(options?.chart?.toolbar ?? {}),
      },

      zoom: {
        enabled: true,
        ...(options?.chart?.zoom ?? {}),
      },

      redrawOnParentResize: true,
      redrawOnWindowResize: true,

      animations: {
        enabled: true,
        ...(options?.chart?.animations ?? {}),
      },

      ...(options?.chart ?? {}),
    },

    stroke: {
      curve: 'smooth',

      width: series.length > 0 ? series.map(() => 1.5) : 1.5,

      ...(options?.stroke ?? {}),
    },

    fill: {
      type: 'gradient',

      gradient: {
        opacityFrom: 0.65,
        opacityTo: 0,

        ...(options?.fill && 'gradient' in options.fill && options.fill.gradient ? options.fill.gradient : {}),
      },

      ...(options?.fill ?? {}),
    },

    markers: {
      size: 0,

      strokeColors: '#fff',
      strokeWidth: 2,

      hover: {
        size: 6,
      },

      ...(options?.markers ?? {}),
    },

    grid: {
      xaxis: {
        lines: {
          show: true,
        },
      },

      yaxis: {
        lines: {
          show: true,
        },
      },

      ...(options?.grid ?? {}),
    },

    dataLabels: {
      enabled: false,

      ...(options?.dataLabels ?? {}),
    },

    tooltip: {
      enabled: true,
      shared: false,

      x: {
        format: 'dd/MM/yy HH:mm',
      },

      ...(options?.tooltip ?? {}),
    },

    xaxis: {
      type: 'datetime',

      categories,

      labels: {
        datetimeUTC: false,
        format: 'd/M HH:mm',

        style: {
          fontSize: '12px',
          colors: '#93969e',
        },
      },

      axisBorder: {
        show: true,
      },

      axisTicks: {
        show: false,
      },

      tooltip: {
        enabled: false,
      },

      ...(options?.xaxis ?? {}),
    },

    yaxis: {
      ...(options?.yaxis ?? {}),

      min: yAxisMin,
      max: yAxisMax,

      labels: {
        ...(Array.isArray(options?.yaxis) ? {} : options?.yaxis?.labels ?? {}),

        style: {
          fontSize: '12px',
          colors: '#7f838b',

          ...(Array.isArray(options?.yaxis) ? {} : options?.yaxis?.labels?.style ?? {}),
        },

        formatter: (value: number) => {
          return value.toFixed(2);
        },
      },

      title: {
        ...(Array.isArray(options?.yaxis) ? {} : options?.yaxis?.title ?? {}),

        text: '',
        style: {
          fontSize: '0px',

          ...(Array.isArray(options?.yaxis) ? {} : options?.yaxis?.title?.style ?? {}),
        },
      },
    },

    // ==========================================================
    // IMPORTANT
    //
    // Put annotations AFTER ...options
    // so AVG/MIN/MAX cannot be overwritten
    // ==========================================================

    annotations: {
      yaxis: yaxisAnnotations,

      ...(options?.annotations ?? {}),
    },
  };

  // // ============================================================
  // // Debug
  // // ============================================================

  // console.log(`[${id}] Chart Limits`, {
  //   min: minValue,
  //   max: maxValue,
  //   avg: avgValue,
  //   warningMin: warningMinValue,
  //   warningMax: warningMaxValue,
  //   annotations: yaxisAnnotations,
  // });

  // ============================================================
  // Render
  // ============================================================

  return (
    <div className="max-w-full overflow-hidden">
      {label}

      <div id={`${id}_container`} className="min-w-[180px]">
        <Chart options={_options} series={series} type="area" height={height} />
      </div>
    </div>
  );
}
