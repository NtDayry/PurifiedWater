-- =============================================================================
-- DROP TABLES (สำหรับการพัฒนาและทดสอบ)
-- หมายเหตุ: คำสั่ง DROP TABLE นี้ถูกคอมเมนต์ไว้เพื่อป้องกันการลบข้อมูลโดยไม่ตั้งใจในสภาพแวดล้อมจริง
-- =============================================================================
-- DROP TABLE IF EXISTS scan_ocr_lines;
-- DROP TABLE IF EXISTS scan_defects;
-- DROP TABLE IF EXISTS scan_timings;
-- DROP TABLE IF EXISTS scan_results;
-- DROP TABLE IF EXISTS lots;


-- =============================================================================
-- DATABASE SCHEMA CONFIGURATION
-- ระบบจัดการข้อมูลการตรวจสอบ (Inspection) และระบบจัดการสิทธิ์ (RBAC)
-- =============================================================================

-- เปิดใช้งาน Extension สำหรับการค้นหาข้อความแบบคล้ายคลึง (Fuzzy Search / Like)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =============================================================================
-- SECTION 1: BUSINESS DATA TABLES (ข้อมูลกระบวนการตรวจสอบ)
-- =============================================================================

---
-- 1. ตารางหลักสำหรับเก็บข้อมูลล็อตสินค้า
---
CREATE TABLE lots (
    id         SERIAL PRIMARY KEY,
    lot        VARCHAR(100) NOT NULL UNIQUE, -- หมายเลขล็อต ห้ามซ้ำ
    mfg        VARCHAR(20),                 -- วันผลิต (Manufacturing Date)
    exp        VARCHAR(20),                 -- วันหมดอายุ (Expiry Date)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE lots IS 'ข้อมูลหลักของล็อตสินค้าที่เข้าสู่กระบวนการตรวจสอบ';
COMMENT ON COLUMN lots.lot IS 'รหัสหรือหมายเลขล็อตสินค้า (Unique)';

---
-- 2. ตารางเก็บผลลัพธ์การสแกนหลัก (Main Scan Event)
---
CREATE TABLE scan_results (
    id         SERIAL PRIMARY KEY,
    lot_id     INT NOT NULL REFERENCES lots(id) ON DELETE CASCADE, -- ผูกกับตารางแม่ lots
    scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),                 -- เวลาที่เกิดการสแกน
    engine     VARCHAR(50) NOT NULL,                               -- โปรแกรม/โมเดลที่ใช้ประมวลผล
    is_valid   BOOLEAN NOT NULL,                                   -- ผลลัพธ์ผ่านหรือไม่ผ่าน (Pass/Fail)
    image_path TEXT                                                -- ที่อยู่ไฟล์ภาพที่ใช้สแกน
);

COMMENT ON TABLE scan_results IS 'ประวัติผลการบันทึกการสแกนหลักของแต่ละล็อต';

---
-- 3. ตารางเก็บข้อมูลเวลาประมวลผล (Performance Metrics) - สัมพันธ์แบบ 1:1 กับ scan_results
---
CREATE TABLE scan_timings (
    id             SERIAL PRIMARY KEY,
    scan_id        INT NOT NULL UNIQUE REFERENCES scan_results(id) ON DELETE CASCADE, -- สิทธิ์ 1:1 ด้วย UNIQUE
    prepare_ms     NUMERIC(10,2), -- เวลาเตรียมภาพ (มิลลิวินาที)
    yolo_ms        NUMERIC(10,2), -- เวลาตรวจจับวัตถุทรงกลม/กล่อง (มิลลิวินาที)
    ocr_ms         NUMERIC(10,2), -- เวลาแกะตัวอักษร (มิลลิวินาที)
    postprocess_ms NUMERIC(10,2), -- เวลาจัดฟอร์แมตข้อมูลขั้นสุดท้าย (มิลลิวินาที)
    total_ms       NUMERIC(10,2)  -- เวลารวมทั้งหมดในการประมวลผล (มิลลิวินาที)
);

COMMENT ON TABLE scan_timings IS 'ข้อมูลเวลาที่ใช้ประมวลผลของ AI ในแต่ละขั้นตอน (มิลลิวินาที)';

---
-- 4. ตารางเก็บข้อมูลตำหนิหรือจุดบกพร่องที่ตรวจเจอ (Defects Detected)
---
CREATE TABLE scan_defects (
    id         SERIAL PRIMARY KEY,
    scan_id    INT NOT NULL REFERENCES scan_results(id) ON DELETE CASCADE,
    class_name VARCHAR(50) NOT NULL,    -- ประเภทของข้อผิดพลาด/คลาสที่ AI เจอ
    confidence NUMERIC(5,2) NOT NULL,   -- ค่าความเชื่อมั่น (0.00 - 100.00)
    box_x1     NUMERIC(10,4),           -- พิกัดกล่องข้อผิดพลาด (Bounding Box)
    box_y1     NUMERIC(10,4),
    box_x2     NUMERIC(10,4),
    box_y2     NUMERIC(10,4)
);

COMMENT ON TABLE scan_defects IS 'รายการจุดบกพร่อง/สิ่งเจือปนที่ตรวจพบโดย AI';

---
-- 5. ตารางเก็บข้อมูลตัวอักษรที่แกะได้ผ่าน OCR รายบรรทัด
---
CREATE TABLE scan_ocr_lines (
    id          SERIAL PRIMARY KEY,
    scan_id     INT NOT NULL REFERENCES scan_results(id) ON DELETE CASCADE,
    field_key   VARCHAR(20) NOT NULL,  -- คีย์ระบุประเภทข้อมูล เช่น LOT, MFG, EXP
    text        VARCHAR(255) NOT NULL, -- ข้อความที่อ่านได้จากภาพ
    confidence  NUMERIC(5,2) NOT NULL, -- ค่าความแม่นยำในการแกะตัวอักษร
    rect_x      INT,                   -- พิกัดกล่องข้อความบรรทัดนั้นๆ
    rect_y      INT,
    rect_width  INT,
    rect_height INT
);

COMMENT ON TABLE scan_ocr_lines IS 'ข้อความที่อ่านได้และค่าความมั่นใจจากการทำ OCR แยกรายฟิลด์';


-- =============================================================================
-- SECTION 2: ACCESS CONTROL TABLES (ระบบจัดการผู้ใช้และสิทธิ์ - RBAC)
-- =============================================================================

---
-- 6. ตารางบทบาทผู้ใช้งาน (Roles)
---
CREATE TABLE roles (
    role_id        SERIAL PRIMARY KEY,
    role_name      VARCHAR(50) NOT NULL UNIQUE,       -- ชื่อบทบาท เช่น admin, operator
    description    TEXT,                             -- อธิบายขอบเขตงานของ Role
    is_full_access BOOLEAN NOT NULL DEFAULT FALSE     -- แฟล็กพิเศษสำหรับ Super Admin (ข้ามขั้นตอนเช็ก Permission)
);

COMMENT ON TABLE roles IS 'ตารางกำหนดกลุ่มบทบาทในการเข้าถึงระบบ';
COMMENT ON COLUMN roles.is_full_access IS 'TRUE = สิทธิ์สูงสุด (Super Admin ทำได้ทุกอย่าง), FALSE = ตรวจสิทธิ์ตามสิทธิ์ย่อยในตาราง mapping';

---
-- 7. ตารางสิทธิ์การใช้งาน (Permissions Registry)
---
CREATE TABLE permissions (
    permission_id   SERIAL PRIMARY KEY,
    permission_key  VARCHAR(50) NOT NULL UNIQUE, -- คีย์สำหรับเช็กในโค้ด เช่น read:lots, edit_user
    description     TEXT                         -- อธิบายหน้าที่ของสิทธิ์นี้
);

COMMENT ON TABLE permissions IS 'ทะเบียนรายการสิทธิ์ย่อยทั้งหมดภายในระบบ';

---
-- 8. ตารางข้อมูลผู้ใช้งาน (Users)
---
CREATE TABLE users (
    user_id              SERIAL PRIMARY KEY,
    registered_date      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, -- วันที่สมัครสมาชิก
    fullname             VARCHAR(100) NOT NULL,                        -- ชื่อ-นามสกุลจริง
    username             VARCHAR(50) NOT NULL UNIQUE,                  -- ชื่อเข้าระบบ ห้ามซ้ำ
    password             VARCHAR(100) NOT NULL,                        -- รหัสผ่าน (ต้องผ่านการ Hash)
    department           VARCHAR(100),                                 -- แผนก/ฝ่าย
    profile_image        VARCHAR(100),                                 -- พาธรูปโปรไฟล์
    role                 VARCHAR(50) NOT NULL DEFAULT 'viewer',        -- ผูกกับชื่อบทบาทในตาราง roles
    status               VARCHAR(20) NOT NULL DEFAULT 'pending'        -- สถานะผู้ใช้งาน
        CHECK (status IN ('active', 'pending', 'blocked')),
    password_changed_at  TIMESTAMP,                                    -- วันที่แก้ไขรหัสผ่านล่าสุด
    token_version        VARCHAR(255),                                 -- ควบคุมและทำลาย JWT Token เมื่อล็อกเอาต์หรือเปลี่ยนสิทธิ์
    sign_in_attempts     INTEGER NOT NULL DEFAULT 0,                   -- จำนวนครั้งที่คีย์รหัสผิดต่อเนื่อง
    last_sign_in_attempt TIMESTAMP,                                    -- เวลาที่พยายามล็อกอินล่าสุด
    updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,          -- เวลาอัปเดตข้อมูลผู้ใช้ล่าสุด

    -- ความสัมพันธ์: ล็อกข้อมูลคอลัมน์ role ให้ต้องตรงกับตาราง roles(role_name)
    CONSTRAINT fk_users_roles
        FOREIGN KEY (role)
        REFERENCES roles(role_name)
        ON UPDATE CASCADE   -- ถ้าชื่อบทบาทต้นทางเปลี่ยน ให้ปรับตามอัตโนมัติ
        ON DELETE RESTRICT  -- ห้ามลบบทบาทหากยังมีพนักงานผูกกับบทบาทนั้นอยู่ (แนะนำเปลี่ยนจาก CASCADE เป็น RESTRICT เพื่อความปลอดภัยสูงสุด)
);

COMMENT ON TABLE users IS 'ข้อมูลบัญชีผู้ใช้งานระบบและประวัติการเข้าใช้งานความปลอดภัย';

---
-- 9. ตารางแมปความสัมพันธ์ระหว่างบทบาทและสิทธิ์ย่อย (Junction Table: Many-to-Many)
---
CREATE TABLE role_permissions (
    role_id       INTEGER NOT NULL,
    permission_id INTEGER NOT NULL,

    -- ตั้ง Composite Primary Key ร่วมกัน เพื่อล็อกให้ 1 บทบาท ห้ามมีสิทธิ์ซ้ำเดิม และช่วยปลดล็อก UI บนเครื่องมือบริหาร DB
    PRIMARY KEY (role_id, permission_id),

    CONSTRAINT fk_role_permissions_role
        FOREIGN KEY (role_id)
        REFERENCES roles(role_id)
        ON UPDATE RESTRICT
        ON DELETE CASCADE, -- หากลบบทบาท ให้ล้างสิทธิ์ที่ผูกไว้ทิ้งทันที

    CONSTRAINT fk_role_permissions_permission
        FOREIGN KEY (permission_id)
        REFERENCES permissions(permission_id)
        ON UPDATE RESTRICT
        ON DELETE CASCADE  -- หากลบตัวสิทธิ์หลัก ให้ล้างสิทธิ์ที่ผูกไว้กับทุกกลุ่มทิ้งทันที
);

COMMENT ON TABLE role_permissions IS 'ตารางจับคู่ความสัมพันธ์แบบกลุ่มว่าบทบาทใดสามารถทำสิ่งใดได้บ้าง';


-- =============================================================================
-- SECTION 3: SYSTEM AUDITING TABLES (ระบบบันทึก Log การทำงาน)
-- =============================================================================

---
-- 10. ตารางเก็บบันทึกประวัติการเปลี่ยนแปลงข้อมูลเชิงลึก (Audit Trail Logs)
---
CREATE TABLE audit_logs (
    id                   SERIAL PRIMARY KEY,
    created_at           TIMESTAMPTZ DEFAULT NOW(),  -- เวลาเกิดเหตุการณ์
    user_id              INTEGER,                  -- ID ผู้ทำรายการ
    username             VARCHAR(50),              -- ชื่อผู้ทำรายการ (เผื่อยกร่างเพื่ออ่านล็อกง่ายขึ้น)
    action               VARCHAR(50),              -- พฤติกรรม เช่น INSERT, UPDATE, DELETE, LOGIN
    entity               VARCHAR(100),             -- ชื่อตารางหรือโมดูลที่ถูกกระทำ เช่น users, lots
    entity_id            VARCHAR(50),              -- ID ข้อมูลที่โดนเปลี่ยน (เก็บเป็น string เพื่อความยืดหยุ่น)
    old_data             JSONB,                    -- ข้อมูล "ก่อน" แก้ไข (จัดเก็บเป็นวัตถุ JSON โครงสร้างค้นหาง่าย)
    new_data             JSONB,                    -- ข้อมูล "หลัง" แก้ไข
    ip_address           VARCHAR(45),              -- IP ของผู้ยิงคำสั่ง (รองรับ IPv4 และ IPv6ความยาวสูงสุด 45)
    user_agent           TEXT                      -- โปรแกรมหรือเว็บเบราว์เซอร์ที่ผู้ใช้ใช้เข้ามาระบบ
);

COMMENT ON TABLE audit_logs IS 'ประวัติบันทึกกิจกรรมและการแก้ไขข้อมูลสำคัญในระบบ (สำหรับใช้สืบสวนย้อนหลัง)';


-- =============================================================================
-- SECTION 4: INDEXES DEFINITIONS (การเพิ่มประสิทธิภาพความเร็วการทำงาน)
-- =============================================================================

-- ดัชนีกลุ่มข้อมูลหลัก (ช่วยให้หน้าค้นหาข้อมูลล็อต / แดชบอร์ดทำงานเร็วขึ้นเยอะ)
CREATE INDEX idx_lots_lot                   ON lots(lot);
CREATE INDEX idx_lots_mfg_trgm              ON lots USING GIN (mfg gin_trgm_ops); -- ค้นหา MFG แบบคำบางส่วน (LIKE '%..%')
CREATE INDEX idx_lots_exp_trgm              ON lots USING GIN (exp gin_trgm_ops); -- ค้นหา EXP แบบคำบางส่วน

-- ดัชนีกลุ่มผลการตรวจสอบ
CREATE INDEX idx_scan_results_lot_id        ON scan_results(lot_id);
CREATE INDEX idx_scan_results_scanned_at    ON scan_results(scanned_at DESC);     -- สำหรับจัดเรียงแสดงผลล่าสุดในตารางหน้าแรก
CREATE INDEX idx_scan_results_is_valid      ON scan_results(is_valid);           -- ดึงเฉพาะก้อนที่เป็น Fail ไปทำสถิติแดชบอร์ด
CREATE INDEX idx_scan_results_lot_date      ON scan_results(lot_id, scanned_at DESC); -- Composite Index ดึงสรุปประวัติสแกนเฉพาะของล็อตนั้นแบบไวที่สุด

CREATE INDEX idx_scan_timings_scan_id       ON scan_timings(scan_id);
CREATE INDEX idx_scan_timings_total_ms      ON scan_timings(total_ms);           -- ตรวจสอบ AI ที่ทำงานผิดปกติช้าเกินเกณฑ์

CREATE INDEX idx_scan_defects_scan_id       ON scan_defects(scan_id);
CREATE INDEX idx_scan_defects_class_name    ON scan_defects(class_name);         -- นับสถิติสรุปว่าเจอตำหนิชนิดไหนมากที่สุดในโรงงาน

CREATE INDEX idx_scan_ocr_lines_scan_id     ON scan_ocr_lines(scan_id);
CREATE INDEX idx_scan_ocr_lines_field_key   ON scan_ocr_lines(field_key);

-- ดัชนีกลุ่มระบบผู้ใช้และสิทธิ์
CREATE INDEX idx_users_role                 ON users(role);
CREATE INDEX idx_users_fullname_trgm        ON users USING GIN (fullname gin_trgm_ops);   -- พิมพ์ค้นหาชื่อพนักงานแบบไวๆ
CREATE INDEX idx_users_username_trgm        ON users USING GIN (username gin_trgm_ops);   -- เช็กตรวจสอบสิทธิ์บัญชี
CREATE INDEX idx_users_department_trgm      ON users USING GIN (department gin_trgm_ops); -- กรองตามแผนก

CREATE INDEX idx_role_permissions_perm_id   ON role_permissions(permission_id); -- สำหรับการสืบค้นย้อนกลับว่ามีใครถือครองสิทธิ์ตัวนี้บ้าง