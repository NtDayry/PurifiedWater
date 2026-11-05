import type { ScanDetail } from '@_types/details';

interface Props {
  ref_lot: string;
  ref_mfg: string;
  ref_exp: string;
  ocrResults: ScanDetail['ocr_results'];
  ocrThreshold: number;
  activeKey: string | null;
  onActiveKeyChange: (key: string | null) => void;
}

const FIELD_ORDER = ['lot', 'mfg', 'exp'] as const;

type FieldKey = (typeof FIELD_ORDER)[number];

function fieldStyle(key: string) {
  const map: Record<string, { accent: string; border: string; bg: string; activeBg: string; title: string; text: string }> = {
    lot: {
      accent: 'bg-cyan-500',
      border: 'border-cyan-400/40',
      bg: 'bg-cyan-500/[0.08]',
      activeBg: 'bg-cyan-500/[0.18]',
      title: 'text-cyan-500 dark:text-cyan-100',
      text: 'text-cyan-500 dark:text-cyan-100',
    },
    mfg: {
      accent: 'bg-violet-500',
      border: 'border-violet-400/40',
      bg: 'bg-violet-500/[0.08]',
      activeBg: 'bg-violet-500/[0.18]',
      title: 'text-violet-500 dark:text-violet-100',
      text: 'text-violet-500 dark:text-violet-100',
    },
    exp: {
      accent: 'bg-amber-500',
      border: 'border-amber-400/40',
      bg: 'bg-amber-500/[0.08]',
      activeBg: 'bg-amber-500/[0.18]',
      title: 'text-amber-500 dark:text-amber-100',
      text: 'text-amber-500 dark:text-amber-100',
    },
  };

  return (
    map[key] ?? {
      accent: 'bg-sky-500',
      border: 'border-sky-400/40',
      bg: 'bg-sky-500/[0.08]',
      activeBg: 'bg-sky-500/[0.18]',
      title: 'text-sky-500 dark:text-sky-100',
      text: 'text-sky-500 dark:text-sky-100',
    }
  );
}

export default function OcrResultsPanel({ ref_lot, ref_mfg, ref_exp, ocrResults, ocrThreshold, activeKey, onActiveKeyChange }: Props) {
  const orderedKeys = [...FIELD_ORDER, ...Object.keys(ocrResults ?? {}).filter((key) => !FIELD_ORDER.includes(key as FieldKey))];

  return (
    <section>
      <div className="mt-4 grid auto-rows-fr grid-cols-1 gap-3 lg:grid-cols-3" onMouseLeave={() => onActiveKeyChange(null)}>
        {orderedKeys.map((key) => {
          const value = ocrResults?.[key];

          const style = fieldStyle(key);
          const isActive = activeKey === key;
          const hasText = Boolean(value?.text?.trim());
          const confidence = value?.confidence ? `${value?.confidence.toFixed(2)} %` : "";

          const isLowConfidence = value?.confidence !== undefined && value.confidence < ocrThreshold;
          const isValid = (key === 'lot' && ref_lot === value?.text) || (key === 'mfg' && ref_mfg === value?.text) || (key === 'exp' && ref_exp === value?.text);

          // ─── สไตล์ตัวอักษร เส้นขอบ และจุดสี ───
          const titleColor = isLowConfidence || !isValid ? 'text-red-500 dark:text-red-400' : style.title;
          const textColor = isLowConfidence || !isValid ? 'text-red-500 dark:text-red-400' : style.text;
          const accentColor = isLowConfidence || !isValid ? 'bg-red-500' : style.accent;
          const borderColor = isLowConfidence || !isValid ? 'border-red-400/40 dark:border-red-500/30' : style.border;

          // ─── แยก Logic สีพื้นหลังรวมถึง Hover แยกตามสถานะผ่าน/ไม่ผ่าน ───
          const currentBg = isLowConfidence || !isValid
            ? `${isActive ? 'bg-red-500/[0.15]' : 'bg-red-500/[0.05]'} hover:bg-red-500/[0.12] dark:hover:bg-red-500/[0.18]`
            : `${isActive ? style.activeBg : style.bg} hover:bg-white/5`;

          return (
            <button
              key={key}
              type="button"
              onMouseEnter={() => onActiveKeyChange(key)}
              onFocus={() => onActiveKeyChange(key)}
              className={`flex w-full items-stretch rounded-2xl border px-4 py-3 text-left transition ${borderColor} ${currentBg}`}
            >
              <div className="flex w-full flex-col justify-between gap-2">
                <div className="flex justify-between items-center gap-3">
                  <div className="flex gap-3">
                    <div
                      className={`mt-[3px] size-2.5 shrink-0 rounded-full ${accentColor} ${isActive ? 'shadow-[0_0_0_4px_rgba(239,68,68,0.1)]' : ''}`}
                    />
                    <div className={`text-xs font-semibold uppercase tracking-[0.2em] ${titleColor}`}>{key}</div>
                  </div>
                  <div className={`text-[11px] mt-[2px] font-medium ${titleColor}`}>{confidence}</div>
                </div>
                <div className="ps-5">
                  {hasText ? (
                    <div className={`break-all font-mono text-lg font-semibold leading-snug tracking-[0.08em] ${textColor}`}>{value.text}</div>
                  ) : (
                    <div className="mt-1 text-[12px] text-gray-600 dark:text-white/35">ไม่มีข้อมูล OCR</div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}