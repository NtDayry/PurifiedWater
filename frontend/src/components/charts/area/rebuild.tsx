import Chart from 'react-apexcharts';
import ApexCharts from 'apexcharts';
import { useEffect, useMemo, useRef } from 'react';
import { ApexOptions } from 'apexcharts';

interface Props {
  id: string;
  group?: string;
  categories: string[];
  series: { name: string; data: number[] }[];
  height?: number;
  options?: ApexOptions;
  label: React.ReactNode;
}

export default function AreaChart({ id, group, categories, series, options, height = 220, label }: Props) {
  const chartId = `${id}_chart`;
  const mountedRef = useRef(false);

  // ✅ options ต้อง stable
  const chartOptions: ApexOptions = useMemo(() => {
    const _options: ApexOptions = {
      chart: {
        id: chartId,
        group: group,
        type: 'area',
        height,
        toolbar: { show: false },
        zoom: { enabled: true },
        animations: { enabled: true }, // 🔥 สำคัญ
      },
      stroke: { curve: 'smooth', width: 1 },
      fill: {
        type: 'gradient',
        gradient: { opacityFrom: 0.6, opacityTo: 0 },
      },
      dataLabels: {
        enabled: false, // Disable data labels
      },
      tooltip: {
        enabled: true, // Enable tooltip
        shared: true,
        x: {
          format: 'dd/MM/yy HH:mm',
        },
      },
      xaxis: {
        type: 'datetime',
        categories,
        labels: {
          datetimeUTC: false,
          format: 'd/M HH:mm',
        },
        axisBorder: {
          show: true, // Hide x-axis border
        },
        axisTicks: {
          show: false, // Hide x-axis ticks
        },
        tooltip: {
          enabled: false, // Disable tooltip for x-axis points
        },
      },
      yaxis: {
        labels: {
          style: {
            fontSize: '12px', // Adjust font size for y-axis labels
            colors: ['#6B7280'], // Color of the labels
          },
          formatter: function (val: number) {
            return val.toFixed(2);
          },
        },
        title: {
          text: '', // Remove y-axis title
          style: {
            fontSize: '0px',
          },
        },
      },
    };

    if (options) {
      const { colors, ...rest } = options;
      Object.assign(_options, rest);
    }

    return _options;
  }, [chartId, group, height, categories, options]);

  // ✅ update data ด้วย exec (ไม่ remount)
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }

    // ✅ update data
    ApexCharts.exec(chartId, 'updateSeries', series, true);

    // ✅ update สี + categories
    ApexCharts.exec(chartId, 'updateOptions', {
      colors: options?.colors,
      xaxis: { categories },
    });
  }, [series, categories, chartId]);

  return (
    <div className="max-w-full overflow-hiden">
      {label}
      <div className="min-w-[180px]">
        <Chart options={chartOptions} series={series} type="area" height={height} />
      </div>
    </div>
  );
}
