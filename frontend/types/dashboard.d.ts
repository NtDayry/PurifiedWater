export interface LotSummary {
  created: string;
  lot: string;
  mfg: string;
  exp: string;
  total: number;
  ok: number;
  ng: number;
}

export type Lots = {
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  items: LotSummary[];
};

export type TimingSummary = {
  prepare: number;
  defect: number;
  ocr: number;
  postprocess: number;
  other: number;
};

export type Defects = {
  class: string;
  total: number;
};
