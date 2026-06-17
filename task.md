# 📋 แผนงานและเช็คลิสต์การทำงานย่อย (Sub-Task Checklist)

เอกสารนี้ใช้สำหรับติดตามความคืบหน้าการพัฒนาการแยกระบบข้อมูลภายใน (Raw Telemetry) และภายนอก (Purified Telemetry) ผ่าน **Postgres + Redis Cache** เพื่อการทำงานที่ต่อเนื่องและสามารถส่งต่อ/ทำงานต่อได้ทันที

---

## 🚀 แผนงานและสถานะรายเฟส (Implementation Status)

- [x] **เฟสที่ 1: โครงสร้างพื้นฐานและการเชื่อมต่อ Redis (Redis & Infrastructure Setup)**
  - [x] 1.1 ตรวจสอบและตั้งค่า Redis Server ในสภาพแวดล้อมระบบ (Local หรือ Docker)
  - [x] 1.2 ติดตั้ง Redis Go Client (`go-redis/v9`) ใน Backend ของ `ff-dashboard-mgmt`
  - [x] 1.3 ออกแบบและทดสอบโครงสร้างคีย์ (Key Schema) ใน Redis สำหรับระบบภายในและภายนอก
    * คีย์ภายใน: `raw_telemetry:device_uuid` (เก็บดิบ 100%)
    * คีย์ภายนอก (ถ้าทำพรีแคช): `purified_telemetry:device_uuid`
    * ช่องสัญญาณ Pub/Sub: `device:updates:raw` และ `device:updates:purified`

- [x] **เฟสที่ 2: อัปเกรดระบบนำเข้าข้อมูล (`ff-preprocess-raw` Ingest Daemon)**
  - [x] 2.1 แก้ไข Ingest Worker ให้เขียนข้อมูลประวัติดิบลง Postgres (TimescaleDB) ตามปกติ
  - [x] 2.2 เพิ่มตรรกะใน Ingest/Process Usecase ให้ทำการแปลงข้อมูลสดเป็น JSON และ Upsert ลง Redis LKV Cache (`raw_telemetry:device_id`)
  - [x] 2.3 เพิ่มคำสั่งสั่ง Publish สัญญาณผ่าน Redis Pub/Sub ไปยังชาแนล `device:updates:raw` ทุกครั้งที่มีข้อมูลใหม่จาก CSV

- [x] **เฟสที่ 3: ระบบหลังบ้านภายในความเร็วสูง (`ff-dashboard-mgmt/backend` - Go Fiber)**
  - [x] 3.1 ปรับปรุง API `GET /api/v1/fahfon-sense/devices` ให้สืบค้นข้อมูลเรียลไทม์ผ่าน **Redis Cache** ก่อน (ถ้า Cache Miss ค่อยสืบค้น Postgres)
  - [x] 3.2 สร้าง Endpoint WebSockets `/ws/v1/telemetry/raw` สำหรับแอดมิน เพื่อส่งต่อข้อมูลดิบโดยดึงจาก Redis Pub/Sub ไปอัปเดตหน้าจอทันทีแบบ Reactive
  - [x] 3.3 ปรับปรุงระบบหน้าบ้าน Next.js ให้เชื่อมต่อ WebSocket และทำ Reactive UI Rendering เปลี่ยนแปลงข้อมูลเฉพาะแถวที่สถานีขยับ

- [x] **เฟสที่ 4: พัฒนาและแยกระบบภายนอกความปลอดภัยสูง (`ff-microservice`)**
  - [x] 4.1 สร้างฟังก์ชัน **Data Purification Pipeline** ในไมโครเซอร์วิส:
    * ล้างข้อมูลเสีย: เปลี่ยนค่าติดลบชำรุด (เช่น `-999.00`) ให้เป็น `null`
    * ปกปิดฮาร์ดแวร์: นำฟิลด์ `IMEI` และ `secret_key` ออกจาก JSON ตอบกลับภายนอก
  - [x] 4.2 สร้าง Endpoint `GET /api/v1/iot/devices/:uuid/telemetry` ดึงข้อมูลด่วนจาก Redis LKV แล้วผ่านกรอง Purification
  - [x] 4.3 พัฒนา WebSocket / SSE Endpoint สำหรับภายนอก โดยเชื่อมต่อช่องสัญญาณกรอง `device:updates:purified` (หรือผสาน API-Key RLS)
  - [x] 4.4 เชื่อมต่อ Row-Level Security (RLS) บังคับกรองตาม `email` ที่มาจาก Dynamic Gateway Header

- [x] **เฟสที่ 5: การทดสอบและการส่งมอบระบบ (Testing & Verification)**
  - [x] 5.1 ทดสอบการเรียกดูข้อมูลจากระบบภายใน (แอดมินต้องเห็นข้อมูลดิบทั้งหมดรวมถึง IMEI และค่าเสียอย่างรวดเร็ว)
  - [x] 5.2 ทดสอบการเรียกดูข้อมูลจากระบบภายนอกผ่าน Gateway (ข้อมูลต้องถูกกรองบริสุทธิ์ ไม่มี IMEI หลุด และค่าเสียถูกสลับเป็น null)
  - [x] 5.3 ทดสอบการจำลองเหตุการณ์ CSV อัปเดต และเฝ้าดูหน้าจอตารางปรับปรุงสถานะแบบ Real-time โดยไร้รอยต่อ

---

## 📝 บันทึกความคืบหน้าการทำงาน (Activity Logs)
*(ส่วนนี้จะอัปเดตความสำเร็จอย่างต่อเนื่อง)*

* **30 พฤษภาคม 2569 (18:00น.)** - ออกแบบแผนการและโครงสร้างฐานข้อมูลเสร็จสิ้น ได้รับความเห็นชอบเรื่องการแยก Domain ข้อมูลและการผสาน Redis Cache ทั้งฝั่งภายในและภายนอก
