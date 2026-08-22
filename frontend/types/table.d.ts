export interface GetLotsParams {
  page: number;
  limit: number;
  search: string;
  sortKey: string;
  sortDirection: 'asc' | 'desc';
}

export interface GetLotsDetailsParams {
  lot: string;
  mfg?: string;
  exp?: string;
  page: number;
  limit: number;
  search: string;
  sortKey: string;
  sortDirection: 'asc' | 'desc';
}

// ฟังก์ชันที่ใช้ในการกำหนด header ของตาราง
export interface TableHeaderType {
  label: string;
  key: string;
  isSort?: boolean;
  align?: 'left' | 'right' | 'center';
}