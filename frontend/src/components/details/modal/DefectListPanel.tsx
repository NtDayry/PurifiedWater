import type { ScanDetail } from '@_types/details';
import { BadgeAlert } from 'lucide-react';

type DefectItem = ScanDetail['defects'][number];

interface Props {
  defects: DefectItem[];
  activeIndex: number | null;
  onHover: (index: number | null) => void;
}

function severityTone(index: number) {
  const tones = [
    {
      dot: 'bg-rose-500',
      bg: 'rgba(244,63,94,0.08)',
      border: 'rgba(244,63,94,0.25)',
      pill: 'bg-rose-500 text-white',
      text: '#fda4af',
      glow: 'rgba(244,63,94,0.25)',
    },
    {
      dot: 'bg-amber-500',
      bg: 'rgba(245,158,11,0.08)',
      border: 'rgba(245,158,11,0.25)',
      pill: 'bg-amber-500 text-white',
      text: '#fbbf24',
      glow: 'rgba(245,158,11,0.25)',
    },
    {
      dot: 'bg-sky-500',
      bg: 'rgba(96,165,250,0.08)',
      border: 'rgba(96,165,250,0.25)',
      pill: 'bg-sky-500 text-white',
      text: '#93c5fd',
      glow: 'rgba(96,165,250,0.25)',
    },
  ];

  return tones[index % tones.length];
}

export default function DefectListPanel({ defects, activeIndex, onHover }: Props) {
  return (
    <section className="bg-white overflow-hidden rounded-3xl border dark:border-gray-800 shadow-[0_12px_40px_rgba(0,0,0,0.22)]">
      <div className="border-b border-[#131c2e] px-5 py-4">
        <div className="flex items-center gap-2">
          <BadgeAlert className="size-5 text-rose-500" />
          <h3 className="text-lg font-bold dark:text-white/[0.8]">Defects</h3>
        </div>
        <p className="mt-1 text-sm dark:text-white/[0.8]">เลื่อนเมาส์บนรายการเพื่อ highlight กรอบบนรูป</p>
      </div>

      <div className="space-y-2 p-4">
        {defects.length > 0 ? (
          defects.map((defect, index) => {
            const tone = severityTone(index);
            const active = activeIndex === index;

            return (
              <button
                key={`${defect.class_name}-${index}`}
                type="button"
                onMouseEnter={() => onHover(index)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(index)}
                onBlur={() => onHover(null)}
                className="flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition"
                style={{
                  borderColor: active ? tone.border : '#1a2235',
                  background: active ? tone.bg : '#060910',
                }}
              >
                <span
                  className={`mt-1 size-2.5 rounded-full ${tone.dot}`}
                  style={{ boxShadow: active ? `0 0 10px 2px ${tone.glow}` : 'none' }}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate font-semibold text-[#dce8f8]" style={{ color: active ? tone.text : '#dce8f8' }}>
                      {defect.class_name?.replace("_", " ").toUpperCase()}
                    </p>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${tone.pill}`}>{defect.confidence.toFixed(1)}%</span>
                  </div>
                </div>
              </button>
            );
          })
        ) : (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-300">
            ไม่มี defect ในสแกนนี้
          </div>
        )}
      </div>
    </section>
  );
}
