import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { LineConfirmCircleIcon, IcCancelIcon, SiClockIcon } from '@/icons';
import { useEffect, useState } from 'react';
import type { ScanDetail } from '@_types/details';
import DefectOverlay from './DefectOverlay';
import OcrResultsPanel from './OcrResultsPanel';
import { formatDate } from '@/components/utils/date';
import { useTranslation } from 'react-i18next';

interface Props {
  open: boolean;
  ref_lot: string;
  ref_mfg: string;
  ref_exp: string;
  data: ScanDetail | null;
  current: number;
  total: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export default function ImageViewerModal({ open, ref_lot, ref_mfg, ref_exp, data, current, total, onClose, onPrev, onNext }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [activeOcrKey, setActiveOcrKey] = useState<string | null>(null);
  const { t } = useTranslation(); // ใช้สำหรับแปลภาษา

  useEffect(() => {
    setActiveIndex(null);
    setActiveOcrKey(null);
  }, [data?.id, open]);

  // keyboard shortcuts: Esc to close, ArrowLeft/ArrowRight and '<'/'>' to navigate
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      // Close on Escape
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      // Prev: ArrowLeft or '<'
      if (e.key === 'ArrowLeft' || e.key === '<') {
        e.preventDefault();
        onPrev();
        return;
      }

      // Next: ArrowRight or '>'
      if (e.key === 'ArrowRight' || e.key === '>') {
        e.preventDefault();
        onNext();
        return;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, onPrev, onNext]);

  if (!open || !data) return null;

  const status = {
    label: data.is_valid ? 'PASS' : 'FAIL',
    color: data.is_valid ? 'bg-green-700/[0.8] text-green-500' : 'bg-red-700/[0.8] text-red-300',
    icon: data.is_valid ? <LineConfirmCircleIcon width={15} height={15} /> : <IcCancelIcon width={15} height={15} />,
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-400/[0.3] p-4 backdrop-blur-sm dark:bg-gray-800/[0.4] dark:backdrop-blur-md"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[900px] overflow-hidden rounded-xl bg-gray-100 shadow-2xl dark:bg-[#0a0e1a]"
      >
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close modal"
          className="absolute right-4 top-4 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border dark:border-gray-500/[0.5] bg-white/90 text-slate-700 dark:bg-black/[0.5] dark:text-gray-500/[0.5]"
        >
          <X className="size-5" />
        </button>

        {/* Header */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 bg-gray-950/[0.3] p-5 pr-15 dark:bg-gray-900/[0.5]">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-extrabold ${status.color}`}>
              <span>{status.icon}</span>
              <span className="pt-[1px]">{status.label}</span>
            </span>

            <span className="rounded-full bg-gray-300 px-3 py-1 text-xs text-gray-500 dark:bg-gray-900">
              <span><SiClockIcon className="inline-block mr-1 pb-[2px] size-4" /></span>
              {formatDate(data?.scanned_at)}
            </span>
            <span className="rounded-full bg-gray-300 px-3 py-1 text-xs text-gray-500 dark:bg-gray-900">
              OCR thresh: {Number(data?.ocr_conf_thresh || 0).toFixed(2)}%
            </span>
            <span className="rounded-full bg-gray-300 px-3 py-1 text-xs text-gray-500 dark:bg-gray-900">
              Defect thresh: {Number(data?.defect_conf_thresh || 0).toFixed(2)}%
            </span>
          </div>
          <span className="rounded-full bg-gray-300 px-3 py-1 text-xs text-gray-500 dark:bg-gray-900">
            {(current + 1).toLocaleString()}&nbsp;/&nbsp;{total?.toLocaleString()}
          </span>
        </div>

        {/* Image + overlay */}
        <div className="grid max-h-[750px] grid-cols-12 gap-4 overflow-y-auto p-8 pt-2 custom-scrollbar">
          <div className="col-span-12 sm:col-span-7">
            <div className="relative">
              {data.image_path ? (
                <DefectOverlay
                  src={data.image_path}
                  defects={data.defects ?? []}
                  ocrResults={data.ocr_results}
                  activeIndex={activeIndex}
                  activeOcrKey={activeOcrKey}
                  onActiveOcrKeyChange={setActiveOcrKey}
                  onActiveIndexChange={setActiveIndex}
                />
              ) : (
                <div className="flex h-[480px] items-center justify-center text-slate-400">ไม่มีรูปภาพ</div>
              )}

              {/* Prev / Next buttons */}
              {total > 1 && (
                <>
                  <button
                    type="button"
                    onClick={onPrev}
                    disabled={current <= 0}
                    className="absolute left-3 top-1/2 -translate-y-1/2 rounded-2xl border bg-white/80 p-2 text-slate-700 disabled:opacity-40 dark:bg-black/45 dark:text-white"
                  >
                    <ChevronLeft className="size-6" />
                  </button>

                  <button
                    type="button"
                    onClick={onNext}
                    disabled={current >= total - 1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-2xl border bg-white/80 p-2 text-slate-700 disabled:opacity-40 dark:bg-black/45 dark:text-white"
                  >
                    <ChevronRight className="size-6" />
                  </button>
                </>
              )}
            </div>

            {/* helper text when defects exist */}
            {data.defects && data.defects.length > 0 ? (
              <p className="mt-3 text-center text-[12px] text-red-500">{t('page.inspection_scan_lists.modal.message_has_defect')}</p>
            ) : (
              <p className="mt-3 text-center text-[12px] text-green-500">{t('page.inspection_scan_lists.modal.message')}</p>
            )}

            <div className="mt-4">
              <OcrResultsPanel ref_lot={ref_lot} ref_mfg={ref_mfg} ref_exp={ref_exp} ocrResults={data.ocr_results} ocrThreshold={Number(data?.ocr_conf_thresh || 0)} activeKey={activeOcrKey} onActiveKeyChange={setActiveOcrKey} />
            </div>
          </div>

          {/* Defect list */}
          <div className="col-span-12 sm:col-span-5">
            {data.defects && data.defects.length > 0 ? (
              <div className="h-full overflow-hidden rounded-md border border-gray-400/[0.3] bg-red-500/[0.1] dark:border-gray-800/[0.3] dark:bg-red-300/[0.1]">
                <div className="flex items-center gap-1 bg-red-500/[0.5] px-2 py-3 text-[12px] font-bold text-red-800 dark:bg-red-800/[0.5] dark:text-red-400">
                  <span>
                    <IcCancelIcon width={15} height={15} />
                  </span>
                  <span>{t('page.inspection_scan_lists.modal.has_defect').replace('[length]', `${data.defects.length}`)}</span>
                </div>
                <div className="max-h-[360px] overflow-y-auto custom-scrollbar">
                  {data.defects.map((d: any, i: number) => {
                    const isActive = activeIndex === i;
                    return (
                      <div
                        key={i}
                        onMouseEnter={() => setActiveIndex(i)}
                        onMouseLeave={() => setActiveIndex(null)}
                        className={`flex items-center justify-between gap-4 px-4 py-3 transition ${isActive ? 'bg-[rgba(244,63,94,0.06)]' : 'bg-transparent'}`}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: 999,
                              background: '#f43f3f',
                              display: 'inline-block',
                              boxShadow: isActive ? `0 0 8px 2px #f43f3f` : 'none',
                            }}
                          />
                          <div>
                            <div className="text-sm font-bold text-slate-700 dark:text-slate-100">{d.class_name?.replace("_", " ").toUpperCase()}</div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-xs text-amber-500">{(d.conf ?? d.confidence)?.toFixed?.(1) ?? '-'}% conf</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="h-full overflow-hidden rounded-md border border-gray-400/[0.3] bg-green-500/[0.1] dark:border-gray-800/[0.3] dark:bg-green-400/[0.1]">
                <div className="flex items-center gap-1 bg-green-500/[0.5] px-2 py-3 text-[13px] font-bold text-green-800 dark:bg-green-800/[0.5] dark:text-green-500">
                  <LineConfirmCircleIcon width={15} height={15} />
                  <span className="pt-[2px]">{t('page.inspection_scan_lists.modal.no_defect')}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
