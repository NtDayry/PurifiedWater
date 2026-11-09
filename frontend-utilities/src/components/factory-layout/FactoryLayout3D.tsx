import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Gauge, Pause, RotateCw } from 'lucide-react';
import { API_URL } from '@/api/connection/apiURL';
// ข้อมูลอาคารโหลดทันที (ไฟล์เล็ก ไม่มี three.js) ส่วนฉาก 3 มิติโหลดแยกภายหลังเมื่อหน้าเว็บแสดงผลเสร็จ
import { BUILDINGS, N, OBJECTS, ROOMS } from '@/lib/factoryBuildings';
import type { FactorySceneApi } from '@/lib/factoryScene3d';

type ViewKey = 'ov' | 'top' | 'side' | 'gate';
const VIEWS: ViewKey[] = ['ov', 'top', 'side', 'gate'];

const btnOff =
  'bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-700';
const btnOn =
  'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-400 dark:border-emerald-700';

// เวลาของที่ตั้งโรงงาน (Asia/Bangkok) เป็นชั่วโมงทศนิยม จากนาฬิกาที่ปรับเทียบกับเซิร์ฟเวอร์แล้ว
const SITE_TZ = 'Asia/Bangkok';
function siteHours(offsetMs: number) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SITE_TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(Date.now() + offsetMs));
  const g = (k: string) => Number(parts.find((p) => p.type === k)?.value ?? 0);
  return g('hour') + g('minute') / 60 + g('second') / 3600;
}
// อ่านเวลาเซิร์ฟเวอร์จาก HTTP header "Date" (ไม่ต้องมี endpoint เพิ่ม) แล้วคืนค่าความต่างกับนาฬิกาเครื่อง (ms)
// ใช้ fetch ตรง (ไม่ผ่าน axios interceptor) เพื่อไม่ให้สถานะ 401 พาไปหน้า login
async function fetchServerOffset(): Promise<number> {
  const t0 = Date.now();
  const res = await fetch(`${API_URL.BASE_URL}${API_URL.USERS_ME}`, { method: 'HEAD', credentials: 'include', cache: 'no-store' });
  const t1 = Date.now();
  const d = res.headers.get('date');
  const server = d ? Date.parse(d) : NaN;
  if (Number.isNaN(server)) throw new Error('no Date header');
  return server + 500 - (t0 + t1) / 2; // header ละเอียดระดับวินาที → +0.5 วินาที
}

// ===== ค่ามิเตอร์ (MOCKUP) — แทนที่ด้วยข้อมูลจริงได้ที่ useMeterValues() =====
type MeterValue = { value: number; unit: string; updatedAt?: string; alarm?: boolean };   // alarm = แจ้งเตือนจากระบบจริง (ถ้ามี)
// key: water = มิเตอร์น้ำประปา, power = มิเตอร์ไฟฟ้า, tr1..tr5 = หม้อแปลงไฟฟ้า 1–5 (เรียงจากประตูหน้าเข้าไปด้านใน)
// tank14 = บ่อเก็บน้ำอาคาร 1,4 (ลานจอดรถ), b5tank = ถังเก็บน้ำดาดฟ้าอาคาร 5, pump = บ่อน้ำประปาโรงงาน, pool = บ่อน้ำโรงอาหาร → ระดับน้ำ (%)
// b5chiller = Chiller ดาดฟ้าอาคาร 5, chiller = Chiller ลานโหลดโกดัง, cda = ห้อง CDA → มิเตอร์ไฟ (kWh)
// pwtank = ระดับน้ำในถังห้องระบบน้ำ Purified (%), pwvel = ความเร็วการไหล (Fluid velocity, m/s)
type MeterKey = 'water' | 'power' | 'tr1' | 'tr2' | 'tr3' | 'tr4' | 'tr5' | 'tank14' | 'b5tank' | 'pump' | 'pool' | 'b5chiller' | 'chiller' | 'cda' | 'pwtank' | 'pwvel';
type MeterValues = Record<MeterKey, MeterValue>;
const METER_MOCK: MeterValues = {
  water: { value: 12845.6, unit: 'm³' },
  power: { value: 98432, unit: 'kWh' },
  tr1: { value: 412530, unit: 'kWh' },
  tr2: { value: 287640, unit: 'kWh' },
  tr3: { value: 356210, unit: 'kWh' },
  tr4: { value: 198870, unit: 'kWh' },
  tr5: { value: 243905, unit: 'kWh' },
  tank14: { value: 78.5, unit: '%' },
  pool: { value: 71.3, unit: '%' },
  b5tank: { value: 64.2, unit: '%' },
  pump: { value: 82.0, unit: '%' },
  b5chiller: { value: 154320, unit: 'kWh' },
  chiller: { value: 87650, unit: 'kWh' },
  cda: { value: 63210, unit: 'kWh' },
  pwtank: { value: 68.4, unit: '%' },
  pwvel: { value: 1.85, unit: 'm/s' },
};
// เกณฑ์แจ้งเตือน (alarm) — ค่าหลุดช่วงนี้ หรือข้อมูลส่ง alarm: true มา → ไอคอน/ป้ายเป็นสีแดงกะพริบ
const ALARM_RULES: Partial<Record<MeterKey, { min?: number; max?: number }>> = {
  tank14: { min: 20, max: 98 },
  pool: { min: 20, max: 98 },
  b5tank: { min: 20, max: 98 },
  pump: { min: 20, max: 98 },
  pwtank: { min: 20, max: 95 },
  pwvel: { min: 0.5, max: 2.5 },
};
const isAlarm = (k: MeterKey, m: MeterValue) => {
  const r = ALARM_RULES[k];
  return !!m.alarm || (!!r && ((r.min !== undefined && m.value < r.min) || (r.max !== undefined && m.value > r.max)));
};
// id วัตถุที่คลิกได้ -> key ของค่ามิเตอร์ (ใช้แสดงตัวเลขในกล่องมุมขวาบน)
const METER_OF: Record<string, MeterKey[]> = {
  o_wmeter: ['water'],
  o_emeter: ['power'],
  o_tr1: ['tr1'],
  o_tr2: ['tr2'],
  o_tr3: ['tr3'],
  o_tr4: ['tr4'],
  o_tr5: ['tr5'],
  o_tank14: ['tank14'],
  o_pool: ['pool'],
  o_b5tank: ['b5tank'],
  o_pump: ['pump'],
  o_b5chiller: ['b5chiller'],
  o_chiller: ['chiller'],
  r_cda: ['cda'],
  r_pw: ['pwtank', 'pwvel'],
};
const pushMeters = (scene: FactorySceneApi, mv: MeterValues) =>
  (Object.keys(mv) as MeterKey[]).forEach((k) => {
    scene.setMeter(k, mv[k].value, mv[k].unit);
    scene.setAlarm(k, isAlarm(k, mv[k]));
  });
// จำลอง alarm แบบสุ่มเพื่อดูการแสดงผล — ตั้งเป็น false เมื่อต่อข้อมูลจริง (alarm จะมาจากข้อมูลจริง/เกณฑ์ ALARM_RULES เท่านั้น)
const SIMULATE_ALARMS = true;
function useMeterValues(): MeterValues {
  // TODO: ดึงข้อมูลจริง (เช่น API/MQTT) แล้ว setValues(...) — ตอนนี้ใช้ค่าจำลองที่ขยับเล็กน้อยทุก 5 วินาทีเพื่อดูการแสดงผล
  const [values, setValues] = useState<MeterValues>(METER_MOCK);
  const alarmUntil = useRef<Partial<Record<MeterKey, number>>>({});
  useEffect(() => {
    const id = setInterval(() => {
      // จำลอง alarm แบบสุ่ม (ปิดได้ที่ SIMULATE_ALARMS): ทุกรอบมีโอกาสเกิด alarm ใหม่ที่จุดสุ่ม 1 จุด ค้างอยู่ 10–25 วินาที, พร้อมกันไม่เกิน 2 จุด
      const now = Date.now();
      const au = alarmUntil.current;
      (Object.keys(au) as MeterKey[]).forEach((k) => { if ((au[k] ?? 0) <= now) delete au[k]; });
      if (SIMULATE_ALARMS && Object.keys(au).length < 2 && Math.random() < 0.3) {
        const free = (Object.keys(METER_MOCK) as MeterKey[]).filter((k) => !au[k]);
        const k = free[Math.floor(Math.random() * free.length)];
        if (k) au[k] = now + 10000 + Math.random() * 15000;
      }
      const simAlarm = { ...au };
      setValues((v) => {
        const n = { ...v };
        (Object.keys(n) as MeterKey[]).forEach((k) => {
          const u = n[k].unit;
          const value =
            u === '%' ? +Math.min(100, Math.max(0, n[k].value + (Math.random() - 0.5))).toFixed(1) // ระดับน้ำขึ้น-ลงเล็กน้อย
            : u === 'm/s' ? +Math.max(0, n[k].value + (Math.random() - 0.5) * 0.06).toFixed(2) // ความเร็วการไหลแกว่งเล็กน้อย
            : k === 'water' ? +(n[k].value + Math.random() * 0.3).toFixed(1)
            : Math.round(n[k].value + Math.random() * 4);
          n[k] = { ...n[k], value, alarm: !!simAlarm[k] };
        });
        return n;
      });
    }, 5000);
    return () => clearInterval(id);
  }, []);
  return values;
}

function formatTime(h: number) {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60) % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export default function FactoryLayout3D() {
  const { t, i18n } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<FactorySceneApi | null>(null);

  const [selected, setSelected] = useState('fac');
  // ค่าเริ่มต้นเมื่อเปิดหน้า: หมุนอัตโนมัติ + ซ่อนป้ายชื่อ
  const [auto, setAuto] = useState(true);
  const [icons, setIcons] = useState(true); // แสดงไอคอน + ตัวเลขมิเตอร์
  const [time, setTime] = useState(() => siteHours(0));
  // live = เวลาเดินตามเวลาเซิร์ฟเวอร์อัตโนมัติ; เมื่อผู้ใช้เลื่อนเองจะหยุดตาม จนกดปุ่ม "เวลาปัจจุบัน"
  const [live, setLive] = useState(true);
  const offsetRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const meters = useMeterValues();
  const [loadError, setLoadError] = useState(false);
  const [loadErrorMsg, setLoadErrorMsg] = useState(''); // ข้อความ error จริง (ช่วยหาสาเหตุ)

  const liveRef = useRef(live);
  liveRef.current = live;
  const syncNow = () => {
    const h = siteHours(offsetRef.current);
    setTime(h);
    sceneRef.current?.setTime(h);
  };
  useEffect(() => {
    let alive = true;
    fetchServerOffset()
      .then((off) => {
        if (alive) offsetRef.current = off;
      })
      .catch(() => {
        /* อ่านเวลาเซิร์ฟเวอร์ไม่ได้ → ใช้นาฬิกาเครื่อง */
      })
      .finally(() => {
        if (alive && liveRef.current) syncNow();
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!live) return;
    syncNow();
    const id = setInterval(syncNow, 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  // โหลดโมเดลหลังหน้าเว็บแสดงผลเสร็จ: รอให้เบราว์เซอร์วาดหน้าก่อน (2 เฟรม + ช่วงว่าง) แล้วค่อย import โค้ดฉาก 3 มิติแบบแยกไฟล์
  // ค่าที่ผู้ใช้ปรับระหว่างรอ (ป้าย/โซลาร์/หมุน/เวลา) จะถูกส่งเข้าโมเดลตอนสร้างเสร็จ
  const meterRef = useRef(meters);
  meterRef.current = meters;
  useEffect(() => {
    if (sceneRef.current) pushMeters(sceneRef.current, meters);
  }, [meters]);
  const stateRef = useRef({ auto, time, selected, icons });
  stateRef.current = { auto, time, selected, icons };
  useEffect(() => {
    let cancelled = false;
    let scene: FactorySceneApi | null = null;
    let idleId: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const start = () => {
          import('@/lib/factoryScene3d')
            .then(({ createFactoryScene }) => {
              if (cancelled || !hostRef.current) return;
              const st = stateRef.current;
              scene = createFactoryScene(hostRef.current, {
                onSelect: setSelected,
                onAutoRotateChange: setAuto, // คลิก object / หมุน-ซูมกล้องเอง → ปุ่มหมุนอัตโนมัติเปลี่ยนเป็นปิด
                initialId: st.selected,
                initialTime: st.time,
                initialLabels: false,
                initialAutoRotate: st.auto,
              });
              sceneRef.current = scene;
              setLoading(false);
              pushMeters(scene, meterRef.current);
              if (!st.icons) scene.setIcons(false);
            })
            .catch((err) => {
              console.error('[FactoryLayout3D] load failed', err);
              if (!cancelled) {
                setLoadError(true);
                setLoadErrorMsg(err instanceof Error ? err.message : String(err));
              }
            });
        };
        const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void, o?: { timeout: number }) => number);
        if (ric) idleId = ric(start, { timeout: 300 });
        else timer = setTimeout(start, 0);
      }),
    );
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (idleId !== undefined) (window as any).cancelIdleCallback?.(idleId);
      if (timer) clearTimeout(timer);
      scene?.dispose();
      sceneRef.current = null;
    };
  }, []);

  const isTh = i18n.language?.startsWith('th');
  const room = ROOMS.find((x) => x.id === selected);
  const obj = OBJECTS.find((x) => x.id === selected);
  const b = BUILDINGS.find((x) => x.id === (room ? room.parent : obj ? obj.parent : selected)) ?? BUILDINGS[1];
  const nameOf = (x: (typeof BUILDINGS)[number]) => (isTh ? x.name : x.en);

  const [view, setViewKey] = useState<ViewKey | ''>('');
  const selectCls =
    'h-9 rounded-lg border border-gray-300 bg-white pl-3 pr-8 text-sm font-medium text-gray-800 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200';
  const iconBtn = (on: boolean) =>
    `inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-xs font-semibold shadow-sm transition active:scale-95 ${on ? btnOn : btnOff}`;

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      {/* แถบควบคุม: อาคาร + มุมกล้อง (dropdown) | ป้าย/โซลาร์/หมุน | เวลา */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <select
          aria-label={t('factory_layout3d.building')}
          className={selectCls}
          value={room ? room.parent : selected}
          onChange={(e) => sceneRef.current?.select(e.target.value)}
        >
          <optgroup label={t('factory_layout3d.group_buildings')}>
            {BUILDINGS.map((x) => (
              <option key={x.id} value={x.id}>
                {nameOf(x)}
              </option>
            ))}
          </optgroup>
          <optgroup label={t('factory_layout3d.group_objects')}>
            {OBJECTS.map((x) => (
              <option key={x.id} value={x.id}>
                {isTh ? x.name : x.en}
              </option>
            ))}
          </optgroup>
        </select>
        <select
          aria-label={t('factory_layout3d.camera')}
          className={selectCls}
          value={view}
          onChange={(e) => {
            const v = e.target.value as ViewKey;
            if (!v) return;
            setViewKey(v);
            // เลือกมุมมองแล้วหยุดการหมุนอัตโนมัติ เพื่อให้ภาพค้างที่มุมนั้น
            sceneRef.current?.setAutoRotate(false);
            setAuto(false);
            sceneRef.current?.setView(v);
          }}
        >
          <option value="" disabled>
            {t('factory_layout3d.camera')}
          </option>
          {VIEWS.map((v) => (
            <option key={v} value={v}>
              {t(`factory_layout3d.view_${v}`)}
            </option>
          ))}
        </select>

        <div className="mx-1 hidden h-6 w-px bg-gray-200 sm:block dark:bg-slate-700" />
        <button
          type="button"
          className={iconBtn(auto)}
          title={t('factory_layout3d.auto_rotate')}
          onClick={() => {
            sceneRef.current?.setAutoRotate(!auto);
            setAuto(!auto);
          }}
        >
          {auto ? <Pause className="h-3.5 w-3.5" /> : <RotateCw className="h-3.5 w-3.5" />}
          <span className="hidden md:inline">{t('factory_layout3d.auto_rotate')}</span>
        </button>
        <button
          type="button"
          className={iconBtn(icons)}
          title={t('factory_layout3d.icons')}
          aria-pressed={icons}
          onClick={() => {
            sceneRef.current?.setIcons(!icons);
            setIcons(!icons);
          }}
        >
          <Gauge className="h-3.5 w-3.5" />
          <span className="hidden md:inline">{t('factory_layout3d.icons')}</span>
        </button>

        <div className="ml-auto flex min-w-[220px] flex-1 items-center gap-2 sm:max-w-sm">
          <input
            id="factory-time"
            aria-label={t('factory_layout3d.time')}
            type="range"
            min={0}
            max={24}
            step={0.05}
            value={time}
            onChange={(e) => {
              const v = Number(e.target.value);
              setLive(false);
              setTime(v);
              sceneRef.current?.setTime(v);
            }}
            className="w-full accent-emerald-600"
          />
          <span className="w-11 text-sm font-semibold tabular-nums text-gray-800 dark:text-slate-200">
            {formatTime(time)}
          </span>
          <button
            type="button"
            className={iconBtn(live)}
            onClick={() => setLive(true)}
            title={t('factory_layout3d.time_live_hint')}
          >
            <Clock className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">{t('factory_layout3d.time_live')}</span>
          </button>
        </div>
      </div>

      {/* พื้นที่ 3 มิติ (เต็มความสูงจอ) */}
      <div
        className="relative w-full bg-slate-100 dark:bg-slate-950"
        style={{ height: 'calc(100vh - 190px)', minHeight: 480 }}
      >
        <div ref={hostRef} className="absolute inset-0" style={{ cursor: 'grab' }} />
        {/* ข้อมูลอาคารที่เลือก (ย่อ) */}
        <div className="pointer-events-none absolute right-3 top-3 rounded-xl bg-black/45 px-3 py-2 text-white backdrop-blur-sm">
          {room || obj ? (
            <>
              <div className="text-sm font-bold leading-tight">{isTh ? (room ?? obj)!.name : (room ?? obj)!.en}</div>
              {(room || obj?.parent) && <div className="text-[11px] opacity-85">{nameOf(b)}</div>}
              {obj?.note && <div className="mt-1 max-w-[280px] text-[11px] leading-snug opacity-90">{isTh ? obj.note : obj.noteEn ?? obj.note}</div>}
              {(METER_OF[selected] ?? []).map((k) => {
                const m = meters[k];
                const al = isAlarm(k, m);
                return (
                  <div key={k} className={`mt-1 font-mono text-lg font-bold tabular-nums ${al ? 'animate-pulse rounded bg-red-600 px-1.5' : ''}`}>
                    {m.value.toLocaleString('en-US', m.unit === '%' ? { minimumFractionDigits: 1, maximumFractionDigits: 1 } : { maximumFractionDigits: 2 })} <span className="text-xs font-normal opacity-80">{m.unit}</span>
                    {al && <span className="ml-1.5 text-[11px] font-semibold">ALARM</span>}
                  </div>
                );
              })}
            </>
          ) : (
            <>
              <div className="text-sm font-bold leading-tight">{nameOf(b)}</div>
              <div className="text-[11px] opacity-85 tabular-nums">
                {b.w} × {b.l} {t('factory_layout3d.unit_m')} · {t('factory_layout3d.kpi_height_short')} {b.h} {t('factory_layout3d.unit_m')} ·{' '}
                {N(b.gfa)} {t('factory_layout3d.unit_sqm')}
              </div>
            </>
          )}
        </div>
        <span className="pointer-events-none absolute bottom-2 left-24 rounded-full bg-black/45 px-2.5 py-0.5 text-[11px] text-white">
          {t('factory_layout3d.hint')}
        </span>
        {(loading || loadError) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-100/90 dark:bg-slate-950/90">
            {loadError ? (
              <span className="flex flex-col items-center gap-1 text-center text-sm text-red-600 dark:text-red-400">
                {t('factory_layout3d.load_error')}
                {loadErrorMsg && <code className="max-w-md break-all text-xs opacity-80">{loadErrorMsg}</code>}
              </span>
            ) : (
              <>
                <span className="h-9 w-9 animate-spin rounded-full border-4 border-emerald-500/30 border-t-emerald-600" />
                <span className="text-sm text-gray-600 dark:text-slate-300">{t('factory_layout3d.loading')}</span>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
