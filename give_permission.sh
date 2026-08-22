#!/bin/bash

TARGET="$HOME/PurifiedWater"

if [ ! -d "$TARGET" ]; then
    echo "ไม่พบโฟลเดอร์: $TARGET"
    exit 1
fi

echo "กำลังเปิดสิทธิ์ 777 ให้ $TARGET และไฟล์/โฟลเดอร์ย่อยทั้งหมด..."

sudo chmod -R 777 "$TARGET"

if [ $? -eq 0 ]; then
    echo "เปิดสิทธิ์เรียบร้อยแล้ว"
else
    echo "เกิดข้อผิดพลาด"
    exit 1
fi