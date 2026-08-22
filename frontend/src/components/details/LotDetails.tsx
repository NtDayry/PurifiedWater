import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { useSearchParams } from 'react-router-dom';
import LotDetailsTable from './LotDetailsTable';
import { getDetailAndState } from '@/api';
import useSwalAlert from '@/hooks/useSwalAlert';
import type { LotStats, LotTiming } from '@_types/details';

export default function LotDetails() {
  const { lot } = useParams<{ lot: string }>();
  const [searchParams] = useSearchParams();
  const mfg = searchParams.get('mfg') || '';
  const exp = searchParams.get('exp') || '';
  const SwalAlert = useSwalAlert(); // ใช้สำหรับแสดง alert แบบ Swal
  const { t } = useTranslation(); // ใช้สำหรับแปลภาษา

  // แยก State ตามข้อมูลแต่ละชุดจาก API
  const [stats, setStats] = useState<LotStats | null>(null);
  const [timing, setTiming] = useState<LotTiming | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!lot) return;

    async function fetchLotData() {
      setLoading(true);
      try {
        const { stats, timing } = await getDetailAndState(lot || '', mfg, exp);
        setStats(stats);
        setTiming(timing);
      } catch (err: any) {
        SwalAlert.error({ text: 'เกิดข้อผิดพลาดในการโหลดข้อมูล' });
      } finally {
        setLoading(false);
      }
    }

    fetchLotData();
  }, [lot]);

  // ดึงค่าสถิติจากก้อน `stats` ตรง ๆ (ไม่พึ่งพารายการสแกนเฉพาะรายหน้าแล้ว)
  const totalInspected = stats?.total ?? 0;
  const passedCount = stats?.passed ?? 0;
  const failedCount = stats?.failed ?? 0;
  const platesWithDefect = stats?.has_defect ?? 0;

  return (
    <div className="min-h-screen">
      <main>
        {/* แผง Dashboard Summary Cards */}
        <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: t('page.inspection_scan_lists.summary.total'),
              value: totalInspected?.toLocaleString(),
              acc: '#3d7eff',
            },
            {
              label: t('page.inspection_scan_lists.summary.pass'),
              value: passedCount?.toLocaleString(),
              acc: '#22c55e',
            },
            {
              label: t('page.inspection_scan_lists.summary.fail'),
              value: failedCount?.toLocaleString(),
              acc: '#f43f5e',
            },
            {
              label: t('page.inspection_scan_lists.summary.defects'),
              value: platesWithDefect?.toLocaleString(),
              acc: '#f59e0b',
            },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-gray-300 dark:border-gray-800 dark:bg-white/[0.03] p-5"
              style={{ borderTopColor: card.acc, borderTopWidth: 2 }}
            >
              <span className="block font-mono text-3xl font-black leading-none" style={{ color: card.acc }}>
                {loading ? '...' : card.value}
              </span>
              <span className="mt-2 block text-[11px] font-medium text-[#3a4a60] dark:text-gray-400">{card.label}</span>
            </div>
          ))}
        </section>

        {/* ตัวอย่างส่วนแสดงผลตารางเวลาเฉลี่ย (Timing) */}
        <section className="mb-5 rounded-xl border border-gray-300 dark:border-gray-800 p-5 dark:bg-white/[0.01]">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">{t('page.inspection_scan_lists.references.title')}</h3>
          <div className="grid grid-cols-3 gap-3 text-center font-mono mb-5">
            <div className="p-2 bg-gray-200 dark:bg-gray-800 rounded">
              <span className="block text-xs text-gray-500">{t('page.inspection_scan_lists.references.lot')}</span>
              <span className="text-gray-600 font-bold dark:text-gray-400 ">{stats?.lot}</span>
            </div>
            <div className="p-2 bg-gray-200 dark:bg-gray-800 rounded">
              <span className="block text-xs text-gray-500">{t('page.inspection_scan_lists.references.mfg')}</span>
              <span className="text-gray-600 font-bold dark:text-gray-400 ">{stats?.mfg}</span>
            </div>
            <div className="p-2 bg-gray-200 dark:bg-gray-800 rounded">
              <span className="block text-xs text-gray-500">{t('page.inspection_scan_lists.references.exp')}</span>
              <span className="text-gray-600 font-bold dark:text-gray-400 ">{stats?.exp}</span>
            </div>
          </div>

          <div className="border border-1 border-gray-400/[0.3] dark:border-gray-800/[0.3] mb-5"></div>

          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">{t('page.inspection_scan_lists.avg_timing.title')}</h3>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-center font-mono">
            <div className="p-2 bg-gray-200 dark:bg-gray-800 rounded">
              <span className="block text-xs text-gray-500">{t('page.inspection_scan_lists.avg_timing.prepare')}</span>
              <span className="text-gray-600 font-bold dark:text-gray-400 ">{timing?.prepare} ms</span>
            </div>
            <div className="p-2 bg-gray-200 dark:bg-gray-800 rounded">
              <span className="block text-xs text-gray-500">{t('defect')}</span>
              <span className="text-gray-600 font-bold dark:text-gray-400 ">{timing?.defect} ms</span>
            </div>
            <div className="p-2 bg-gray-200 dark:bg-gray-800 rounded">
              <span className="block text-xs text-gray-500">{t('page.inspection_scan_lists.avg_timing.ocr')}</span>
              <span className="text-gray-600 font-bold dark:text-gray-400 ">{timing?.ocr} ms</span>
            </div>
            <div className="p-2 bg-gray-200 dark:bg-gray-800 rounded">
              <span className="block text-xs text-gray-500">{t('page.inspection_scan_lists.avg_timing.post')}</span>
              <span className="text-gray-600 font-bold dark:text-gray-400 ">{timing?.postprocess} ms</span>
            </div>
            <div className="p-2 bg-gray-200 dark:bg-gray-800 rounded">
              <span className="block text-xs text-gray-500">{t('page.inspection_scan_lists.avg_timing.other')}</span>
              <span className="text-gray-600 font-bold dark:text-gray-400 ">{timing?.other} ms</span>
            </div>
            <div className="p-2 bg-blue-200 dark:bg-blue-950/[0.4] rounded font-bold">
              <span className="block text-xs text-blue-400">{t('page.inspection_scan_lists.avg_timing.total')}</span>
              <span className="text-blue-600 font-bold dark:text-blue-300 ">{timing?.total} ms</span>
            </div>
          </div>
        </section>

        <LotDetailsTable lot={lot} mfg={mfg} exp={exp} />
      </main>
    </div>
  );
}
