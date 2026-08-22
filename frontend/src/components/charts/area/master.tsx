import Chart from 'react-apexcharts';
import { ReactNode } from 'react';
import { ApexOptions } from 'apexcharts';

interface SeriesProps {
  name: string;
  data: number[];
}

interface AreaChartProps {
  id: string;
  group?: string;
  categories: string[];
  series: SeriesProps[];
  label: ReactNode;
  height?: number;
  options?: ApexOptions;
}

export default function AreaChart({ id, group, categories, series, label, options, height = 350 }: AreaChartProps) {
  const _options: ApexOptions = {
    legend: {
      show: true, // Hide legend
      position: 'top',
      horizontalAlign: 'left',
    },
    // colors: ['#465FFF', '#9CB9FF'], // Define line colors
    chart: {
      id: `${id}_report_chart`,
      fontFamily: 'Outfit, sans-serif',
      height: 310,
      type: 'area', // Set the chart type to 'line'
      toolbar: {
        show: false, // Hide chart toolbar
      },
      zoom: {
        enabled: true,
      },
      group: group,
      redrawOnParentResize: false,
      redrawOnWindowResize: false,
      animations: {
        enabled: true,
      },
    },
    stroke: {
      curve: 'smooth', // Define the line style (straight, smooth, or step)
      width: [1, 1], // Line width for each dataset
    },
    fill: {
      type: 'gradient',
      gradient: {
        opacityFrom: 0.65,
        opacityTo: 0,
      },
    },
    markers: {
      size: 0, // Size of the marker points
      strokeColors: '#fff', // Marker border color
      strokeWidth: 2,
      hover: {
        size: 6, // Marker size on hover
      },
    },
    grid: {
      xaxis: {
        lines: {
          show: true, // Hide grid lines on x-axis
        },
      },
      yaxis: {
        lines: {
          show: true, // Show grid lines on y-axis
        },
      },
    },
    dataLabels: {
      enabled: false, // Disable data labels
    },
    tooltip: {
      enabled: true, // Enable tooltip
      shared: false,
      x: {
        format: 'dd/MM/yy HH:mm',
      },
    },
    xaxis: {
      type: 'datetime', // Category-based x-axis
      categories: categories,
      labels: {
        datetimeUTC: false, // 🔥 สำคัญมาก
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
    ...options,
  };

  return (
    <div className="max-w-full overflow-hiden">
      {label}
      <div id={`${id}_container`} className="min-w-[180px]">
        <Chart options={_options} series={series} type="area" height={height} />
      </div>
    </div>
  );
}
