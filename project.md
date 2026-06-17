# 🏛️ สถาปัตยกรรม 3 ระบบบูรณาการข้อมูลอุปกรณ์ (3-System Unified IoT Data Architecture Blueprint)

ระบบบริหารจัดการและจัดสรรข้อมูลสภาพอากาศ **Fahfon-Sense** และสถานีเรดาร์ **Fahfon-River** ได้รับการออกแบบตามหลัก **CQRS (Command Query Responsibility Segregation)** แยกหน้าที่และความรับผิดชอบของระบบเป็น 3 ส่วนหลักอย่างชัดเจน เพื่อประสิทธิภาพสูงสุด (Ultra High Performance), ป้องกันการล่มต่อเนื่อง (Loose Coupling), และรองรับความปลอดภัยระดับองค์กร (Enterprise Security)

---

## 🗺️ ภาพรวมสถาปัตยกรรมระบบเชื่อมโยง (System Architecture Overview)

```mermaid
flowchart TD
    %% Ingestion Layer (ff-preprocess-raw)
    subgraph System1 ["1. Ingestion & Database Sync (ff-preprocess-raw)"]
        CSV["CSV Logs (Ubuntu VM /IoT/FAHFONSENSE/)"]
        Mongo["MongoDB Live (iotRegistedIMEI / iotDeviceInfo)"]
        Worker["Go Ingest Worker (Type-Safe Goroutines)"]
        CSV -->|Tail & Parse 13 Vars| Worker
        Mongo -->|Sync device_registrations every 5m| Worker
    end

    %% Storage Layer (TimescaleDB)
    subgraph Storage ["Shared High-Performance TimescaleDB (10.1.2.19)"]
        DB_Master["device_master (Metadata Cache with UUIDs & AccountID)"]
        DB_Current["fahfon_current (Real-time Telemetry Values)"]
        DB_History["fahfon_current_stat (12-hour/30-day aggregated buckets)"]
        DB_Regis["device_registrations (Mongo synced)"]
        DB_Specs["device_specifications (Mongo synced)"]
    end

    Worker -->|Bulk Insert / Upsert| Storage
    DB_Regis -->|Trigger sync| DB_Master
    DB_Specs -->|Trigger sync| DB_Master

    %% Management Layer (ff-dashboard-mgmt)
    subgraph System2 ["2. Admin Configuration Portal (ff-dashboard-mgmt)"]
        NextUI["Next.js App Router UI (Light Mode)"]
        FiberBE["Fiber v3 Admin API (Port 8081)"]
        NextUI -->|Admin Actions / Edits / Thresholds| FiberBE
        FiberBE -->|Audit Log / Override Status| Storage
    end

    %% Read-Only Consumer Layer (ff-microservice)
    subgraph System3 ["3. Unified Consumer API (ff-microservice - NEW)"]
        DataAPI["Go + pgx Read-Only Endpoint (Port 8082)"]
    end

    Storage ===|Read-Only Queries / Replica| DataAPI

    %% API Gateway Layer
    subgraph Gateway ["Dynamic Gateway (dynamic-gateway-microservice)"]
        CaddyProxy["Caddy Proxy / Router"]
        AuthMid["X-Gateway-Meta / API-Key Authentication"]
        CaddyProxy --> AuthMid
    end

    DataAPI -->|Register Service Route| CaddyProxy

    %% Downstream Projects
    subgraph Consumers ["Downstream Projects (Multi-Project)"]
        ProjA["Project A (Agri Analytics)"]
        ProjB["Project B (Smart City Map)"]
        ProjC["Project C (Disaster Alert)"]
    end

    AuthMid -->|Route JSON| ProjA
    AuthMid -->|Route JSON| ProjB
    AuthMid -->|Route JSON| ProjC
```

---

## ⚙️ ระบบที่ 1: `ff-preprocess-raw` (ตัว Sync และนำเข้าข้อมูลดิบ)

ทำหน้าที่เป็น **Ingest Daemon & Metadata Sync Worker** รันในระดับเบื้องหลัง (Background Service) คอยนำเข้าข้อมูลจากแหล่งภายนอกและบันทึกเขียนข้อมูลลง TimescaleDB

### 1.1 รายละเอียดการทำงานของโมดูลย่อย (Core Modules)
1. **Ingest Worker (`ingest_worker.go`)**:
   * ทำการ Tail สแกนไฟล์ CSV ของอุปกรณ์ 3,000 เครื่อง ที่เพิ่มบรรทัดข้อมูลทุกๆ 5 นาที จากพาธ `/IoT/FAHFONSENSE/[device id]/[YYYY-MM-DD].csv`
   * ใช้ **Goroutines Pipeline (Ingest -> Process -> Store)** และ Go Channels ในการลำเลียงข้อมูลแบบ Non-blocking เพื่อป้องกันปัญหาคอขวดเวลาเขียนฐานข้อมูล (Database Backpressure)
2. **Process Worker (`process_worker.go`)**:
   * แปลงข้อมูลสายสตริงเป็นชนิดข้อมูล Type-safe (Float64 / Integer)
   * **คำนวณฝนสะสม (Rain Accumulation)**: คำนวณค่าปริมาณฝนสะสมรายชั่วโมง (`RainAccHourly`) และปริมาณฝนสะสมรายวัน (`RainDaily`) โดยใช้ Integral คำนวณจากค่า `RainRate` (mm/h) และระยะเวลารอยต่อ
   * ใช้ `sync.Map` แคชสถานะล่าสุดของอุปกรณ์ไว้ในแรมเพื่อจำกัดความผิดปกติ (ป้องกันค่าฝนระเบิดหลังอุปกรณ์ออฟไลน์ไปนาน)
3. **Metadata Sync Worker (`device_sync_worker.go`)**:
   * ทำการเชื่อมต่อดึงเอกสารจาก MongoDB คอลเลกชัน `iotRegistedIMEI` และ `iotDeviceInfo` ทุกๆ 5 นาที
   * บันทึกข้อมูลลงสู่ตารางชั่วคราว `device_registrations` (เก็บ `account_id` ในรูปสตริง และ `email` ของเพจทางการ) และตาราง `device_specifications` ใน PostgreSQL
4. **PostgreSQL Triggers (ตัวรวบรวมข้อมูลระดับ DB)**:
   * เมื่อข้อมูลอัปเดตลง `device_registrations` หรือ `device_specifications` ➡️ Trigger `sync_device_registration_to_master()` จะทำการทำงานอัตโนมัติเพื่อ Upsert (Insert/Update) รวมข้อมูลขึ้นสู่ตารางกลาง **`device_master`** พร้อมสุ่มสร้างรหัส UUID v4 ให้อุปกรณ์ใหม่ทันที

### 1.2 โครงสร้างตารางฐานข้อมูลส่วนนำเข้า (TimescaleDB SQL Schemas)
```sql
-- ตารางรับข้อมูล MongoDB Registrations
CREATE TABLE device_registrations (
    mongo_id VARCHAR(50) PRIMARY KEY,
    account_uuid UUID,
    account_id VARCHAR(100), -- เก็บค่าดิบ Account ID เพจทางการ
    imei VARCHAR(20),
    station VARCHAR(50),
    reg_type VARCHAR(10),
    site VARCHAR(255),
    owner VARCHAR(255),
    email VARCHAR(255), -- อีเมลเพจทางการ
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    interval INTEGER,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ตารางสรุปหลักเพื่อใช้ Join แสดงข้อมูล (Device Master)
CREATE TABLE device_master (
    id SERIAL PRIMARY KEY,
    uuid UUID UNIQUE DEFAULT uuid_generate_v4(), -- สำหรับอ้างอิงระดับสากลและ URL หน้าบ้าน
    mongo_id VARCHAR(50) UNIQUE,
    station VARCHAR(50),
    imei VARCHAR(20),
    owner VARCHAR(255),
    email VARCHAR(255), -- ใช้จัดกลุ่มเพจทางการ
    account_id VARCHAR(100), -- บัญชีผู้ใช้เพจทางการ
    site VARCHAR(255),
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    secret_key TEXT,
    interval INTEGER,
    status VARCHAR(50) DEFAULT 'ACTIVE', -- ACTIVE, OFFLINE, MALFUNCTIONING
    last_seen_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Bangkok'),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🎨 ระบบที่ 2: `ff-dashboard-mgmt` (ระบบเว็บจัดการและการตั้งค่าอุปกรณ์)

ทำหน้าที่เป็น **Admin Configuration Core & Operations Control Center** สำหรับผู้ดูแลระบบตรวจทานสถานะ แก้ไข และจำแนกอุปกรณ์ทั้งหมด

### 2.1 รายละเอียดการทำงานของโมดูลย่อย (Core Modules)
1. **Next.js Web Portal (Light Mode UI)**:
   * พัฒนาด้วย Next.js App Router (Latest version) คุมโทนดีไซน์ด้วย **Premium Stripe Hybrid Light Theme** (การ์ดขาวขอบโค้งมน, มิติไล่ระดับสีอ่อนเงา, เมนูข้างเทาสว่างสะอาดตา)
   * ทำการสืบค้นข้อมูลหมุดอุปกรณ์แบบ dynamic ป้องกัน SSR Crash ด้วยการแปลง Dynamic component กับ Leaflet
   * หน้าหลักแดชบอร์ดมี **Official Page Filter Selector** กรองอุปกรณ์ทั่งหมดในแผนที่และตารางแบบ Reactive ทันทีระดับมิลลิวินาที
   * มีหน้าจอยอดนิยมใหม่ `/dashboard/official-pages` แสดงกลุ่มผู้มีสิทธิ์เพจทางการ จัดการดึงขยายรายชื่ออุปกรณ์ย่อย และเชื่อม CRUD ตรงไปยัง MongoDB
2. **Go Fiber Backend (`ff-dashboard-mgmt/backend`)**:
   * พัฒนาโครงสร้าง Clean Architecture (domain ➡️ usecase ➡️ repository) รันบนพอร์ต `8081`
   * **Concurrent Audit Logger Channel**: รันช่องทางเก็บบันทึกการกระทำความปลอดภัยผ่าน Go Channels ขนาด 10,000 logs ประมวลผลเป็น background thread ทำงานได้รวดเร็วระดับนาโนวินาที ไม่กระตุก Request หลัก
   * **API Endpoint ใหม่**:
     * `GET /api/v1/fahfon-sense/official-pages` ดึงรายชื่อกลุ่มเพจทางการ อีเมล และจำนวนเครื่อง
     * `GET /api/v1/fahfon-sense/devices` รองรับการฟิลเตอร์ดึงข้อมูลตามเมลของสังกัด
     * `PUT /api/v1/fahfon-sense/devices/:station/status` สำหรับแอดมินปลดล็อคสถานะ (Status Override)

### 2.2 โครงสร้างโฟลเดอร์หน้าบ้านและหลังบ้าน (Folder Layout)
```
ff-dashboard-mgmt/
├── backend/                  # โครงสร้าง Clean Architecture
│   ├── cmd/server/main.go    # สตาร์ต REST API พอร์ต 8081 และ Migration
│   ├── internal/
│   │   ├── domain/           # เก็บโครงสร้าง Entity เช่น OfficialPage, FahfonDeviceMaster
│   │   ├── usecase/          # ประมวลผลตรรกะการคัดกรองกลุ่มเพจทางการ
│   │   ├── delivery/http/    # HTTP Controllers (Fiber Handlers)
│   │   └── infrastructure/
│   │       └── database/     # จัดสรร Query ของ Postgres & MongoDB
│   └── Dockerfile
│
└── frontend/                 # แอปพลิเคชัน Next.js
    ├── src/
    │   ├── app/              # Next.js App Router
    │   │   ├── dashboard/
    │   │   │   ├── official-pages/ # [NEW] หน้าจอจัดการและแยกกรุ๊ปเพจทางการ
    │   │   │   ├── page.tsx  # หน้าจอ Dashboard หลักพร้อมตัวกรองเพจทางการ
    │   │   │   └── layout.tsx
    │   │   └── login/
    │   ├── components/
    │   │   ├── UI.tsx        # Premium Light Mode Components (DashboardCard, PageHeader)
    │   │   ├── FahfonMap.tsx # แผนที่แสดงหมุดเซนเซอร์รองรับ Client-side Filter
    │   │   └── Sidebar.tsx   # เมนูหลักสไลด์ด้านข้างเพิ่มลิงก์ Official Pages
    │   └── context/          # Auth Context และ Token Session
    └── Dockerfile
```

---

## 📡 ระบบที่ 3: `ff-microservice` (Unified Consumer API - ระบบตัวกรองข้อมูลกลาง)

เป็น **ระบบจัดสรรและแจกจ่ายข้อมูลดิบและข้อมูลสรุปภายนอก (Read-Only Data Distribution Service)** ออกแบบมาเพื่อเป็นจุดเชื่อมต่อเพียงจุดเดียวให้โปรเจกต์ย่อยอื่นๆ ดึงข้อมูลไปใช้งานได้อย่างเสถียรและปลอดภัยสูงสุด

### 3.1 คุณสมบัติสำคัญของระบบ (Key Features)
1. **CQRS Read Isolation (แยกทราฟฟิกฝั่งอ่าน)**:
   * ทำหน้าที่ดึงข้อมูลอย่างเดียว (Read-Only) ห้ามไม่ให้เขียนหรือแก้ตารางใน TimescaleDB
   * เพื่อความ High Performance สูงสุดในการดึงข้อมูลย้อนหลังของพาร์ทเนอร์ แนะนำให้กำหนด **Connection Pool ให้เชื่อมต่อไปยัง Read Replica (ตู้สำเนาข้อมูลลูก) ของ TimescaleDB** เพื่อไม่ให้คำสั่งคิวรี่จำนวนมหาศาลดึงแรมและหน่วยประมวลผลของ Ingest Worker หลักล่ม
2. **Dynamic Gateway Alignment (เชื่อมเกตเวย์อัจฉริยะ)**:
   * รันเป็น Go Microservice อยู่หลัง **`dynamic-gateway-microservice`**
   * เกตเวย์จะทำหน้าที่ยืนยันสิทธิ์ API Key ➡️ เมื่อแปลงคำร้องสำเร็จ จะทำการส่งแนบข้อมูลเมทาดาต้าของโปรเจกต์นั้นใน Header:
     * `X-Gateway-Meta: {"cityId": "city_chiangmai", "projectId": "project_agriculture"}`
3. **Row-level Security (การกรองความปลอดภัยระดับบรรทัด)**:
   * ตัว `ff-microservice` จะแกะ JSON ใน Header `X-Gateway-Meta` 
   * ทำการจำกัด Query `WHERE email = $1` หรือกรองพิกัดเฉพาะเมืองต้นสังกัดโดยอัตโนมัติ ทำให้ผู้ใช้ปลายทางดึงข้อมูลหลุดไปดูของเมืองอื่นไม่ได้เด็ดขาด ป้องกันปัญหาด้านความปลอดภัยทางข้อมูลของภาครัฐและเอกชน

### 3.2 การออกแบบโครงสร้าง API มาตรฐาน (API Blueprint)

#### 1. ดึงข้อมูลรายชื่ออุปกรณ์ทั้งหมดเฉพาะในสังกัด
* **Endpoint**: `GET /api/v1/iot/devices`
* **สิทธิ์การดึง**: โครงการที่ถือ API Key
* **ตัวอย่างการสืบค้นหลังบ้าน**:
  ```sql
  SELECT uuid, station, imei, site, lat, lng, status 
  FROM device_master 
  WHERE email = $1 -- ดึงอีเมลมาจาก X-Gateway-Meta อัตโนมัติ
  ```
* **Response Payload (Standard JSON)**:
  ```json
  [
    {
      "uuid": "c3e80c6c-0e24-4f01-9f93-018f6f59c882",
      "station": "เทศบาลตำบลต้นธง",
      "imei": "864201938502938",
      "site": "สวนเกษตรอินทรีย์ต้นธง",
      "coordinates": {
        "lat": 18.5721,
        "lng": 99.0023
      },
      "status": "ACTIVE"
    }
  ]
  ```

#### 2. ดึงข้อมูลพารามิเตอร์เซนเซอร์ล่าสุดเรียลไทม์
* **Endpoint**: `GET /api/v1/iot/devices/:uuid/telemetry`
* **Response Payload (Standard JSON)**:
  ```json
  {
    "device_uuid": "c3e80c6c-0e24-4f01-9f93-018f6f59c882",
    "timestamp_utc": "2026-05-28T14:15:00Z",
    "metrics": {
      "temperature_celsius": 32.40,
      "humidity_percentage": 60.00,
      "pressure_hpa": 1008.20,
      "rain_rate_mm_h": 0.00,
      "pm25_ug_m3": 12.00,
      "wind_speed_m_s": 1.20,
      "battery_voltage": 4.12
    }
  }
  ```

#### 3. ดึงข้อมูลประวัติย้อนหลังแบบ Bucket
* **Endpoint**: `GET /api/v1/iot/devices/:uuid/history?range=daily`
* **สืบค้นข้อมูลย้อนหลัง**: เชื่อมต่อดึงข้อมูลที่จัดทำเฉลี่ยไว้แล้วในตาราง **`fahfon_current_stat`** เรียงตามเวลา ทำให้โหลดกราฟได้อย่างรวดเร็ว

### 3.3 แผนโครงสร้างโฟลเดอร์ของ `ff-microservice` (New Project Layout)
```
ff-microservice/
├── cmd/
│   └── api/
│       └── main.go           # จุดรันไมโครเซอร์วิสพอร์ต 8082 เชื่อมต่อ Timescale Read-Replica
├── internal/
│   ├── domain/
│   │   └── iot.go            # โครงสร้าง Schema, JSON และอินเตอร์เฟส
│   ├── usecase/
│   │   └── iot_usecase.go    # จัดการคัดกรอง Row-Level Security จาก X-Gateway-Meta Header
│   ├── repository/
│   │   └── pg_repo.go        # คำสั่งสืบค้น SQL (Read-Only) ออกแบบคิวรี่ให้ทำงานได้ไวที่สุด
│   └── delivery/
│       └── http/
│           ├── handler.go    # Fiber Controllers สำหรับดึงข้อมูล API 
│           └── middleware/   # ดักจับและแกะค่า JSON จาก Dynamic Gateway Header
├── go.mod
├── go.sum
└── Dockerfile
```

---

## 📈 แผนการทดสอบและเพิ่มประสิทธิภาพความเร็ว (Ultimate Performance & Security Rules)

1. **การใช้งาน Database Connection Pool**:
   * ทั้งใน **ระบบที่ 1, 2, และ 3** ต้องกำหนดค่า `MaxConns` และ `MinConns` ใน `pgxpool.Config` ให้สอดคล้องกับขนาดของเซนเซอร์ เพื่อไม่ให้เกิดข้อผิดพลาดการจองแรมจนล้น (Prevent Memory Leak)
2. **การทำดัชนีคอลัมน์ (Index Optimization)**:
   * ต้องทำ Index ในตาราง Timescale `device_master` สำหรับคอลัมน์ `uuid`, `imei`, `email`, และ `account_id` เพื่อให้คำสั่งสืบค้น SQL ของ API ข้อมูล และ Dashboard ทำงานได้เสร็จภายใน **<5 มิลลิวินาที**
3. **การรักษาความปลอดภัย (Dynamic Firewall Boundaries)**:
   * **ระบบที่ 1 และ 2** จำกัดสิทธิ์การเข้าถึงให้อยู่เฉพาะในเครือข่ายภายในขององค์กร หรือจำกัดสิทธิ์เฉพาะแอดมิน
   * **ระบบที่ 3** เปิดเผยออกสู่ภายนอกผ่าน Dynamic Gateway เท่านั้น และทำการดักเช็ค Token ในระบบ Middleware ทุกครั้ง

---

## 🔑 ข้อมูลบัญชีผู้ใช้งานและการเชื่อมต่อ (System Credentials & Connections)

รายละเอียดบัญชีการใช้งานและคอนฟิกูเรชันสำหรับการพัฒนาระบบและการดูแลระบบ:

### 1. บัญชีผู้ดูแลระบบแดชบอร์ดหลังบ้าน (Admin Configuration Portal Login)
* **URL (Local)**: `http://localhost:3000/login`
* **Username**: `superadmin`
* **Password**: `admin1234`
* **Email**: `superadmin@fahfon.io`
* **Role**: `SuperAdmin` (มีสิทธิ์สูงสุดในการจัดการเครื่อง จัดการผู้ใช้ และสืบค้น Log)

### 2. บัญชีการเชื่อมต่อฐานข้อมูลส่วนกลาง (Shared TimescaleDB Connection)
* **Host**: `10.1.2.19`
* **Port**: `5433`
* **User**: `fahfon-data`
* **Password**: `wnXL1ECKzCPM4STH14a2uWJJWxxChQT8`
* **Database**: `fahfon_iot`
* **Connection String (PostgreSQL)**:
  `postgres://fahfon-data:wnXL1ECKzCPM4STH14a2uWJJWxxChQT8@10.1.2.19:5433/fahfon_iot?sslmode=disable&TimeZone=Asia/Bangkok`

### 3. บัญชีการเชื่อมต่อแคตตาล็อกอุปกรณ์ (MongoDB Connection)
* **URI (MongoDB)**:
  `mongodb://devApp0:Dev%40pp0@www.regis.fahfon.info:27017/userProfile?serverSelectionTimeoutMS=5000&connectTimeoutMS=10000&authSource=admin&authMechanism=SCRAM-SHA-1&maxTransactionLockRequestTimeoutMillis=2000`
* **Database**: `userProfile`
* **User**: `devApp0`
* **Password**: `Dev@pp0`

