export type Role = 'admin' | 'operator' | 'viewer';

export interface User {
  id: number;
  username: string;
  email: string;
  role: Role;
  is_active: boolean;
  created_at: string;
}

export interface LotSummary {
  lot: string;
  total: number;
  ok: number;
  ng: number;
}

export interface ScanItem {
  id: number;
  is_valid: boolean;
  scanned_at: string;
  image_path: string | null;
  total_ms: number;
}

export interface DefectItem {
  class_name: string;
  confidence: number;
  box: [number, number, number, number];
}

export interface OcrResult {
  text: string;
  confidence: number;
}

export interface ScanTiming {
  prepare_ms: number;
  yolo_ms: number;
  ocr_ms: number;
  postprocess_ms: number;
  total_ms: number;
}

export interface ScanDetail {
  id: number;
  is_valid: boolean;
  ocr_conf_thresh: number;
  defect_conf_thresh: number;
  scanned_at: string;
  image_path: string;
  ref_lot: string;
  ref_mfg: string;
  ref_exp: string;

  timing?: ScanTiming | null;

  defects: {
    class_name: string;
    confidence: number;
    box: number[];
  }[];

  ocr_results: Record<
    string,
    {
      text: string;
      confidence: number;
      box?: [number | null, number | null, number | null, number | null];
    }
  >;
}

export interface LotDetail {
  lot: string;
  mfg: string;
  exp: string;
  passed: number;
  failed: number;
  has_defect: number;
  defect_summary: Record<string, number>;
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  scans: ScanItem[];
}

export interface OcrLines {
  lot: string | null;
  mfg: string | null;
  exp: string | null;
}

export interface ScanItem {
  id: number;
  is_valid: boolean;
  scanned_at: string;
  image_path: string | null;
  total_ms: number | null;
  ocr_lines: OcrLines;
  defects: Record<number>[];
}

// @_types/details.ts (หรือไฟล์ที่เกี่ยวข้อง)
export interface LotStats {
  lot: string;
  mfg: string;
  exp: string;
  total: number;
  passed: number;
  failed: number;
  has_defect: number;
  defect_summary: Record<string, number>;
}

export interface LotTiming {
  lot: string;
  mfg: string;
  exp: string;
  prepare: number;
  defect: number;
  ocr: number;
  postprocess: number;
  other: number;
  total: number;
}