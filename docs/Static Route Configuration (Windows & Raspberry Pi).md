# **คู่มือการตั้งค่า Static Route (Windows & Raspberry Pi)**

เอกสารสรุปชุดคำสั่งการตั้งค่า Static Route เพื่อเชื่อมต่อระหว่างเครื่อง Windows (วง 192.168.0.x) กับ Raspberry Pi (วง 192.168.50.x) ผ่านเกตเวย์ 192.168.0.3 และ 192.168.50.5

# **สรุปภาพรวมโครงข่าย (Network Overview)**

| ฝั่งการเชื่อมต่อ | เครือข่ายท้องถิ่น (Subnet) | Gateway ชี้ทางออก | อินเทอร์เฟซหลัก |
| :---- | :---- | :---- | :---- |
| **Windows Workstation** | 192.168.0.0/24 | 192.168.0.3 | Ethernet / Wi-Fi |
| **Raspberry Pi** | 192.168.50.0/24 | 192.168.50.5 | Wired connection 1 (eth0) |
| **Pi Internet Route** | 0.0.0.0/0 (Default) | ผ่าน Access Point | Engineer\_5G (wlan0) |

# **1\. การตั้งค่าฝั่ง Windows**

รันคำสั่งทั้งหมดผ่าน **PowerShell (Run as Administrator)**

## **เพิ่ม Static Route แบบถาวร (Persistent Route)**

```
route -p ADD 192.168.50.0 MASK 255.255.255.0 192.168.0.3
```

## **การตรวจสอบการตั้งค่า**

```
route print
```

*หมายเหตุการตรวจสอบ:* ตรวจสอบในส่วน **Persistent Routes** ต้องพบวง 192.168.50.0/24 ชี้ไปยัง Gateway 192.168.0.3

## **คำสั่งลบ Route (กรณีต้องการยกเลิก)**

```
route DELETE 192.168.50.0
```

# **2\. การตั้งค่าฝั่ง Raspberry Pi (Linux / NetworkManager)**

รันคำสั่งทั้งหมดผ่าน **Terminal** ของ Raspberry Pi

## **ขั้นตอนการตั้งค่าด้วย nmcli**

* **ขั้นตอนที่ 1: ตั้งค่าพอร์ตแลน (eth0 / "Wired connection 1")**  
  * ปิดการตั้งค่า Default Gateway อัตโนมัติ เพื่อไม่ให้สายแลนแย่งทางออกอินเทอร์เน็ตหลัก  
  * เพิ่ม Static Route ไปยังวงคอมพิวเตอร์ (192.168.0.0/24) ผ่าน Gateway 192.168.50.5  
  * เพิ่ม Static Route ไปยังวงปลายทาง (192.168.50.0/24) ผ่าน Gateway 192.168.50.5

```
sudo nmcli connection modify "Wired connection 1" ipv4.never-default true
sudo nmcli connection modify "Wired connection 1" +ipv4.routes "192.168.0.0/24 192.168.50.5"
sudo nmcli connection modify "Wired connection 1" +ipv4.routes "192.168.50.0/24 192.168.50.5"
```

* **ขั้นตอนที่ 2: ตั้งค่า Wi-Fi ("Engineer\_5G") เป็น Default Gateway หลัก**

```
sudo nmcli connection modify "Engineer_5G" ipv4.never-default false
```

* **ขั้นตอนที่ 3: รีสตาร์ทการเชื่อมต่อเครือข่ายเพื่อให้ค่าใหม่มีผล**

```
sudo nmcli connection up "Wired connection 1"
sudo nmcli connection up "Engineer_5G"
```

## **คำสั่งลบ Route บน Raspberry Pi (กรณีต้องการยกเลิก)**

```
sudo nmcli connection modify "Wired connection 1" -ipv4.routes "192.168.0.0/24 192.168.50.5"
sudo nmcli connection modify "Wired connection 1" -ipv4.routes "192.168.50.0/24 192.168.50.5"
sudo nmcli connection up "Wired connection 1"
```

# **3\. คำสั่งทดสอบการเชื่อมต่อ (Verification Commands)**

## **ทดสอบบน Raspberry Pi**

* **ตรวจสอบ Routing Table:**

```
ip route
```

*(ผลลัพธ์ที่ถูกต้อง: ต้องพบบรรทัด 192.168.0.0/24 via 192.168.50.5 dev eth0 และ default via ... dev wlan0)*

* **ทดสอบ Ping ไปยังคอมพิวเตอร์ Windows:**

```
ping -c 4 192.168.0.119
```

## **ทดสอบบน Windows**

* **ทดสอบ Ping ไปยัง Raspberry Pi:**

```
ping 192.168.50.101
```

* **ทดสอบเส้นทางการวิ่งของแพ็กเกจ (Traceroute):**

l  
tracert 192.168.50.101