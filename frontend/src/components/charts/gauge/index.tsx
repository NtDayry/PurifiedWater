
interface GaugeProps {
  value: number;
  decimal?: number;
  label: string;
  unit?: string;
  min?: number;
  max?: number;
  color?: string;
  size?: number;
  loading?: boolean;
}

export default function Gradient({
  value,
  decimal = 1,
  label,
  unit = 'mJ/cm²',
  min = 0,
  max = 100,
  color = '#f43f5e',
  size = 180,
  loading = false,
}: GaugeProps) {
  const numericVal = typeof value === 'number' && !isNaN(value) ? value : 0;
  const clampedPct = Math.min(Math.max((numericVal - min) / (max - min || 1), 0), 1);

  // Gauge geometry: 270 degree arc (from -135deg to +135deg)
  const strokeWidth = Math.max(14, Math.round(size * 0.078));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.75; // 270 degrees out of 360
  const dashOffset = arcLength * (1 - clampedPct);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-2 w-full select-none animate-pulse">
        <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="transform -rotate-225 overflow-visible"
          >
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="currentColor"
              className="text-gray-200 dark:text-gray-800/80"
              strokeWidth={strokeWidth}
              strokeDasharray={`${arcLength} ${circumference}`}
              strokeDashoffset={0}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pt-2 gap-2">
            <div className="w-16 h-7 bg-gray-200 dark:bg-gray-700/70 rounded" />
            <div className="w-10 h-3 bg-gray-200 dark:bg-gray-700/70 rounded" />
          </div>
        </div>
        {label && (
          <div className="h-3 w-14 bg-gray-200 dark:bg-gray-700/60 rounded -mt-2" />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-2 w-full select-none">
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="transform -rotate-225 overflow-visible"
        >
          <defs>
            <linearGradient id="uvGaugeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#916bfa" />
              <stop offset="100%" stopColor="#562ec5" />
            </linearGradient>
            <filter id="gaugeGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="5" dy="5" stdDeviation="10" floodColor={color} floodOpacity="0.5" />
            </filter>
          </defs>

          {/* Background Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            className="text-gray-200 dark:text-gray-800"
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={0}
            strokeLinecap="round"
          />

          {/* Active Gradient Arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="url(#uvGaugeGradient)"
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            filter="url(#gaugeGlow)"
            style={{
              transition: 'stroke-dashoffset 0.5s ease-out',
            }}
          />
        </svg>

        {/* Center Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
          <span
            className="text-3xl font-extrabold tracking-tight text-gray-800 dark:text-white font-mono"
            style={{ color: color, fontSize: Math.round(size * 0.17), lineHeight: 1 }}
          >
            {numericVal.toFixed(decimal)}
          </span>
          {unit && (
            <span className="font-semibold text-gray-500 dark:text-gray-400 mt-0.5" style={{ fontSize: Math.round(size * 0.067) }}>
              {unit}
            </span>
          )}
        </div>
      </div>

      {label && (
        <span className="font-medium text-gray-400 dark:text-gray-500 -mt-2" style={{ fontSize: Math.round(size * 0.067) }}>
          {label}
        </span>
      )}
    </div>
  );
}
