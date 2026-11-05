import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { LevelPoint } from '@/types/waterSupply.types';

export function Card({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 ${className}`}>
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-2xl font-bold tabular-nums text-gray-800 dark:text-white/90">
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-gray-500 dark:text-gray-400">{unit}</span>}
      </div>
    </div>
  );
}

export function Badge({
  label,
  on,
  tone = 'green',
}: {
  label: string;
  on: boolean;
  tone?: 'green' | 'red';
}) {
  const onCls = tone === 'red' ? 'bg-error-500 animate-pulse' : 'bg-success-500';
  return (
    <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800">
      <span className="font-medium text-gray-700 dark:text-gray-200">{label}</span>
      <span className="flex items-center gap-2">
        <span className={`text-xs font-semibold ${on ? (tone === 'red' ? 'text-error-600 dark:text-error-400' : 'text-success-600 dark:text-success-400') : 'text-gray-400'}`}>
          {on ? 'ON' : 'OFF'}
        </span>
        <span className={`h-3 w-3 rounded-full transition-colors ${on ? onCls : 'bg-gray-300 dark:bg-gray-600'}`} />
      </span>
    </div>
  );
}

export function TankGauge({
  percent,
  levelCm,
  low,
  high,
}: {
  percent: number;
  levelCm: number;
  low: boolean;
  high: boolean;
}) {
  const fill = low ? 'bg-error-500' : high ? 'bg-warning-500' : 'bg-brand-500';
  return (
    <div className="flex items-center gap-6">
      <div className="relative h-64 w-32 overflow-hidden rounded-xl border-2 border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-950 shadow-inner">
        <div
          className={`absolute bottom-0 w-full transition-all duration-700 ${fill}`}
          style={{ height: `${percent}%` }}
        />
        {[25, 50, 75].map((m) => (
          <div key={m} className="absolute w-full border-t border-dashed border-gray-400/60 dark:border-gray-500/60" style={{ bottom: `${m}%` }}>
            <span className="ml-1 text-[10px] font-semibold text-gray-600 dark:text-gray-400 drop-shadow">{m}%</span>
          </div>
        ))}
      </div>
      <div>
        <div className="text-4xl font-extrabold tabular-nums text-gray-900 dark:text-white">
          {percent.toFixed(1)}
          <span className="text-xl font-normal text-gray-500 dark:text-gray-400">%</span>
        </div>
        <div className="mt-1 text-sm font-medium text-gray-500 dark:text-gray-400 tabular-nums">{levelCm.toFixed(1)} cm</div>
        {low && (
          <div className="mt-2 flex items-center gap-1.5 text-sm font-bold text-error-600 dark:text-error-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>ระดับน้ำต่ำกว่าเกณฑ์</span>
          </div>
        )}
        {high && (
          <div className="mt-2 flex items-center gap-1.5 text-sm font-bold text-warning-600 dark:text-warning-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>ระดับน้ำสูงเกินเกณฑ์</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function Sparkline({ points, max }: { points: LevelPoint[]; max: number }) {
  if (points.length < 2) {
    return <div className="text-sm text-gray-400 py-6 text-center">รอรับข้อมูลประวัติระดับน้ำ...</div>;
  }
  const W = 400;
  const H = 100;
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const d = points
    .map((p, i) => {
      const x = ((p.t - t0) / Math.max(t1 - t0, 1)) * W;
      const y = H - (Math.min(p.cm, max) / max) * H;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full" preserveAspectRatio="none">
      <path d={d} fill="none" stroke="#0284c7" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
