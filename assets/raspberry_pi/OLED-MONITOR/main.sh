#!/bin/bash

# ─── หาตำแหน่งโฟลเดอร์ที่สคริปต์นี้สิงอยู่อัตโนมัติ (Dynamic Path) ─────────────
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ─── ตั้งค่า encoding ให้ terminal และ Python รองรับภาษาไทย UTF-8 ──────────
export LANG=C.UTF-8
export LC_ALL=C.UTF-8
export PYTHONIOENCODING=utf-8

cd "$APP_DIR" || { echo "[ERROR] ไม่พบโฟลเดอร์ $APP_DIR"; exit 1; }

# ตรวจสอบการมีอยู่ของ venv
if [ -f "$APP_DIR/.venv/bin/activate" ]; then
    source "$APP_DIR/.venv/bin/activate"
else
    echo "[ERROR] ไม่พบ Virtual Environment ใน $APP_DIR/.venv"
    exit 1
fi

echo "======================================================"
echo "  [BOOT] เริ่มโปรแกรมหลัก..."
echo "  [PATH] $APP_DIR"
echo "  [USER] $USER"
echo "======================================================"

# ─── วนลูปเปิดโปรแกรมหลัก ─────────────────────────────────────────────────
while true; do
    python3 -u "$APP_DIR/main.py"
    EXIT_CODE=$?

    echo ""
    echo "[INFO] main.py จบด้วย Exit Code: $EXIT_CODE"

    # Exit Code 3 = ระบบต้องการรีสตาร์ท (เช่น อัปเดตเสร็จสิ้น หรือกดสั่งรีบูต)
    if [ "$EXIT_CODE" -eq 3 ]; then
        echo "[INFO] กำลัง Restart..."
        sleep 1
    else
        # Exit Code อื่น (0 = ปิดปกติ, 1 = error) → ออกจาก loop
        echo "[INFO] ปิดโปรแกรม (Exit Code: $EXIT_CODE)"
        break
    fi
done