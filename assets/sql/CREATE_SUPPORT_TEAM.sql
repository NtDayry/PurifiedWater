-- 1. สร้างตาราง support_team บน PostgreSQL
CREATE TABLE IF NOT EXISTS support_team (
    id SERIAL PRIMARY KEY,                         -- รันเลข ID อัตโนมัติ
    name VARCHAR(150) NOT NULL,                    -- ชื่อ-นามสกุลภาษาไทย
    name_en VARCHAR(150) NOT NULL,                 -- ชื่อ-นามสกุลภาษาอังกฤษ
    role VARCHAR(100) NOT NULL,                     -- บทบาท/ตำแหน่งภาษาไทย
    role_en VARCHAR(100) NOT NULL,                  -- บทบาท/ตำแหน่งภาษาอังกฤษ
    created_at TIMESTAMPTZ DEFAULT NOW(),          -- วันที่สร้าง (บันทึกโซนเวลาด้วย)
    updated_at TIMESTAMPTZ DEFAULT NOW()           -- วันที่อัปเดตล่าสุด
);

-- 2. เพิ่มข้อมูลทีมวิศวกรรม (Insert Members)
INSERT INTO support_team (name, name_en, role, role_en) VALUES
('รัตนโชติ มงคลลิขิต', 'Rattanachot Mongkollikit', 'หัวหน้าโครงการ', 'Project Manager'),
('ราเชน หมอเมือง', 'Rachen Momuang', 'หัวหน้าทีมวิศวกรรม', 'Engineering Team Lead'),
('ภิญโญ แสงทินทอง', 'Pinyo Saengthinthong', 'ผู้ช่วยหัวหน้าทีมวิศวกรรม', 'Assistant Engineering Team Lead'),
('ณัฐพล พรดอนก่อ', 'Nattapon Pondonko', 'ผู้จัดทำระบบ', 'System Developer'),
('รัตน์ตกูล คนงาม', 'Rattakul Khonngam', 'ช่างเทคนิค', 'Technician'),
('สุทัศน์ คล้ายสมบูรณ์', 'Suthud Khlaitsomboon', 'ช่างเทคนิค', 'Technician'),
('อนุรักษ์ สุขเอี่ยม', 'Anurak Sukiam', 'วิศวกรบำรุงรักษา', 'Maintenance Engineer'),
('กฤษฏา แสนสุริวงค์', 'Kritsada Saensuriwong', 'วิศวกรบำรุงรักษา', 'Maintenance Engineer'),
('สิทธิศักดิ์ วัฒนะ', 'Sitthisak Wattana', 'ช่างสนับสนุน', 'Technical Support'), 
('พลพล หมายชัย', 'Phonlaphat Maichai', 'ช่างสนับสนุน', 'Technical Support'),
('ประภัสสร ชัยเสน', 'Praphassorn Chaisen', 'ผู้ประสานงานวิศวกรรม', 'Engineering Coordinator');