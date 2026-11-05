import axios from "axios";

// กำหนดรูปแบบของ options ที่ใช้ในการจัดการ error ตาม status code
export interface FetchErrorOptions {
  error: unknown;                                     // ข้อมูล error ที่เกิดขึ้น
  onBadRequest?: (error: unknown) => void;            // 400 - คำขอไม่ถูกต้อง
  onUnauthorized?: (error: unknown) => void;          // 401 - ไม่มีสิทธิ์เข้าถึง (ยังไม่ login หรือ token หมดอายุ)
  onForbidden?: (error: unknown) => void;             // 403 - ถูกปฏิเสธสิทธิ์
  onNotFound?: (error: unknown) => void;              // 404 - ไม่พบ resource
  onMethodNotAllowed?: (error: unknown) => void;      // 405 - method นี้ไม่อนุญาต
  onConflict?: (error: unknown) => void;              // 409 - ข้อมูลขัดแย้ง (เช่น username ซ้ำ)
  onGone?: (error: unknown) => void;                  // 410 - resource ถูกลบหรือไม่ให้ใช้งานแล้ว
  onUnprocessableEntity?: (error: unknown) => void;   // 422 - ข้อมูลถูกต้องตามรูปแบบ แต่ไม่สามารถประมวลผลได้
  onTooManyRequests?: (error: unknown) => void;       // 429 - ส่ง request มากเกินไป (rate limit)
  onInternalServerError?: (error: unknown) => void;   // 500 - เซิร์ฟเวอร์มีปัญหาภายใน
  onBadGateway?: (error: unknown) => void;            // 502 - เกตเวย์รับข้อมูลผิดพลาดจาก upstream
  onServiceUnavailable?: (error: unknown) => void;    // 503 - เซิร์ฟเวอร์ไม่พร้อมให้บริการ
  onGatewayTimeout?: (error: unknown) => void;        // 504 - รอ upstream นานเกินไป
  onOtherError?: (error: unknown) => void;            // กรณีอื่น ๆ ที่ไม่อยู่ในรายการด้านบน
}

// ฟังก์ชันสำหรับตรวจสอบ error และเรียก callback ตาม status code
export const parseFetchError = (options: FetchErrorOptions) => {
  const {
    error,
    onBadRequest,
    onUnauthorized,
    onForbidden,
    onNotFound,
    onMethodNotAllowed,
    onConflict,
    onGone,
    onUnprocessableEntity,
    onTooManyRequests,
    onInternalServerError,
    onBadGateway,
    onServiceUnavailable,
    onGatewayTimeout,
    onOtherError
  } = options;

  console.error("API request error:", error); // log error ไว้ debug

  // ถ้าไม่ใช่ error ที่มาจาก axios ให้ไปที่ onOtherError
  if (!axios.isAxiosError(error)) {
    return onOtherError?.(error);
  }

  // ดึง status code จาก response
  const statusCode = error.response?.status;

  // ตรวจสอบ status code และเรียก callback ที่ตรงกัน
  switch (statusCode) {
    case 400: return onBadRequest?.(error);
    case 401: return onUnauthorized?.(error);
    case 403: return onForbidden?.(error);
    case 404: return onNotFound?.(error);
    case 405: return onMethodNotAllowed?.(error);
    case 409: return onConflict?.(error);
    case 410: return onGone?.(error);
    case 422: return onUnprocessableEntity?.(error);
    case 429: return onTooManyRequests?.(error);
    case 500: return onInternalServerError?.(error);
    case 502: return onBadGateway?.(error);
    case 503: return onServiceUnavailable?.(error);
    case 504: return onGatewayTimeout?.(error);
    default:  return onOtherError?.(error); // ถ้าไม่ตรงกับ case ไหนเลย
  }
};
