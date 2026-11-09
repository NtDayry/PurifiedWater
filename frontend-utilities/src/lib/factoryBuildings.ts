// @ts-nocheck
/**
 * ข้อมูลอาคารของแผนผังโรงงาน (ขนาด/ตำแหน่ง) — แยกจากฉาก 3 มิติ เพื่อให้หน้าเว็บแสดงข้อมูลได้ทันที
 * โดยไม่ต้องรอโหลด three.js และโค้ดสร้างฉาก (factoryScene3d.ts โหลดภายหลังแบบ dynamic import)
 * หน่วยเป็นเมตร: แกน X = ตะวันออก(+)/ตะวันตก(-), Z = เหนือ(0) -> ใต้(+) หน้าประตู
 */
export interface FactoryBuilding {
  id: string; name: string; en: string; note: string;
  w: number; l: number; h: number; fl: number; fh: number;
  ex: number; ez: number; cx: number; cz: number; z0: number;
  area: number; gfa: number; vol: number;
}

export const BUILDINGS_RAW=[
 {id:'wh',name:'อาคารโกดัง',en:'Warehouse',w:18,l:52,h:32,fl:4,fh:8,solar:1,col:'#f7f8fa',win:'small',note:'หลังคาโซลาร์เซลล์'},
 {id:'fac',name:'อาคารโรงงาน',en:'Factory',w:27,l:120,h:10,fl:1,fh:10,solar:2,col:'#d4d6da',win:'band',note:'แผงโซลาร์เซลล์เต็มหลังคา · ห้องงานระบบปิดทึบด้านตะวันออก (หลังคาเมทัลชีทสีน้ำเงิน ยื่น 3.5 ม. สูง 4 ม.) ต่อด้วยชายคาเมทัลชีทสีน้ำเงิน ยื่นอีก 1.5 ม. สูงจากพื้น 2.5 ม.'},
 {id:'b5',name:'อาคาร 5',en:'Building 5',w:17,l:22,rot:1,h:24,fl:6,fh:4,hvac:1,col:'#e0d8cc',win:'office',note:'ด้านหน้า (ฝั่งถนน): ผนังแผ่นขาวกรอบเทาเข้ม กล่องเทาเข้มชั้นบน ชั้นล่างกระจก กันสาดทางเข้า · ด้านข้าง (ฝั่งโรงงาน): ระเบียงทุกชั้น คอมเพรสเซอร์แอร์ · ดาดฟ้า: ถังเก็บน้ำ 4 ถัง · ห้องควบคุมและปั๊มน้ำชิลเลอร์ (สูง 4 ม.) · ชิลเลอร์ 2 ยูนิต · ราวกันตกรอบดาดฟ้า'},
 {id:'b4',name:'อาคาร 4 (ฝ่ายขาย)',en:'Building 4 (Sales)',w:19,l:55,h:6,fl:1,fh:6,col:'#f1f2ef',win:'office',note:'อาคารยาว ชั้นเดียว ผนังปูนสีขาว · ชายคากล่องหนารอบอาคาร ยื่น 1.2 ม. ใต้ชายคาลาดเอียง มีครีบค้ำสามเหลี่ยมด้านยาว · ด้านติดอาคาร 5: ประตูบานคู่สีเทา บอร์ดประกาศ · เลข 4 สีน้ำเงินที่ผนังด้านยาวใกล้มุม · ฐานปูนยกพร้อมกระถางต้นไม้ด้านลานจอดรถ'},
 {id:'b1',name:'อาคาร 1 (ออฟฟิศ)',en:'Office',w:11,l:24,rot:1,h:8,fl:2,fh:4,col:'#f4f4f2',win:'none',note:'หน้าประตูทางเข้า'}
];
// อาคาร 1: ยกพื้น 0.9 ม. (เท่าชานบันไดทางเข้า) + ชั้น 1 สูงถึงขอบล่างชายคาอาคาร 4 (eaveY), ชั้น 2 สูง fh
// อาคาร 4 ห่างอาคาร 1 = 5 ม. = ส่วนต่อเติมหลังอาคาร 1 กว้าง 3 ม. + ทางเดินมีหลังคา 2 ม.
{const b1=BUILDINGS_RAW.find(b=>b.id==='b1'),b4=BUILDINGS_RAW.find(b=>b.id==='b4');b4.eaveY=4.6;b1.base=.9;b1.fh1=+(b4.eaveY-b1.base).toFixed(2);b1.h=+(b1.base+b1.fh1+b1.fh*(b1.fl-1)).toFixed(2)}
const GAP=[15,10,6,5,0];let p=0;
// แนวอ้างอิงแกน X: FE = ผนังโรงงานฝั่งถนนเข้าโรงงาน (โกดังชิดแนวนี้), OW = แนวผนังอาคาร 1/4/5 ฝั่งตรงข้าม
// โรงงานกว้าง 27 ม. ขยายออกฝั่งตรงข้ามถนน; อาคาร 5/4/1 ขยายไปทางซ้าย (มองจากหน้าบริษัท) ให้ผนังตะวันตกแนวเดียวกับโรงงาน (ฝั่งชิลเลอร์/ระบบบำบัด) — แนวถนนและอาคาร 1/4/5 อยู่ที่เดิม
const FE=12.5,OW=FE-BUILDINGS_RAW[1].w;                                                  // ระยะห่างระหว่างอาคาร (โกดัง→โรงงาน→อาคาร 5→อาคาร 4→อาคาร 1); อาคาร 5–4 = 6 ม.
BUILDINGS_RAW.forEach((b,i)=>{b.ex=b.rot?b.l:b.w;b.ez=b.rot?b.w:b.l;b.z0=p;b.cz=p+b.ez/2;b.cx=['wh','fac'].includes(b.id)?FE-b.ex/2:(['b1','b4','b5'].includes(b.id)?OW+b.ex/2:0);b.area=b.w*b.l;b.gfa=b.area*b.fl;b.vol=b.area*b.h;p+=b.ez+GAP[i]});
export const TOTAL=BUILDINGS_RAW[4].z0+BUILDINGS_RAW[4].ez,C=TOTAL/2;
export const N=n=>n.toLocaleString('th-TH');

export const BUILDINGS: FactoryBuilding[] = BUILDINGS_RAW;

// ห้อง/แผนกด้านถนนของอาคารโรงงาน (o = ระยะจากหัวอาคารฝั่งโกดัง, w = ความกว้างโซนคลิก ม.)
export interface FactoryRoom { id: string; name: string; en: string; o: number; w: number; parent: string }
export const ROOMS: FactoryRoom[] = [
 {id:'r_load1',name:'ลานโหลดวัตถุดิบ เฟส 1',en:'Raw Material Loading Bay Phase 1',o:109.6,w:9.4,parent:'fac'},
 {id:'r_boiler',name:'ห้อง Boiler',en:'Boiler Room',o:100.6,w:6.0,parent:'fac'},
 {id:'r_ahu1',name:'ห้อง AHU1',en:'AHU1 Room',o:82,w:7.0,parent:'fac'},
 {id:'r_load2',name:'ลานโหลดวัตถุดิบ เฟส 2',en:'Raw Material Loading Bay Phase 2',o:75.1,w:5.4,parent:'fac'},
 {id:'r_cda',name:'ห้อง CDA',en:'CDA Room',o:68.1,w:5.8,parent:'fac'},
 {id:'r_pw',name:'ห้องระบบน้ำ Purified',en:'Purified Water System Room',o:60.6,w:7.0,parent:'fac'},
 {id:'r_eng',name:'แผนกวิศวกรรม',en:'Engineering Department',o:51.5,w:10.0,parent:'fac'},
 {id:'r_ahu2',name:'ห้อง AHU2 และโซลาร์เซลล์',en:'AHU2 & Solar Cell Room',o:43.5,w:6.0,parent:'fac'},
 {id:'r_store',name:'ห้องเก็บของและตู้ลมดูดฝุ่น',en:'Storage & Dust Collector Room',o:35,w:9.0,parent:'fac'},
 {id:'r_ahu3',name:'ห้อง AHU3',en:'AHU3 Room',o:1.5,w:3.0,parent:'fac'},
];

// วัตถุอื่นที่คลิกเลือกได้ (โซนคลิกสร้างใน factoryScene3d.ts ด้วย id เดียวกัน)
export interface FactoryObject { id: string; name: string; en: string; parent?: string; note?: string; noteEn?: string }
export const OBJECTS: FactoryObject[] = [
 {id:'o_canteen',name:'โรงอาหาร',en:'Canteen'},
 {id:'o_pool',name:'บ่อพักน้ำทิ้ง (สระน้ำโรงอาหาร)',en:'Effluent Holding Pond (Canteen)',
  note:'บ่อรับน้ำขั้นสุดท้ายที่ผ่านการบำบัดและแยกตะกอนแล้ว ใช้พักน้ำเพื่อตรวจสอบคุณภาพน้ำทิ้ง ให้ธรรมชาติช่วยปรับสภาพน้ำ (Polishing) หรือเก็บสำรองไว้รดน้ำต้นไม้และใช้หมุนเวียนภายในโรงงาน',
  noteEn:'Final pond for treated, clarified water: holds effluent for quality checks, natural polishing, and reuse for irrigation and in-plant recycling.'},
 {id:'o_chiller',name:'Chiller (ข้างโกดัง)',en:'Chiller (by Warehouse)',parent:'wh'},
 {id:'o_pump',name:'บ่อน้ำประปาและระบบปั๊ม',en:'Water Storage Tank & Pump System',parent:'fac'},
 {id:'o_gen',name:'เครื่องปั่นไฟ',en:'Backup Generator',parent:'b5'},
 {id:'o_b5tank',name:'ถังเก็บน้ำประปา (ดาดฟ้าอาคาร 5)',en:'Water Storage Tanks (Building 5 Rooftop)',parent:'b5'},
 {id:'o_b5chiller',name:'Chiller (ดาดฟ้าอาคาร 5)',en:'Chiller (Building 5 Rooftop)',parent:'b5'},
 {id:'o_guard',name:'ป้อม รปภ.',en:'Security Guard Booth'},
 {id:'o_wmeter',name:'มิเตอร์น้ำประปา',en:'Water Meter'},
 {id:'o_emeter',name:'มิเตอร์ไฟฟ้า',en:'Electricity Meter'},
 {id:'o_tr1',name:'หม้อแปลงไฟฟ้า 1',en:'Transformer 1'},
 {id:'o_tr2',name:'หม้อแปลงไฟฟ้า 2',en:'Transformer 2'},
 {id:'o_tr3',name:'หม้อแปลงไฟฟ้า 3',en:'Transformer 3'},
 {id:'o_tr4',name:'หม้อแปลงไฟฟ้า 4',en:'Transformer 4'},
 {id:'o_tr5',name:'หม้อแปลงไฟฟ้า 5',en:'Transformer 5'},
 {id:'o_wt_eq',name:'บ่อปรับเสมอ (EQ Tank)',en:'Equalization Tank (EQ)',parent:'wh',
  note:'รวบรวมน้ำเสียทั้งหมดจากกระบวนการผลิตมาไว้จุดเดียว เพื่อปรับอัตราการไหลและความเข้มข้นของน้ำเสียให้สม่ำเสมอก่อนส่งไปบำบัดขั้นต่อไป',
  noteEn:'Collects all process wastewater in one place to even out flow rate and concentration before further treatment.'},
 {id:'o_wt_eqpump',name:'ปั๊มน้ำบ่อ EQ',en:'EQ Tank Transfer Pumps',parent:'wh',note:'ปั๊มหอยโข่งแบบดูดเอง 2 ชุด สูบน้ำเสียจากบ่อปรับเสมอส่งขึ้นบ่อเติมอากาศ ท่อส่ง HDPE พร้อมประตูน้ำ',noteEn:'Two self-priming centrifugal pumps lifting wastewater from the EQ tank to the aeration tank via HDPE lines with gate valves.'},
 {id:'o_wwtp_panel',name:'ตู้ควบคุมระบบบำบัดน้ำเสีย',en:'WWTP Control Panel',parent:'wh',note:'ตู้ควบคุมปั๊ม/เครื่องเติมอากาศของระบบบำบัดน้ำเสีย พร้อมมิเตอร์ ไฟแสดงสถานะ และสวิตช์เลือกการทำงาน',noteEn:'Controls the wastewater pumps and blower, with meters, status lamps and selector switches.'},
 {id:'o_wt_aer',name:'บ่อเติมอากาศ (Aeration Tank)',en:'Aeration Tank',parent:'wh',
  note:'หัวใจของระบบบำบัดชีวภาพ เติมออกซิเจนเพื่อเลี้ยงจุลินทรีย์ชนิดใช้อากาศ (Aerobic Bacteria) ให้ย่อยสลายสารอินทรีย์และค่าความสกปรก (BOD/COD) ในน้ำเสีย',
  noteEn:'Core of the biological treatment: air is supplied so aerobic bacteria break down organic matter (BOD/COD).'},
 {id:'o_wt_sand',name:'บ่อกรองทราย / ลานตากตะกอน',en:'Sand Filter / Sludge Drying Bed',parent:'wh',
  note:'บ่อกรองทราย: น้ำไหลผ่านชั้นทรายเพื่อกรองตะกอนแขวนลอยขนาดเล็กก่อนปล่อยทิ้ง · ลานตากตะกอน: นำตะกอนเข้มข้นมาเทบนชั้นทรายตากแดดให้น้ำระเหยและกรองออก เหลือกากตะกอนแห้ง',
  noteEn:'Sand filter: water passes through sand to remove fine suspended solids · Drying bed: thickened sludge is spread on sand to drain and sun-dry into dry cake.'},
 {id:'o_wt_anae',name:'บ่อหมักไม่ใช้อากาศ / บ่อพักตะกอน',en:'Anaerobic Tank / Sludge Tank',parent:'wh',
  note:'บ่อปิดทึบ จุลินทรีย์ชนิดไม่ใช้อากาศ (Anaerobic Bacteria) ย่อยสลายสารอินทรีย์/ตะกอน เกิดแก๊สไข่เน่า (H₂S) และมีเทน จึงต้องปิดฝาเพื่อควบคุมกลิ่นและป้องกันแก๊สรั่วไหล',
  noteEn:'Covered tank where anaerobic bacteria digest organics/sludge, producing H₂S and methane; sealed to control odour and gas.'},
 {id:'o_wh_wc',name:'ห้องน้ำคลัง',en:'Warehouse Restrooms',parent:'wh',note:'ห้องน้ำชาย (ซ้าย) · ห้องน้ำหญิง (ขวา) · หลังคาคอนกรีตแบบดาดฟ้า',noteEn:"Men's (left) · Women's (right) · flat concrete roof deck"},
 {id:'o_tank14',name:'บ่อเก็บน้ำอาคาร 1, 4',en:'Water Storage Tank (Buildings 1, 4)',parent:'b4'},
];
