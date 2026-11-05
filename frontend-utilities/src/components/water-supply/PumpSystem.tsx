import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DisplayUnit, TankCalculations, TankConfig, TankData } from '@/types/waterSupply.types';

// ใส่หน่วยที่ใช้จริง เช่น "m³/h", "m³"
const FLOW_UNIT = 'm³/h';
const VOL_UNIT = 'm³';

interface Props {
  conn?: { text: string; cls: string };
  data: TankData;
  percent: number;
  low: boolean;
  high: boolean;
  tankConfig?: TankConfig;
  displayUnit?: DisplayUnit;
  tankCalculations?: TankCalculations;
}

const wave = (p: number, a: number, n: number) =>
  `M0 0 q ${p / 4} ${-a} ${p / 2} 0` + ` t ${p / 2} 0`.repeat(n * 2 - 1) + ' V400 H0 Z';
const WAVE1 = wave(150, 9, 4);
const WAVE2 = wave(100, 6, 6);

const PIPES = [
  'M20 60 H220 V150',
  'M370 300 H490',
  'M790 300 H850 M850 220 V300 M850 220 H902 M850 300 H902',
  'M958 220 H1010 M958 300 H1010 M1010 220 V300 M1010 260 H1150 M1080 260 V226',
];

const Flow = ({ d, on, w = 5, c = '#67e8f9' }: { d: string; on: boolean; w?: number; c?: string }) => (
  <path className={`fl ${on ? 'on' : ''}`} d={d} stroke={c} strokeWidth={w} fill="none" />
);

const Grad = ({ id, a, b, c }: { id: string; a: string; b: string; c: string }) => (
  <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="-9" x2="0" y2="190">
    <stop offset="0" stopColor={a} />
    <stop offset=".12" stopColor={b} />
    <stop offset="1" stopColor={c} />
  </linearGradient>
);

function Pond({
  x,
  k,
  y,
  pct,
  valueText,
  grad,
  name,
  dimsText,
  isDark,
}: {
  x: number;
  k: number;
  y: number;
  pct: number;
  valueText: string;
  grad: string;
  name: string;
  dimsText?: string;
  isDark: boolean;
}) {
  return (
    <>
      <g clipPath={`url(#clip${k})`}>
        <g transform={`translate(${x + 2} 0)`}>
          <g className="lvl" style={{ transform: `translateY(${y}px)` }}>
            <path className="wv2" d={WAVE2} fill={`url(#${grad})`} opacity={0.55} />
            <path className="wv1" d={WAVE1} fill={`url(#${grad})`} />
            {[30, 90, 150, 210, 260].map((bx, i) => (
              <circle
                key={bx}
                className="bub"
                cx={bx}
                cy={70 + (i % 3) * 25}
                r={2 + (i % 3)}
                style={{ animationDelay: `${(i * 0.7).toFixed(1)}s` }}
              />
            ))}
          </g>
        </g>
      </g>
      <rect x={x + 10} y={152} width={9} height={166} rx={4} fill="#fff" opacity={0.07} />
      <rect x={x} y={140} width={300} height={190} rx={12} fill="none" stroke="url(#frame)" strokeWidth={4} />
      <rect x={x - 8} y={131} width={316} height={12} rx={5} fill="url(#lip)" />
      {[25, 50, 75].map((m) => {
        const ty = 328 - m * 1.86;
        return (
          <g key={m}>
            <line x1={x + 2} x2={x + 14} y1={ty} y2={ty} stroke={isDark ? '#fff' : '#64748b'} opacity={0.4} />
            <text x={x + 18} y={ty + 3} fontSize={10} fill={isDark ? '#e2e8f0' : '#475569'} opacity={0.8}>
              {m}%
            </text>
          </g>
        );
      })}
      <text
        x={x + 150}
        y={232}
        textAnchor="middle"
        fontSize={28}
        fontWeight={700}
        fill="#fff"
        stroke="#0b1220"
        strokeWidth={4}
        paintOrder="stroke"
      >
        {pct.toFixed(1)}%
      </text>
      <text
        x={x + 150}
        y={258}
        textAnchor="middle"
        fontSize={14}
        fontWeight={600}
        fill="#e2e8f0"
        stroke="#0b1220"
        strokeWidth={3}
        paintOrder="stroke"
      >
        {valueText}
      </text>
      <text
        x={x + 150}
        y={352}
        textAnchor="middle"
        fontSize={14}
        fontWeight={600}
        fill={isDark ? '#cbd5e1' : '#334155'}
      >
        {name}
      </text>
      {dimsText && (
        <text
          x={x + 150}
          y={368}
          textAnchor="middle"
          fontSize={11}
          fill={isDark ? '#94a3b8' : '#64748b'}
        >
          {dimsText}
        </text>
      )}
    </>
  );
}

function Pump({
  x,
  y,
  on,
  overload = false,
}: {
  x: number;
  y: number;
  on: boolean;
  overload?: boolean;
}) {
  const pumpClass = overload ? 'pump-overload' : on ? 'spin' : '';
  return (
    <>
      <rect x={x - 36} y={y + 30} width={72} height={9} rx={3} fill="#334155" />
      {/* วงแหวนเตือนและแสงสว่างเมื่อ Overload */}
      {overload && (
        <circle
          cx={x}
          cy={y}
          r={38}
          fill="none"
          stroke="#ef4444"
          strokeWidth={2.5}
          strokeDasharray="6 4"
          className="animate-spin"
          opacity={0.85}
        />
      )}
      <g transform={`translate(${x} ${y})`} className={pumpClass}>
        <circle className="hs" r={30} fill="url(#pg)" strokeWidth={4} />
        <g className="blades">
          {[0, 90, 180, 270].map((a) => (
            <ellipse key={a} cy={-12} rx={6} ry={12} transform={`rotate(${a})`} />
          ))}
        </g>
        <circle r={6} fill={overload ? '#fca5a5' : '#e2e8f0'} />
      </g>
      {/* ป้ายเตือน OVERLOAD บนกราฟฟิกปั๊ม */}
      {overload && (
        <g transform={`translate(${x + 24} ${y - 24})`}>
          <rect x={0} y={0} width={68} height={18} rx={5} fill="#ef4444" className="animate-pulse" />
          <text x={34} y={13} textAnchor="middle" fontSize={9} fontWeight={800} fill="#ffffff" letterSpacing={0.5}>
            OVERLOAD
          </text>
        </g>
      )}
    </>
  );
}

export default function PumpSystem({
  data,
  percent,
  low,
  high,
  conn,
  tankConfig,
  displayUnit,
  tankCalculations,
}: Props) {
  const { t } = useTranslation();
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : true
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const { water_level: wl, controls: c } = data;
  const p1Flow = c.pump1_on && !c.pump1_overload;
  const p2Flow = c.pump2_on && !c.pump2_overload;
  const any = p1Flow || p2Flow;

  const calc1 = tankCalculations?.tank1;
  const calc2 = tankCalculations?.tank2;

  const pct1 = calc1 ? calc1.percent : percent;
  const pct2 = calc2 ? calc2.percent : percent;

  const y1 = 328 - (pct1 / 100) * 186;
  const y2 = 328 - (pct2 / 100) * 186;

  const isLiter = displayUnit === 'liter';
  const val1 = isLiter
    ? `${Math.round(calc1?.volume_l ?? 0).toLocaleString()} L`
    : `${(calc1?.level_cm ?? wl.level_cm).toFixed(1)} cm`;
  const val2 = isLiter
    ? `${Math.round(calc2?.volume_l ?? 0).toLocaleString()} L`
    : `${(calc2?.level_cm ?? wl.level_cm).toFixed(1)} cm`;

  const dims1 = tankConfig?.tank1
    ? `${tankConfig.tank1.width_m} × ${tankConfig.tank1.length_m} × ${tankConfig.tank1.height_m} m`
    : undefined;
  const dims2 = tankConfig?.tank2
    ? `${tankConfig.tank2.width_m} × ${tankConfig.tank2.length_m} × ${tankConfig.tank2.height_m} m (+${tankConfig.tank2_offset_cm}cm)`
    : undefined;

  const grad = low ? 'wgL' : high ? 'wgH' : 'wgN';
  const lbl = (on: boolean) => (on ? '#34d399' : isDark ? '#94a3b8' : '#64748b');

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-800 dark:text-slate-300">
          {t('water_supply.diagram_2d_title')}
        </h2>
        {conn && (
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${conn.cls}`}>
            ● {conn.text}
          </span>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-800 shadow-inner">
        <svg viewBox="0 0 1160 420" className="w-full min-w-[800px]">
          <defs>
            <Grad id="wgN" a="#a5f3fc" b="#38bdf8" c="#075985" />
            <Grad id="wgL" a="#fecaca" b="#ef4444" c="#7f1d1d" />
            <Grad id="wgH" a="#fef08a" b="#fbbf24" c="#92400e" />
            <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
              {isDark ? (
                <>
                  <stop offset="0" stopColor="#1e293b" />
                  <stop offset="1" stopColor="#0b1220" />
                </>
              ) : (
                <>
                  <stop offset="0" stopColor="#f8fafc" />
                  <stop offset="1" stopColor="#e2e8f0" />
                </>
              )}
            </linearGradient>
            <linearGradient id="frame" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={isDark ? '#cbd5e1' : '#94a3b8'} />
              <stop offset="1" stopColor={isDark ? '#334155' : '#475569'} />
            </linearGradient>
            <linearGradient id="lip" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={isDark ? '#cbd5e1' : '#cbd5e1'} />
              <stop offset="1" stopColor={isDark ? '#475569' : '#64748b'} />
            </linearGradient>
            <radialGradient id="pg">
              <stop offset="0" stopColor="#334155" />
              <stop offset="1" stopColor="#0b1220" />
            </radialGradient>
            <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path
                d="M30 0H0V30"
                fill="none"
                stroke={isDark ? '#fff' : '#000'}
                strokeOpacity={isDark ? 0.04 : 0.05}
              />
            </pattern>
            <clipPath id="clip1">
              <rect x={72} y={142} width={296} height={186} rx={10} />
            </clipPath>
            <clipPath id="clip2">
              <rect x={492} y={142} width={296} height={186} rx={10} />
            </clipPath>
          </defs>
          <rect width={1160} height={420} rx={16} fill="url(#bg)" />
          <rect width={1160} height={420} rx={16} fill="url(#grid)" />

          <Pond
            x={70}
            k={1}
            y={y1}
            pct={pct1}
            valueText={val1}
            grad={grad}
            name={t('water_supply.tank_1')}
            dimsText={dims1}
            isDark={isDark}
          />
          <Pond
            x={490}
            k={2}
            y={y2}
            pct={pct2}
            valueText={val2}
            grad={grad}
            name={t('water_supply.tank_2')}
            dimsText={dims2}
            isDark={isDark}
          />

          {['pl1', 'pl2', 'pl3'].map((cls) => (
            <g key={cls} className={cls}>
              {PIPES.map((d) => (
                <path key={d} d={d} />
              ))}
            </g>
          ))}
          <path d="M20 60 H134" stroke="#67e8f9" strokeWidth={5} opacity={0.5} fill="none" />

          {/* วาล์วเปิด -> เติมน้ำบ่อ 1 -> ท่อเชื่อม -> บ่อ 2 -> ปั๊มดูดออก */}
          <Flow d="M166 60 H220 V150" on={c.valve_on} />
          <Flow d={`M220 150 V${Math.max(y1, 156).toFixed(1)}`} on={c.valve_on} w={3} c="#bae6fd" />
          <Flow d="M370 300 H490" on={c.valve_on || any} />
          <Flow d="M790 300 H850" on={any} />
          <Flow d="M850 300 V220 H902" on={p1Flow} />
          <Flow d="M850 300 H902" on={p2Flow} />
          <Flow d="M958 220 H1010 V260 H1150" on={p1Flow} />
          <Flow d="M958 300 H1010 V260 H1150" on={p2Flow} />
          <Flow d="M1080 260 V228" on={any} w={3} />

          <g className={`rip ${c.valve_on ? 'on' : ''}`} transform={`translate(220 ${y1.toFixed(1)})`}>
            <ellipse rx={16} ry={4} />
          </g>

          <Pump x={930} y={220} on={c.pump1_on} overload={Boolean(c.pump1_overload)} />
          <Pump x={930} y={300} on={c.pump2_on} overload={Boolean(c.pump2_overload)} />

          {/* Flow Meter Gauge */}
          <g transform="translate(70 60)">
            <circle r={17} fill="url(#pg)" stroke="#67e8f9" strokeWidth={3} />
            <path d="M-9 4 A10 10 0 1 1 9 4" stroke="#94a3b8" strokeWidth={2} fill="none" />
            <path d="M0 2 L6 -6" stroke="#67e8f9" strokeWidth={2} />
            <circle r={2.5} fill="#e2e8f0" />
          </g>
          <text x={70} y={92} textAnchor="middle" fontSize={11} fill={isDark ? '#94a3b8' : '#64748b'}>
            FM
          </text>

          <g transform="translate(150 60)" className={c.valve_on ? 'vopen' : ''}>
            <path d="M-14 -12 L0 0 L-14 12 Z M14 -12 L0 0 L14 12 Z" fill={c.valve_on ? '#34d399' : '#ef4444'} />
            <path d="M0 0 V-20 M-9 -20 H9" stroke={isDark ? '#e2e8f0' : '#475569'} strokeWidth={3} fill="none" />
          </g>

          {/* อัตราการไหล + ปริมาณสะสมที่เติมลงบ่อ */}
          <rect
            x={250}
            y={14}
            width={255}
            height={78}
            rx={12}
            fill={isDark ? '#0b1220' : '#ffffff'}
            stroke={isDark ? '#334155' : '#cbd5e1'}
            strokeWidth={1.5}
          />
          <line x1={376} x2={376} y1={26} y2={80} stroke={isDark ? '#334155' : '#cbd5e1'} />
          <text x={266} y={36} fontSize={11} fill={isDark ? '#94a3b8' : '#64748b'}>
            {t('water_supply.flow_rate')}
          </text>
          <text
            x={266}
            y={64}
            fontSize={22}
            fontWeight={700}
            fill={wl.flow_rate > 0 ? (isDark ? '#67e8f9' : '#0284c7') : isDark ? '#e2e8f0' : '#0f172a'}
          >
            {wl.flow_rate.toFixed(3)}
            <tspan fontSize={11} fill={isDark ? '#94a3b8' : '#64748b'} dx={4}>
              {FLOW_UNIT}
            </tspan>
          </text>
          <text x={392} y={36} fontSize={11} fill={isDark ? '#94a3b8' : '#64748b'}>
            {t('water_supply.total_volume')}
          </text>
          <text x={392} y={64} fontSize={22} fontWeight={700} fill={isDark ? '#e2e8f0' : '#0f172a'}>
            {wl.volumn.toFixed(3)}
            <tspan fontSize={11} fill={isDark ? '#94a3b8' : '#64748b'} dx={4}>
              {VOL_UNIT}
            </tspan>
          </text>

          {/* Pressure switch ถัดจากปั๊ม */}
          <g transform="translate(1080 202)" className={c.pressure_switch ? 'vopen' : ''}>
            <circle r={24} fill="url(#pg)" stroke={c.pressure_switch ? '#34d399' : '#64748b'} strokeWidth={4} />
            <text y={5} textAnchor="middle" fontSize={14} fontWeight={700} fill={lbl(c.pressure_switch)}>
              {c.pressure_switch ? 'ON' : 'OFF'}
            </text>
          </g>
          <text x={1080} y={166} textAnchor="middle" fontSize={11} fill={isDark ? '#94a3b8' : '#64748b'}>
            {t('water_supply.pressure_switch')}
          </text>

          <g textAnchor="middle" fontSize={13}>
            <text x={150} y={96} fill={lbl(c.valve_on)}>
              {c.valve_on ? t('water_supply.valve_open') : t('water_supply.valve_closed')}
            </text>
            {c.pump1_overload ? (
              <g transform="translate(930 172)">
                <rect x={-64} y={-14} width={128} height={20} rx={6} fill="#ef4444" className="animate-pulse" />
                <text textAnchor="middle" y={1} fontSize={11} fontWeight={800} fill="#ffffff">
                  PUMP 1 · {t('water_supply.pump_overload', 'OVERLOAD')}
                </text>
              </g>
            ) : (
              <text x={930} y={176} fill={lbl(c.pump1_on)}>
                PUMP 1 · {c.pump1_on ? t('water_supply.pump_run') : t('water_supply.pump_stop')}
              </text>
            )}

            {c.pump2_overload ? (
              <g transform="translate(930 354)">
                <rect x={-64} y={-14} width={128} height={20} rx={6} fill="#ef4444" className="animate-pulse" />
                <text textAnchor="middle" y={1} fontSize={11} fontWeight={800} fill="#ffffff">
                  PUMP 2 · {t('water_supply.pump_overload', 'OVERLOAD')}
                </text>
              </g>
            ) : (
              <text x={930} y={358} fill={lbl(c.pump2_on)}>
                PUMP 2 · {c.pump2_on ? t('water_supply.pump_run') : t('water_supply.pump_stop')}
              </text>
            )}
            <text x={430} y={284} fontSize={11} fill={isDark ? '#94a3b8' : '#64748b'}>
              {t('water_supply.connecting_pipe')}
            </text>
          </g>
          <text x={20} y={36} fontSize={13} fill={isDark ? '#94a3b8' : '#64748b'}>
            {t('water_supply.inflow')}
          </text>
          <text x={1150} y={284} textAnchor="end" fontSize={13} fill={isDark ? '#94a3b8' : '#64748b'}>
            {t('water_supply.outflow')}
          </text>
          <text x={20} y={405} fontSize={13} fill={isDark ? '#94a3b8' : '#64748b'}>
            {t('water_supply.mode')}: {c.auto_mode ? t('water_supply.auto') : t('water_supply.manual')}
          </text>
        </svg>
      </div>
    </section>
  );
}
