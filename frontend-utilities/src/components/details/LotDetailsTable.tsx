import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useDebounce } from 'use-debounce';
import { Search, Package } from 'lucide-react';
import { AnimateArrowUpIcon, AnimateArrowDownIcon } from '@/icons';
import { getLotDetail, getScanDetail } from '@/api';
import { useDragScroll } from '@/hooks/useScroll';
import { useLoading } from '@/context/LoadingContext';
import useSwalAlert from '@/hooks/useSwalAlert';
import { useTableState } from '@/hooks/useTableState';
import { useLotDetailStore } from '@/store/useLotDetailStore';
import { getPageNumbers } from '@/components/utils/getPageNumbers';
import { formatDate } from '@/components/utils/date';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/radixUI/input';
import Pagination from '@/components/table-pagination/Pagination';
import Badge from '@/components/ui/badge/Badge';
import type { LotDetail, ScanItem, ScanDetail } from '@_types/details';
import type { TableHeaderType } from '@_types/table';
import ImageViewerModal from '@/components/details/modal/ImageViewerModal';
import { imagePath } from '@/components/utils/formatImagePath';

function splitDateTime(value: string) {
  const [datePart = '-', timePart = '-'] = formatDate(value).split(' ');
  return { datePart, timePart };
}

// คอมโพเนนต์หลักของตารางการตรวจสอบ
export default function LotDetailsTable({ lot, mfg, exp }: { lot?: string; mfg?: string; exp?: string }) {
  const [dataTable, setDataTable] = useState<LotDetail>(); // สถานะสำหรับเก็บข้อมูลตาราง
  // Modal แสดงภาพและรายละเอียดต่างๆ
  const [selected, setSelected] = useState<ScanDetail | null>(null);
  const [viewerIdx, setViewerIdx] = useState<number | null>(null);

  const [total, setTotal] = useState(0); // สถานะสำหรับเก็บจำนวนรายการทั้งหมด
  const [totalPages, setTotalPages] = useState(1); // สถานะสำหรับเก็บจำนวนหน้าทั้งหมด
  const { scrollRef, onPointerMove, onPointerUp, onPointerDown } = useDragScroll<HTMLDivElement>(); // ใช้สำหรับการลากเลื่อนตาราง
  const { loading, setLoading } = useLoading(); // สถานะโหลด
  const SwalAlert = useSwalAlert(); // ใช้สำหรับแสดง alert แบบ Swal
  const { t } = useTranslation(); // ใช้สำหรับแปลภาษา

  // ใช้ store สำหรับจัดการ state ของตาราง
  const {
    searchTerm,
    setSearchTerm,
    currentPage,
    setCurrentPage,
    rowsPerPage,
    setRowsPerPage,
    sortKey,
    sortDirection,
    setSort
  } = useTableState(useLotDetailStore);

  // ใช้ debounce สำหรับการค้นหา
  const [debouncedSearch] = useDebounce(searchTerm, 500);

  // ฟังก์ชัน useEffect สำหรับโหลดข้อมูลตารางเมื่อมีการเปลี่ยนแปลง
  useEffect(() => {
    if (!lot) return;
    setLoading(true, 'before', 500);
    getLotDetail({
      lot: lot,
      mfg: mfg,
      exp: exp,
      page: currentPage,
      limit: rowsPerPage,
      search: debouncedSearch,
      sortKey: sortKey,
      sortDirection: sortDirection,
    })
      .then((d) => {
        setDataTable(d);
        setTotal(d.total);
        setTotalPages(d.total_pages);
      })
      .catch(SwalAlert.error)
      .finally(() => setLoading(false));
  }, [currentPage, rowsPerPage, debouncedSearch, sortKey, sortDirection, lot, mfg, exp]);

  // ฟังก์ชันจัดการการเรียงข้อมูลเมื่อกดที่ header ของตาราง
  const handleSort = (key: string, enable: boolean = false) => {
    if (!enable) return;

    if (sortKey === key) {
      setSort(key, sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(key, 'asc');
    }
  };

  const openViewer = useCallback(
    async (scan: ScanItem, idx: number) => {
      // เปิด modal จะทำได้ก็ต่อเมื่อโหลดรายละเอียดสำเร็จ ดังนั้นเราจะตั้ง viewer index
      // หลังจากโหลดสำเร็จเพื่อให้ current index สอดคล้องกับ selected

      try {
        const detail = await getScanDetail(scan.id);
        // เก็บข้อมูล detail แล้วตั้ง index ให้กับ viewer
        setSelected(detail);
        setViewerIdx(idx);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูล scan detail ได้';
        // หากโหลดไม่สำเร็จ ให้รีเซ็ตทั้ง selected และ index
        setSelected(null);
        setViewerIdx(null);
        SwalAlert.error({ text: message });
      }
    },
    [SwalAlert]
  );

  const navigateViewer = useCallback(
    async (dir: 1 | -1) => {
      // ต้องมีข้อมูลทั้งหมดและ viewer index ปัจจุบัน
      if (viewerIdx === null) return;
      if (typeof total !== 'number' || total <= 0) return;

      // คำนวณ absolute index ของรายการถ้านับจากหน้าแรก
      const absIndex = (currentPage - 1) * rowsPerPage + viewerIdx + dir;
      if (absIndex < 0 || absIndex >= total) return;

      const targetPage = Math.floor(absIndex / rowsPerPage) + 1;
      const targetIdx = absIndex % rowsPerPage;

      // ถ้า target อยู่ในหน้าปัจจุบัน ให้เปิดจาก dataTable เลย
      if (targetPage === currentPage) {
        if (dataTable?.scans && dataTable.scans[targetIdx]) {
          await openViewer(dataTable.scans[targetIdx], targetIdx);
        }
        return;
      }

      // ถ้าเป็นหน้าต่าง ๆ ให้โหลดหน้านั้นมาก่อน แล้วเปลี่ยน state ของตารางและเปิด viewer
      if (!lot) return;

      try {
        setLoading(true, 'before', 500);
        const d = await getLotDetail({
          lot: lot,
          mfg: mfg,
          exp: exp,
          page: targetPage,
          limit: rowsPerPage,
          search: debouncedSearch,
          sortKey: sortKey,
          sortDirection: sortDirection,
        });

        // อัพเดตตารางให้เป็นหน้าที่โหลดมาแล้ว
        setDataTable(d);
        setTotal(d.total);
        setTotalPages(d.total_pages);
        setCurrentPage(targetPage);

        // เปิด viewer สำหรับ index ในหน้าที่โหลด
        if (d.scans && d.scans[targetIdx]) {
          await openViewer(d.scans[targetIdx], targetIdx);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูลหน้าใหม่ได้';
        SwalAlert.error({ text: message });
      } finally {
        setLoading(false);
      }
    },
    [
      currentPage,
      rowsPerPage,
      viewerIdx,
      total,
      dataTable?.scans,
      openViewer,
      lot,
      mfg,
      exp,
      debouncedSearch,
      sortKey,
      sortDirection,
      setCurrentPage,
      SwalAlert,
      setLoading,
    ]
  );

  // โครงสร้าง header ของตาราง
  const tableHeader: TableHeaderType[] = [
    { label: t('page.inspection_scan_lists.table.header.created'), key: 'created', align: 'center', isSort: true },
    { label: t('page.inspection_scan_lists.table.header.status'), key: 'status', align: 'center', isSort: true },
    { label: t('page.inspection_scan_lists.table.header.ocr_read'), key: 'ocr_read', align: 'center' },
    { label: t('page.inspection_scan_lists.table.header.defects'), key: 'defects', align: 'center' },
    { label: t('page.inspection_scan_lists.table.header.preview'), key: 'preview', align: 'center' },
  ];

  // ข้อความสำหรับแสดงจำนวนรายการ
  const detail = t('page.inspection_scan_lists.table.detail');

  return (
    <div className="bg-white shadow-xl rounded-xl border border-gray-250 dark:bg-white/[0.03] dark:border-white/[0.05]">
      {/* แสดง search bar และจำนวนรายการ */}
      <div className="flex justify-between items-center px-4 py-5">
        <p className="text-lg font-bold text-gray-600 dark:text-white/[0.8]">
          {detail.replace('[ci]', dataTable?.scans.length.toLocaleString() || '0').replace('[ti]', total.toLocaleString())}
        </p>

        <div className="relative w-60">
          <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />

          <Input
            placeholder={t('page.inspection_scan_lists.table.search')}
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
            }}
            className={`pl-9 pr-3 ${searchTerm ? '!text-success' : 'text-muted-foreground'}`}
          />
        </div>
      </div>

      <div className="border border-1 dark:border-gray-800"></div>

      {/* ตารางข้อมูล */}
      <div
        ref={scrollRef}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerMove={onPointerMove}
        className="max-w-full overflow-x-auto select-none custom-scrollbar"
      >
        <Table className="min-w-220">
          {/* Header ของตาราง */}
          <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
            <TableRow>
              {tableHeader.map((header) => (
                <TableCell
                  key={header.label}
                  isHeader
                  onClick={() => handleSort(header.key, header.isSort)}
                  className={`px-4 py-3 bg-gray-500/10 dark:bg-gray-800 font-medium text-gray-500 text-start text-theme-lg dark:text-white/[0.8] ${header.key ? 'cursor-pointer select-none' : ''
                    }`}
                >
                  <h4 className={`flex items-center gap-1 justify-${header.align || 'start'} ${sortKey !== header.key ? 'w-full' : ''}`}>
                    {header.label}

                    <span className={`${sortKey === header.key ? 'visible' : 'invisible'}`}>
                      {sortDirection === 'asc' ? <AnimateArrowUpIcon className="size-4" /> : <AnimateArrowDownIcon className="size-4" />}
                    </span>
                  </h4>
                </TableCell>
              ))}
            </TableRow>
          </TableHeader>

          {/* Body ของตาราง */}
          <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
            {dataTable?.scans.map((row, idx) => {
              return (
                <TableRow
                  key={row.scanned_at}
                  className={`cursor-pointer hover:bg-primary/10 dark:hover:bg-gray-800/60 animate-slideDown ${selected && selected.id === row.id ? 'bg-primary/10 dark:bg-primary/900/30' : ''}`}
                  onClick={() => openViewer(row, idx)}
                >
                  <TableCell className="flex justify-center align-top px-4 py-2 ps-0 text-gray-500 text-start text-theme-sm dark:text-gray-400">
                    <div className="flex flex-col w-25">
                      <span className="w-full text-center">{splitDateTime(row.scanned_at).datePart}</span>
                      <span className="w-full rounded bg-gray-300 text-[13px] px-0 py-[2px] text-center text-gray-800 dark:bg-gray-800 dark:text-gray-400">
                        {splitDateTime(row.scanned_at).timePart}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="align-top pr-4 pl-0 py-2 text-gray-500 text-center text-theme-sm dark:text-gray-400">
                    <Badge className="w-20 h-full" color={row.is_valid ? 'success' : 'error'} children={row.is_valid ? 'OK' : 'NG'} />
                  </TableCell>
                  <TableCell className="align-top px-4 py-2 text-gray-800 text-start text-[11px] dark:text-gray-500">
                    <div className="flex h-full flex-col justify-center gap-1">
                      <div className="rounded bg-gray-200 dark:bg-gray-800 p-2">
                        LOT<span className="text-gray-600 dark:text-gray-400 pl-2">{row.ocr_lines.lot ?? ''}</span>
                      </div>
                      <div className="rounded bg-gray-200 dark:bg-gray-800 p-2">
                        MFG<span className="text-gray-600 dark:text-gray-400 pl-2">{row.ocr_lines.mfg ?? ''}</span>
                      </div>
                      <div className="rounded bg-gray-200 dark:bg-gray-800 p-2">
                        EXP<span className="text-gray-600 dark:text-gray-400 pl-2">{row.ocr_lines.exp ?? ''}</span>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="align-top px-4 py-2 text-gray-500 text-start dark:text-gray-400">
                    <div className="flex h-full flex-row gap-1">
                      {Object.entries(row.defects ?? {}).map(([key, value]) => {
                        const defectStyles: Record<
                          string,
                          {
                            className: string;
                            label: string;
                          }
                        > = {
                          ink_smear: {
                            className: 'bg-red-600/[0.2] text-red-600 border-red-600 dark:text-red-500 dark:border-red-500',
                            label: 'Ink Smear',
                          },

                          print_incomplete: {
                            className: 'bg-amber-600/[0.3] text-amber-800 border-amber-600 dark:text-amber-500 dark:border-amber-500',
                            label: 'Print Incomplete',
                          },

                          missing_print: {
                            className: 'bg-blue-600/[0.3] text-blue-800 border-blue-600 dark:text-blue-500 dark:border-blue-500',
                            label: 'Missing Print',
                          },

                          blurry_text: {
                            className: 'bg-purple-600/[0.3] text-purple-800 border-purple-600 dark:text-purple-500 dark:border-purple-500',
                            label: 'Blurry Text',
                          },
                          print_misaligned: {
                            className: 'bg-green-600/[0.3] text-green-800 border-green-600 dark:text-green-500 dark:border-green-500',
                            label: 'Print Misaligned',
                          },
                        };

                        return (
                          <div
                            key={key}
                            className={`inline-flex items-center px-2.5 py-0.5 justify-center gap-1 rounded-sm text-[11px] font-medium border ${defectStyles[key]?.className}`}
                          >
                            {defectStyles[key]?.label} {value ?? ''}
                          </div>
                        );
                      })}
                    </div>
                  </TableCell>

                  <TableCell className="align-top pr-4 pl-0 py-2 text-gray-500 text-theme-sm dark:text-gray-400">
                    <div className="flex justify-center">
                      <div className="flex justify-center items-center h-[100px] w-[180px] overflow-hidden rounded-[5px]">
                        {row.image_path ? (
                          <img
                            width={40}
                            height={40}
                            src={imagePath(row.image_path)}
                            alt={`scan-${row.id}`}
                            className="w-full h-full object-fill"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.className = 'flex justify-center h-[80px] w-[80px] overflow-hidden rounded-[5px]';
                              target.src = '/images/no-image.png';
                            }}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[9px] text-[#2e3e58]">No image</div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}

            {/* แสดงข้อความเมื่อไม่มีข้อมูล */}
            {!loading && dataTable?.scans.length === 0 && (
              <TableRow className="animate-fadeIn">
                <TableCell colSpan={12} className="px-5 py-4 sm:px-6 text-start">
                  <div className="border dark:border-gray-800 bg-gray-400/[0.1] dark:bg-gray-800 rounded-lg">
                    <div className="text-center py-12">
                      <Package className="w-12 h-12 text-muted-foreground dark:text-white/[0.5] mx-auto mb-4" />

                      <h3 className="text-lg font-medium text-muted-foreground dark:text-white/[0.5] mb-2">
                        {t('page.inspection_scan_lists.table.empty.title')}
                      </h3>

                      <p className="text-muted-foreground dark:text-white/[0.5] mb-4">{t('page.inspection_scan_lists.table.empty.subtitle')}</p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* แสดง pagination */}
      <div className="border border-1 dark:border-gray-800"></div>

      <Pagination
        filteredData={Array(total)}
        totalPages={totalPages}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        pagesLists={getPageNumbers(currentPage, totalPages)}
        rowsPerPage={rowsPerPage}
        setRowsPerPage={setRowsPerPage}
        rowPerPageText={{
          display: t('page.inspection_scan_lists.table.row_per_page.display'),
          row: t('page.inspection_scan_lists.table.row_per_page.row'),
        }}
      />

      <ImageViewerModal
        open={Boolean(selected)}
        ref_lot={lot || ''}
        ref_mfg={mfg || ''}
        ref_exp={exp || ''}
        data={selected}
        // ส่ง current เป็น absolute index (นับจากหน้าแรก) เพื่อให้ modal สามารถรู้สถานะ prev/next
        current={viewerIdx === null ? 0 : (currentPage - 1) * rowsPerPage + viewerIdx}
        // ส่ง total เป็นจำนวนรายการทั้งหมด (ไม่ใช่จำนวนต่อหน้า) เพื่อให้สามารถเลื่อนไปข้ามหน้าได้
        total={total}
        onClose={() => {
          setSelected(null);
          setViewerIdx(null);
        }}
        onPrev={() => void navigateViewer(-1)}
        onNext={() => void navigateViewer(1)}
      />
    </div>
  );
}
