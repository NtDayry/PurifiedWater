import { useCallback } from 'react';

// กำหนดประเภทของ Parameter ที่ฟังก์ชันจะรองรับ
type PathType = string | null | undefined;

export default function useImagePath() {
  /**
   * ฟังก์ชันสำหรับจัดการเติม / นำหน้า Path รูปภาพ
   * @param path - เส้นทางรูปภาพจากเบส (string | null | undefined)
   * @param defaultImage - รูปภาพเริ่มต้นในกรณีที่ไม่มี path ส่งมา
   */
  const formatPath = useCallback((path: PathType, defaultImage: string = '/polipharm.png'): string => {
    if (!path || path.trim() === '') return defaultImage; // 1. ถ้าไม่มี path หรือเป็นค่าว่าง ให้ส่งรูปเริ่มต้นกลับไป
    if (path.startsWith('http://') || path.startsWith('https://')) return path; // 2. ถ้าเป็น URL สมบูรณ์อยู่แล้ว (เช่น http://, https://) ให้ส่งกลับไปตรงๆ
    if (path.startsWith('/')) return path; // 3. ถ้าขึ้นต้นด้วย / อยู่แล้ว ให้ส่งกลับไปเลย
    
    return `/${path}`; // 4. ถ้าไม่มี / ให้เติมข้างหน้าให้สมบูรณ์
  }, []);

  /**
   * ฟังก์ชันเสริม: เติม / พร้อมพ่วง Timestamp เพื่อป้องกัน Browser แคชรูปเก่า
   */
  const formatPathWithCache = useCallback(
    (path: PathType, defaultImage: string = '/polipharm.png'): string => {
      const cleanPath = formatPath(path, defaultImage);
      if (cleanPath === defaultImage) return cleanPath; // ถ้าเป็นรูป default ไม่ต้องใส่ timestamp ตัวกันแคช

      return `${cleanPath}?t=${new Date().getTime()}`;
    },
    [formatPath]
  );

  return { formatPath, formatPathWithCache };
}
