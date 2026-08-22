import clsx from "clsx";

// ─── MetricCard ────────────────────────────────────────────────────────────
interface MetricCardProps {
  label: string;
  value: number;
  decimals?: number;
  unit: string;
  icon?: string;
  className?: string;
  small?: boolean;
  hmi?: boolean;
  loading?: boolean;
}

export const MetricCard = ({ label, value, decimals = 2, unit, icon, small = false, hmi = false, className, loading = false }: MetricCardProps) => {
  const valueSize = hmi ? (small ? 36 : 46) : small ? 26 : 30;
  const labelSize = hmi ? 16 : 12;
  const unitSize = hmi ? 17 : 12;
  const cardPadding = hmi ? (small ? '12px 14px' : '16px 18px') : small ? '10px 12px' : '12px 16px';

  if (loading) {
    return (
      <div className="text-gray-500 dark:text-gray-300" style={{ borderRadius: 10, padding: cardPadding, display: 'flex', flexDirection: 'column', gap: 6, position: 'relative', overflow: 'hidden' }}>
        <div className="flex items-center gap-1.5">
          <div className={clsx("bg-gray-200 dark:bg-gray-700/70 rounded animate-pulse", hmi ? "h-5 w-28" : "h-3 w-16")} />
        </div>
        <div className="flex items-baseline gap-2 mt-0.5">
          <div className={clsx("bg-gray-200 dark:bg-gray-700/70 rounded animate-pulse", hmi ? "h-12 w-32" : small ? "h-6 w-16" : "h-8 w-24")} />
          <div className={clsx("bg-gray-200 dark:bg-gray-700/70 rounded animate-pulse", hmi ? "h-5 w-12" : "h-3 w-6")} />
        </div>
      </div>
    );
  }

  return (
    <div className="text-gray-500 dark:text-gray-300" style={{ borderRadius: 10, padding: cardPadding, display: 'flex', flexDirection: 'column', gap: hmi ? 8 : 4, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, transparent)` }} />
      <div style={{ fontSize: labelSize, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
        {icon && <span style={{ marginRight: 4 }}>{icon}</span>}{label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: hmi ? 8 : 4 }}>
        <span className={className} style={{ fontSize: valueSize, fontWeight: 800, fontFamily: "'DM Mono',monospace", lineHeight: 1 }}>{value.toFixed(decimals)}</span>
        <span style={{ fontSize: unitSize, fontWeight: 700 }}>{unit}</span>
      </div>
    </div>
  );
};

// ─── SectionHeader ────────────────────────────────────────────────────────
export const SectionHeader = ({ title, subtitle, accent = '#00d4ff', className, hmi = false }: { title: string; subtitle?: string; accent?: string; className?: string; hmi?: boolean }) => (
  <div className={clsx("mb-4", className)}>
    <div className="flex items-end pb-2 gap-2 dark:text-gray-300">
      <div style={{ width: hmi ? 6 : 3, height: hmi ? 32 : 18, background: accent, borderRadius: 2 }} />
      <h2 className="leading-none" style={{ margin: 0, fontSize: hmi ? 26 : 16, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{title}</h2>
      {subtitle && <span className="text-gray-600 dark:text-gray-400" style={{ fontSize: hmi ? 16 : 12, marginLeft: 2, fontWeight: hmi ? 700 : 400 }}>{subtitle}</span>}
    </div>
  </div>
);

// ─── StatusBadge ──────────────────────────────────────────────────────────
const BADGE_MAP: Record<string, { c: string; l: string }> = {
  normal:      { c: '#0ec952', l: 'NORMAL'      },
  ok:          { c: '#0ec952', l: 'OK'          },
  high:        { c: '#ef4444', l: 'HIGH'        },
  warning:     { c: '#f59e0b', l: 'WARNING'     },
  under_range: { c: '#f59e0b', l: 'UNDER RANGE' },
  over_range:  { c: '#ef4444', l: 'OVER RANGE'  },
  no_signal:   { c: '#64748b', l: 'NO SIGNAL'   },
  inactive:    { c: '#475569', l: 'INACTIVE'    },
};

export const StatusBadge = ({ status, loading = false, hmi = false }: { status: string; loading?: boolean; hmi?: boolean }) => {
  if (loading) {
    return (
      <div className={clsx("inline-flex items-center rounded-full bg-gray-200/80 dark:bg-gray-700/60 animate-pulse border border-transparent", hmi ? "h-8 w-28" : "h-5 w-16")} />
    );
  }
  const s = BADGE_MAP[status] ?? BADGE_MAP.normal;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: hmi ? 8 : 5, padding: hmi ? '5px 12px' : '2px 8px', borderRadius: 20, background: s.c + '18', border: `1px solid ${s.c}44` }}>
      <div style={{ width: hmi ? 11 : 8, height: hmi ? 11 : 8, borderRadius: '50%', background: s.c, boxShadow: `0 0 6px ${s.c}`, animation: 'pulse 2s infinite' }} />
      <span style={{ fontSize: hmi ? 15 : 12, fontWeight: 800, color: s.c, letterSpacing: '0.1em' }}>{s.l}</span>
    </div>
  );
};

// ─── GaugeRing ────────────────────────────────────────────────────────────
interface GaugeRingProps {
  value: number;
  min: number;
  max: number;
  unit: string;
  label: string;
  color?: string;
  size?: number;
}

export const GaugeRing = ({ value, min, max, unit, label, color = '#00d4ff', size = 80 }: GaugeRingProps) => {
  const pct = Math.min(Math.max((value - min) / (max - min), 0), 1);
  const r = size / 2 - 8;
  const circ = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1">
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-135deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={5} strokeDasharray={circ * 0.75} strokeDashoffset={0} strokeLinecap="round" />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={5}
            strokeDasharray={circ * 0.75} strokeDashoffset={circ * 0.75 * (1 - pct)}
            strokeLinecap="round" style={{ filter: `drop-shadow(0 0 4px ${color})`, transition: 'stroke-dashoffset 0.6s ease' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ paddingTop: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color, fontFamily: "'DM Mono',monospace" }}>{value}</span>
          <span style={{ fontSize: 9, color: '#475569' }}>{unit}</span>
        </div>
      </div>
      <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, letterSpacing: '0.05em' }}>{label}</span>
    </div>
  );
};

// ─── Card ─────────────────────────────────────────────────────────────────
export const Card = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 16, padding: 20, backdropFilter: 'blur(12px)', ...style }}>
    {children}
  </div>
);
