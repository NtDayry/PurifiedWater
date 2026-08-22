import Chart from "react-apexcharts";
import { ApexOptions } from "apexcharts";

interface PieChartProps {
  series: number[]
  unit?: string
  options?: ApexOptions
}

export default function PieChart({ series, unit = "", options }: PieChartProps) {
  const _options: ApexOptions = {
    chart: {
      fontFamily: "Outfit, sans-serif",
      toolbar: {
        show: false,
      },
    },
    fill: {
      type: 'gradient',
    },
    stroke: {
      show: false,
      width: 4,
      colors: ["transparent"],
    },
    legend: {
      position: 'bottom',
      show: true,
      horizontalAlign: "center",
    },
    dataLabels: {
      enabled: false,
    },
    yaxis: {
      title: {
        text: undefined,
      },
    },
    tooltip: {
      enabled: false,
      y: {
        formatter: (val: number) => `${val}`,
      },
    },
    plotOptions: {
      pie: {
        donut: {
          size: '65',
          labels: {
            show: true,
            name: {
              show: true,
              formatter: (name: string) => name.toUpperCase(),
            },
            value: {
              show: true,
              formatter: (val: string) => `${parseInt(val)}${" "}${unit}`,
            },
            total: {
              show: true,
              label: 'Total',
              color: '#547bfa',
              formatter: (w) => {
                const total = w.globals.seriesTotals.reduce(
                  (a: number, b: number) => a + b,
                  0
                )

                return `${parseInt(total)}${" "}${unit}`
              },
            },
          },
        },
      },
    },
    ...options
  };


  return (
    <div className="max-w-full overflow-hidden custom-scrollbar">
      <div id="pieChart" className="py-5 pb-1">
        <Chart options={_options} series={series} type="donut" height={350} />
      </div>
    </div>
  );
}
