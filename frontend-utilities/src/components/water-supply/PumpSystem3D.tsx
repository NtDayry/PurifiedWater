import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCw, Pause } from 'lucide-react';
import type { DisplayUnit, TankCalculations, TankConfig, TankData } from '@/types/waterSupply.types';
import { PumpScene3D } from '@/lib/pumpScene3d';

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

export default function PumpSystem3D({
  data,
  percent,
  low,
  high,
  conn,
  tankConfig,
  displayUnit,
  tankCalculations,
}: Props) {
  const { t, i18n } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<PumpScene3D | null>(null);
  const [auto, setAuto] = useState(false);
  const [isDark, setIsDark] = useState(() =>
    typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : true
  );

  // ตรวจจับการสลับ Theme Dark / Light ของระบบ
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const dark = document.documentElement.classList.contains('dark');
      setIsDark(dark);
      sceneRef.current?.setTheme(dark);
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    const scene = new PumpScene3D(canvasRef.current);
    scene.setTheme(isDark);
    scene.setLang(i18n.language);
    sceneRef.current = scene;

    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setLang(i18n.language);
  }, [i18n.language]);

  useEffect(() => {
    sceneRef.current?.update({
      data,
      percent,
      low,
      high,
      tankConfig,
      displayUnit,
      tankCalculations,
    });
  }, [data, percent, low, high, tankConfig, displayUnit, tankCalculations]);

  useEffect(() => {
    sceneRef.current?.setAutoRotate(auto);
  }, [auto]);

  const btnCls =
    'rounded-lg border px-3 py-1.5 text-xs font-semibold transition active:scale-95 shadow-sm';

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-800 dark:text-slate-300">
            {t('water_supply.diagram_3d_title')}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`${btnCls} inline-flex items-center gap-1.5 ${
              auto
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-400 dark:border-emerald-700'
                : 'bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-750'
            }`}
            onClick={() => setAuto((v) => !v)}
          >
            {auto ? <Pause className="h-3.5 w-3.5" /> : <RotateCw className="h-3.5 w-3.5" />}
            <span>{auto ? t('water_supply.auto_rotate_off') : t('water_supply.auto_rotate_on')}</span>
          </button>
          {conn && (
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${conn.cls}`}>
              ● {conn.text}
            </span>
          )}
        </div>
      </div>
      <div
        className="relative w-full overflow-hidden rounded-xl border border-gray-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-950 shadow-inner"
        style={{ aspectRatio: '2.4 / 1', minHeight: 380 }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full touch-none"
          style={{ cursor: 'grab' }}
        />
      </div>
    </section>
  );
}
