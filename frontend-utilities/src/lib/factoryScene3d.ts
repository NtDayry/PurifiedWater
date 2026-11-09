// @ts-nocheck
/**
 * ฉาก 3 มิติแผนผังโรงงาน (three.js) — พอร์ตมาจากต้นแบบ factory-3d.html
 * หน่วยเป็นเมตร: แกน X = ตะวันออก(+)/ตะวันตก(-), Y = สูง, Z = เหนือ(0) -> ใต้(+) หน้าประตู  (ทิศในคอมเมนต์ = ทิศของแบบจำลอง)
 * ทิศจริงของที่ตั้ง (13°37'25.27"N 100°43'05.90"E, ตรวจจากภาพดาวเทียม): แนวอาคารวิ่งตะวันตก->ตะวันออก จากซอยสุขาภิบาล 6
 *   แกนจำลอง +Z (ฝั่งประตู/ถนนหน้า) = ทิศตะวันตกจริง, -Z (โกดัง) = ตะวันออกจริง, -X (แนวบ้าน) = เหนือจริง, +X (ถนนเข้าโรงงาน) = ใต้จริง
 * หมายเหตุ: ไฟล์นี้ปิด type-check ไว้ (ต้นฉบับเป็นโค้ดสร้างฉากแบบ imperative จำนวนมาก)
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createDenzaD9 } from './denzaD9Model';

import { BUILDINGS_RAW, BUILDINGS, TOTAL, C, N, ROOMS, type FactoryBuilding } from './factoryBuildings';
export { BUILDINGS_RAW, BUILDINGS, TOTAL, C, N, type FactoryBuilding };

export interface FactorySceneOptions {
  onSelect?: (id: string) => void;
  onAutoRotateChange?: (on: boolean) => void;   // แจ้งเมื่อการหมุนอัตโนมัติถูกยกเลิกจากการคลิก object / หมุน-ซูมกล้องเอง
  initialId?: string;
  initialTime?: number;
  initialLabels?: boolean;
  initialAutoRotate?: boolean;
}
export interface FactorySceneApi {
  select: (id: string, fly?: boolean) => void;
  setView: (k: 'ov' | 'top' | 'side' | 'gate') => void;
  setLabels: (on: boolean) => void;
  setSolar: (on: boolean) => void;
  setAutoRotate: (on: boolean) => void;
  setTime: (h: number) => void;
  /** ตั้งค่าตัวเลขที่แสดงใต้ไอคอนมิเตอร์ ('water' = มิเตอร์น้ำ, 'power' = มิเตอร์ไฟฟ้า) */
  setMeter: (kind: string, value: number | string, unit?: string) => void;
  /** แจ้งเตือน (alarm) ของจุดแสดงค่า: พื้นหลังไอคอน+ป้ายตัวเลขเป็นสีแดงสว่างกะพริบ */
  setAlarm: (kind: string, on: boolean) => void;
  setIcons: (on: boolean) => void;   // แสดง/ซ่อนไอคอนลอย + ตัวเลขมิเตอร์ทั้งหมด   // kind: water | power | tr1..tr5 | tank14 | b5tank | pump | pool (ระดับน้ำ %) | b5chiller | chiller | cda (kWh)
  dispose: () => void;
}

export function createFactoryScene(host: HTMLElement, opts: FactorySceneOptions = {}): FactorySceneApi {
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const box=el=>el.getBoundingClientRect;
const B=BUILDINGS_RAW;
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;
host.appendChild(renderer.domElement);renderer.domElement.style.cssText="display:block;width:100%;height:100%;touch-action:none";
const scene=new THREE.Scene();scene.fog=new THREE.Fog(0xbfe0f5,450,1200);
const cam=new THREE.PerspectiveCamera(45,1,1,3000);
const ctl=new OrbitControls(cam,renderer.domElement);
ctl.enableDamping=true;ctl.maxPolarAngle=1.5;ctl.minPolarAngle=0;ctl.minDistance=15;ctl.maxDistance=1500;
const hemi=new THREE.HemisphereLight(0xdfefff,0x6b7f55,.55*Math.PI);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xfff2dd,Math.PI);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
const sc=sun.shadow.camera;sc.left=-230;sc.right=230;sc.top=230;sc.bottom=-230;sc.near=10;sc.far=900;sun.shadow.bias=-.0005;
sun.target.position.set(0,0,C);scene.add(sun,sun.target);
// วัสดุสีพื้น (ไม่มี texture) ใช้ร่วมกันเมื่อค่าเหมือนกัน → ลดจำนวนวัสดุ/การคอมไพล์ shader และรวม mesh ได้มากขึ้น
const _mc=new Map();
const M=(c,o={})=>{const plain=Object.values(o).every(v=>v===null||typeof v!=='object');if(!plain)return new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:.85,metalness:0},o));
 const k=c+'|'+JSON.stringify(o);let m=_mc.get(k);if(!m){m=new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:.85,metalness:0},o));_mc.set(k,m)}return m};
const mesh=(g,m,x,y,z,sh=true)=>{const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.castShadow=sh;o.receiveShadow=true;scene.add(o);return o};
const cv=(w,h,f)=>{const c=document.createElement('canvas');c.width=w;c.height=h;f(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t};

// ground
const grass=cv(256,256,(g,w,h)=>{g.fillStyle='#7aa35a';g.fillRect(0,0,w,h);for(let i=0;i<1400;i++){g.fillStyle=`rgba(${40+Math.random()*50|0},${100+Math.random()*60|0},40,.25)`;g.fillRect(Math.random()*w,Math.random()*h,2,2)}});
grass.repeat.set(60,60);
mesh(new THREE.PlaneGeometry(1400,1400).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({map:grass,roughness:1}),0,-.05,C,false);
mesh(new THREE.BoxGeometry(76,.2,TOTAL+28),M(0xb5b8be),0,0,C+2,false);           // ลานคอนกรีต
// ถนนหลักหน้าโรงงาน กว้าง 14 ม. (MRZ = กึ่งกลาง, MRH = ครึ่งความกว้าง) — ขอบถนนฝั่งโรงงานเริ่มหลังแนวหญ้า 0.8 ม. + ฟุตบาท 1.5 ม. + คันหิน 0.15 ม. หน้ากำแพง
const MRH=7,MRZ=TOTAL+14.81+.8+1.5+.15+MRH;
mesh(new THREE.BoxGeometry(1400,.25,MRH*2),M(0x45484f),0,.02,MRZ,false);     // ถนนหน้าโรงงาน
for(let x=-600;x<600;x+=14)mesh(new THREE.BoxGeometry(6,.3,.5),M(0xf2f2f2),x,.05,MRZ,false);
mesh(new THREE.BoxGeometry(7,.15,TOTAL+80),M(0xb8996b,{roughness:1}),-78,.01,C,false); // ถนนดินฝั่งตะวันตก

// textures
const winTex=(b,rx,ry)=>{const cw=128,ch=Math.round(128*b.fh/6);
 const t=cv(cw,ch,(g,w,h)=>{g.fillStyle=b.col;g.fillRect(0,0,w,h);g.fillStyle='rgba(0,0,0,.06)';g.fillRect(0,h-4,w,4);
  const glass=(x,y,ww,hh)=>{const gr=g.createLinearGradient(x,y,x+ww,y+hh);gr.addColorStop(0,'#7fb0d4');gr.addColorStop(1,'#35597a');g.fillStyle=gr;g.fillRect(x,y,ww,hh);g.strokeStyle='rgba(255,255,255,.5)';g.strokeRect(x,y,ww,hh)};
  if(b.win==='office')glass(w*.14,h*.3,w*.72,h*.4);
  else if(b.win==='band'){glass(w*.04,h*.12,w*.92,h*.22);g.strokeStyle='rgba(0,0,0,.12)';for(let i=1;i<4;i++){g.beginPath();g.moveTo(w*i/4,h*.4);g.lineTo(w*i/4,h);g.stroke()}}
  else if(b.win!=='none')glass(w*.34,h*.38,w*.32,h*.2)});
 t.repeat.set(rx,ry);return t};
const solarTex=cv(64,128,(g,w,h)=>{g.fillStyle='#14296b';g.fillRect(0,0,w,h);g.strokeStyle='#4a6fd0';g.lineWidth=1;for(let i=0;i<=6;i++){g.beginPath();g.moveTo(i*w/6,0);g.lineTo(i*w/6,h);g.stroke()}for(let j=0;j<=12;j++){g.beginPath();g.moveTo(0,j*h/12);g.lineTo(w,j*h/12);g.stroke()}g.strokeStyle='#cfd8f0';g.lineWidth=3;g.strokeRect(0,0,w,h)});
const roofM=M(0xa9a9a4,{roughness:1});
const pick=[],outlines={},labels=[],solars=[],groups={};
// โซนคลิกเลือกวัตถุ (มองไม่เห็น): id ตรงกับ OBJECTS ใน factoryBuildings.ts — เก็บจุดศูนย์กลาง/ขนาดไว้ใช้เลื่อนกล้อง (dz = ค่าเลื่อนที่จะถูกใส่ภายหลัง)
const ICONS=[],METERS={},ICONX=[];let CDAP=null;
// ไอคอน/ป้ายตัวเลขกดได้: key ของมิเตอร์ → id วัตถุที่จะเลือก (กล้องเลื่อนไปหา + แสดงข้อมูลมุมขวาบน)
const ICONID={water:'o_wmeter',power:'o_emeter',tr1:'o_tr1',tr2:'o_tr2',tr3:'o_tr3',tr4:'o_tr4',tr5:'o_tr5',tank14:'o_tank14',b5tank:'o_b5tank',pump:'o_pump',pool:'o_pool',b5chiller:'o_b5chiller',chiller:'o_chiller',cda:'r_cda',pwtank:'r_pw',pwvel:'r_pw'};   // ICONX = ก้านแสง/เงาของไอคอน (ซ่อน-แสดงพร้อมไอคอน)
const SHUT={},ANIMK=[],GATE={};let NIGHTK=0;   // NIGHTK = ระดับกลางคืน 0–1 (ใช้กับไฟหน้ารถ)   // ประตูม้วนท่าโหลด (เปิด-ปิดได้), ชิ้นที่ขยับได้ (ไม่รวม mesh), ไม้กั้นทางเข้า
// ไฮไลต์ object ที่เลือก: กลางวัน = มืดลง, กลางคืน = สว่างขึ้น (HLM[id] = mesh ที่อยู่ในโซนคลิกของ object นั้น)
const HLM={};let hlOn=null,hlNight=false,isNight=false,hlC=[];                                                                         // ไอคอนลอย (ขยายตามระยะกล้อง)
const ZONES={},zoneM=new THREE.MeshBasicMaterial({visible:false});
function zone(id,x,y,z,sx,sy,sz,dz=0,dir=0){const m=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),zoneM);m.position.set(x,y,z);m.userData.id=id;scene.add(m);pick.push(m);ZONES[id]={x,y,z:z+dz,s:Math.max(sx,sy*1.5,sz),dir,top:y+sy/2,m}}

function label(b){const w=512,h=140;const t=cv(w,h,(g)=>{g.fillStyle='rgba(20,24,32,.82)';g.beginPath();g.roundRect?g.roundRect(4,4,w-8,h-8,26):g.rect(4,4,w-8,h-8);g.fill();g.fillStyle='#fff';g.textAlign='center';g.font='bold 46px sans-serif';g.fillText(b.name,w/2,60);g.fillStyle='#ffb4b4';g.font='34px sans-serif';g.fillText(`${b.w}×${b.l} ม. · สูง ${b.h} ม.`,w/2,108)});
 const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,depthTest:false,transparent:true}));s.scale.set(44,12,1);s.renderOrder=10;s.position.set(b.lx!==undefined?b.lx:b.cx,b.h+(b.solar?4:b.hvac?8:6)+8,b.cz);scene.add(s);labels.push(s)}

const FY=.3;                                                                            // อาคารโรงงานยกพื้นสูง 30 ซม.
B.forEach(b=>{const _n0=scene.children.length;
 const rx=Math.max(1,Math.round(b.ez/6)),rz=Math.max(1,Math.round(b.ex/6));
 const side=()=>M(0xffffff,{map:winTex(b,rx,b.fl)}),end=()=>M(0xffffff,{map:winTex(b,rz,b.fl)});
 const mt=(n=b.l)=>{const t=cv(16,16,(g,w,h)=>{g.fillStyle='#ffffff';g.fillRect(0,0,8,h);g.fillStyle='#e9ebee';g.fillRect(8,0,8,h)});t.repeat.set(Math.round(n/.5),1);return new THREE.MeshStandardMaterial({map:t,roughness:.5,metalness:.1})};
 const cc=()=>{const t=cv(128,128,(g,w,h)=>{g.fillStyle='#f4f5f6';g.fillRect(0,0,w,h);for(let i=0;i<900;i++){g.fillStyle=`rgba(${170+Math.random()*60|0},${170+Math.random()*60|0},${170+Math.random()*60|0},.10)`;g.fillRect(Math.random()*w,Math.random()*h,3,3)}g.strokeStyle='rgba(60,60,60,.45)';g.lineWidth=2;g.strokeRect(0,0,w,h)});t.repeat.set(rz,b.fl);return M(0xffffff,{map:t,roughness:.95})};
 const fE=()=>{const t=cv(16,128,(g,w,h)=>{g.fillStyle='#eef0f2';g.fillRect(0,0,w,h);g.fillStyle='#d3d7dc';g.fillRect(0,0,6,h);g.fillStyle='#2f8a99';g.fillRect(0,0,w,h*.16);g.fillStyle='#246f7c';g.fillRect(0,h*.16,w,3)});t.repeat.set(Math.round(b.l/.5),1);return new THREE.MeshStandardMaterial({map:t,roughness:.5,metalness:.35})}; // ผนังโรงงานด้านถนน: เมทัลชีทขาว แถบบนสีเขียวน้ำทะเล
 const pnl=(w,h)=>{const t=cv(128,128,(g,W,H)=>{g.fillStyle='#eef0f1';g.fillRect(0,0,W,H);g.strokeStyle='#c8ccd0';g.lineWidth=3;g.strokeRect(1,1,W-2,H-2)});t.repeat.set(w/1.6,h/2);return M(0xffffff,{map:t,roughness:.7})}; // แผ่นผนังสีขาวมีร่องรอยต่อ (อาคาร 5)
 const brn=(w,h)=>{const t=cv(64,64,(g,W,H)=>{g.fillStyle='#71675f';g.fillRect(0,0,W,H);g.fillStyle='#665d55';g.fillRect(0,H-3,W,3)});t.repeat.set(w/4,h/4);return M(0xffffff,{map:t,roughness:.85})};
 const mats=b.id==='wh'?[mt(),mt(),roofM,roofM,end(),mt(b.ex)]:b.id==='fac'?[fE(),side(),roofM,roofM,(()=>{const m=fE();m.map.repeat.set(Math.round(b.w/.5),1);return m})(),end()]:b.id==='b5'?[pnl(b.ez,b.h),pnl(b.ez,b.h),roofM,roofM,pnl(b.ex,b.h),brn(b.ex,b.h)]:b.id==='b4'?[M(0xf1f2ef,{roughness:.92}),M(0xf1f2ef,{roughness:.92}),roofM,roofM,end(),M(0xf1f2ef,{roughness:.92})]:[side(),side(),roofM,roofM,end(),end()];
 const m=mesh(new THREE.BoxGeometry(b.ex,b.h,b.ez),mats,b.cx,b.h/2,b.cz);m.userData.id=b.id;pick.push(m);
 const lvY=i=>b.fh1?b.base+b.fh1+(i-1)*b.fh:i*b.fh;                                     // ระดับพื้น/ขอบชั้น (อาคาร 1 ชั้นแรกสูงไม่เท่าชั้นอื่น)
 if(b.id!=='b5'&&b.id!=='b4')for(let i=1;i<=b.fl;i++)mesh(new THREE.BoxGeometry(b.ex+.5,.3,b.ez+.5),M(0x8d9097),b.cx,lvY(i),b.cz,false);
 if(b.base)mesh(new THREE.BoxGeometry(b.ex+.3,b.base,b.ez+.3),M(0xd9dad6,{roughness:.9}),b.cx,b.base/2,b.cz);   // ฐานยกพื้น   // ชายคา/ขอบชั้น
 const o=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(b.ex+1,b.h+1,b.ez+1)),new THREE.LineBasicMaterial({color:0xff3b3b}));
 o.position.set(b.cx,b.h/2,b.cz);o.visible=false;scene.add(o);outlines[b.id]=o;
 if(b.solar){const n=b.solar,gw=n===2?1.4:0,pw=(b.w-3-gw)/n,pl=b.l-4;
  for(let k=0;k<n;k++){const t=solarTex.clone();t.needsUpdate=true;t.repeat.set(Math.round(pw/1.1),Math.round(pl/2.2));
   const dk=M(0x222831);const sm=new THREE.MeshStandardMaterial({map:t,roughness:.25,metalness:.55});
   const x=b.cx+(n===2?(k?1:-1)*(pw/2+gw/2):0);
   const s=mesh(new THREE.BoxGeometry(pw,.35,pl),[dk,dk,sm,dk,dk,dk],x,b.h+.35,b.cz);s.userData.id=b.id;pick.push(s);solars.push(s)}}
 // ดาดฟ้าอาคาร 5 (hvac): สร้างแยกด้านล่าง ตามผังดาดฟ้า
 label(b);if(b.id==='fac')for(let i=_n0;i<scene.children.length;i++)scene.children[i].position.y+=FY});   // ยกตัวอาคารโรงงานขึ้นบนฐาน

// ===== อาคาร 5 ด้านหน้า (ฝั่งถนนเข้าโรงงาน, +X) และด้านข้าง (ฝั่งโรงงาน, -Z) ตามรูปจริง =====
{const b=B[2],H=b.h,xF=b.cx+b.ex/2,xW=b.cx-b.ex/2,z0=b.z0,z1=b.z0+b.ez,Bx=(a,c,d)=>new THREE.BoxGeometry(a,c,d),Y1=V(0,1,0);
 const chr=M(0x3f454c,{roughness:.6,metalness:.2}),gry=M(0x6f757c,{roughness:.7}),wht=M(0xf2f3f4,{roughness:.7}),rec=M(0xe1e4e7,{roughness:.8}),
  gls=M(0x252c33,{roughness:.15,metalness:.5}),frm=M(0x2b3036,{metalness:.5,roughness:.4}),rlW=M(0xe9ebed,{metalness:.4,roughness:.4}),pvc=M(0xf0f0ee,{roughness:.5}),red=M(0xd23a2a,{roughness:.45,metalness:.3});
 const pipe=(a,c,r,m)=>{const d=V(0,0,0).subVectors(c,a),o=mesh(new THREE.CylinderGeometry(r,r,d.length(),10),m,0,0,0);o.position.copy(a).addScaledVector(d,.5);o.quaternion.setFromUnitVectors(Y1,d.clone().normalize())};
 const win=(x,y,z,w,h,ax)=>{if(ax==='x'){mesh(Bx(.06,h,w),gls,x,y,z,false);mesh(Bx(.08,h+.1,.06),frm,x,y,z-w/2);mesh(Bx(.08,h+.1,.06),frm,x,y,z+w/2);mesh(Bx(.08,.06,w),frm,x,y+h/2,z);mesh(Bx(.08,.06,w),frm,x,y-h/2,z);mesh(Bx(.08,.05,w),frm,x,y,z,false)}
  else{mesh(Bx(w,h,.06),gls,x,y,z,false);mesh(Bx(.06,h+.1,.08),frm,x-w/2,y,z);mesh(Bx(.06,h+.1,.08),frm,x+w/2,y,z);mesh(Bx(w,.06,.08),frm,x,y+h/2,z);mesh(Bx(w,.06,.08),frm,x,y-h/2,z)}};
 // --- ด้านหน้า: ชั้นล่างถอยเข้า ผนังเทาเข้ม + หน้ากระจก + ประตู
 mesh(Bx(.04,4,b.ez),gry,xF+.02,2,(z0+z1)/2,false);
 for(const [a,c] of[[z0+1.2,z0+11.4],[z0+13.2,z1-.6]]){const n=Math.round((c-a)/1.6);for(let i=0;i<n;i++){const w=(c-a)/n;win(xF+.06,1.9,a+w*(i+.5),w-.05,3.1,'x')}}
 mesh(Bx(.06,2.25,1.0),M(0xc7ccd1,{metalness:.4,roughness:.4}),xF+.06,1.37,z0+12.3,false);mesh(Bx(.07,.8,.14),gls,xF+.09,1.6,z0+12.1,false);   // ประตูเหล็ก
 mesh(Bx(.5,4,.5),gry,xF-.2,2,z0+.25);                                                                         // เสามุม
 // บันไดหน้าทางเข้า + ชาน + กระถางแจกันขาว
 mesh(Bx(2.4,.45,b.ez-1.5),M(0x8f949a,{roughness:.8}),xF+1.2,.225,z0+b.ez/2+.4);
 for(let k=0;k<3;k++)mesh(Bx(.35,.15*(3-k),b.ez-3),M(0x8f949a,{roughness:.8}),xF+2.4+.175+k*.35,.075*(3-k),z0+b.ez/2+.4);
 {const u=xF+3.8,zz=z0+11.6;mesh(new THREE.CylinderGeometry(.18,.28,.45,14),pvc,u,.225,zz);mesh(new THREE.CylinderGeometry(.34,.2,.45,14),pvc,u,.67,zz);mesh(new THREE.SphereGeometry(.38,8,6),M(0x4c8a3c),u,1.0,zz)}
 // กันสาดทางเข้า: แผ่นเรียบสีเทาเข้ม ยื่น 2.6 ม. + แปใต้กันสาด
 mesh(Bx(2.6,.22,b.ez),chr,xF+1.3,3.95,(z0+z1)/2);                                   // กันสาดเสมอขอบอาคารฝั่งอาคาร 4
 for(let z=z0+.6;z<z1-.2;z+=1.4)mesh(Bx(2.5,.12,.08),M(0x9aa0a6,{metalness:.4}),xF+1.3,3.78,z,false);
 // แถบเทาเข้มใต้พื้นชั้น 2 + กรอบเทาเข้มขอบบนและมุมฝั่งโรงงาน
 mesh(Bx(.3,.5,b.ez+.1),chr,xF+.15,4.25,(z0+z1)/2);
 mesh(Bx(.6,.7,b.ez+.3),chr,xF+.1,H-.15,(z0+z1)/2);mesh(Bx(b.ex+.3,.7,.5),chr,b.cx,H-.15,z0-.05);
 mesh(Bx(.6,H-4,.55),chr,xF+.1,4+(H-4)/2,z0-.05);
 // ส่วนเหนือ (ฝั่งโรงงาน) ของหน้าอาคาร: ร่องหน้าต่างแนวตั้ง
 {const zs=z0+4.6;mesh(Bx(.05,H-6,1.3),rec,xF+.03,5+(H-6)/2,zs,false);for(let y=6.2;y<H-1;y+=4)win(xF+.07,y,zs,.65,1.4,'x')}
 mesh(Bx(.08,H-4,.35),chr,xF+.04,4+(H-4)/2,z0+9.2,false);                                                    // ร่องแบ่งเทาเข้ม
 // ส่วนใต้ (ฝั่งอาคาร 4): ชั้น 2-3 หน้าต่างกล่องยื่น, ชั้น 4-6 กล่องเทาเข้มยื่น
 for(const y of[6.1,10.1]){const zz=z0+12.6;mesh(Bx(.45,1.9,1.9),wht,xF+.22,y,zz);mesh(Bx(.06,1.3,1.3),wht,xF+.46,y,zz,false);win(xF+.47,y,zz,1.0,1.2,'x')}
 mesh(Bx(.5,H-12,b.ez-9.4+.3),chr,xF+.25,12+(H-12)/2,z0+9.4+(b.ez-9.4+.3)/2);
 for(let y=14;y<H;y+=4){const zz=z0+12.6;mesh(Bx(.3,1.7,1.9),wht,xF+.55,y,zz);win(xF+.66,y,zz,1.3,1.1,'x');mesh(Bx(.5,.06,1.9),chr,xF+.75,y+.85,zz)}
 // --- ด้านข้าง (ฝั่งโรงงาน): ระเบียงทุกชั้น ราวสีขาว, แอร์ชั้น 2, ท่อน้ำทิ้งขาว, ชั้นล่างผนังน้ำตาลหน้าต่างเล็ก + ประตูเทา + ท่อดับเพลิงแดง
 const zN=z0-.02,xb0=xW+.2,xb1=xF-3.1;
 const balcony=(y,d)=>{mesh(Bx(xb1-xb0,.22,d),wht,(xb0+xb1)/2,y-.11,zN-d/2);mesh(Bx(xb1-xb0,.18,.06),M(0xd5d8db),(xb0+xb1)/2,y-.31,zN-d+.03,false);
  const zr=zN-d+.08,n=Math.round((xb1-xb0)/.15);for(const yy of[.95,.5])mesh(Bx(xb1-xb0,.05,.05),rlW,(xb0+xb1)/2,y+yy,zr,false);
  for(let i=0;i<=n;i+=1)mesh(Bx(.03,.95,.03),rlW,xb0+(xb1-xb0)*i/n,y+.475,zr,false);for(const x of[xb0,xb1])mesh(Bx(.04,.95,d),rlW,x,y+.475,zN-d/2,false)};
 balcony(4,1.7);for(let y=8;y<H;y+=4)balcony(y,1.15);
 const acM=M(0xe6e8ea,{metalness:.3,roughness:.5}),fan=M(0x2a2d31);
 for(let x=xb0+1.2;x<xb1-.8;x+=1.6){mesh(Bx(.85,.65,.33),acM,x,4.33,zN-1.2);mesh(new THREE.CylinderGeometry(.22,.22,.02,14).rotateX(Math.PI/2),fan,x+.1,4.33,zN-1.37,false)}
 for(const [x,o] of[[xb1+.35,0],[xb1+.6,.2]]){pipe(V(x,.3,zN-.12-o),V(x,H-.2,zN-.12-o),.08,pvc);for(let y=6;y<H;y+=4)mesh(Bx(.1,.06,.25),rlW,x,y,zN-.06-o/2,false)}
 mesh(Bx(xF-xb1-.6,4,.04),gry,(xb1+.3+xF-.3)/2,2,zN-.01,false);                                               // ผนังเทาชั้นล่างใกล้มุม
 mesh(Bx(1.0,2.2,.05),M(0x7d838a,{metalness:.3,roughness:.5}),xF-1.6,1.1,zN-.03,false);win(xF-1.6,2.95,zN-.05,.6,.9,'z');
 pipe(V(xb1+1.3,0,zN-.12),V(xb1+1.3,4.3,zN-.12),.07,red);mesh(new THREE.SphereGeometry(.12,10,8),red,xb1+1.3,1.2,zN-.15);
 pipe(V(xb1+1.3,1.2,zN-.12),V(xb1+1.75,1.2,zN-.12),.05,red);mesh(new THREE.CylinderGeometry(.1,.1,.06,10).rotateZ(Math.PI/2),red,xb1+1.78,1.2,zN-.12);
 for(const x of[xW+2.2,xW+5.2,xW+8.4,xW+11.4])win(x,2.3,zN-.04,1.0,1.3,'z');
 for(const x of[xW+2.2,xW+5.2,xW+8.4,xW+11.4])mesh(Bx(1.3,.08,.3),wht,x,3.08,zN-.15);                             // กันสาดเล็กเหนือหน้าต่าง
 for(let y=8;y<H;y+=4)for(const x of[xW+3.2,xW+9.2])win(x,y+1.6,zN-.04,.7,1.3,'z');
 // --- ด้านตะวันตก: หน้าต่างแนวตั้งเรียบ ๆ
 for(let y=6;y<H;y+=4)for(const z of[z0+4,z0+9,z0+14])win(xW-.04,y,z,.9,1.4,'x');
 // --- ด้านใต้ (ฝั่งอาคาร 4, +Z) ตามรูปจริง: ผนังเมทัลชีทลอนแนวนอนสีขาว + แถบเทาหน้าต่างเล็ก/บานเกล็ดทุกชั้น,
 //     แนวผนังเทาฝั่งตะวันตก, แนวบันไดผนังน้ำตาล+หน้าต่างซ้อนที่มุมฝั่งถนน, ด้านข้างกล่องเทาเข้มชั้น 4-6 มีช่องสี่เหลี่ยม 2 ช่อง, ราวกันตกดาดฟ้า
 {const zS=z1,xS0=xW+3,xS1=xF-1.8,xBx=xF-4.6;
  const sdT=cv(64,64,(g,w,h)=>{g.fillStyle='#f4f5f3';g.fillRect(0,0,w,h);for(let j=0;j<4;j++){g.fillStyle='#d9dbd8';g.fillRect(0,j*16+12,w,4)}});sdT.repeat.set((xS1-xS0)/2,H/.8);
  const sid=M(0xffffff,{map:sdT,roughness:.6,metalness:.15}),bnd=M(0x8e959c,{roughness:.7}),gW=M(0xa3a9ae,{roughness:.8}),brw=M(0x6e5a4a,{roughness:.85});
  const lvT=cv(64,64,(g,w,h)=>{g.fillStyle='#3a3f45';g.fillRect(0,0,w,h);g.fillStyle='#24282d';for(let j=0;j<8;j++)g.fillRect(0,j*8+5,w,3)});
  const lvr=(x,y,w,h,z=zS+.16)=>{const t=lvT.clone();t.needsUpdate=true;t.repeat.set(1,h/.5);mesh(Bx(w,h,.08),[frm,frm,frm,frm,M(0xffffff,{map:t,roughness:.6}),frm],x,y,z,false)};
  const sw=(x,y,z=zS+.15)=>win(x,y,z,.55,.45,'z');                                              // หน้าต่างบานเล็ก
  mesh(Bx(xS1-xS0,H-.4,.08),sid,(xS0+xS1)/2,(H-.4)/2,zS+.04);                                     // ผนังลอนแนวนอน
  mesh(Bx(xS0-xW,H,.06),gW,(xW+xS0)/2,H/2,zS+.03,false);                                         // แนวผนังเทาฝั่งตะวันตก
  for(let y=6;y<H;y+=4)win(xW+1.5,y,zS+.08,.7,1.3,'z');
  // แถบเทาชั้น 2-6
  for(let y=4;y<H;y+=4){const xe=y>=12?xBx:xS1;mesh(Bx(xe-xS0-.6,1.5,.06),bnd,(xS0+.3+xe-.3)/2,y+1.9,zS+.1,false)}
  for(const y of[4,12,16,20])for(let x=xS0+1.2;x<(y>=12?xBx:xS1)-2.6;x+=1.1)if(((x-xS0)/1.1|0)%4!==3)sw(x,y+2.1);
  lvr(xS1-1.4,4+1.9,1.5,1.4);                                                                     // ชั้น 2: บานเกล็ดด้านขวา
  lvr(xS0+6.2,8+1.9,3.6,1.4);lvr(xS0+10.2,8+1.9,3.4,1.4);                                          // ชั้น 3: บานเกล็ดใหญ่ 2 ชุด
  for(const x of[xBx-2.2,xBx-1.2])win(x,12+1.9,zS+.15,.6,1.2,'z');                                 // ชั้น 4: หน้าต่าง 2 บาน
  // ชั้นล่าง: หน้าต่างเล็กชิดบน + บานเกล็ดสูง + ท่อน้ำฝน
  for(const x of[xS0+1.4,xS0+3.2,xS0+4.0,xS0+4.8])sw(x,3.2);
  lvr(xS1-.7,1.7,.9,2.6);mesh(Bx(.5,.35,.12),M(0xe6e8ea),xS1-1.7,2.9,zS+.12);
  pipe(V(xS1-2.4,.1,zS+.2),V(xS1-2.4,H-.3,zS+.2),.07,M(0xd2d4d6,{metalness:.4,roughness:.4}));
  // แนวบันไดที่มุมฝั่งถนน: ผนังน้ำตาล + หน้าต่างซ้อนแนวตั้ง (ชั้น 1-3) และบานกระทุ้งชั้นล่าง
  mesh(Bx(xF-xS1,12,.1),brw,(xS1+xF)/2,6,zS+.05);
  for(const y of[5.9,8.3,10.6])win((xS1+xF)/2,y,zS+.12,1.2,1.7,'z');
  for(const x of[xS1+.5,xS1+1.2]){const o=mesh(Bx(.6,1.0,.05),gls,x,2.9,zS+.3,false);o.rotation.x=-.35}
  win((xS1+xF)/2,1.4,zS+.12,1.3,1.2,'z');
  // ด้านข้างกล่องเทาเข้ม ชั้น 4-6: ยื่นออกจากผนัง + ช่องสี่เหลี่ยมลึก 2 ช่อง (มีบานเกล็ดด้านใน)
  {const bw=xF+.5-xBx,bx=(xBx+xF+.5)/2;mesh(Bx(bw,H-12+.3,.7),chr,bx,12+(H-12+.3)/2,zS+.35);
   for(let y=13;y<H;y+=1.6)mesh(Bx(bw,.02,.02),M(0x52585f),bx,y,zS+.71,false);
   for(const y of[16.6,20.4]){mesh(Bx(1.3,1.5,.04),M(0x15181b),bx-.4,y,zS+.72,false);lvr(bx-.4,y,1.0,1.1,zS+.66)}
   mesh(Bx(bw,.25,.8),M(0xd8dadc),bx,12-.1,zS+.4)}
  // ราวกันตกดาดฟ้าฝั่งใต้
  for(const yy of[.5,1.0])mesh(Bx(b.ex-5,.05,.05),rlW,b.cx-2,H+yy,zS-.15,false);
  for(let x=xW+.3;x<xF-4.5;x+=1.5)mesh(Bx(.05,1.0,.05),rlW,x,H+.5,zS-.15,false);
  // เลข 5 สีน้ำเงิน ที่ผนังเทาชั้นล่างด้านหน้า มุมฝั่งอาคาร 4
  mesh(Bx(.3,4,1.8),gry,xF+.08,2,zS-.9);
  {const t=cv(128,128,(g,w,h)=>{g.clearRect(0,0,w,h);g.fillStyle='#1f4f9f';g.font='bold 116px Arial, sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('5',w/2,h/2+6)});
   const n=mesh(new THREE.PlaneGeometry(.75,.75),new THREE.MeshBasicMaterial({map:t,transparent:true}),xF+.24,1.5,zS-1.0,false);n.rotation.y=Math.PI/2}}
}
// ===== ดาดฟ้าอาคาร 5 ตามผัง (ด้านบนของผัง = ถนนเข้าโรงงาน = ทิศตะวันออก, ซ้ายของผัง = ทิศเหนือ) =====
// ถังเก็บน้ำ 4 ถัง (มุมถนน-ทิศเหนือ), ห้องควบคุมและปั๊มน้ำชิลเลอร์ สูง 4 ม. (มุมถนน-ทิศใต้), ชิลเลอร์ 2 ยูนิต (กลางดาดฟ้า ติดห้องควบคุม), ราวกันตกรอบดาดฟ้า
{const b=B[2],R=b.h,xW=b.cx-b.ex/2,xE=b.cx+b.ex/2,zN=b.z0,zS=b.z0+b.ez,Bx=(a,c,d)=>new THREE.BoxGeometry(a,c,d),Cy=(r1,r2,h,n=16)=>new THREE.CylinderGeometry(r1,r2,h,n),Y1=V(0,1,0);
 const PX=x=>xE-x/497*b.ex,PZ=u=>zN+u/483*b.ez;                                                      // พิกัดจากผัง (พิกเซล) -> เมตร
 const stl=M(0x8f969f,{metalness:.6,roughness:.4}),sst=M(0xe3e6ea,{metalness:.35,roughness:.3}),sstD=M(0xb9bec5,{metalness:.4,roughness:.35}),
  wallM=M(0xeeeae2,{roughness:.85}),slab=M(0xc9ccd0,{roughness:.9}),dark=M(0x3a3f47,{metalness:.4,roughness:.5}),ins=M(0xd6d9dd,{metalness:.7,roughness:.3}),
  blu=M(0x2f62b8,{metalness:.4,roughness:.45}),rlM=M(0xc9ced6,{metalness:.6,roughness:.35});
 const pipe=(a,c,r,m)=>{const d=V(0,0,0).subVectors(c,a),o=mesh(Cy(r,r,d.length(),12),m,0,0,0);o.position.copy(a).addScaledVector(d,.5);o.quaternion.setFromUnitVectors(Y1,d.clone().normalize())};
 const run=(pts,r,m)=>{for(let i=0;i<pts.length-1;i++)pipe(pts[i],pts[i+1],r,m);for(let i=1;i<pts.length-1;i++)mesh(new THREE.SphereGeometry(r*1.05,12,8),m,pts[i].x,pts[i].y,pts[i].z)};
 // --- ถังเก็บน้ำสแตนเลส 4 ถัง บนขาตั้ง (Ø2.2 ม. สูง 2 ม.)
 const tk=[[44,53],[125,53],[44,132],[125,132]].map(([u,v])=>[PX(v),PZ(u)]),tR=1.1,tB=R+.58;
 tk.forEach(([x,z])=>{for(const a of[0,1,2,3]){const t=a*Math.PI/2+Math.PI/4;mesh(Bx(.1,.54,.1),stl,x+Math.cos(t)*.8,R+.27,z+Math.sin(t)*.8)}
  mesh(Cy(tR+.05,tR+.05,.06,28),stl,x,R+.55,z);
  mesh(Cy(tR,tR,2,28),sst,x,tB+1,z);
  for(const y of[.5,1.0,1.5])mesh(Cy(tR+.012,tR+.012,.05,28),sstD,x,tB+y,z,false);                 // แถบรัดถัง
  const d=mesh(new THREE.SphereGeometry(tR,28,10,0,Math.PI*2,0,Math.PI/2),sst,x,tB+2,z);d.scale.y=.25;
  mesh(Cy(.22,.22,.08,16),sstD,x,tB+2.27,z);                                                        // ฝาถัง
  mesh(Cy(.05,.05,.25,8),sstD,x+.5,tB+2.2,z)});                                                      // ท่อระบายอากาศ
 // --- ห้องควบคุมและปั๊มน้ำชิลเลอร์ สูง 4 ม.
 const rX0=PX(196),rX1=xE,rZ0=PZ(185),rZ1=zS,rH=4,rcx=(rX0+rX1)/2,rcz=(rZ0+rZ1)/2;
 mesh(Bx(rX1-rX0,rH,rZ1-rZ0),wallM,rcx,R+rH/2,rcz);
 mesh(Bx(rX1-rX0+.3,.2,rZ1-rZ0+.3),slab,rcx,R+rH+.1,rcz);                                          // พื้นหลังคาห้อง
 mesh(Bx(rX1-rX0+.3,.35,.1),slab,rcx,R+rH+.37,rZ0-.1);mesh(Bx(.1,.35,rZ1-rZ0+.3),slab,rX0-.1,R+rH+.37,rcz); // ขอบกันซึม
 const dX=rX0+1.2;mesh(Bx(1.0,2.1,.06),dark,dX,R+1.05,rZ0-.03);mesh(Bx(1.12,.06,.08),stl,dX,R+2.13,rZ0-.03);
 mesh(Bx(.06,.04,.12),sstD,dX+.35,R+1.05,rZ0-.08,false);                                           // ประตูเหล็ก + มือจับ
 const lvT=cv(32,32,(g,w,h)=>{g.fillStyle='#9aa0a8';g.fillRect(0,0,w,h);for(let j=0;j<h;j+=8){g.fillStyle='#5d636b';g.fillRect(0,j+5,w,3)}});
 for(const xx of[rX0+3.2,rX0+5.6]){const t=lvT.clone();t.needsUpdate=true;t.repeat.set(2,4);mesh(Bx(1.5,.9,.05),new THREE.MeshStandardMaterial({map:t,metalness:.4,roughness:.5}),xx,R+2.9,rZ0-.03,false)} // บานเกล็ดระบายอากาศ
 mesh(Bx(1.2,.9,.04),M(0x6f9cc0,{metalness:.3,roughness:.2}),rX0+3.2,R+1.6,rZ0-.03,false);         // หน้าต่าง
 mesh(Bx(.04,.9,1.2),M(0x6f9cc0,{metalness:.3,roughness:.2}),rX0-.03,R+2.2,rZ1-1.6,false);
 const sgT=cv(256,64,(g,w,h)=>{g.fillStyle='#1f4f8f';g.fillRect(0,0,w,h);g.fillStyle='#fff';g.font='bold 26px sans-serif';g.textAlign='center';g.fillText('ห้องควบคุม/ปั๊มชิลเลอร์',w/2,42)});
 mesh(Bx(1.6,.4,.02),new THREE.MeshStandardMaterial({map:sgT}),dX,R+2.45,rZ0-.04,false);
 // --- ชิลเลอร์ 2 ยูนิต บนแท่นเหล็ก
 const cX0=PX(315),cX1=PX(225),cZ0=PZ(181),cZ1=PZ(370),ccx=(cX0+cX1)/2,ccz=(cZ0+cZ1)/2,uL=cX1-cX0-.4,uW=(cZ1-cZ0-.7)/2,uH=2.2;
 mesh(Bx(cX1-cX0,.25,cZ1-cZ0),dark,ccx,R+.125,ccz);
 const vT=cv(128,128,(g,w,h)=>{g.fillStyle='#eef0f2';g.fillRect(0,0,w,h);g.fillStyle='#262a31';
  g.beginPath();g.moveTo(w*.06,h*.08);g.lineTo(w*.3,h*.08);g.lineTo(w*.48,h*.92);g.lineTo(w*.4,h*.92);g.closePath();g.fill();
  g.beginPath();g.moveTo(w*.94,h*.08);g.lineTo(w*.7,h*.08);g.lineTo(w*.52,h*.92);g.lineTo(w*.6,h*.92);g.closePath();g.fill();
  g.strokeStyle='#c4c8ce';g.lineWidth=3;g.strokeRect(1,1,w-2,h-2)});vT.repeat.set(2,1);
 const vM=new THREE.MeshStandardMaterial({map:vT,roughness:.55,metalness:.25}),uM=M(0xeef0f2,{roughness:.55,metalness:.25}),fd=M(0x2b2e33);
 const uZ=[cZ0+.25+uW/2,cZ1-.25-uW/2];
 uZ.forEach(uz=>{mesh(Bx(uL,uH,uW),[uM,uM,uM,uM,vM,vM],ccx,R+.25+uH/2,uz);                         // V-coil ด้านยาว
  for(const fx of[-uL/4,uL/4]){mesh(Cy(.62,.62,.35,24),uM,ccx+fx,R+.25+uH+.175,uz);mesh(Cy(.55,.55,.02,24),fd,ccx+fx,R+.25+uH+.36,uz)}
  mesh(Bx(.06,.5,.4),M(0xd9dde2,{metalness:.3}),cX1-.2-.03,R+1.4,uz+uW/2-.4,false);                  // แผงควบคุมเครื่อง
  for(const [y,dz] of[[R+.7,-.35],[R+1.05,.35]])run([V(cX1-.2,y,uz+dz),V(rX0,y,uz+dz)],.09,ins)});   // ท่อน้ำเย็นหุ้มฉนวน เข้าห้องปั๊ม
 // โซนคลิก: ถังเก็บน้ำประปา 4 ถัง / Chiller 2 ยูนิต + ห้องควบคุม-ปั๊มชิลเลอร์ (แยกกัน)
 {let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;tk.forEach(([x,z])=>{x0=Math.min(x0,x-tR);x1=Math.max(x1,x+tR);z0=Math.min(z0,z-tR);z1=Math.max(z1,z+tR)});
  zone('o_b5tank',(x0+x1)/2,R+1.45,(z0+z1)/2,x1-x0+.2,2.9,z1-z0+.2,0,1);
  const a0=Math.min(cX0,rX0),a1=Math.max(cX1,rX1),b0=Math.min(cZ0,rZ0),b1=Math.max(cZ1,rZ1);
  zone('o_b5chiller',(a0+a1)/2,R+rH/2,(b0+b1)/2,a1-a0+.2,rH,b1-b0+.2,0,-1)}
 // --- ท่อน้ำจากถังเก็บน้ำ (แต่ละแถว) เดินบนพื้นดาดฟ้าเข้าห้องควบคุม
 [[tk[0],tk[1]],[tk[2],tk[3]]].forEach(([a,c])=>{const x=a[0],y=R+.2;
  [a,c].forEach(t=>run([V(t[0],tB,t[1]),V(t[0],y,t[1])],.06,blu));
  run([V(x,y,a[1]),V(x,y,rZ0)],.07,blu);mesh(Bx(.2,.12,.2),dark,x,R+.06,(c[1]+rZ0)/2,false)});
 // --- ราวกันตกรอบดาดฟ้า (สูง 1.1 ม. เว้นแนวห้องควบคุม)
 const rail=(x0,z0,x1,z1)=>{const L=Math.hypot(x1-x0,z1-z0),n=Math.max(1,Math.round(L/1.5));
  for(let i=0;i<=n;i++)mesh(Bx(.06,1.1,.06),rlM,x0+(x1-x0)*i/n,R+.55,z0+(z1-z0)*i/n);
  for(const y of[1.1,.55])run([V(x0,R+y,z0),V(x1,R+y,z1)],.03,rlM);
  const ax=Math.abs(x1-x0)>Math.abs(z1-z0);mesh(Bx(ax?L:.02,.12,ax?.02:L),rlM,(x0+x1)/2,R+.06,(z0+z1)/2,false)};  // ขอบกันของตก
 const e=.15;rail(xW+e,zN+e,xE-e,zN+e);rail(xW+e,zN+e,xW+e,zS-e);rail(xW+e,zS-e,rX0-.05,zS-e);rail(xE-e,zN+e,xE-e,rZ0-.05);
}

// ชายคาเมทัลชีทสีน้ำเงิน ด้านตะวันออกของโรงงาน (ยื่น 1.5 ม. สูงจากพื้น 2.5 ม.)
const fc=B[1],FXE=fc.cx+fc.ex/2,FXW=fc.cx-fc.ex/2;                                   // ขอบผนังโรงงานฝั่งถนน (ตะวันออก) / ฝั่งชิลเลอร์ (ตะวันตก)
// ถนนเข้าโรงงาน: ขอบถนนฝั่งโรงงานชิดแผงกันชนสีเหลือง (ผิวนอก x = fc.ex/2+3.5+1.55+0.05 = 17.60) เว้นห่าง 1 ฟุต (0.3048 ม.)
// RXS = ระยะที่เลื่อนถนนและทุกอย่างฝั่งขวา (รถบรรทุกบนถนน, ลานจอดมอเตอร์ไซค์, ป้อม รปภ., โคมไฟถนน, เสาไฟฟ้า/หม้อแปลง) จากตำแหน่งเดิม (ถนนเดิม rdX = 23.5)
const rdW=6,rdX=FXE+3.5+1.55+.05+.3048+rdW/2,RXS=rdX-23.5;
// ช่องระหว่างโกดังกับโรงงาน: พื้นยกสูง 1 ม. มุงหลังคาเสมอชั้น 1 (สูง 8 ม.)
const wh=B[0],gz0=wh.z0+wh.ez,gL=fc.z0-gz0;
{const X0=wh.cx-wh.ex/2,X1=wh.cx+wh.ex/2,Z0=gz0,Z1=fc.z0,pcM=M(0xb5b8be,{roughness:1}),pb=(x0,x1,z0,z1)=>mesh(new THREE.BoxGeometry(x1-x0,1,z1-z0),pcM,(x0+x1)/2,.5,(z0+z1)/2);
 pb(X0,X1-4,Z0,Z1);
 // ===== ลานโหลดตามรูปจริง (มองจากถนนโรงงาน) =====
 const Bx=(a,c,d)=>new THREE.BoxGeometry(a,c,d),xF=X1-4,blu=M(0x1f4fa8,{roughness:.6}),blk=M(0x1b1d20,{roughness:.8}),ylw=M(0xf2b600,{roughness:.5}),wht=M(0xf3f3f1,{roughness:.85});
 const stripeT=cv(32,64,(g,w,h)=>{g.fillStyle='#f2b600';g.fillRect(0,0,w,h);g.fillStyle='#1b1d20';for(let y=-w;y<h;y+=24){g.beginPath();g.moveTo(0,y);g.lineTo(w,y+w);g.lineTo(w,y+w+12);g.lineTo(0,y+12);g.fill()}}),
  stM=new THREE.MeshStandardMaterial({map:stripeT,roughness:.5});
 // หน้าแท่นโหลด: ทาสีน้ำเงิน + ยางกันชนดำเป็นช่วง ๆ + แถบเหลืองขอบบน
 mesh(Bx(.04,1,Z1-Z0-5),blu,xF+.02,.5,(Z0+5+Z1)/2,false);mesh(Bx(.06,.06,Z1-Z0-5),ylw,xF+.03,1.0,(Z0+5+Z1)/2,false);
 for(let z=Z0+6;z<Z1-.5;z+=1.5)mesh(Bx(.18,.45,.35),blk,xF+.09,.55,z);
 // ห้องเลข 7 อยู่ในอาคารโกดัง (ชั้นล่าง ฝั่งขวาเมื่อมองจากถนน) ข้างทางลาด: หน้าต่างกระจก + เลข 7 บนผนังโกดังด้านที่หันไปทางโรงงาน
 // ทางลาดเดินขึ้นแท่นกว้าง 1.5 ม. ชิดผนังโกดัง ลาดจากฝั่งถนนขึ้นไปถึงแท่น (ขอบเหลือง ข้างทาสีน้ำเงิน)
 {const gl=M(0x1d2a35,{roughness:.15,metalness:.5}),wz=Z0+.03;
  mesh(Bx(1.4,1.0,.06),gl,xF-1.0,2.7,wz,false);mesh(Bx(1.6,.1,.14),wht,xF-1.0,2.15,wz+.04,false);
  for(const dx of[-.75,.75])mesh(Bx(.08,1.1,.08),wht,xF-1.0+dx,2.7,wz+.02,false);mesh(Bx(1.6,.08,.08),wht,xF-1.0,3.24,wz+.02,false);
  {const t=cv(128,128,(g,w,h)=>{g.clearRect(0,0,w,h);g.fillStyle='#1f4f9f';g.font='bold 110px Arial, sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('7',w/2,h/2+6)});
   mesh(new THREE.PlaneGeometry(.7,.7),new THREE.MeshBasicMaterial({map:t,transparent:true}),xF+.7,2.8,wz,false)}
  const rw=1.5,rl=4.5,sh=new THREE.Shape();sh.moveTo(0,0);sh.lineTo(rl,0);sh.lineTo(0,1);sh.lineTo(0,0);             // สูง 1 ม. ที่ขอบแท่น ลาดลงไปทางถนน
  mesh(new THREE.ExtrudeGeometry(sh,{depth:rw,bevelEnabled:false}).translate(xF,0,Z0),M(0x8f9399,{roughness:1}),0,0,0);
  const L=Math.hypot(rl,1),e=mesh(Bx(L,.05,.12),ylw,xF+rl/2,.52,Z0+rw-.06,false);e.rotation.z=-Math.atan2(1,rl);
  {const s2=new THREE.Shape();s2.moveTo(0,0);s2.lineTo(rl,0);s2.lineTo(0,1);s2.lineTo(0,0);mesh(new THREE.ShapeGeometry(s2),M(0x1f4fa8,{roughness:.6,side:THREE.DoubleSide}),xF,0,Z0+rw+.01,false)}}
 // ของบนแท่น: ถังพลาสติกน้ำเงิน, กล่องลัง, พาเลท
 {const dr=M(0x1f5fd0,{roughness:.4}),pl=M(0xe0b020,{roughness:.7});
  for(let z=Z0+5.6;z<Z1-2.2;z+=.68){if(Math.abs(z-(Z1-11.4))<1.1||Math.abs(z-(Z1-6.6))<1.1)continue;mesh(Bx(1.1,.12,.66),pl,xF-.6,1.06,z);mesh(new THREE.CylinderGeometry(.29,.29,.9,14),dr,xF-.6,1.57,z)}      // ถังน้ำเงินเรียงแถวบนพาเลทริมแท่น   // เว้นช่องตรงพาเลทของช่องเทียบท่า
  for(let k=0;k<4;k++)mesh(new THREE.CylinderGeometry(.29,.29,.9,14),dr,xF-3.2-(k%2)*.62,1.45+(k>>1)*.92,Z0+6.2);
  const bx=M(0xc9a777,{roughness:.9});for(const [x,z,h] of[[xF-1.4,Z0+10,.9],[xF-1.4,Z0+10.9,.6],[xF-2.3,Z0+10.4,1.2]])mesh(Bx(.8,h,.8),bx,x,1+h/2,z);
  mesh(Bx(1.2,.8,1.0),M(0xc0262c,{roughness:.6}),xF-1.3,1.4,Z0+12.6)}
 // ประตูม้วนในลานโหลด (ผนังโรงงาน) + ไฟฟลูออเรสเซนต์ใต้หลังคา
 mesh(Bx(4.2,3.6,.08),M(0x2a2d31,{metalness:.4,roughness:.5}),xF-6,1+1.8,Z1-.06,false);
 for(const z of[Z0+6,Z0+10])mesh(Bx(.12,.05,1.2),M(0xfffbe8,{emissive:0xfff3c8,emissiveIntensity:.5}),xF-1.5,wh.fh-.5,z,false);
 // ชายคาหน้าลานโหลดฝั่งถนน (ตามรูปจากถนน): แผงลาด+แผงตั้ง สีน้ำเงินเดียวกับชายคาโรงงาน ขอบนอกแนวเดียวกับชายคาโรงงานฝั่งถนน,
 // ปลายทั้งสองข้างปิดด้วยแผงสีเดียวกัน, ใต้หลังคาเป็นโครงถักเหล็ก
 {const zA=Z0,zB=Z1,L=zB-zA,zc=(zA+zB)/2,teal=M(0x2f62a8,{roughness:.45,metalness:.4}),pink=teal,
   xIn=X1-1.2,yIn=5.7,xOut=FXE+3.5+.35+1.15,yOut=7.6,yTop=10.2;                        // ขอบนอกแนวเดียวกับชายคาโรงงานฝั่งถนน
  const sl=Math.hypot(xOut-xIn,yOut-yIn),sk=mesh(Bx(.1,sl,L),teal,(xIn+xOut)/2,(yIn+yOut)/2,zc);sk.rotation.z=-Math.atan2(xOut-xIn,yOut-yIn);
  mesh(Bx(.12,yTop-yOut,L),pink,xOut,(yOut+yTop)/2,zc);mesh(Bx(xOut-X1+.1,.1,L),pink,(X1+xOut)/2,yTop,zc);                       // แผงตั้ง + ฝาบน
  mesh(Bx(.14,.1,L),M(0x244e8a),xIn,yIn-.03,zc,false);                                                                         // ขอบล่าง
  {const sh=new THREE.Shape();sh.moveTo(xIn,yIn);sh.lineTo(xOut,yOut);sh.lineTo(xOut,yTop);sh.lineTo(X1,yTop);sh.lineTo(X1,yIn);sh.lineTo(xIn,yIn);
   const cap=mesh(new THREE.ShapeGeometry(sh),M(0x2f62a8,{roughness:.45,metalness:.4,side:THREE.DoubleSide}),0,0,zB,false)}            // ปิดปลายฝั่งโรงงาน
  {const sh=new THREE.Shape();sh.moveTo(X1,yIn);sh.lineTo(xIn,yIn);sh.lineTo(xOut,yOut);sh.lineTo(xOut,yTop);sh.lineTo(X1,yTop);sh.lineTo(X1,yIn);
   mesh(new THREE.ShapeGeometry(sh),M(0x2f62a8,{roughness:.45,metalness:.4,side:THREE.DoubleSide}),0,0,zA+.02,false)}                  // ปลายฝั่งโกดัง
  }
 // ปลอกเสากันชน สีน้ำเงิน + แถบเหลือง-ดำ ที่เสาหน้าลานฝั่งถนน
 mesh(Bx(.6,1.3,.6),[stM,stM,blu,blu,stM,stM],X1-.25,.65,Z1-.4)}
// หลังคาย่อยหน้าลานโหลดฝั่งโรงงาน (ซ้ายในรูปจากถนน): ยื่นออกมาทางถนนเสมอแนวห้องงานระบบ หลังคาเมทัลชีทฟ้า ขอบลอนน้ำเงิน ฝ้าขาว
// โมเดลจักรยานแม่บ้าน/ซิตี้ไบค์ (ล้อหน้าอยู่ +x ในพิกัดกลุ่ม) — ใช้ที่หน้าแผนกวิศวกรรมและใต้หลังคาลานโหลดโกดัง
function makeBicycle(col,basket){const tube=(g,a,b,r,m)=>{const d=new THREE.Vector3().subVectors(b,a),o=new THREE.Mesh(new THREE.CylinderGeometry(r,r,d.length(),8),m);
     o.position.copy(a).addScaledVector(d,.5);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());o.castShadow=true;g.add(o)};
   const tyre=M(0x1a1c1e,{roughness:.8}),rim=M(0xc9ced3,{metalness:.8,roughness:.25}),blk=M(0x2a2d30,{roughness:.6}),brown=M(0x6b4a2e,{roughness:.6}),
    cream=M(0xf2ead8,{roughness:.6}),wheelG=new THREE.TorusGeometry(.34,.035,8,28),rimG=new THREE.TorusGeometry(.3,.012,6,28),hubG=new THREE.CylinderGeometry(.03,.03,.1,8).rotateX(Math.PI/2),
    spokeM=new THREE.MeshStandardMaterial({color:0xd8dde2,metalness:.7,roughness:.3,transparent:true,opacity:.35}),diskG=new THREE.CircleGeometry(.3,20);
   // จักรยานแม่บ้าน/ซิตี้ไบค์ ล้อหน้าอยู่ +x ในพิกัดกลุ่ม (หมุนให้หันเข้าผนัง)
   const bicycle=(col,basket)=>{const g=new THREE.Group(),fr=M(col,{metalness:.45,roughness:.3}),R=.34,wb=1.05,yA=R,V3=(x,y)=>new THREE.Vector3(x,y,0);
    for(const x of[-wb/2,wb/2]){const w=new THREE.Mesh(wheelG,tyre);w.position.set(x,yA,0);g.add(w);const r=new THREE.Mesh(rimG,rim);r.position.set(x,yA,0);g.add(r);
     for(const s of[-1,1]){const d=new THREE.Mesh(diskG,spokeM);d.position.set(x,yA,s*.012);if(s<0)d.rotation.y=Math.PI;g.add(d)}const h=new THREE.Mesh(hubG,rim);h.position.set(x,yA,0);g.add(h)}
    const bb=V3(-.05,.33),st=V3(-.2,.86),ht=V3(.36,.92),htb=V3(.4,.76),ra=V3(-wb/2,yA),fa=V3(wb/2,yA);
    tube(g,bb,st,.024,fr);tube(g,bb,htb,.026,fr);tube(g,V3(-.17,.74),V3(.38,.82),.022,fr);tube(g,htb,ht,.026,fr);           // เฟรมสเต็ปทรู
    tube(g,bb,ra,.016,fr);tube(g,st,ra,.016,fr);tube(g,htb,fa,.018,fr);                                                    // ตะเกียบหลัง/หน้า
    tube(g,st,V3(-.24,.98),.014,rim);const sd=new THREE.Mesh(new THREE.BoxGeometry(.24,.06,.13),brown);sd.position.set(-.26,1.0,0);g.add(sd);   // หลักอาน + เบาะหนัง
    tube(g,ht,V3(.3,1.06),.016,rim);tube(g,V3(.3,1.06,0).setZ(-.26),V3(.3,1.06,0).setZ(.26),.013,blk);                       // แฮนด์
    for(const z of[-.25,.25]){const gr=new THREE.Mesh(new THREE.CylinderGeometry(.02,.02,.1,8).rotateX(Math.PI/2),brown);gr.position.set(.3,1.06,z);g.add(gr)}
    const cr=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,.015,16).rotateX(Math.PI/2),rim);cr.position.set(-.05,.33,.05);g.add(cr);        // จานหน้า
    for(const s of[-1,1]){tube(g,V3(-.05,.33).setZ(s*.07),V3(-.05+s*.12,.33-s*.08).setZ(s*.08),.012,blk);const pd=new THREE.Mesh(new THREE.BoxGeometry(.1,.02,.06),blk);pd.position.set(-.05+s*.12,.33-s*.08,s*.12);g.add(pd)}
    for(const [x0,x1] of[[-wb/2-.05,-wb/2+.3],[wb/2-.3,wb/2+.05]]){const fd=new THREE.Mesh(new THREE.TorusGeometry(R+.05,.02,4,16,Math.PI*.55),fr);fd.position.set((x0+x1)/2>0?wb/2:-wb/2,yA,0);fd.rotation.z=(x0+x1)/2>0?.25:Math.PI*.2;g.add(fd)}  // บังโคลน
    if(basket){const bk=new THREE.Mesh(new THREE.BoxGeometry(.3,.22,.34),M(0x9a7a4e,{roughness:.9}));bk.position.set(.52,.93,0);g.add(bk);
     const bi=new THREE.Mesh(new THREE.BoxGeometry(.26,.02,.3),M(0x3a2c1e));bi.position.set(.52,1.03,0);g.add(bi)}
    const rk=new THREE.Mesh(new THREE.BoxGeometry(.32,.025,.14),rim);rk.position.set(-.42,.78,0);g.add(rk);tube(g,V3(-.28,.78),V3(-wb/2,yA),.01,rim);   // ตะแกรงหลัง
    const lt=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,.06,10).rotateZ(Math.PI/2),M(0xfff6d8,{emissive:0xfff0c0,emissiveIntensity:.3}));lt.position.set(.44,.8,0);g.add(lt);
    const ks=new THREE.Mesh(new THREE.BoxGeometry(.02,.28,.02),rim);ks.position.set(-.08,.18,.08);ks.rotation.x=.35;g.add(ks);   // ขาตั้ง
    g.traverse(o=>{if(o.isMesh)o.castShadow=true});return g};
 return bicycle(col,basket)}
// เสาหน้ามุม (ข้างช่องลานโหลด) ปลอกน้ำเงินลายเหลือง-ดำ, ใต้หลังคา: พาเลทไม้ซ้อน, จักรยาน 2 คัน, รถยกพาเลทสีแดง
{const X1=wh.cx+wh.ex/2,zR=fc.z0,xa=X1-5,xb=X1+3.5,za=zR-4.6,hy=4.8,Bx=(a,c,d)=>new THREE.BoxGeometry(a,c,d),blu=M(0x1f4fa8,{roughness:.6});
 const rT=cv(16,16,(g,w,h)=>{g.fillStyle='#5aa6d8';g.fillRect(0,0,w,h);g.fillStyle='#3d86bd';g.fillRect(0,0,w,5)});rT.repeat.set(1,12);
 const rM=new THREE.MeshStandardMaterial({map:rT,roughness:.4,metalness:.4}),sof=M(0xf2f3f4,{roughness:.7});
 // ลาดเท่าหลังคาชั้นล่างโรงงานฝั่งถนน (สูง 4.8 → 5.4 ม. ในระยะ 3.5 ม. ≈ 9.7°): ขอบต่ำฝั่งถนน สูงขึ้นไปทางโกดัง
 const ang=Math.atan2(5.4-4.8,3.5),run=xb-xa,yMid=hy+run/2*Math.tan(ang);
 mesh(Bx(run/Math.cos(ang),.14,zR-za),[rM,rM,rM,sof,rM,rM],(xa+xb)/2,yMid,(za+zR)/2).rotation.z=-ang;
 mesh(Bx(.35,.45,zR-za+.2),M(0x4f9bd6,{roughness:.4,metalness:.3}),xb+.1,hy+.1,(za+zR)/2);
 mesh(Bx(run/Math.cos(ang),.45,.3),M(0x4f9bd6,{roughness:.4,metalness:.3}),(xa+xb)/2,yMid+.1,za-.1).rotation.z=-ang;            // ขอบลอนหลังคา (ลาดตามหลังคา)
 mesh(Bx(.12,.2,zR-za+.2),blu,xb+.3,hy-.15,(za+zR)/2,false);mesh(Bx(.5,.5,.5),blu,xb+.1,hy+.05,za-.1);                                  // ปลายครอบสีน้ำเงิน
 const cx=xb-.35,cz=za+.35;mesh(new THREE.CylinderGeometry(.16,.16,hy,12),M(0x9ab0be,{metalness:.4}),cx,hy/2,cz);
 {const t=cv(32,64,(g,w,h)=>{g.fillStyle='#f2b600';g.fillRect(0,0,w,h);g.fillStyle='#1b1d20';for(let y=-w;y<h;y+=24){g.beginPath();g.moveTo(0,y);g.lineTo(w,y+w);g.lineTo(w,y+w+12);g.lineTo(0,y+12);g.fill()}});
  const m=new THREE.MeshStandardMaterial({map:t,roughness:.5});mesh(Bx(.65,1.3,.65),[m,blu,blu,blu,m,blu],cx,.65,cz)}
 const pal=M(0xc49a62,{roughness:.9});for(let s2=0;s2<2;s2++)for(let k=0;k<10;k++)mesh(Bx(1.0,.14,1.2),pal,xb-2.6-s2*1.15,.09+k*.16,zR-1.2);
 const bk=(x,z,c)=>{const m=M(c,{metalness:.4,roughness:.4}),tk=M(0x1b1d20);for(const dz of[-.55,.55]){const w=mesh(new THREE.TorusGeometry(.33,.03,6,18),tk,x,.36,z+dz);w.rotation.y=Math.PI/2}
  mesh(Bx(.04,.04,1.0),m,x,.62,z);mesh(Bx(.04,.5,.04),m,x,.55,z-.15);mesh(Bx(.18,.05,.25),M(0x222222),x,.86,z-.2);mesh(Bx(.4,.04,.04),m,x,.95,z+.45)};
 for(const [bx,c,b] of[[xb-.95,0xe8b4c4,1],[xb-1.6,0x8a8f96,0]]){const g=makeBicycle(c,b);g.position.set(bx,.12,zR-2.3);g.rotation.y=-Math.PI/2;scene.add(g)}   // จักรยาน 2 คัน (โมเดลเดียวกับหน้าแผนกวิศวกรรม)
 mesh(Bx(.7,1.6,.9),M(0xc0262c,{roughness:.5}),xb-4.2,.8,zR-2.4);mesh(Bx(.7,.08,1.4),M(0x2a2d31,{metalness:.5}),xb-4.2,.1,zR-3.2)}
mesh(new THREE.BoxGeometry(wh.ex,.12,gL-4),M(0x9a9da3,{roughness:1}),wh.cx,.06,gz0+4+(gL-4)/2,false);
const rfT=cv(16,16,(g,w,h)=>{for(let j=0;j<h;j++){g.fillStyle=j<8?'#2468d0':'#17489a';g.fillRect(0,j,w,1)}});rfT.repeat.set(1,gL/.6);
const rfM=new THREE.MeshStandardMaterial({map:rfT,roughness:.4,metalness:.5}),rfS=M(0x17489a,{metalness:.5,roughness:.35});
mesh(new THREE.BoxGeometry(wh.ex,.3,gL-1),[rfS,rfS,rfM,rfM,rfS,rfS],wh.cx,wh.fh-.15,gz0+1+(gL-1)/2);
for(const sx of[-1,1])mesh(new THREE.BoxGeometry(.3,wh.fh,.3),M(0x777d88),wh.cx+sx*(wh.ex/2-.25),wh.fh/2,fc.z0-.4);
// โครงถักเหล็กรับหลังคาลานโหลด: ถักพาดช่วงสั้นจากผนังโกดังไปผนังโรงงาน (แนว z) ทุก 3 ม. ตามแนวยาวลาน, คอร์ดบนชิดใต้หลังคา
// + แปเหล็กตามแนว x วางบนคอร์ดบน + ค้ำทแยงกากบาทระหว่างถักคู่ริม
{const tr=M(0x8f969f,{metalness:.55,roughness:.4}),Bx=(a,c,d)=>new THREE.BoxGeometry(a,c,d),X0=wh.cx-wh.ex/2,X1=wh.cx+wh.ex/2,
  z0=gz0+.15,z1=fc.z0-.15,L=z1-z0,zc=(z0+z1)/2,yT=wh.fh-.36,yB=wh.fh-1.1,dh=yT-yB;
 const bar=(a,b,t=.06)=>{const d=new THREE.Vector3().subVectors(b,a),o=mesh(Bx(t,t,d.length()),tr,0,0,0,false);o.position.copy(a).addScaledVector(d,.5);o.lookAt(b);return o};
 const xs=[];for(let x=X0+.5;x<=X1-.4;x+=3)xs.push(x);
 for(const x of xs){mesh(Bx(.1,.1,L),tr,x,yT,zc,false);mesh(Bx(.08,.08,L),tr,x,yB,zc,false);                     // คอร์ดบน/ล่าง
  const n=Math.round(L/1.5);for(let i=0;i<=n;i++){const z=z0+L*i/n;mesh(Bx(.05,dh,.05),tr,x,(yT+yB)/2,z,false);       // เสาตั้ง
   if(i<n){const zn=z0+L*(i+1)/n;bar(V(x,i%2?yT:yB,z),V(x,i%2?yB:yT,zn),.045)}}}                                     // ทแยงสลับ
 for(let z=z0+.75;z<z1;z+=1.5)mesh(Bx(X1-X0,.07,.07),tr,(X0+X1)/2,yT+.1,z,false);                                   // แป
 for(const [xa,xb] of[[xs[0],xs[1]],[xs[xs.length-2],xs[xs.length-1]]]){bar(V(xa,yT,z0),V(xb,yT,z1),.035);bar(V(xb,yT,z0),V(xa,yT,z1),.035)}}
// ชายคาโค้ง (bullnose) ฝั่ง Chiller (ทิศตะวันตก): ต่อจากขอบหลังคาลานโหลดยื่นออก 1.5 ม. สีน้ำเงินเดียวกับหลังคา
{const X0=wh.cx-wh.ex/2,EH=wh.fh,R=1.15,z0=gz0+1,L=fc.z0-z0,pts=[];
 for(let i=0;i<=16;i++){const t=i/16*Math.PI/2;pts.push([X0-.35-R*Math.sin(t),EH-R*(1-Math.cos(t))])}
 const sh=new THREE.Shape();sh.moveTo(X0+.05,EH+.02);pts.forEach(p=>sh.lineTo(p[0],p[1]));
 pts.slice().reverse().forEach(p=>{const a=Math.atan2(p[1]-(EH-R),X0-.35-p[0]);sh.lineTo(p[0]+.06*Math.sin(a),p[1]-.06*Math.cos(a)*0-.06)});sh.lineTo(X0+.05,EH-.04);
 const bT=cv(16,16,(g,w,h)=>{g.fillStyle='#2468d0';g.fillRect(0,0,w,h);g.fillStyle='#17489a';g.fillRect(0,0,w,5)});bT.wrapS=bT.wrapT=THREE.RepeatWrapping;bT.repeat.set(.6,.6);
 mesh(new THREE.ExtrudeGeometry(sh,{depth:L,bevelEnabled:false}).translate(0,0,z0),new THREE.MeshStandardMaterial({map:bT,roughness:.4,metalness:.45,side:THREE.DoubleSide}),0,0,0);
 mesh(new THREE.BoxGeometry(.06,.18,L),M(0x17489a,{metalness:.5,roughness:.35}),X0-.35-R,EH-R+.05,z0+L/2)}
// ทางลาดกว้าง 1.5 ม. ติดอาคารโกดัง เดินขึ้นแท่นโหลด
{const rw=new THREE.Shape();rw.moveTo(0,0);rw.lineTo(0,1);rw.lineTo(-4,0);rw.lineTo(0,0);
 [[rw,wh.cx-wh.ex/2]].forEach(q=>mesh(new THREE.ExtrudeGeometry(q[0],{depth:2,bevelEnabled:false}).translate(q[1],0,gz0),M(0xc4c7cc,{roughness:1}),0,0,0))}
// ทางเดินกว้าง 1 ม. รอบหลังคา พร้อมราวกันตก
const wkM=M(0x5c626b,{metalness:.5,roughness:.6}),rlM=M(0xe5b400,{metalness:.3,roughness:.5});
for(const sx of[-1,1]){const wx=wh.cx+sx*(wh.ex/2-.5),ex=wh.cx+sx*wh.ex/2;
 
 for(let k=0;k<=6;k++)mesh(new THREE.CylinderGeometry(.03,.03,1.1,6),rlM,ex-sx*.05,wh.fh+.55,gz0+.1+k*(gL-.2)/6);
 for(const hy of[1.1,.55])mesh(new THREE.BoxGeometry(.05,.05,gL),rlM,ex-sx*.05,wh.fh+hy,gz0+gL/2)}
mesh(new THREE.BoxGeometry(wh.ex,.1,1),wkM,wh.cx,wh.fh-.05,gz0+.5);
// คอมเพรสเซอร์แอร์วางประปรายบนหลังคา
const acG=new THREE.BoxGeometry(.85,.65,.35),acM=M(0xe8eaed,{metalness:.3,roughness:.5}),acF=new THREE.CylinderGeometry(.24,.24,.02,16).rotateX(Math.PI/2),acD=M(0x2b2e33);
[[-9.5,10,-Math.PI/2],[-9.5,24,-Math.PI/2],[-9.5,40,-Math.PI/2],[9.5,14,Math.PI/2],[9.5,30,Math.PI/2],[9.5,46,Math.PI/2],[-7.5,-.5,Math.PI],[7.5,-.5,Math.PI]].forEach((q,i)=>{const a=new THREE.Group(),b1=new THREE.Mesh(acG,acM),f=new THREE.Mesh(acF,acD);b1.position.y=.4;b1.castShadow=true;f.position.set(0,.4,.18);a.add(b1,f);a.position.set(wh.cx+q[0],wh.fh,q[1]);a.rotation.y=q[2];scene.add(a)});
// รถบรรทุกมารอรับ-ส่งสินค้า
const trG={cab:new THREE.BoxGeometry(1.7,2.2,2.4),cargo:new THREE.BoxGeometry(5.65,2.5,2.5),chs:new THREE.BoxGeometry(7.4,.3,2),ws:new THREE.BoxGeometry(.05,.9,2),sw:new THREE.BoxGeometry(1,.8,2.44),wh:new THREE.CylinderGeometry(.5,.5,.3,18).rotateX(Math.PI/2),lp:new THREE.BoxGeometry(.06,.2,.3)};
const trD=M(0x23262b,{roughness:.8}),trT=M(0x15171a,{roughness:.9}),trGl=new THREE.MeshStandardMaterial({color:0x1b2733,metalness:.9,roughness:.08}),trL=new THREE.MeshStandardMaterial({color:0xaa1111,emissive:0xcc1111,emissiveIntensity:.5});
function addTruck(cab,cargo,x,z,ry=-Math.PI/2){const g=new THREE.Group(),add=(ge,m,px,py,pz)=>{const o=new THREE.Mesh(ge,m);o.position.set(px,py,pz);o.castShadow=true;o.receiveShadow=true;g.add(o)};
 add(trG.cargo,M(cargo,{roughness:.5,metalness:.2}),-.88,2.25,0);add(trG.cab,M(cab,{metalness:.5,roughness:.3}),2.9,1.8,0);
 add(trG.ws,trGl,3.78,2.3,0);add(trG.sw,trGl,2.9,2.3,0);add(trG.chs,trD,0,.85,0);
 for(const wx of[-2.6,-1.4,2.9])for(const wz of[-1.05,1.05])add(trG.wh,trT,wx,.5,wz);
 for(const lz of[-.9,.9])add(trG.lp,trL,-3.72,1.3,lz);
 g.position.set(x,.12,z);g.rotation.y=ry;scene.add(g)}

// ประตูม้วนโกดัง (กว้าง 5 × สูง 4.5 ม.) กึ่งกลางผนังด้านโรงงาน บนแท่นโหลดสูง 1 ม.
{const dT=cv(16,16,(g,w,h)=>{g.fillStyle='#c4c9d0';g.fillRect(0,0,w,8);g.fillStyle='#9aa1ab';g.fillRect(0,8,w,8)});dT.repeat.set(1,22);
 const dM=new THREE.MeshStandardMaterial({map:dT,metalness:.5,roughness:.45}),dF=M(0x3b4048,{metalness:.5,roughness:.5});
 mesh(new THREE.BoxGeometry(5,4.5,.1),dM,wh.cx,3.25,gz0+.05);
 mesh(new THREE.BoxGeometry(5.5,.5,.4),dF,wh.cx,5.75,gz0+.2);
 for(const s of[-1,1])mesh(new THREE.BoxGeometry(.18,4.5,.16),dF,wh.cx+s*2.59,3.25,gz0+.08)}   // (รถบรรทุกจอดนิ่งเดิมเอาออก — มีรถบรรทุกวิ่งเข้า-ออกแทน ดู TRAF)
// ด้านหลังโกดัง (ทิศเหนือ) ตามรูปจริง: ผนังเมทัลชีทขาว + ช่องหน้าต่างแนวตั้ง, ฐานทาสีน้ำเงิน, หอบันไดหนีไฟโครงคอนกรีตสีขาว ราวเหล็ก หลังคาแผ่นพื้น
const feM=M(0x3b4048,{metalness:.6,roughness:.5}),frM=M(0xc9ced6,{metalness:.5,roughness:.4}),ccW=M(0xf1f1ee,{roughness:.85});
const stG=(()=>{const n=22,rise=4,run=6,dx=run/n,dy=rise/n,s=new THREE.Shape();s.moveTo(0,-.25);s.lineTo(0,dy);for(let i=1;i<=n;i++){s.lineTo(i*dx,i*dy);if(i<n)s.lineTo(i*dx,(i+1)*dy)}s.lineTo(run,rise-.25);s.lineTo(0,-.25);return new THREE.ExtrudeGeometry(s,{depth:1.2,bevelEnabled:false}).translate(0,0,-.6)})();
function rail(a,b){const d=new THREE.Vector3().subVectors(b,a),o=new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,d.length(),6),frM);o.position.copy(a).addScaledVector(d,.5);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.clone().normalize());o.castShadow=true;scene.add(o)}
const fxs=wh.cx-3;
{const X0=fxs-2.55,X1=fxs+8.55,Z0=-.15,Z1=-3.3,TT=wh.h+2.5,cxT=(X0+X1)/2,czT=(Z0+Z1)/2,Bx=(a,c,d)=>new THREE.BoxGeometry(a,c,d);
 // บันได 2 ช่วงต่อชั้น (ช่วงละ 4 ม.) + ชานพักกลาง/ชานพักชั้น เป็นคอนกรีต
 for(let k=0;k<4;k++){const y0=8*k;
  const sa=new THREE.Mesh(stG,ccW),sb=new THREE.Mesh(stG,ccW);sa.position.set(fxs,y0,-.8);sb.position.set(fxs+6,y0+4,-2.3);sb.rotation.y=Math.PI;sa.castShadow=sb.castShadow=sa.receiveShadow=sb.receiveShadow=true;scene.add(sa,sb);
  mesh(Bx(2.4,.2,3),ccW,fxs+7.2,y0+4-.1,-1.6);mesh(Bx(2.4,.2,3),ccW,fxs-1.2,y0+8-.1,-1.6);
  rail(V(fxs,y0+1,-1.4),V(fxs+6,y0+5,-1.4));rail(V(fxs+6,y0+5,-3),V(fxs,y0+9,-3));                      // ราวบันได
  for(const [y,xa,xb] of[[y0+4,fxs+6,X1-.15],[y0+8,X0+.15,fxs]])for(const hy of[1.0,.5])rail(V(xa,y+hy,Z1+.15),V(xb,y+hy,Z1+.15)); // ราวชานพักด้านนอก
  for(const [y,x] of[[y0+4,X1-.15],[y0+8,X0+.15]])for(const hy of[1.0,.5])rail(V(x,y+hy,Z0-.1),V(x,y+hy,Z1+.15))}
 // โครงหอบันไดคอนกรีต: เสา + คานทุกระดับ 4 ม. + หลังคาแผ่นพื้น
 for(const x of[X0,fxs,fxs+6,X1])mesh(Bx(.35,TT,.35),ccW,x,TT/2,Z1);
 for(const x of[X0,X1])mesh(Bx(.35,TT,.35),ccW,x,TT/2,Z0-.05);
 for(let y=4;y<=wh.h;y+=4){mesh(Bx(X1-X0+.35,.4,.3),ccW,cxT,y-.1,Z1);for(const x of[X0,X1])mesh(Bx(.3,.4,Z0-Z1),ccW,x,y-.1,czT)}
 mesh(Bx(X1-X0+.9,.3,Z0-Z1+.7),ccW,cxT,TT+.15,czT-.2);mesh(Bx(X1-X0+.9,.5,.12),ccW,cxT,TT+.45,Z1-.53);  // หลังคาหอบันได + ขอบ
 mesh(Bx(X1-X0,.15,Z0-Z1),M(0xb5b8be,{roughness:1}),cxT,.075,czT,false);                           // พื้นใต้หอบันได
 // ประตูทางออกชั้นล่างใต้หอบันได + ไฟ
 mesh(Bx(1.1,2.2,.06),M(0xc9ced6,{metalness:.4,roughness:.5}),fxs+3.2,1.1,-.03);mesh(Bx(1.25,.08,.1),feM,fxs+3.2,2.25,-.03)}
// ผนังด้านหลัง: ช่องหน้าต่างแนวตั้ง (ร่องผนัง) + ประตู/หน้าต่างชั้นล่าง ข้างหอบันไดฝั่งถนน
{const xw=(fxs+8.55+wh.cx+wh.ex/2)/2,Bx=(a,c,d)=>new THREE.BoxGeometry(a,c,d);   // อยู่ฝั่งถนน (ระหว่างหอบันไดกับมุมอาคารฝั่งถนนเข้าโรงงาน)mesh(Bx(1.9,wh.h-9,.12),M(0xe7e9ec,{roughness:.6}),xw,8+(wh.h-9)/2,-.06,false);
 for(let k=1;k<4;k++)for(const yy of[2.2,5.2])mesh(Bx(1.2,1.5,.05),M(0x2c3540,{metalness:.3,roughness:.25}),xw,8*k+yy,-.13,false);
 mesh(Bx(1.5,2.4,.05),M(0x2c3540,{metalness:.3,roughness:.25}),xw,1.9,-.03,false);mesh(Bx(1.7,.1,.1),feM,xw,3.15,-.05)}
// ฐานผนังโกดังทาสีน้ำเงิน สูง 1 ม. รอบอาคาร
{const bl=M(0x2f5fb8,{roughness:.6}),x0=wh.cx-wh.ex/2,x1=wh.cx+wh.ex/2;
 mesh(new THREE.BoxGeometry(wh.ex+.06,1,.04),bl,wh.cx,.5,-.02,false);
 for(const x of[x0-.02,x1+.02])mesh(new THREE.BoxGeometry(.04,1,wh.ez),bl,x,.5,wh.cz,false)}
// ทางเดินรอบอาคารโกดังที่ระดับชั้น 1 (ซ้าย ขวา หลัง) กว้าง 1 ม. พร้อมราวกันตก
{const xoL=wh.cx-wh.ex/2-1,xoR=wh.cx+wh.ex/2+1,zz=gz0+1,
 rl=(x1,z1,x2,z2)=>{for(const hy of[1.1,.55])rail(V(x1,wh.fh+hy,z1),V(x2,wh.fh+hy,z2));const n=Math.max(1,Math.round(Math.hypot(x2-x1,z2-z1)/2));for(let i=0;i<=n;i++)mesh(new THREE.CylinderGeometry(.03,.03,1.1,6),frM,x1+(x2-x1)*i/n,wh.fh+.55,z1+(z2-z1)*i/n,false)};
 for(const sx of[-1,1]){mesh(new THREE.BoxGeometry(1,.1,zz+1),wkM,wh.cx+sx*(wh.ex/2+.5),wh.fh-.05,gz0/2);
  }
 mesh(new THREE.BoxGeometry(wh.ex+2,.1,1),wkM,wh.cx,wh.fh-.07,-.5);
 rl(xoL,-1,xoL,zz);rl(xoR,-1,xoR,zz);rl(xoL,-1,fxs-2.4,-1);rl(fxs+8.4,-1,xoR,-1);rl(xoL,zz,wh.cx-wh.ex/2,zz);rl(xoR,zz,wh.cx+wh.ex/2,zz)}
// ฐานยกพื้นโรงงาน 30 ซม. (พื้นคอนกรีต) ใต้ตัวอาคาร + ห้องงานระบบ + ส่วนยื่นฝั่งอาคาร 5
{const pm=M(0xc9cbce,{roughness:.95}),xL=FXW-.15,xR=FXE+3.5+.15,z0=fc.z0-.15,zE=fc.z0+fc.ez,xP=-1.9;
 mesh(new THREE.BoxGeometry(xR-xL,FY,zE+.15-z0),pm,(xL+xR)/2,FY/2,(z0+zE+.15)/2);
 mesh(new THREE.BoxGeometry(xR-xP+.15,FY,1.6),pm,(xP-.15+xR)/2,FY/2,zE+.15+.8)}
// ห้องงานระบบด้านข้างโรงงาน (ฝั่งถนนเข้าโรงงาน) ตามรูปจริง: ยื่น 3.5 ม. ผนังเมทัลชีทขาว ฐานทาสีน้ำเงิน 1 ม.,
// หลังคาเมทัลชีทสีฟ้า (สูง 4.8→5.4 ม.) ลาดขึ้นหาผนังโรงงาน, ชายคาโค้งเมทัลชีทสีฟ้ายื่น 1.5 ม., ประตูม้วน/ประตู/บานเกล็ด, คอมเพรสเซอร์แอร์ + เสากันชนเหลือง, ท่อระบายอากาศ, เลข 6 ที่หัวอาคาร
{const X0=FXE,X1=X0+3.5,H1=4.8,H2=5.4,Z0=fc.z0,Z1=fc.z0+fc.ez,L=fc.ez,cz=fc.cz,Bx=(a,c,d)=>new THREE.BoxGeometry(a,c,d);
 const ribT=(rep,c1,c2)=>{const t=cv(16,16,(g,w,h)=>{g.fillStyle=c1;g.fillRect(0,0,w,h);g.fillStyle=c2;g.fillRect(0,0,6,h)});t.repeat.set(rep,1);return t};
 const wallE=new THREE.MeshStandardMaterial({map:ribT(L/.3,'#f3f4f5','#d9dce0'),roughness:.5,metalness:.3}),wallN=new THREE.MeshStandardMaterial({color:0xf4f4f2,roughness:.8});
 const bluM=M(0x1f4fbf,{roughness:.6}),tealM=M(0x2f8a99,{roughness:.4,metalness:.4}),tealD=M(0x244e8a,{roughness:.45,metalness:.4}),
  roofG=(()=>{const t=cv(16,16,(g,w,h)=>{for(let j=0;j<h;j++){g.fillStyle=j<8?'#5aa6d8':'#3d86bd';g.fillRect(0,j,w,1)}});t.repeat.set(1,L/.25);return new THREE.MeshStandardMaterial({map:t,roughness:.45,metalness:.5})})(),
  stl=M(0x8f969f,{metalness:.6,roughness:.4}),sst=M(0xc8cdd3,{metalness:.7,roughness:.3}),dark=M(0x2c3540,{metalness:.3,roughness:.3});
 // ตัวห้อง + ผนังด้านถนน + ฐานน้ำเงิน + ผนังหัว-ท้าย
 // ช่องเปิดลึก (ห้องโล่ง/ช่องโหลด) [ระยะจาก Z0, กว้าง, ระดับพื้น]: เว้นตัวห้องเป็นช่องลึก RD ม.
 const OPEN=[[48.1,4.5,FY],[36.8,3.4,FY],[33.3,3.4,FY],[100.6,5.0,FY+.1,3.2,1],[107.1,3.4,FY+1.0]],RD=1.8,OH=3.2;
 {const cuts=OPEN.map(([o,w,fl,dp])=>[Z0+o-w/2,Z0+o+w/2,dp||RD]).sort((a,b)=>a[0]-b[0]);let za=Z0;
  const seg=(a,b,x0,x1,y0,y1,pk)=>{if(b-a<.01)return;const wE=new THREE.MeshStandardMaterial({map:ribT((b-a)/.3,'#f3f4f5','#d9dce0'),roughness:.5,metalness:.3}),m=mesh(Bx(x1-x0,y1-y0,b-a),[wE,wE,wallN,wallN,wallN,wallN],(x0+x1)/2,(y0+y1)/2,(a+b)/2);if(pk){m.userData.id='fac';pick.push(m)}};
  for(const [a,b,dp] of cuts){seg(za,a,X0,X1,0,H1,1);if(X1-dp>X0+.01)seg(a,b,X0,X1-dp,0,H1,1);za=b}seg(za,Z1,X0,X1,0,H1,1);
  for(const [o,w,fl,dp0,lite] of OPEN){const RD=dp0||1.8;const a=Z0+o-w/2,b=Z0+o+w/2,dk=lite?M(0xe9ebec,{roughness:.8}):M(0x2a2f34,{roughness:.9}),fm=M(o>99&&o<103?0x2f8a55:0x8a8f94,{roughness:.8});
   seg(a,b,X1-RD,X1,fl+OH,H1,1);                                                                          // ทับหลังเหนือช่อง
   mesh(Bx(RD,fl,w),M(0x9ea3a8,{roughness:.9}),X1-RD/2,fl/2,(a+b)/2);mesh(Bx(RD-.05,.02,w-.05),fm,X1-RD/2,fl+.01,(a+b)/2,false);  // พื้นช่อง
   for(const z of[a+.01,b-.01])mesh(Bx(RD,OH,.02),dk,X1-RD/2,fl+OH/2,z,false);mesh(Bx(RD,.02,w),dk,X1-RD/2,fl+OH-.01,(a+b)/2,false);
   mesh(new THREE.PlaneGeometry(w,OH).rotateY(Math.PI/2),dk,X1-RD+.01,fl+OH/2,(a+b)/2,false)}}
 {let za=Z0;for(const [o,w] of[...OPEN].sort((p,q)=>p[0]-q[0])){const a=Z0+o-w/2;if(a>za)mesh(Bx(.04,1,a-za),bluM,X1+.02,FY+.5,(za+a)/2,false);za=Z0+o+w/2}mesh(Bx(.04,1,Z1-za),bluM,X1+.02,FY+.5,(za+Z1)/2,false)}for(const z of[Z0-.02,Z1+.02])mesh(Bx(3.5,1,.04),bluM,(X0+X1)/2,FY+.5,z,false);
 // หลังคาลาด (จาก 4 ม. ที่ผนังนอก ขึ้นไป 5.2 ม. ที่ผนังโรงงาน)
 {const run=X1-X0,ang=Math.atan2(H2-H1,run),len=Math.hypot(run,H2-H1);const r=mesh(Bx(len,.1,L+.2),[roofG,roofG,roofG,roofG,roofG,roofG],(X0+X1)/2,(H1+H2)/2+.05,cz);r.rotation.z=-ang;r.userData.id='fac';pick.push(r);
  for(const z of[Z0-.08,Z1+.08]){const sh=new THREE.Shape();sh.moveTo(X0,H1);sh.lineTo(X1,H1);sh.lineTo(X0,H2);sh.lineTo(X0,H1);const g=new THREE.ShapeGeometry(sh);mesh(g,wallN,0,0,z,false).material.side=THREE.DoubleSide}}
 // ชายคาโค้ง (bullnose) สีฟ้า ระดับและสีเดียวกับชายคาชั้นล่างที่ยึดเสาโกดัง (สูง EH = 4.8 ม.) ยื่นออก 1.5 ม. + แผงปิดผนังจากหลังคาห้องถึงระดับชายคา
 {const EH=4.8,R=1.15,cv0=new THREE.Shape();const pts=[];for(let i=0;i<=16;i++){const t=i/16*Math.PI/2;pts.push([X1+.35+R*Math.sin(t)-.0,EH-R*(1-Math.cos(t))])}
  const outer=pts.map(p=>V(p[0],p[1],0)),inner=pts.map(p=>V(p[0]-.06*Math.sin(Math.atan2(p[1]-(EH-R),p[0]-(X1+.35))),p[1]-.06,0));
  const sh=new THREE.Shape();sh.moveTo(X1-.05,EH+.02);outer.forEach(p=>sh.lineTo(p.x,p.y));inner.slice().reverse().forEach(p=>sh.lineTo(p.x,p.y));sh.lineTo(X1-.05,EH-.04);
  const rT=(()=>{const t=cv(16,16,(g,w,h)=>{g.fillStyle='#5aa6d8';g.fillRect(0,0,w,h);g.fillStyle='#3d86bd';g.fillRect(0,0,w,5)});t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(.6,.6);return t})();
  const cn=mesh(new THREE.ExtrudeGeometry(sh,{depth:L,bevelEnabled:false}).translate(0,0,Z0),new THREE.MeshStandardMaterial({map:rT,roughness:.4,metalness:.45,side:THREE.DoubleSide}),0,0,0);cn.userData.id='fac';pick.push(cn);
  mesh(Bx(.06,.18,L),M(0x4f9bd6,{roughness:.4,metalness:.3}),X1+.35+R,EH-R+.05,cz)}                                                   // ขอบปลายชายคา
 // ประตู/ช่องเปิดด้านถนน (ตำแหน่งตามแนวยาว จากหัวอาคารฝั่งโกดัง)
 let fx=X1+.03;const shT=(()=>{const t=cv(16,16,(g,w,h)=>{g.fillStyle='#d8dcdf';g.fillRect(0,0,w,h);g.fillStyle='#a9afb5';g.fillRect(0,0,w,3)});t.repeat.set(1,10);return t})();
 const shutter=(z,w)=>{mesh(Bx(.06,3,w),new THREE.MeshStandardMaterial({map:shT,metalness:.5,roughness:.4}),fx,1.5,z,false);mesh(Bx(.2,.35,w+.2),sst,fx+.08,3.15,z);for(const s of[-1,1])mesh(Bx(.08,3,.08),stl,fx+.02,1.5,z+s*w/2)};
 const door=(z,dbl)=>{const w=dbl?1.6:.95;mesh(Bx(.05,2.2,w),M(0xe9ebee,{roughness:.5}),fx,1.1,z,false);mesh(Bx(.05,.5,dbl?.35:.3),dark,fx+.01,1.6,z-(dbl?.4:0),false);if(dbl)mesh(Bx(.05,.5,.35),dark,fx+.01,1.6,z+.4,false);mesh(Bx(.07,2.3,.06),stl,fx,1.15,z-w/2);mesh(Bx(.07,2.3,.06),stl,fx,1.15,z+w/2);mesh(Bx(.07,.06,w),stl,fx,2.27,z)};
 const louver=(z)=>{const t=cv(32,32,(g,w,h)=>{g.fillStyle='#dfe2e5';g.fillRect(0,0,w,h);for(let j=0;j<h;j+=6){g.fillStyle='#8f969c';g.fillRect(0,j+3,w,3)}});t.repeat.set(1,4);mesh(Bx(.05,1.4,1.2),new THREE.MeshStandardMaterial({map:t,roughness:.5,metalness:.3}),fx,2.1,z,false)};
 const open=(z,w)=>{mesh(Bx(.06,3,w),M(0x1d2228,{roughness:.9}),fx,1.5,z,false)};                     // ช่องเปิดเก็บของ (ประตูเปิดอยู่)
 // ===== ผนังห้องงานระบบด้านถนน ตามรูปจริง (ระยะ o นับจากหัวอาคารฝั่งโกดัง Z0, ยาวรวม 120 ม.) =====
 // ฝั่งโกดัง → ฝั่งอาคาร 5: โรงเก็บของเปิด 2 ช่อง, ประตูคู่+แอร์, ผนังบานเกล็ด+ตู้ใส, ประตู/ประตูม้วน, ห้องบานเกล็ด,
 // ประตูม้วนท่าโหลด, ประตูคู่+คอนเดนซิ่ง, ห้องเครื่องเปิดโล่ง (พื้นเขียว), ช่องโหลดถังน้ำเงิน, ประตูม้วนท่าโหลด, ผนังเรียบยาวถึงหัวอาคาร
 {let Zo=o=>Z0+o;const acB=M(0xdfe2e5,{metalness:.3,roughness:.5}),ylw=M(0xf2c230,{roughness:.5}),blkS=M(0x222222,{roughness:.6}),Y=FY,wd=M(0xeef0f1,{roughness:.5}),win=M(0x1b232b,{roughness:.2,metalness:.4}),blu2=M(0x1f4fbf,{roughness:.6}),
   rub=M(0x16181a,{roughness:.85}),yb=(()=>{const t=cv(64,16,(g,w,h)=>{for(let i=0;i<8;i++){g.fillStyle=i%2?'#1b1d20':'#f2b600';g.fillRect(i*8,0,8,h)}});t.repeat.set(4,1);return new THREE.MeshStandardMaterial({map:t,roughness:.5})})(),
   lvT=cv(32,32,(g,w,h)=>{g.fillStyle='#e6e8ea';g.fillRect(0,0,w,h);for(let j=0;j<h;j+=8){g.fillStyle='#9aa0a6';g.fillRect(0,j+5,w,3)}}),
   lvM=(hh,ww)=>{const t=lvT.clone();t.needsUpdate=true;t.repeat.set(Math.max(1,ww/1.2),hh/.25);return new THREE.MeshStandardMaterial({map:t,roughness:.5,metalness:.3})};
  const shM=(h)=>{const t=shT.clone();t.needsUpdate=true;t.repeat.set(1,h/.3);return new THREE.MeshStandardMaterial({map:t,metalness:.5,roughness:.4})};
  const dr=(o,dbl,y0=Y)=>{const z=Zo(o),w=dbl?1.7:.95;mesh(Bx(.05,2.15,w),wd,fx,y0+1.075,z,false);
   for(const dz of dbl?[-.42,.42]:[0])mesh(Bx(.05,.45,.14),win,fx+.01,y0+1.55,z+dz,false);if(dbl)mesh(Bx(.05,2.1,.02),stl,fx+.01,y0+1.07,z,false);
   for(const s2 of[-1,1])mesh(Bx(.07,2.25,.06),stl,fx,y0+1.12,z+s2*w/2);mesh(Bx(.07,.06,w+.06),stl,fx,y0+2.22,z)};
  const shutterD=(o,w,sill)=>{const z=Zo(o),h=3.0;SHUT[o]={m:mesh(Bx(.06,h,w),shM(h),fx,sill+h/2,z,false),z,sill,h,w,fx};mesh(Bx(.22,.4,w+.25),sst,fx+.08,sill+h+.2,z);
   for(const s2 of[-1,1])mesh(Bx(.1,h,.1),stl,fx+.02,sill+h/2,z+s2*w/2)};
  const DL=Y+1.0,dock=(o,w)=>{const z=Zo(o);mesh(Bx(.05,DL-Y,w+.4),blu2,fx+.01,Y+(DL-Y)/2,z,false);mesh(Bx(.07,.1,w+.4),yb,fx+.02,DL,z,false);   // ระดับท่าโหลด = ขอบบนแถบสีน้ำเงิน   // หน้าท่าโหลด + ขอบเหลือง-ดำ
   for(let k=0;k<Math.round(w/.75);k++){const zz=z-w/2+.35+k*.75;mesh(Bx(.14,.6,.18),rub,fx+.08,DL-.42,zz);mesh(Bx(.3,.12,.3),rub,fx+.18,.06,zz)}};  // ยางกันชน
  const openBay=(o,w,fl=Y)=>{const z=Zo(o),h=3.2;   // กรอบช่องเปิด (ตัวช่องลึกสร้างไว้ที่ตัวห้องแล้ว)
   for(const s2 of[-1,1])mesh(Bx(.12,h+.1,.12),stl,fx+.02,fl+h/2,z+s2*w/2);mesh(Bx(.12,.12,w+.1),stl,fx+.02,fl+h+.04,z)};
  const louverPanel=(o,w,h,y)=>mesh(Bx(.06,h,w),lvM(h,w),fx+.02,y,Zo(o),false);
  const vent=(o,y,aw)=>{mesh(Bx(.05,.55,.65),lvM(.55,.65),fx+.02,y,Zo(o),false);mesh(Bx(.08,.62,.72),stl,fx,y,Zo(o),false);
   if(aw){const a=mesh(Bx(.4,.04,.8),M(0x2e6fd0,{roughness:.5}),fx+.2,y+.4,Zo(o),false);a.rotation.z=-.35}};
  const split=(o,y)=>{const z=Zo(o);mesh(Bx(.32,.6,.85),acB,fx+.18,y,z);mesh(new THREE.CylinderGeometry(.22,.22,.02,20).rotateZ(Math.PI/2),blkS,fx+.35,y,z+.08,false)};
  const cond=(o,big)=>{const z=Zo(o),w=big?2.6:1.3,h=big?1.1:1.0,d=big?1.1:.75,x=X1+.25+d/2+.2;mesh(Bx(d+.3,.15,w+.3),M(0xc9ccd0,{roughness:1}),x,.075,z);   // คอนเดนซิ่งสีฟ้า
   const cm=M(0x3d7fd6,{roughness:.4,metalness:.5}),gm=M(0x1f3f63,{roughness:.6,metalness:.4});mesh(Bx(d,h,w),[gm,cm,cm,cm,gm,gm],x,.15+h/2,z);
   if(big)for(const dz of[-.6,.6])mesh(new THREE.CylinderGeometry(.42,.42,.04,20),blkS,x,.15+h+.02,z+dz,false)};
  const bol=(o)=>{const z=Zo(o);for(const s2 of[-1,1])mesh(new THREE.CylinderGeometry(.05,.05,.9,10),ylw,X1+1.4,.45,z+s2*.35);for(const y of[.4,.8])mesh(Bx(.06,.07,.75),y>.5?ylw:blkS,X1+1.4,y,z)};
  const planter=(o)=>{const z=Zo(o),pc=M(0xd8d8d2,{roughness:.95});mesh(Bx(.6,.45,1.2),pc,X1+.6,.225,z);mesh(new THREE.SphereGeometry(.42,8,6),M(0x4c8a3c),X1+.6,.75,z);
   for(const dz of[-.35,0,.35])mesh(new THREE.SphereGeometry(.13,6,5),M(0xd8337a),X1+.68,.95+Math.abs(dz)*.3,z+dz,false)};
  // --- ฝั่งโกดัง: โรงเก็บของเปิด 2 ช่อง (มีเสากลาง) + ประตูคู่ + แอร์ + ช่องระบาย, เสาสีฟ้า, ผนังบานเกล็ด + ตู้ใสเก็บของ
  // ชุดประตูฝั่งโกดัง (โรงเก็บของเปิด 2 ช่อง, ประตูคู่, แอร์, เสาฟ้า, ผนังบานเกล็ด, ตู้ใส) เอาออกตามที่สั่ง
  // ชุดประตูรูป 3-4 เลื่อนไปทางอาคาร 5 (รักษาระยะห่างเดิม) ให้ประตูคู่ตรงกับเส้นขอบโรงจอดมอเตอร์ไซค์ (ระยะ 83.5 ม.)
  const SG=3.6;                                                                     // ชุดประตูช่วงเสาหม้อแปลง เลื่อนไปทางอาคาร 5 อีก 3.6 ม. (ตามเส้นเขียว)
  Zo=o=>Z0+o+29.5+SG;
  // --- ช่วงกลาง-ฝั่งโกดัง (รูป 4): ช่องระบาย, ประตู, ประตูม้วน, ห้องบานเกล็ด (ยื่น 0.4 ม.) + ประตูคู่, ประตูม้วนท่าโหลด
  dr(25.5,false);                                                                      // เอาแผงบานเกล็ดข้างเสาไฟฟ้าออก
shutterD(29.5,4.9,Y);                                                                   // ประตูม้วนห้องระบบน้ำ Purified (ขยาย 3.4→4.9 ม.)

  {const z=Zo(35),w=5.6;mesh(Bx(.4,3.4,w),M(0xf0f1f2,{roughness:.6}),X1+.2,Y+1.7,z);                       // ห้องบานเกล็ดยื่น
   for(const dz of[-1.9,1.9])mesh(Bx(.06,2.4,1.6),lvM(2.4,1.6),X1+.43,Y+1.5,z+dz,false);
   mesh(Bx(.05,1.4,5.0),blu2,X1+.43,Y+.55,z,false);CDAP={x:X1-1.75,z};const fx0=fx;fx=X1+.49;dr(35,true,Y);                    // ประตูห้อง CDA ยื่นพ้นแถบน้ำเงิน (กันผิวซ้อนกระพริบ)
   vent(33.2,Y+3.0,true);vent(36.8,Y+3.0,true);fx=fx0}
  shutterD(42,4.2,DL);dock(42,4.2);vent(45.6,Y+2.6);
  Zo=o=>Z0+o+29.5;
  // --- ช่วงกลาง (รูป 3): คอนเดนซิ่งใหญ่ + แอร์ + ประตูคู่ + เสากันชน + กระถางเฟื่องฟ้า
  cond(49,false);bol(51);dr(54,true);cond(58.5,true);split(61.5,Y+.8);bol(64);vent(66,Y+2.8);
  Zo=o=>Z0+o+SG;
  // --- ต่อจากประตูเดี่ยว (ระยะ 55) ไปทางโกดัง ตามรูปจริง: แผงบานเกล็ดใหญ่, ประตูเดี่ยว, ท่อน้ำฟ้า,
  //     หลังคาย่อยสีน้ำเงินคลุมห้องเก็บของเปิด + บานเกล็ด, จักรยาน/สกู๊ตเตอร์, ห้องเก็บของเปิด 2 ช่อง, กระถางเฟื่องฟ้าแนวผนัง
  louverPanel(52.7,3.2,1.6,Y+1.7);dr(50.4,false);
  mesh(new THREE.CylinderGeometry(.06,.06,H1-Y,10),M(0x4aa3e0,{roughness:.4}),X1+.12,Y+(H1-Y)/2,Zo(48.6));          // ท่อน้ำสีฟ้าแนวตั้ง
  openBay(44.5,4.5);                                                                     // ช่องประตูม้วนแผนกวิศวกรรม (ขยาย 3.0→4.5 ม.)
  dr(33.2+3.4/2+.06+.3048+1.7/2+.03,true);                                             // ประตูคู่ห้อง AHU2 และโซลาร์เซลล์ ห่างกรอบประตูห้องเก็บของ 1 ฟุต
  louverPanel(40.6,2.4,1.6,Y+1.5);openBay(33.2,3.4);openBay(29.7,3.4);
  {const za=Zo(37.5),zb=Zo(47.5),cy=3.5,dx=2.3,rf=M(0x2f62a8,{roughness:.45,metalness:.4}),pst=M(0x9aa3ab,{metalness:.4});   // หลังคาย่อย
   const r=mesh(Bx(dx,.08,zb-za),rf,X1+dx/2,cy,(za+zb)/2);r.rotation.z=-.08;mesh(Bx(.06,.22,zb-za),rf,X1+dx,cy-.15,(za+zb)/2,false);
   for(const z of[za+.2,(za+zb)/2,zb-.2])mesh(Bx(.08,cy-.1,.08),pst,X1+dx-.1,(cy-.1)/2,z)}
  // (ตู้ใสหน้าห้องเอาออกตามที่ขอ)
  // จักรยาน 4 คัน จอดหันหน้าเข้าผนังแผนกวิศวกรรม ข้างประตูม้วน ขอบช่องจอดเสมอขอบซ้ายประตูม้วน + เส้นช่องจอดสีขาว
  {const bicycle=makeBicycle;   // โมเดลจักรยาน (ใช้ร่วมกับจักรยานใต้หลังคาลานโหลดโกดัง)
   const lnM=M(0xf4f4f2,{roughness:.6}),xs=X1+.25,xe=X1+2.1,pitch=.72,zc=Z0+48.1+4.5/2+.06+pitch*2,cols=[[0x2f7d6b,1],[0xe8b4c4,1],[0x1f4f9f,0],[0xf0e6c8,1]];
   for(let k=0;k<=4;k++){const z=zc+(k-2)*pitch;mesh(Bx(xe-xs,.01,.06),lnM,(xs+xe)/2,.135,z,false)}                       // เส้นแบ่งช่องจอด
   mesh(Bx(.06,.01,pitch*4+.06),lnM,xe,.135,zc,false);                                                                    // เส้นท้ายช่อง
   cols.forEach(([c,bk],k)=>{const g=bicycle(c,bk),z=zc+(k-1.5)*pitch;g.position.set(X1+.95,.13,z);g.rotation.y=Math.PI;g.rotation.x=0;scene.add(g)})}
  Zo=o=>Z0+o;
  dr(.3048+.035+1.7/2,true);
  // ===== โซนคลิกเลือกห้อง/แผนก ด้านถนน (มองไม่เห็น) — ชื่อแสดงในกล่องข้อมูลมุมขวาบน =====
  {const zm=new THREE.MeshBasicMaterial({visible:false});
   ROOMS.forEach(r=>{const m=new THREE.Mesh(new THREE.BoxGeometry(.4,H1,r.w),zm);m.position.set(X1+.25,H1/2,Zo(r.o));m.userData.id=r.id;scene.add(m);pick.push(m)})}                                                           // ประตูขาวบานคู่ ชิดขอบฝั่งโกดัง เว้น 1 ฟุต (นับจากขอบกรอบประตู)
  // --- ช่วงฝั่งอาคาร 5 (รูป 1-2): ชุดประตูม้วน/ช่องโหลด/ห้องเครื่อง เริ่มที่แผ่นผนังบล็อกที่ 3 นับจากหัวอาคารฝั่งอาคาร 5
  // คอนเดนซิ่ง/กระถางหน้าห้องเครื่อง ใช้ชุดที่เลื่อนมาจากช่วงกลางแทน (เอาประตูขาวบานเดียวออก)
  // ห้อง Boiler ตามรูปจริง: พื้นเขียว ขอบหน้าน้ำเงิน, หม้อไอน้ำ IHI (ถังเทา + แผงควบคุมน้ำเงิน + หัวเผา/พัดลม), ท่อสแตนเลสหุ้มฉนวน,
  // เฮดเดอร์ไอน้ำ + วาล์ว 4 ตัวด้านขวา, ถังเคมี/ถังกรองซ้าย, ถังพลาสติกขาว/ม่วง, กรงตะแกรงขวา, แผ่นทางลาดหน้าห้อง, ปล่องควันกลางห้องทะลุหลังคา
  {const o=100.6,w=5.0,fl=Y+.1,z=Zo(o),xb=X1-3.2,xc=X1-1.9,ss=M(0xc9ced3,{metalness:.75,roughness:.3}),gy=M(0x8e959c,{metalness:.4,roughness:.4}),
    bl=M(0x1f5fd0,{roughness:.4}),wt=M(0xf2f2ee,{roughness:.6}),pp=M(0xc9a0d8,{roughness:.5}),pipe=(a,b,r=.07,m=ss)=>{const d=V(0,0,0).subVectors(b,a),q=mesh(new THREE.CylinderGeometry(r,r,d.length(),10),m,0,0,0);q.position.copy(a).addScaledVector(d,.5);q.quaternion.setFromUnitVectors(V(0,1,0),d.normalize())};
   openBay(o,w,fl);
   mesh(Bx(.12,.1,w),M(0x1f4fbf,{roughness:.6}),X1+.06,fl-.05,z,false);                                         // ขอบหน้าน้ำเงิน
   {const r=mesh(Bx(.9,.04,.9),M(0xb9bec2,{metalness:.6,roughness:.4}),X1+.45,fl/2+.02,z+2.0,false);r.rotation.z=-.2}   // แผ่นทางลาด
   // หม้อไอน้ำ IHI
   mesh(new THREE.CylinderGeometry(.5,.5,1.7,24),gy,xc,fl+.85,z+.1);mesh(new THREE.CylinderGeometry(.52,.52,.06,24),M(0x6f767c,{metalness:.5}),xc,fl+1.72,z+.1);
   {const t=cv(64,96,(g,w2,h)=>{g.fillStyle='#2463d0';g.fillRect(0,0,w2,h);g.fillStyle='#0d1b2a';g.fillRect(8,8,w2-16,22);g.fillStyle='#fff';g.font='bold 22px Arial';g.textAlign='center';g.fillText('IHI',w2/2,62)});
    mesh(Bx(.04,.55,.38),M(0xffffff,{map:t,roughness:.5}),xc+.5,fl+1.25,z+.1,false)}
   mesh(Bx(.35,.32,.35),M(0xbfc3c6,{metalness:.6}),xc-.05,fl+1.92,z+.25);mesh(new THREE.CylinderGeometry(.16,.16,.12,16).rotateZ(Math.PI/2),ss,xc+.15,fl+1.95,z+.25);   // หัวเผา/พัดลม
   mesh(new THREE.CylinderGeometry(.08,.08,.04,14).rotateZ(Math.PI/2),M(0xf2f2f2),xc+.28,fl+2.15,z-.2);                       // เกจวัดแรงดัน
   // ปล่องควัน (สนิมน้ำตาลแดง) กลางห้อง ทะลุหลังคาโรงงานขึ้นไป
   {const rust=M(0x7a4a3a,{roughness:.7,metalness:.3});mesh(new THREE.CylinderGeometry(.13,.13,12.6-fl-1.75,14),rust,xc-.1,(fl+1.75+12.6)/2,z+.1);
    mesh(new THREE.CylinderGeometry(.22,.22,.06,14),rust,xc-.1,H1+.6,z+.1);mesh(new THREE.CylinderGeometry(.24,.13,.18,14),rust,xc-.1,12.65,z+.1)}
   // ท่อสแตนเลสหุ้มฉนวน + เฮดเดอร์ + วาล์ว 4 ตัว (ฝั่งขวา)
   pipe(V(xc-.1,fl+2.0,z-.2),V(xc-.1,fl+2.6,z-.2),.09);pipe(V(xc-.1,fl+2.6,z-.2),V(xc-.1,fl+2.6,z-1.3),.09);pipe(V(xc-.1,fl+2.6,z-1.3),V(xc-.1,fl+1.0,z-1.3),.09);
   pipe(V(xc-.3,fl+.95,z-.55),V(xc-.3,fl+.95,z-2.1),.11);for(let k=0;k<4;k++){const zz=z-.75-k*.38;mesh(Bx(.18,.22,.2),M(0x3a3f44,{metalness:.5}),xc-.3,fl+1.2,zz);
    mesh(new THREE.TorusGeometry(.07,.012,6,14).rotateY(Math.PI/2),ss,xc-.18,fl+1.25,zz,false);pipe(V(xc-.3,fl+1.32,zz),V(xc-.3,fl+2.4,zz),.03)}
   mesh(Bx(.5,.45,1.6),gy,xc-.3,fl+.23,z-1.35);                                                                                // ขาตั้งเฮดเดอร์
   pipe(V(xb+.2,fl+2.3,z-1.9),V(xb+.2,fl+.2,z-1.9),.06);pipe(V(xb+.2,fl+2.3,z-1.9),V(xb+1.2,fl+2.3,z-1.9),.06);                  // ท่อชิดผนังขวา
   // ฝั่งซ้าย: ถังกรองดำ + ถังเคมี/ชุดซอฟเทนเนอร์ (คลุมผ้าใบน้ำเงิน) + ท่อ PVC ฟ้า
   mesh(new THREE.CylinderGeometry(.4,.4,2.3,18),M(0x22262a,{roughness:.6}),xb+.5,fl+1.15,z+2.0);
   mesh(Bx(.6,.55,1.0),M(0xd6d9dc,{metalness:.3}),xb+.9,fl+.9,z+1.1);mesh(Bx(.65,.35,1.05),M(0x34489a,{roughness:.9}),xb+.9,fl+1.33,z+1.1);
   for(const zz of[z+1.5,z+1.65])pipe(V(xb+1.6,fl+.1,zz),V(xb+1.6,fl+1.6,zz),.025,M(0x5aa6d8,{roughness:.5}));
   // ถังพลาสติก / แกลลอน
   mesh(new THREE.CylinderGeometry(.22,.22,.45,14),wt,xc+.6,fl+.23,z-1.0);mesh(Bx(.25,.3,.2),wt,xc+.55,fl+.15,z+.95);
   for(const zz of[z-2.0,z-1.75])mesh(Bx(.25,.35,.2),pp,xc+.65,fl+.18,zz);
   // กรงตะแกรงเหล็กฝั่งขวา
   {const mT=cv(16,16,(g,w2,h)=>{g.strokeStyle='#6a737c';g.lineWidth=2;g.strokeRect(0,0,w2,h)});mT.repeat.set(6,9);
    const mm=new THREE.MeshStandardMaterial({map:mT,transparent:true,alphaTest:.1,side:THREE.DoubleSide,metalness:.6,roughness:.4});
    mesh(Bx(1.2,2.1,.02),mm,X1-.7,fl+1.05,z-w/2+.6,false);mesh(Bx(.02,2.1,.6),mm,X1-.1,fl+1.05,z-w/2+.3,false)}
   // ถังน้ำเงินบนพาเลทหน้าห้อง
   mesh(Bx(1.1,.12,1.1),wt,X1+1.0,.08,z+.6);for(const [dx,dz] of[[-.25,-.25],[.25,-.25],[-.25,.25],[.25,.25]])mesh(new THREE.CylinderGeometry(.27,.27,.9,14),bl,X1+1.0+dx,.6,z+.6+dz)}
  {const o=107.1,w=3.4;openBay(o,w,DL);dock(o,w);const z=Zo(o),dm=M(0x1f5fd0,{roughness:.4});                // ช่องโหลดถังน้ำเงิน
   for(let k=0;k<4;k++)for(let r=0;r<2;r++)mesh(new THREE.CylinderGeometry(.28,.28,.85,14),dm,fx-.4-r*.6,DL+.43,z-1.2+k*.75)}
  // --- ฝั่งอาคาร 5 (รูป 1): ประตูม้วนท่าโหลด + ผนังเรียบสีขาว (แผ่นรอยต่อแนวตั้ง) ฐานน้ำเงินสูง ยาวถึงหัวอาคาร
  shutterD(112.1,4.0,DL);dock(112.1,4.0);
  {const b2=Zo(L-.3),a=b2-2*2.8,pnT=cv(64,64,(g,w,h)=>{g.fillStyle='#f3f3f1';g.fillRect(0,0,w,h);g.fillStyle='#dcdcd8';g.fillRect(0,0,2,h)});pnT.repeat.set(2,1);
   mesh(Bx(.05,H1-Y-.1,b2-a),[M(0xffffff,{map:pnT,roughness:.8}),wd,wd,wd,wd,wd],fx+.01,Y+(H1-Y-.1)/2,(a+b2)/2,false);
   mesh(Bx(.06,1.0,b2-a),blu2,fx+.02,Y+.5,(a+b2)/2,false)}}
 // ท่อระบายอากาศแนวตั้ง (สแตนเลส) พ้นหลังคา + หมวกครอบ
 // ท่อพ้นหลังคา: ห้องเก็บของและตู้ลมดูดฝุ่น 2 ท่อ (สแตนเลส) — ห้อง Boiler มีปล่องของตัวเอง (ดูชุดห้อง Boiler)
 [33.3,36.8].forEach(o=>{const z=Z0+o,x=X0+.7;mesh(new THREE.CylinderGeometry(.14,.14,8.8,12),sst,x,4.4,z);mesh(new THREE.CylinderGeometry(.24,.24,.12,14),sst,x,8.86,z);mesh(new THREE.CylinderGeometry(.04,.04,.25,6),sst,x,8.7,z)});
 // เลข 6 ที่หัวอาคารฝั่งประตูหน้า + ทางระบายน้ำ/ช่องตะแกรงที่ฐาน
 const nT=cv(128,128,(g,w,h)=>{g.clearRect(0,0,w,h);g.fillStyle='#1f4fbf';g.font='bold 110px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('6',w/2,h/2+6)});
 mesh(new THREE.PlaneGeometry(.9,.9),new THREE.MeshBasicMaterial({map:nT,transparent:true}),X1-1.0,2.6,Z1+1.53,false);
 mesh(Bx(.6,.5,.03),M(0x2a4fa8,{roughness:.6}),X1-2.6,.45,Z1+1.54,false)}
// ป้ายชื่อห้อง/ลานโหลดด้านถนนโรงงาน: แผ่นป้ายสีน้ำเงิน ตัวหนังสือสีขาว (ชื่อไทย + อังกฤษ) ติดที่ขอบหน้าชายคาโค้ง ตรงกลางแต่ละห้อง
// (เหนือประตูม้วนเหลือผนังไม่พอ จึงติดหน้าชายคาซึ่งมองเห็นจากถนนได้ชัด) — กว้างตามความยาวข้อความ ไม่เกินความกว้างห้อง
{const xs=FXE+3.5+.35+1.15+.04,yc=3.95,SH=.55;
 for(const r of ROOMS){const z=fc.z0+r.o,cH=128;
  const mg=document.createElement('canvas').getContext('2d'),fT='bold 62px "Leelawadee UI", "Noto Sans Thai", Tahoma, sans-serif',fE='600 30px "Segoe UI", Arial, sans-serif';
  mg.font=fT;const tw=mg.measureText(r.name).width;mg.font=fE;const ew=mg.measureText(r.en).width;
  let cW=Math.ceil(Math.max(tw,ew)+70),sw=SH*cW/cH;const k=Math.min(1,(r.w-.4)/sw);sw*=k;const sh=SH*k;
  const t=cv(cW,cH,(g,w,h)=>{g.fillStyle='#1d4fb8';g.fillRect(0,0,w,h);g.strokeStyle='#ffffff';g.lineWidth=5;g.strokeRect(9,9,w-18,h-18);
   g.fillStyle='#ffffff';g.textAlign='center';g.textBaseline='middle';g.font=fT;g.fillText(r.name,w/2,52);g.font=fE;g.globalAlpha=.9;g.fillText(r.en,w/2,101)});
  t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;
  const pm=new THREE.MeshStandardMaterial({map:t,emissive:0xffffff,emissiveMap:t,emissiveIntensity:.18,roughness:.5});
  mesh(new THREE.BoxGeometry(.04,sh+.06,sw+.06),M(0xb8bec6,{metalness:.6,roughness:.35}),xs-.01,yc,z,false);                 // กรอบอะลูมิเนียม
  mesh(new THREE.PlaneGeometry(sw,sh).rotateY(Math.PI/2),pm,xs+.012,yc,z,false)}}                                            // หน้าป้าย (หันออกถนน)
// ผนังโรงงานด้านที่ติดอาคาร 5 (หัวอาคาร +Z) ตามรูปจริง: เมทัลชีทขาว ฐานน้ำเงิน, ชายคายื่น 2 ม. ฝ้าขาว ขอบโค้งน้ำเงิน + โคมฟลูออเรสเซนต์,
// ประตูคู่สีขาวมีช่องกระจก, ช่องบันไดขึ้นประตูมุมฝั่งถนน (ขั้นบันไดสีเขียวน้ำทะเล), ฝาท่อ, เส้นที่จอดรถสีเหลือง
{const zE=fc.z0+fc.ez,xL=FXW,xR=FXE,eY=5,eD=2,Bx=(a,c,d)=>new THREE.BoxGeometry(a,c,d);
 const PJ=1.6,zE2=zE+PJ,xP=-1.9;                                                          // ช่วงที่มีประตู+เส้นเหลือง (x ≥ xP) ยื่นออกจากผนังเดิม 1.6 ม.
 const bluM=M(0x1f4fbf,{roughness:.6}),navy=M(0x2f62a8,{roughness:.45,metalness:.3}),sof=(()=>{const t=cv(16,16,(g,w,h)=>{g.fillStyle='#eceeee';g.fillRect(0,0,w,h);g.fillStyle='#cfd3d6';g.fillRect(0,0,w,4)});t.repeat.set(1,eD/.25);return new THREE.MeshStandardMaterial({map:t,roughness:.6,metalness:.1,emissive:0x8a8c8c})})();
 const stl=M(0x8f969f,{metalness:.6,roughness:.4}),wDoor=M(0xf1f2f3,{roughness:.5}),gls=M(0x252c33,{roughness:.15,metalness:.5}),teal=M(0x2b6f73,{roughness:.6}),ylw=M(0xe8a628,{roughness:.7});
 // ส่วนยื่น 1.6 ม.: ผนังเมทัลชีทลอนขาว สูงถึงชายคา + ฐานน้ำเงิน
 {const rT=cv(16,16,(g,w,h)=>{g.fillStyle='#eef0f2';g.fillRect(0,0,w,h);g.fillStyle='#d3d7dc';g.fillRect(0,0,6,h)}),rm=(n)=>{const t=rT.clone();t.needsUpdate=true;t.repeat.set(n,1);return new THREE.MeshStandardMaterial({map:t,roughness:.5,metalness:.3})};
  const pj=mesh(Bx(xR-xP,eY,PJ),[rm(PJ/.3),rm(PJ/.3),M(0xc9ccd0),M(0xc9ccd0),rm((xR-xP)/.3),rm((xR-xP)/.3)],(xP+xR)/2,eY/2,zE+PJ/2);pj.userData.id='fac';pick.push(pj)}
 mesh(Bx(xP-xL,1,.04),bluM,(xL+xP)/2,FY+.5,zE+.02,false);mesh(Bx(xR-xP,1,.04),bluM,(xP+xR)/2,FY+.5,zE2+.02,false);mesh(Bx(.04,1,PJ),bluM,xP-.02,FY+.5,zE+PJ/2,false); // ฐานน้ำเงิน
 // ชายคายื่น + ฝ้า + ขอบโค้งน้ำเงิน (bullnose) ตลอดแนว
 mesh(Bx(xP-xL,.08,eD),sof,(xL+xP)/2,eY,zE+eD/2);mesh(Bx(xR+3.5-xP,.08,eD+PJ),sof,(xP+xR+3.5)/2,eY,zE+(eD+PJ)/2);   // ชายคาช่วงเดิม / ช่วงยื่น
 {const R=.38,sh=new THREE.Shape();const pts=[];for(let i=0;i<=12;i++){const t=i/12*Math.PI/2;pts.push([R*Math.sin(t),R*(1-Math.cos(t))])}
  sh.moveTo(0,0);pts.forEach(p=>sh.lineTo(p[0],p[1]));sh.lineTo(R,R+.2);sh.lineTo(R-.06,R+.2);for(let i=12;i>=0;i--){const t=i/12*Math.PI/2;sh.lineTo((R-.06)*Math.sin(t),.06+(R-.06)*(1-Math.cos(t)))}sh.lineTo(0,.06);
  for(const [xa,xb,z] of[[xL,xP,zE],[xP,xR+3.5,zE2]]){const g=new THREE.ExtrudeGeometry(sh,{depth:xb-xa,bevelEnabled:false});g.rotateY(-Math.PI/2);g.translate(xb,eY-.04,z+eD-R);mesh(g,navy,0,0,0)}
  mesh(Bx(.06,.6,PJ),navy,xP,eY+.2,zE+eD+PJ/2,false)}                                                    // ปิดขอบชายคาตรงจุดหยัก
 for(const x of[xL+2,(xL+xR)/2-4,(xL+xR)/2+4,xR-1])mesh(Bx(.4,.04,.08),stl,x,eY-.06,(x>xP?zE2:zE)+eD-.2,false);       // ค้ำชายคา
 [-6,1,7].forEach(x=>{const z=(x>xP?zE2:zE)+1.1;mesh(Bx(1.25,.08,.16),M(0xe9e6d8,{roughness:.4}),x,eY-.08,z,false);mesh(Bx(1.15,.03,.1),M(0xfffbe8,{emissive:0xfff3c8,emissiveIntensity:.5}),x,eY-.13,z,false)});
 // ประตูคู่สีขาวมีช่องกระจกแคบ 2 ช่อง
 {const _d0=scene.children.length,dx=-.6;mesh(Bx(1.7,2.3,.06),wDoor,dx,1.15,zE2+.04,false);mesh(Bx(.03,2.3,.07),stl,dx,1.15,zE2+.06,false);
  for(const s of[-1,1]){mesh(Bx(.13,.55,.03),gls,dx+s*.42,1.75,zE2+.08,false);mesh(Bx(.06,.04,.04),stl,dx+s*.08,1.05,zE2+.1,false)}
  mesh(Bx(1.9,.08,.12),stl,dx,2.36,zE2+.06);for(const s of[-1,1])mesh(Bx(.08,2.36,.12),stl,dx+s*.91,1.18,zE2+.06);
  mesh(Bx(.4,.25,.03),M(0xd8d0b0),dx,2.6,zE2+.04,false);                                                   // ป้ายเหนือประตู
  mesh(new THREE.CylinderGeometry(.42,.42,.03,20),M(0x3c4046,{metalness:.5,roughness:.5}),dx+.6,.115,zE2+1.4,false);for(let i=_d0;i<scene.children.length-1;i++)scene.children[i].position.y+=FY} // ฝาท่อ (ประตูยกตามพื้นโรงงาน)
 mesh(Bx(.18,.18,.06),M(0xdadde0),-4.2,3.4,zE+.05,false);                                                    // ช่องระบายอากาศเล็ก
 // ช่องประตูทางขึ้นมุมฝั่งถนน: กล่องยื่นออกจากผนัง 1.5 ม. มาทางอาคาร 5 ผนังปูนสีขาวฐานน้ำเงิน ยาวต่อไปจนถึงขอบอาคาร (ขอบนอกห้องงานระบบ)
 // ประตูอยู่ด้านข้างของกล่องฝั่งบ่อน้ำ (ตะวันตก) บันไดสีเขียวน้ำทะเล 5 ขั้นขึ้นจากฝั่งบ่อน้ำ + ราวจับ
 {const x0=xR-2.6,x1=xR+3.5,cx=(x0+x1)/2,dp=1.5+PJ,zc=zE+dp/2,zD=zE2+.75,bH=4.8,lv=1.0;             // กล่องทางขึ้นยื่นออกตามส่วนยื่น (ประตู/บันไดอยู่ช่วงนอก zD)
  const wT=cv(16,16,(g,w,h)=>{g.fillStyle='#eef0f2';g.fillRect(0,0,w,h);g.fillStyle='#d3d7dc';g.fillRect(0,0,6,h)}),wm=(rep)=>{const t=wT.clone();t.needsUpdate=true;t.repeat.set(rep,1);return new THREE.MeshStandardMaterial({map:t,roughness:.5,metalness:.3})};
  const pl=M(0xf3f3f1,{roughness:.85});                                                                // ผนังปูนสีขาว ยาวถึงขอบอาคาร
  const box=mesh(Bx(x1-x0,bH,dp),[pl,pl,M(0xc9ccd0),M(0xc9ccd0),pl,pl],cx,bH/2,zc);box.userData.id='fac';pick.push(box);
  mesh(Bx(x1-x0+.04,1,.04),bluM,cx,.5,zE+dp+.02,false);mesh(Bx(.04,1,dp),bluM,x1+.02,.5,zc,false);mesh(Bx(.04,lv,dp),bluM,x0-.02,lv/2,zc,false); // ฐานน้ำเงิน
  mesh(Bx(x1-x0+.2,.12,dp+.15),M(0xd5d8db,{roughness:.6}),cx,bH+.06,zc+.05);                               // หลังคา/ทับหลังกล่อง
  // ประตูด้านข้าง (ฝั่งบ่อน้ำ) ที่ระดับชาน
  mesh(Bx(.06,2.15,.95),M(0x7d838a,{metalness:.3,roughness:.5}),x0-.03,lv+1.075,zD,false);
  for(const z of[zD-.5,zD+.5])mesh(Bx(.08,2.25,.06),stl,x0-.04,lv+1.12,z);mesh(Bx(.08,.06,1.06),stl,x0-.04,lv+2.25,zD);
  mesh(Bx(.04,.05,.12),M(0xc8cdd3,{metalness:.7}),x0-.08,lv+1.0,zD+.32,false);
  // ชานพักหน้าประตู + บันได 5 ขั้นขึ้นจากฝั่งบ่อน้ำ (ไล่ลงไปทางตะวันตก)
  const sw=1.25,st=.3,n=5,rise=lv/n;mesh(Bx(.9,lv,sw),teal,x0-.45,lv/2,zD);
  for(let k=0;k<n-1;k++){const h=rise*(n-1-k);mesh(Bx(st,h,sw),teal,x0-.9-st/2-k*st,h/2,zD)}
  const xs=x0-.9-(n-1)*st,zr=zD+sw/2-.05,rl=(a,c)=>{const d=V(0,0,0).subVectors(c,a),o=mesh(new THREE.CylinderGeometry(.025,.025,d.length(),6),stl,0,0,0);o.position.copy(a).addScaledVector(d,.5);o.quaternion.setFromUnitVectors(V(0,1,0),d.normalize())};
  rl(V(xs,.95,zr),V(x0-.9,lv+.95,zr));rl(V(x0-.9,lv+.95,zr),V(x0,lv+.95,zr));
  for(const [x,y] of[[xs,0],[x0-.9,lv],[x0-.05,lv]])mesh(Bx(.05,.95,.05),stl,x,y+.475,zr)}
 // เส้นที่จอดรถสีเหลือง (กรอบ + เส้นทแยงห้ามจอด) หน้าผนัง
 const ln=(x0,z0,x1,z1)=>{const L=Math.hypot(x1-x0,z1-z0),o=mesh(Bx(L,.02,.1),ylw,(x0+x1)/2,.115,(z0+z1)/2,false);o.rotation.y=-Math.atan2(z1-z0,x1-x0)};
 {const a=-1.7,c=5.6,n=zE2+.2,f=zE2+5.2;ln(a,n,c,n);ln(a,f,c,f);ln(c,n,c,f);ln(a,n,a,f);ln(a+2.2,f,c,n+.8)}
}
// อาคารปั๊มน้ำและบ่อน้ำประปา: กว้าง 2.5 ยาว 8.2 ม. อยู่ใต้โรงงาน ชิดขอบซ้าย (ตะวันตก) ห่างจากโรงงาน 1.5 ม.
// บ่อเก็บน้ำประปาเป็นบ่อใต้ดิน โผล่พ้นดิน 1 ม. ด้านบนเป็นลานวางปั๊มและตู้ควบคุม มีรั้วตาข่ายและหลังคาเมทัลชีท
const ph=3,PL=10.2,PW=2.5,px=FXW+PL/2,pz=fc.z0+fc.ez+1.5+PW/2;
const grib=cv(16,16,(g,w,h)=>{for(let j=0;j<h;j++){g.fillStyle=j<8?'#dcdfe4':'#c0c5cc';g.fillRect(0,j,w,1)}});grib.repeat.set(1,5);
const pwm=M(0xdfe2e6,{roughness:.6,metalness:.3}),prm=new THREE.MeshStandardMaterial({map:grib,roughness:.4,metalness:.5});
const mshT=cv(16,16,(g,w,h)=>{g.strokeStyle='#4a505a';g.lineWidth=3;g.beginPath();g.moveTo(0,0);g.lineTo(w,0);g.moveTo(0,0);g.lineTo(0,h);g.stroke()});
const meshM=(rx,ry)=>{const t=mshT.clone();t.needsUpdate=true;t.repeat.set(rx,ry);return new THREE.MeshStandardMaterial({map:t,transparent:true,alphaTest:.1,side:THREE.DoubleSide,roughness:.6,metalness:.6})};
// บ่อน้ำ (กว้าง 2.5 × ยาว 8.2 ม.) โผล่พ้นดิน 1 ม. ล้อมด้วยรั้วตาข่ายห่างจากขอบบ่อทุกด้าน 30 ซม. หลังคาเมทัลชีทคลุม
// ผัง: ประตูกรงเหล็ก 2 บาน กึ่งกลางด้านกว้างฝั่งซ้าย (ตะวันตก) กว้างเกือบเต็มด้าน, ปั๊มน้ำ+ตู้ควบคุมฝั่งซ้าย, ปั๊มดับเพลิงฝั่งขวา (ตะวันออก)
// ท่อทั้งหมดเดินตามแนวยาวฝั่งอาคาร 5 (ใต้) ไปทางประตู แล้วต่อลงพื้น; ผนังฝั่งถนน (ตะวันออก) และฝั่งอาคาร 5 (ใต้) มุงเมทัลชีท
{const xA=px-PL/2,xB=px+PL/2,zN=pz-PW/2,zS=pz+PW/2,TH=1,RY=TH+2.8,DH=RY-TH,zF=fc.z0+fc.ez-.1,xD=xA+.7,zO=zN-.15,dZ=pz,dW=2.7,
  G=.3,eA=xA-G,eB=xB+G,eN=zN-G,eS=zS+G,EL=PL+2*G,EW=PW+2*G,ecx=px,ecz=pz,fy=RY/2;                 // e* = แนวรั้ว (ห่างขอบบ่อ 30 ซม.)
 const gy=r=>r+.08;                                                                                // ระดับท่อวางบนพื้น
 const Bx=(a,b,c)=>new THREE.BoxGeometry(a,b,c),Y1=V(0,1,0);
 const conc=M(0xd3d5d8,{roughness:.95}),redM=M(0xb8262b,{roughness:.5,metalness:.3}),rcM=M(0xa3232a,{roughness:.55,metalness:.3}),grnM=M(0x3f9a5a,{roughness:.5,metalness:.2}),
  bluM=M(0x5fb3e0,{roughness:.6}),sstM=M(0xc3c8cf,{metalness:.8,roughness:.25}),blkM=M(0x22252a,{metalness:.4,roughness:.5}),postM=M(0x555b66,{metalness:.5,roughness:.5}),
  whtM=M(0xeeeeec,{roughness:.6}),gauM=M(0xf4f4f0,{roughness:.4});
 const pipe=(a,b,r,m)=>{const d=V(0,0,0).subVectors(b,a),o=mesh(new THREE.CylinderGeometry(r,r,d.length(),12),m,0,0,0);o.position.copy(a).addScaledVector(d,.5);o.quaternion.setFromUnitVectors(Y1,d.clone().normalize())};
 const run=(pts,r,m)=>{for(let i=0;i<pts.length-1;i++)pipe(pts[i],pts[i+1],r,m);for(let i=1;i<pts.length-1;i++)mesh(new THREE.SphereGeometry(r*1.05,12,8),m,pts[i].x,pts[i].y,pts[i].z)};
 const flange=(x,y,z,ax,r,m)=>{const g=new THREE.CylinderGeometry(r,r,.05,18);if(ax==='x')g.rotateZ(Math.PI/2);if(ax==='z')g.rotateX(Math.PI/2);mesh(g,m,x,y,z)};
 const wheel=(x,y,z,ax)=>{const g=new THREE.TorusGeometry(.12,.02,6,16);if(ax==='x')g.rotateY(Math.PI/2);if(ax==='y')g.rotateX(Math.PI/2);mesh(g,redM,x,y,z,false)};
 const gauge=(x,y,z)=>{mesh(new THREE.CylinderGeometry(.07,.07,.03,16).rotateX(Math.PI/2),gauM,x,y,z,false)};
 const lite=(x,y,z,c)=>mesh(new THREE.CylinderGeometry(.025,.025,.02,10).rotateX(Math.PI/2),M(c,{emissive:c,emissiveIntensity:.7}),x,y,z,false);
 // บ่อใต้ดิน: ส่วนที่โผล่พ้นดิน 1 ม.
 mesh(Bx(PL,TH,PW),conc,px,TH/2,pz);
 mesh(Bx(PL+.04,.12,PW+.04),M(0x9ea3aa,{roughness:1}),px,.06,pz,false);                           // คราบขอบล่าง
 mesh(Bx(EL,.04,EW),M(0xbfc2c6,{roughness:1}),ecx,.02,ecz,false);                                 // พื้นคอนกรีตในรั้ว
 for(const x of[xA+3.6,xD])mesh(Bx(.7,.04,.7),M(0x4a4f57,{metalness:.5,roughness:.6}),x,TH+.02,zN+.5,false); // ฝาบ่อ (manhole)
 mesh(new THREE.CylinderGeometry(.08,.08,.18,14),bluM,xD+.25,TH+.13,zN+.6);                         // เซนเซอร์วัดระดับน้ำ
 run([V(xB-.3,TH,zS-.3),V(xB-.3,TH+.8,zS-.3),V(xB-.3,TH+.8,zS-.48),V(xB-.3,TH+.62,zS-.48)],.05,sstM); // ท่อระบายอากาศบ่อ
 // รั้วตาข่ายรอบบ่อ (ห่างขอบบ่อ 30 ซม.) ตั้งจากพื้นถึงหลังคา + ประตูทางขึ้นด้านกว้างฝั่งซ้าย
 const dmT=cv(32,32,(g,w,h)=>{g.strokeStyle='#a3a9b1';g.lineWidth=2.5;g.beginPath();g.moveTo(0,h/2);g.lineTo(w/2,0);g.lineTo(w,h/2);g.lineTo(w/2,h);g.closePath();g.stroke()});
 const meshD=(rx,ry)=>{const t=dmT.clone();t.needsUpdate=true;t.repeat.set(rx,ry);return new THREE.MeshStandardMaterial({map:t,transparent:true,alphaTest:.1,side:THREE.DoubleSide,roughness:.6,metalness:.6})};
 const fenceZ=(z,x0,x1,y0,y1)=>mesh(new THREE.PlaneGeometry(x1-x0,y1-y0),meshD((x1-x0)/.1,(y1-y0)/.1),(x0+x1)/2,(y0+y1)/2,z,false);
 const fenceX=(x,z0,z1,y0,y1)=>mesh(new THREE.PlaneGeometry(z1-z0,y1-y0).rotateY(Math.PI/2),meshD((z1-z0)/.1,(y1-y0)/.1),x,(y0+y1)/2,(z0+z1)/2,false);
 for(const x of[eA+.06,eA+EL/3,eA+2*EL/3,eB-.06])for(const z of[eN+.06,eS-.06])mesh(Bx(.12,RY,.12),postM,x,fy,z);
 for(const z of[eN+.06,ecz,eS-.06])for(const x of[eA+.06,eB-.06])mesh(Bx(.12,RY,.12),postM,x,fy,z);
 for(const [w,d,x,z] of[[EL,.1,ecx,eN+.05],[EL,.1,ecx,eS-.05],[.1,EW,eA+.05,ecz],[.1,EW,eB-.05,ecz]])mesh(Bx(w,.15,d),conc,x,.075,z,false); // ขอบปูนฐานรั้ว
 fenceZ(eN,eA,eB,.15,RY);                                                                          // ตาข่ายด้านหน้า (ฝั่งโรงงาน)
 const shM=l=>{const t=cv(16,16,(g,w,h)=>{for(let i=0;i<w;i++){g.fillStyle=i<8?'#dcdfe4':'#bfc4cb';g.fillRect(i,0,1,h)}});t.repeat.set(l/.2,1);return new THREE.MeshStandardMaterial({map:t,roughness:.45,metalness:.5})};
 {const h=RY-.15,y=.15+h/2,mS=shM(EL),mE=shM(EW);
  mesh(Bx(EL,h,.04),[pwm,pwm,pwm,pwm,mS,mS],ecx,y,eS-.02);                                         // ผนังเมทัลชีท ฝั่งอาคาร 5 (ด้านยาว ทิศใต้)
  mesh(Bx(.04,h,EW),[mE,mE,pwm,pwm,pwm,pwm],eB-.02,y,ecz)   // ผนังเมทัลชีท ฝั่งถนน (ด้านกว้าง ทิศตะวันออก)
  // บานเกล็ดระบายอากาศสแตนเลสตามรูปจริง: ด้านยาว (ฝั่งอาคาร 5) 2 ชุด, ด้านกว้าง (ฝั่งถนน) 1 ชุด + กลอนประตู
  const lfM=M(0xc7cbcf,{metalness:.65,roughness:.35}),lfD=M(0x8d9296,{metalness:.5,roughness:.45});
  const louver=(w,hh,cx,cy,cz,ax)=>{const n=Math.round(hh/.2),fr=.06;
   if(ax==='z'){mesh(Bx(w+.12,hh+.12,.05),lfD,cx,cy,cz+.02,false);for(let i=0;i<n;i++){const b=mesh(Bx(w,.17,.03),lfM,cx,cy-hh/2+(i+.5)*hh/n,cz+.06,false);b.rotation.x=-.5}}
   else{mesh(Bx(.05,hh+.12,w+.12),lfD,cx+.02,cy,cz,false);for(let i=0;i<n;i++){const b=mesh(Bx(.03,.17,w),lfM,cx+.06,cy-hh/2+(i+.5)*hh/n,cz,false);b.rotation.z=.5}}};
  louver(2.0,1.25,ecx-.4,2.3,eS,'z');louver(1.0,1.15,ecx+2.9,2.3,eS,'z');                                 // ด้านยาว: บานใหญ่ + บานเล็ก
  louver(1.0,1.25,eB,2.3,ecz-.2,'x');                                                                // ด้านกว้าง: บานกลาง
  mesh(Bx(.06,.08,.22),M(0x555a5f,{metalness:.6}),eB+.05,1.4,ecz+.75,false);mesh(Bx(.05,.25,.05),M(0x555a5f,{metalness:.6}),eB+.05,1.4,ecz+.62,false)}  // กลอนประตู
 const dH=2.2,lW=dW/2,frM=M(0x4a4f57,{metalness:.6,roughness:.45});                                // ประตูกรงเหล็ก 2 บาน (ระดับพื้น)
 fenceX(eA,eN,dZ-dW/2,.15,RY);fenceX(eA,dZ+dW/2,eS,.15,RY);fenceX(eA,dZ-dW/2,dZ+dW/2,.15+dH,RY);    // ตาข่ายฝั่งซ้าย (เว้นช่องประตู)
 for(const s of[-1,1]){const cz=dZ+s*lW/2,y0=.15,yc=y0+dH/2;                                        // บานประตูแต่ละบาน
  mesh(new THREE.PlaneGeometry(lW-.08,dH-.08).rotateY(Math.PI/2),meshD((lW-.08)/.07,(dH-.08)/.07),eA-.03,yc,cz,false);
  for(const z of[cz-lW/2+.025,cz+lW/2-.025])mesh(Bx(.05,dH,.05),frM,eA-.03,yc,z);                   // กรอบตั้ง
  for(const y of[y0+.025,y0+dH/2,y0+dH-.025])mesh(Bx(.05,.05,lW),frM,eA-.03,y,cz);                  // กรอบนอน
  mesh(Bx(.06,.18,.03),M(0xb9bec6,{metalness:.8,roughness:.3}),eA-.09,y0+1.05,dZ+s*.07,false)}     // มือจับ
 mesh(Bx(.08,.08,.08),frM,eA-.08,.15+1.05,dZ,false);                                                 // กลอน/แม่กุญแจ
 mesh(Bx(EL+.4,.2,EW+.4),[pwm,pwm,prm,prm,pwm,pwm],ecx,RY+.1,ecz);                                 // หลังคาเมทัลชีท
 for(const z of[eN+.1,ecz,eS-.1])mesh(Bx(EL,.1,.06),postM,ecx,RY-.05,z,false);                      // แป
 mesh(Bx(PL-1.5,.05,.05),M(0xffffff,{emissive:0xffffff,emissiveIntensity:.8}),px,RY-.13,pz,false);  // หลอดไฟใต้หลังคา
 // ---- อุปกรณ์บนบ่อ: เขียนตามผังเดิมแล้วสะท้อนซ้าย-ขวา (ปั๊มดับเพลิงไปฝั่งขวา, ปั๊มน้ำ+ตู้ควบคุมมาฝั่งซ้ายใกล้ประตู)
 const n0=scene.children.length;
 // ชุดปั๊มดับเพลิง (หลังสะท้อนอยู่ฝั่งขวา/ตะวันออก) — ปั๊มหลัก (ตัวแดง มอเตอร์ดำ) + ปั๊มเติมแรงดัน (jockey สีน้ำเงิน)
 const fpX=xA+.9,fpZ=zS-.75,jpX=xA+1.75,jpZ=zS-.55,hZ=zS-1.45,hY=TH+1.9; // hZ: แนวท่อตั้ง/เฮดเดอร์ ถอยชิดปั๊ม เว้นทางเดินจากประตู
 mesh(Bx(.7,.15,.7),conc,fpX,TH+.075,fpZ);
 mesh(new THREE.CylinderGeometry(.22,.26,.55,18),redM,fpX,TH+.425,fpZ);
 mesh(new THREE.CylinderGeometry(.27,.27,.6,20),blkM,fpX,TH+1.0,fpZ);mesh(new THREE.CylinderGeometry(.22,.22,.1,20),blkM,fpX,TH+1.35,fpZ);
 run([V(fpX,TH+.45,fpZ-.2),V(fpX,TH+.45,hZ),V(fpX,hY,hZ)],.12,redM);                               // ท่อส่งปั๊มหลัก -> เฮดเดอร์
 run([V(fpX,TH+.45,fpZ+.2),V(fpX,TH+.45,fpZ+.5),V(fpX,TH,fpZ+.5)],.12,redM);                       // ท่อดูดลงบ่อ
 mesh(Bx(.26,.26,.26),redM,fpX,TH+1.3,hZ);wheel(fpX,TH+1.3,hZ-.2,'z');flange(fpX,TH+1.1,hZ,'y',.2,redM);flange(fpX,TH+1.5,hZ,'y',.2,redM); // วาล์วประตูน้ำ
 gauge(fpX+.25,TH+.75,fpZ-.33);
 mesh(Bx(.35,.15,.35),conc,jpX,TH+.075,jpZ);
 mesh(new THREE.CylinderGeometry(.09,.09,.75,14),sstM,jpX,TH+.525,jpZ);
 mesh(new THREE.CylinderGeometry(.13,.13,.3,16),M(0x2f62b8,{metalness:.4,roughness:.45}),jpX,TH+1.05,jpZ);
 run([V(jpX,TH+.35,jpZ-.1),V(jpX,TH+.35,hZ),V(jpX,hY,hZ)],.05,redM);gauge(jpX+.15,TH+.8,jpZ-.15);
 run([V(jpX,TH+.3,jpZ+.1),V(jpX,TH+.3,jpZ+.3),V(jpX,TH,jpZ+.3)],.05,redM);
 run([V(xA+.6,hY,hZ),V(xA+2.8,hY,hZ)],.14,redM);flange(xA+2.82,hY,hZ,'x',.26,redM);               // เฮดเดอร์ดับเพลิง (ปลายด้านในปิดหน้าแปลน)
 // ตู้ควบคุมปั๊มดับเพลิง (สีแดง) 2 ตู้ ชิดผนังใต้
 [[xA+3.0,1.3,TH+.45],[xA+3.85,1.8,TH]].forEach(([x,h,y0])=>{const cz=zS-.12-.175;mesh(Bx(.75,h,.35),rcM,x,y0+h/2,cz);
  if(y0>TH)for(const s of[-1,1])mesh(Bx(.05,y0-TH,.05),postM,x+s*.3,(TH+y0)/2,cz);
  [0x2fbf4a,0xf0b429,0xd83a3a].forEach((c,i)=>lite(x-.2+i*.1,y0+h-.25,cz-.18,c));mesh(Bx(.3,.4,.01),M(0xe9e2d0),x,y0+h*.5,cz-.18,false)});
 // ท่อประปาสีเขียว: จากบ่อขึ้นมา ผ่านวาล์ว ส่งเข้าโรงงาน
 const gX=px+.9,gZ=zN+.35;run([V(gX,TH,gZ),V(gX,TH+1.1,gZ)],.11,grnM);                                   // ขึ้นจากบ่อ (ต่อออกด้านล่างหลังสะท้อน)
 flange(gX,TH+.25,gZ,'y',.17,grnM);flange(gX,TH+.85,gZ,'y',.17,grnM);mesh(Bx(.22,.22,.22),sstM,gX,TH+.55,gZ);wheel(gX-.17,TH+.55,gZ,'x');
 // ระบบปั๊มน้ำประปา (หลังสะท้อนอยู่ฝั่งซ้าย/ตะวันตก ใกล้ประตู) (booster) + ตู้ควบคุม HMI + ถังแรงดัน + ระบบเติมเคมี
 const bxX=xB-2.2,bxZ=zS-.45,bhZ=zS-1.15,bhY=TH+1.1;   // (ก่อนสะท้อน: หน้าตู้/หัวปั๊มหัน +x -> หลังสะท้อนหันไปทางประตูฝั่งซ้าย)
 for(const s of[-1,1])mesh(Bx(.06,1.95,.06),postM,bxX,TH+.975,bxZ+s*.35);
 mesh(Bx(.22,.8,.6),sstM,bxX,TH+1.6,bxZ);                                                           // ตู้ควบคุมสแตนเลส
 mesh(Bx(.01,.15,.22),M(0x3b7bd8,{emissive:0x2a5fb0,emissiveIntensity:.6}),bxX+.116,TH+1.85,bxZ,false); // หน้าจอ HMI
 [[TH+1.62,[0xd83a3a,0xf0b429,0x2fbf4a]],[TH+1.5,[0xd83a3a,0xf0b429,0x2fbf4a]],[TH+1.38,[0xd83a3a]]].forEach(([y,cs])=>cs.forEach((c,i)=>mesh(new THREE.CylinderGeometry(.025,.025,.02,10).rotateZ(Math.PI/2),M(c,{emissive:c,emissiveIntensity:.7}),bxX+.12,y,bxZ+.12-i*.12,false)));
 mesh(new THREE.CylinderGeometry(.28,.28,.9,20),whtM,bxX,TH+.6,zS-.55);                              // ถังแรงดัน
 run([V(bxX,TH+1.05,zS-.55),V(bxX,bhY,zS-.55),V(bxX,bhY,bhZ)],.035,sstM);
 run([V(xB-3.3,bhY,bhZ),V(xB-1.35,bhY,bhZ)],.06,sstM);                                            // ท่อเฮดเดอร์สแตนเลส (ต่อออกด้านล่างหลังสะท้อน)
 [xB-2.9,xB-1.5].forEach(x=>{mesh(Bx(.45,.08,.25),blkM,x,TH+.04,bhZ);                                // ปั๊มบูสเตอร์ 2 ตัว
  mesh(new THREE.CylinderGeometry(.1,.1,.3,14).rotateZ(Math.PI/2),M(0x6b7a6e,{metalness:.4,roughness:.5}),x-.08,TH+.2,bhZ);
  mesh(new THREE.CylinderGeometry(.11,.11,.12,14).rotateZ(Math.PI/2),sstM,x+.15,TH+.2,bhZ);
  run([V(x+.15,TH+.31,bhZ),V(x+.15,bhY,bhZ)],.04,sstM);mesh(Bx(.05,.08,.05),M(0x2a6fd6),x+.15,TH+.8,bhZ-.06,false);
  run([V(x+.21,TH+.2,bhZ),V(x+.4,TH+.2,bhZ),V(x+.4,TH,bhZ)],.04,bluM)});                              // ท่อดูด PVC ลงบ่อ
 mesh(new THREE.CylinderGeometry(.28,.28,.8,20),whtM,xB-3.2,TH+.4,zN+.55);                            // ถังเคมี
 mesh(Bx(.04,1.15,.04),bluM,xB-2.9,TH+.575,zN+.55);mesh(Bx(.3,.04,.22),bluM,xB-3.05,TH+1.15,zN+.55);
 mesh(Bx(.18,.16,.14),M(0xd99a3a,{roughness:.5}),xB-3.1,TH+1.25,zN+.55);                              // ปั๊มเคมี (dosing)
 run([V(xB-3.2,TH+.8,zN+.55),V(xB-3.2,TH+1.17,zN+.55)],.012,M(0xe8d24a));
 run([V(xB-3.1,TH+1.33,zN+.55),V(xB-3.1,TH+1.33,bhZ),V(xB-3.1,bhY+.06,bhZ)],.015,blkM);
 mesh(Bx(.9,.04,.7),M(0x23377a,{roughness:.8}),xB-2.25,TH+.02,zN+.5,false);                              // แผ่นรองสีน้ำเงิน
 mesh(Bx(.36,.5,.26),M(0x2a6fd6,{roughness:.5}),xB-2.25,TH+.29,zN+.5);mesh(new THREE.CylinderGeometry(.05,.05,.06,10),blkM,xB-2.35,TH+.57,zN+.5); // แกลลอนเคมี
 run([V(xB-3.5,TH+.04,zN+.95),V(xB-1.75,TH+.04,zN+.95)],.035,bluM);                                    // ท่อ PVC บนลาน
 for(let i=n0;i<scene.children.length;i++){const o=scene.children[i],q=o.quaternion;o.position.x=2*px-o.position.x;q.set(q.x,-q.y,-q.z,q.w);o.scale.x*=-1}
 // ---- ท่อออก: ทุกเส้นมาที่ช่องว่างด้านยาวฝั่งอาคาร 5 (ใต้) เดินตามแนวยาวไปทางประตู แล้วต่อลงพื้น (ไม่ต่อเข้าอาคาร)
 // ท่อที่อยู่สูงกว่าลงพื้นไกลกว่า (ชิดมุมกว่า) เพื่อไม่ให้ท่อตัดกัน: แดง (2.9) -> เขียว (2.6) -> สแตนเลส (2.35)
 const zP=zS+G/2,rX=xB-.6,dR=xA+.15,dG=xA+.5,dS=xA+.85,sY=TH+1.35,gY=TH+1.6,gXm=px-.9,sXm=xA+1.35,gZm=zN+.35,bhZm=zS-1.15;
 const toGround=(x,r,m)=>flange(x,.03,zP,'y',r*1.8,m);                                            // ปลอกท่อที่พื้น
 run([V(rX,hY,hZ),V(rX,hY,zP),V(dR,hY,zP),V(dR,0,zP)],.14,redM);toGround(dR,.14,redM);             // ท่อแดงดับเพลิง
 mesh(Bx(.26,.26,.26),redM,dR,TH+.5,zP);wheel(dR+.2,TH+.5,zP,'x');flange(dR,TH+.3,zP,'y',.22,redM);flange(dR,TH+.7,zP,'y',.22,redM);
 mesh(new THREE.SphereGeometry(.11*1.05,12,8),grnM,gXm,TH+1.1,gZm);
 run([V(gXm,TH+1.1,gZm),V(gXm,gY,gZm),V(gXm,gY,zP),V(dG,gY,zP),V(dG,0,zP)],.11,grnM);toGround(dG,.11,grnM); // ท่อประปาสีเขียว
 mesh(new THREE.SphereGeometry(.06*1.05,12,8),sstM,sXm,TH+1.1,bhZm);
 run([V(sXm,TH+1.1,bhZm),V(sXm,sY,bhZm),V(sXm,sY,zP),V(dS,sY,zP),V(dS,0,zP)],.06,sstM);toGround(dS,.06,sstM); // ท่อสแตนเลสระบบประปา
}
label({name:'ปั๊มน้ำ/บ่อน้ำประปา',w:3.1,l:10.8,h:3.8,cz:pz,lx:px});zone('o_pump',px,1.95,pz,PL+.8,3.9,PW+.8);
// เครื่องทำน้ำเย็น (Chiller) ขนาด 5 × 10 ม. ขอบบน(เหนือ)เสมอขอบล่าง(ใต้)ของโกดัง, ขอบขวา(ตะวันออก)เสมอขอบซ้าย(ตะวันตก)ของโรงงาน
// ด้านหน้าหันไปทางขวา (ตะวันออก) — มองจากด้านหน้า: ซ้าย = ใต้, ขวา = เหนือ
// ประตูตาข่ายห่างจากขอบซ้าย 2 ม., ตู้ควบคุมอยู่ตรงประตู, ปั๊มน้ำอยู่ฝั่งซ้ายสุด, โมดูลชิลเลอร์ (กว้าง 1.3 ม.) อยู่ฝั่งขวา เว้นระยะห่างเท่ากัน
// ท่อน้ำกลับจากโรงงาน -> ปั๊ม -> ท่อจ่ายเข้าโมดูลชิลเลอร์แต่ละตัว -> ท่อน้ำเย็นออกจากโมดูล -> ท่อเมนส่งเข้าผนังด้านตะวันตกของโรงงาน
{const CW=5,CL=10,cx=fc.cx-fc.ex/2-CW/2,cz=wh.z0+wh.ez+CL/2,x0=cx-CW/2,x1=cx+CW/2,z0=cz-CL/2,z1=cz+CL/2,wH=1.2,fH=2.6,rH=4,gW=2,
  gZ1=z1-2,gZ0=gZ1-gW,gC=(gZ0+gZ1)/2;                                                           // ช่องประตู (ห่างขอบซ้าย/ใต้ 2 ม.)
 const wM=M(0xf2f3f4,{roughness:.9}),pM=M(0x8f969f,{metalness:.5,roughness:.45}),Bx=(a,b,c)=>new THREE.BoxGeometry(a,b,c);
 mesh(Bx(CW,.15,CL),M(0xc4c7cc,{roughness:1}),cx,.075,cz,false);                               // พื้นคอนกรีต
 mesh(Bx(.2,wH,CL),wM,x0+.1,wH/2,cz);mesh(Bx(CW,wH,.2),wM,cx,wH/2,z0+.1);mesh(Bx(CW,wH,.2),wM,cx,wH/2,z1-.1); // ผนังปูนเตี้ย หลัง/ข้าง
 const fh=fH-wH,fy=(wH+fH)/2,fx=x1-.1;                                                           // รั้วตาข่ายเหนือผนัง
 mesh(new THREE.PlaneGeometry(CL,fh).rotateY(Math.PI/2),meshM(CL/.15,fh/.15),x0+.1,fy,cz,false);
 for(const z of[z0+.1,z1-.1])mesh(new THREE.PlaneGeometry(CW,fh),meshM(CW/.15,fh/.15),cx,fy,z,false);
 for(const [a,b] of[[z0,gZ0],[gZ1,z1]]){const l=b-a,c=(a+b)/2;                                 // ผนังด้านหน้า (ตะวันออก) เว้นช่องประตู
  mesh(Bx(.2,wH,l),wM,fx,wH/2,c);mesh(new THREE.PlaneGeometry(l,fh).rotateY(Math.PI/2),meshM(l/.15,fh/.15),fx,fy,c,false)}
 mesh(new THREE.PlaneGeometry(gW,fH).rotateY(Math.PI/2),meshM(gW/.15,fH/.15),fx,fH/2,gC,false); // ประตูตาข่าย
 mesh(Bx(.08,.08,gW),pM,fx,fH,gC);for(const z of[gZ0,gZ1])mesh(Bx(.08,fH,.08),pM,fx,fH/2,z);
 for(const x of[x0+.1,x1-.1])for(const z of[z0+.1,cz,z1-.1])mesh(Bx(.15,rH,.15),pM,x,rH/2,z);     // เสา
 for(const z of[z0+.1,cz,z1-.1])mesh(Bx(CW+.6,.2,.12),pM,cx,rH-.2,z);                            // คานรับหลังคา
 const rt=grib.clone();rt.needsUpdate=true;rt.repeat.set(1,(CW+1)/.6);rt.rotation=Math.PI/2;
 const rtM=new THREE.MeshStandardMaterial({map:rt,roughness:.4,metalness:.5});
 mesh(Bx(CW+1,.12,CL+1),[pwm,pwm,rtM,rtM,pwm,pwm],cx,rH+.06,cz);                                 // หลังคาเมทัลชีท
 const vT=cv(128,128,(g,w,h)=>{g.fillStyle='#eef0f2';g.fillRect(0,0,w,h);g.fillStyle='#262a31';
  g.beginPath();g.moveTo(w*.06,h*.08);g.lineTo(w*.3,h*.08);g.lineTo(w*.48,h*.92);g.lineTo(w*.4,h*.92);g.closePath();g.fill();
  g.beginPath();g.moveTo(w*.94,h*.08);g.lineTo(w*.7,h*.08);g.lineTo(w*.52,h*.92);g.lineTo(w*.6,h*.92);g.closePath();g.fill();
  g.strokeStyle='#c4c8ce';g.lineWidth=3;g.strokeRect(1,1,w-2,h-2)});
 const vM=new THREE.MeshStandardMaterial({map:vT,roughness:.55,metalness:.25}),uM=M(0xeef0f2,{roughness:.55,metalness:.25}),fdM=M(0x2b2e33);
 const uD=2.4,uW=1.3,uH=2.3,uX=x0+.35+uD/2,uF=uX+uD/2,mZ0=z0+.3,mZ1=gZ0-.1,uG=(mZ1-mZ0-3*uW)/2;    // โมดูลชิลเลอร์ 3 ชุด กว้าง 1.3 ม. เว้นระยะ uG ระหว่างตัว
 const uZ=[0,1,2].map(k=>mZ0+uW/2+k*(uW+uG));
 uZ.forEach(uz=>{mesh(Bx(uD,uH,uW),[vM,uM,uM,uM,uM,uM],uX,.15+uH/2,uz);
  mesh(new THREE.CylinderGeometry(.55,.55,.4,20),uM,uX,.15+uH+.2,uz);mesh(new THREE.CylinderGeometry(.48,.48,.02,20),fdM,uX,.15+uH+.41,uz)});
 const cbX=x1-1.4;                                                                                // ตู้ควบคุม ตรงประตู หน้าตู้หันออกประตู
 mesh(Bx(.6,2,1.4),M(0xd9dde2,{metalness:.3,roughness:.5}),cbX,1.15,gC);
 [[-.4,0x2fbf4a],[0,0xd83a3a],[.4,0x2fbf4a]].forEach(([o,c])=>mesh(Bx(.03,.1,.1),M(c,{emissive:c,emissiveIntensity:.6}),cbX+.31,1.65,gC+o,false));
 mesh(Bx(.02,.6,.9),M(0x3a3f47),cbX+.31,1.1,gC,false);
 // ท่อ: pipe(จุดเริ่ม, จุดปลาย, รัศมี, วัสดุ) + ข้องอ
 const ipM=M(0xd6d9dd,{metalness:.7,roughness:.3}),stl=M(0xb9bec6,{metalness:.8,roughness:.25}),Y1=new THREE.Vector3(0,1,0);
 const pipe=(a,b,r,m)=>{const d=new THREE.Vector3().subVectors(b,a),o=mesh(new THREE.CylinderGeometry(r,r,d.length(),12),m,0,0,0);o.position.copy(a).addScaledVector(d,.5);o.quaternion.setFromUnitVectors(Y1,d.clone().normalize())};
 const run=(pts,r,m)=>{for(let i=0;i<pts.length-1;i++)pipe(pts[i],pts[i+1],r,m);for(let i=1;i<pts.length-1;i++)mesh(new THREE.SphereGeometry(r,12,8),m,pts[i].x,pts[i].y,pts[i].z)};
 const hX=x1-.5,rY=2.95,sY=3.35,pT=fc.z0+1.5,wX=x1+.15;                                          // wX = ในผนังโรงงาน
 // ปั๊มน้ำ 2 ชุด ฝั่งซ้ายสุด: แกนปั๊มตามแนวเหนือ-ใต้ ด้านหน้าตัวปั๊ม (volute) หันไปทางโมดูลชิลเลอร์ มอเตอร์อยู่ด้านหลัง
 const pmM=M(0x2f62b8,{metalness:.4,roughness:.45}),pbM=M(0x3b4048,{metalness:.5,roughness:.5}),cZ=(r,l)=>new THREE.CylinderGeometry(r,r,l,14).rotateX(Math.PI/2);
 const pXs=[x0+1.7,x0+2.6],pz=z1-1.1,vZ=pz-.2,mY=1.3,xm=(pXs[0]+pXs[1])/2,zJ=gZ0+1.95,dX=uF+.3,dY=.9;
 pXs.forEach(px=>{mesh(Bx(.5,.12,1.1),pbM,px,.21,pz);                                           // ฐานปั๊ม
  mesh(cZ(.17,.5),pmM,px,.5,pz+.25);mesh(cZ(.12,.06),pbM,px,.5,pz+.53);                           // มอเตอร์ (ด้านหลัง)
  mesh(cZ(.22,.18),pmM,px,.5,vZ);                                                                  // ตัวปั๊ม (ด้านหน้า หันไปทางชิลเลอร์)
  run([V(px,.72,vZ),V(px,mY,vZ)],.07,stl);                                                         // ท่อดูดด้านบนปั๊ม
  run([V(px,.5,vZ-.09),V(px,.5,zJ)],.07,stl)});                                                    // ท่อส่งออกด้านหน้าปั๊ม -> ไปทางชิลเลอร์
 run([V(pXs[0],mY,vZ),V(pXs[1],mY,vZ)],.1,stl);                                                    // ท่อร่วมดูด
 // ท่อน้ำกลับจากโรงงาน -> ปั๊ม
 run([V(wX,rY,pT),V(hX,rY,pT),V(hX,rY,vZ),V(xm,rY,vZ),V(xm,mY,vZ)],.15,ipM);
 // ท่อจ่ายจากปั๊ม -> โมดูลชิลเลอร์แต่ละตัว
 run([V(pXs[0],.5,zJ),V(dX,.5,zJ),V(dX,dY,zJ),V(dX,dY,uZ[0])],.1,stl);
 uZ.forEach(uz=>run([V(dX,dY,uz),V(uF,dY,uz)],.07,stl));
 // ท่อน้ำเย็นออกจากโมดูล -> ท่อเมนส่งเข้าโรงงาน
 uZ.forEach(uz=>run([V(uF-.2,.15+uH,uz),V(uF-.2,sY,uz),V(hX,sY,uz)],.08,ipM));
 run([V(hX,sY,uZ[0]),V(hX,sY,pT),V(wX,sY,pT)],.15,ipM);
 label({name:'Chiller ทำความเย็น',w:CW,l:CL,h:rH,cz,lx:cx});zone('o_chiller',cx,rH/2,cz,CW+.4,rH,CL+.4)}
// ===== ระบบบำบัดน้ำเสีย + ห้องน้ำคลัง (ฝั่งตะวันตกของโกดัง ถัดจากชิลเลอร์ ตามแผนผังที่กำหนด) =====
// 1 บ่อปรับเสมอ (EQ) → 2 บ่อเติมอากาศ → 3 บ่อกรองทราย/ลานตากตะกอน (2 ช่อง) → น้ำทิ้งไปบ่อพักน้ำทิ้ง (สระโรงอาหาร); ตะกอนส่วนเกิน → 4 บ่อหมักไม่ใช้อากาศ (ปิดทึบ)
// 5 ห้องน้ำคลัง: ห้องน้ำชายฝั่ง +Z (ฝั่งชิลเลอร์) ห้องน้ำหญิงฝั่ง -Z, หลังคาพื้นคอนกรีตแบบดาดฟ้า, ประตูหันเข้าหาโกดัง (ทิศ +X) เว้นทางเดิน 1.8 ม.
// บ่อ 1-4 วางตามพิกัดเดิม (ผนังโรงงานเดิม x = -12.5) แล้วเลื่อนทั้งชุดตามผนังโรงงานฝั่งชิลเลอร์ (OX) — ห้องน้ำคลังยึดตามผนังโกดัง ไม่เลื่อน
{const _w0=scene.children.length,G=.1,Bx=(a,b,c)=>new THREE.BoxGeometry(a,b,c),cw=M(0xc3c6c8,{roughness:.95}),cwT=M(0xaeb2b5,{roughness:.95}),
  stl=M(0xa3aab2,{metalness:.6,roughness:.4}),pvc=M(0x55606c,{roughness:.55}),bluP=M(0x2f62b8,{metalness:.3,roughness:.5});
 const pipe=(a,b,r,m)=>{const d=new THREE.Vector3().subVectors(b,a),o=mesh(new THREE.CylinderGeometry(r,r,d.length(),10),m,0,0,0);o.position.copy(a).addScaledVector(d,.5);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.clone().normalize())};
 const run=(pts,r,m)=>{for(let i=0;i<pts.length-1;i++)pipe(pts[i],pts[i+1],r,m);for(let i=1;i<pts.length-1;i++)mesh(new THREE.SphereGeometry(r,10,8),m,pts[i].x,pts[i].y,pts[i].z)};
 // บ่อคอนกรีต: ผนังหนา t สูง hW เหนือพื้น + บัวขอบบน
 const tank=(x0,x1,z0,z1,hW,t=.2)=>{const cx=(x0+x1)/2,cz=(z0+z1)/2,W=x1-x0,L=z1-z0,y=G+hW/2;
  mesh(Bx(W,hW,t),cw,cx,y,z0+t/2);mesh(Bx(W,hW,t),cw,cx,y,z1-t/2);mesh(Bx(t,hW,L-2*t),cw,x0+t/2,y,cz);mesh(Bx(t,hW,L-2*t),cw,x1-t/2,y,cz);
  return {x0,x1,z0,z1,cx,cz,W,L,t,top:G+hW}};
 const surf=(T,col,dy,o={})=>mesh(Bx(T.W-2*T.t,.02,T.L-2*T.t),M(col,{roughness:.3,metalness:.05,...o}),T.cx,T.top-dy,T.cz,false);
 // ราวกันตกเหล็กชุบรอบบ่อเปิด (บนขอบบ่อ)
 const guard=T=>{const a=[[T.x0+.1,T.z0+.1],[T.x1-.1,T.z0+.1],[T.x1-.1,T.z1-.1],[T.x0+.1,T.z1-.1]];
  for(let k=0;k<4;k++){const p=a[k],q=a[(k+1)%4];for(const hy of[.5,1])rail(V(p[0],T.top+hy,p[1]),V(q[0],T.top+hy,q[1]));
   const n=Math.max(1,Math.round(Math.hypot(q[0]-p[0],q[1]-p[1])/1.5));for(let i=0;i<n;i++)mesh(new THREE.CylinderGeometry(.025,.025,1,6),stl,p[0]+(q[0]-p[0])*i/n,T.top+.5,p[1]+(q[1]-p[1])*i/n,false)}};
 // ป้ายสีน้ำเงินตัวหนังสือขาว (แบบเดียวกับป้ายห้องโรงงาน) s=+1 หันไป +X, s=-1 หันไป -X; post=true → ตั้งบนเสา 2 ต้น
 const sign=(th,en,x,y,z,s,maxW,post=false,bg='#1d4fb8',fg='#ffffff')=>{const cH=128,fT='bold 62px "Leelawadee UI", "Noto Sans Thai", Tahoma, sans-serif',fE='600 30px "Segoe UI", Arial, sans-serif';
  const mg=document.createElement('canvas').getContext('2d');mg.font=fT;const tw=mg.measureText(th).width;mg.font=fE;const ew=mg.measureText(en).width,cW=Math.ceil(Math.max(tw,ew)+70);
  let sh=.46,sw=sh*cW/cH;if(sw>maxW){sh*=maxW/sw;sw=maxW}
  const t=cv(cW,cH,(g,w,h)=>{g.fillStyle=bg;g.fillRect(0,0,w,h);g.strokeStyle=fg;g.lineWidth=5;g.strokeRect(9,9,w-18,h-18);g.fillStyle=fg;g.textAlign='center';g.textBaseline='middle';
   g.font=fT;g.fillText(th,w/2,52);g.font=fE;g.globalAlpha=.9;g.fillText(en,w/2,101)});t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;
  const pm=new THREE.MeshStandardMaterial({map:t,emissive:0xffffff,emissiveMap:t,emissiveIntensity:.18,roughness:.5});
  mesh(Bx(.04,sh+.06,sw+.06),M(0xb8bec6,{metalness:.6,roughness:.35}),x,y,z,false);mesh(new THREE.PlaneGeometry(sw,sh).rotateY(s*Math.PI/2),pm,x+s*.022,y,z,false);
  if(post)for(const d of[-1,1])mesh(Bx(.06,y,.06),stl,x-s*.05,y/2,z+d*(sw/2-.08))};

 // --- 1 บ่อปรับเสมอ (EQ Tank) ตามรูปจริง: ขอบบ่อปูนเตี้ย คลุมตาข่ายกรองแสงสีฟ้า ราวเหล็กชุบ 2 ด้าน
 //   ปั๊มหอยโข่งแบบดูดเอง (self-priming) 2 ชุด บนแท่นเหล็กข้างบ่อ (ฝั่งบ่อเติมอากาศ) มอเตอร์หันมาทางห้องน้ำ ท่อดูดลอดผนังบ่อ
 //   ท่อส่ง HDPE ดำตั้งขึ้น + ประตูน้ำพวงมาลัยแดง → ท่อร่วมด้านบน (หน้าแปลนปิดปลาย) → ลงพื้นเลียบผนังบ่อเติมอากาศ → ขึ้นบ่อเติมอากาศ
 const T1=tank(-17.5,-12.5,48.0,50.8,.6);surf(T1,0x4f4d40,.3);
 {const nt=cv(256,128,(g,w,h)=>{g.fillStyle='rgba(40,150,190,.78)';g.fillRect(0,0,w,h);g.strokeStyle='rgba(20,90,140,.9)';g.lineWidth=3;
   for(let x=0;x<=w;x+=w/4){g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke()}for(let y=0;y<=h;y+=h/2){g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke()}
   g.strokeStyle='rgba(255,255,255,.12)';g.lineWidth=1;for(let x=0;x<w;x+=4){g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke()}});
  mesh(new THREE.PlaneGeometry(T1.W-.1,T1.L-.1).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({map:nt,transparent:true,roughness:.7,side:THREE.DoubleSide,depthWrite:false}),T1.cx,T1.top+.04,T1.cz,false)}
 {const y=T1.top,p=[[T1.x1-.1,T1.z1-.1],[T1.x0+.1,T1.z1-.1],[T1.x0+.1,T1.z0+.1]];                       // ราว 2 ด้าน (ฝั่งชิลเลอร์ + ท้ายบ่อ)
  for(let k=0;k<2;k++){const a=p[k],b=p[k+1];for(const hy of[.55,1.05])rail(V(a[0],y+hy,a[1]),V(b[0],y+hy,b[1]));const n=Math.max(1,Math.round(Math.hypot(b[0]-a[0],b[1]-a[1])/1.5));
   for(let i=0;i<=n;i++)mesh(new THREE.CylinderGeometry(.025,.025,1.05,6),stl,a[0]+(b[0]-a[0])*i/n,y+.525,a[1]+(b[1]-a[1])*i/n,false)}}
 // แนวท่อทั้งหมดเดินด้านหลัง (ฝั่งตรงข้ามห้องน้ำ: นอกผนังด้าน x0 ของบ่อ) — XB = แนวท่อหลัง
 const T2top=G+5.0,XB=-17.9,hd=M(0x24272b,{roughness:.55}),fr=M(0x6d6f70,{metalness:.5,roughness:.6});
 // ปั๊มหอยโข่งดูดเอง 2 ชุด เรียงตามแนวยาวบ่อ EQ (ข้างผนังบ่อฝั่งบ่อเติมอากาศ) มอเตอร์หันไปทางห้องน้ำ
 {const pw=M(0xd4d7d6,{metalness:.35,roughness:.55}),mt=M(0xb9bec2,{metalness:.45,roughness:.45}),lb=M(0x9fd3e0,{roughness:.5}),gn=M(0x7fb59a,{roughness:.5}),
   vr=M(0xc8202a,{roughness:.5}),HY=1.78,pz=47.45,pumps=[-16.6,-15.0];
  mesh(Bx(3.0,.08,.9),fr,-15.55,G+.04,pz);for(const zz of[pz-.42,pz+.42])mesh(Bx(3.0,.12,.08),fr,-15.55,G+.1,zz);          // แท่นเหล็กฐานปั๊ม
  for(const px of pumps){
   mesh(Bx(.42,.42,.36),pw,px,G+.36,pz);mesh(Bx(.5,.06,.4),pw,px,G+.12,pz);                                                   // ตัวเรือนปั๊ม (ดูดเอง)
   mesh(new THREE.CylinderGeometry(.13,.13,.18,14).rotateZ(Math.PI/2),pw,px+.3,G+.36,pz);                                     // ฝาครอบเพลา
   mesh(new THREE.CylinderGeometry(.15,.15,.42,16).rotateZ(Math.PI/2),mt,px+.6,G+.32,pz);                                     // มอเตอร์
   for(let k=-3;k<=3;k++)mesh(new THREE.TorusGeometry(.152,.008,4,16).rotateY(Math.PI/2),mt,px+.6+k*.055,G+.32,pz,false);  // ครีบระบายความร้อน
   mesh(new THREE.CylinderGeometry(.12,.12,.04,14).rotateZ(Math.PI/2),M(0x3a3e43),px+.83,G+.32,pz,false);                      // ฝาพัดลมท้าย
   mesh(Bx(.14,.1,.14),mt,px+.58,G+.52,pz);mesh(Bx(.06,.05,.06),hd,px+.58,G+.6,pz,false);                                     // กล่องต่อสาย
   for(const dx of[-.15,.15])mesh(Bx(.08,.1,.3),fr,px+.6+dx,G+.12,pz);
   // ท่อดูด: ออกด้านข้างตัวปั๊ม ลอดผนังบ่อ EQ (สีฟ้า + ข้อต่อเขียว)
   run([V(px,G+.42,pz+.18),V(px,G+.42,T1.z0+.45)],.055,lb);mesh(new THREE.CylinderGeometry(.068,.068,.16,12).rotateX(Math.PI/2),gn,px,G+.42,T1.z0-.2,false);
   // ท่อส่ง HDPE ดำตั้งขึ้น + ข้อต่อยูเนียน + ประตูน้ำพวงมาลัยแดง + เช็ควาล์ว
   mesh(new THREE.CylinderGeometry(.06,.06,.08,10),M(0xa9adb1,{metalness:.7,roughness:.3}),px,G+.62,pz);
   run([V(px,G+.57,pz),V(px,HY,pz)],.06,hd);
   mesh(Bx(.16,.22,.16),hd,px,1.0,pz);mesh(new THREE.CylinderGeometry(.012,.012,.16,6).rotateX(Math.PI/2),fr,px,1.0,pz-.16,false);
   mesh(new THREE.TorusGeometry(.065,.013,6,14),vr,px,1.0,pz-.24);                                                            // พวงมาลัยหันออกทางเดิน
   mesh(Bx(.14,.16,.14),hd,px,1.32,pz)}                                                                                       // เช็ควาล์ว
  // ท่อร่วมด้านบน: หน้าแปลนปิดปลายฝั่งห้องน้ำ → วิ่งไปด้านหลัง → ลงแนวหลังเลียบผนังบ่อเติมอากาศ → ขึ้นลงบ่อเติมอากาศ
  const e=pumps[1];run([V(e+.18,HY,pz),V(e,HY,pz),V(pumps[0],HY,pz),V(XB,HY,pz),V(XB,HY,45.0),V(XB,T2top+.35,45.0),V(-17.0,T2top+.35,45.0),V(-17.0,T2top-.2,45.0)],.075,hd);
  mesh(new THREE.CylinderGeometry(.19,.19,.06,20).rotateZ(Math.PI/2),fr,e+.21,HY,pz);
  for(let k=0;k<8;k++){const a=k*Math.PI/4;mesh(new THREE.CylinderGeometry(.018,.018,.05,6).rotateZ(Math.PI/2),M(0x4a4d50),e+.25,HY+Math.cos(a)*.15,pz+Math.sin(a)*.15,false)}
  mesh(Bx(.1,HY-.075-G,.1),fr,XB,(HY-.075+G)/2,pz);mesh(Bx(.3,.03,.3),fr,XB,G+.015,pz);mesh(Bx(.22,.03,.14),fr,XB,HY-.09,pz)}   // เสารับท่อ: ตั้งตรงใต้ข้องอท่อพอดี + แผ่นฐาน + บ่ารับท่อ
 zone('o_wt_eqpump',-15.6,G+1,47.45,3.4,2.0,1.1);
 sign('บ่อปรับเสมอ','Equalization Tank (EQ)',-12.25,1.45,49.4,1,2.4,true);
 zone('o_wt_eq',T1.cx,G+.6,T1.cz,T1.W+.2,1.2,T1.L+.2);

 // --- 2 บ่อเติมอากาศ (Aeration Tank) สูง 5 ม.: น้ำสลัดจ์สีน้ำตาล + ฟองอากาศ + ท่อลมเมน/ท่อลมลงบ่อ (แนวหลัง) + เครื่องเติมอากาศ (Blower) ด้านหลังบ่อ
 const T2=tank(-17.5,-12.5,38.4,45.4,5.0,.3);surf(T2,0x86784a,.3);guard(T2);
 {const fM=M(0xeeeadb,{roughness:1,transparent:true,opacity:.7}),rnd=(()=>{let s=7;return()=>(s=(s*16807)%2147483647)/2147483647})();
  for(let i=0;i<110;i++){const r=.07+rnd()*.14;mesh(new THREE.CylinderGeometry(r,r*.9,.03,10),fM,T2.x0+.45+rnd()*(T2.W-.9),T2.top-.28,T2.z0+.45+rnd()*(T2.L-.9),false)}}
 const hY=T2.top+.2,hX=T2.x0+.15,bZ=(T2.z1+T1.z0)/2;run([V(hX,hY,38.75),V(hX,hY,45.3)],.07,bluP);                      // ท่อลมเมน (ขอบบ่อด้านหลัง)
 for(let z=39.2;z<45;z+=1.15)run([V(hX,hY,z),V(hX+.55,hY,z),V(hX+.55,T2.top-.6,z)],.035,bluP);                 // ท่อลมลงหัวกระจายอากาศ
 // Blower: กึ่งกลางระหว่างบ่อ EQ กับบ่อเติมอากาศ ใต้ท่อส่งจากปั๊ม EQ (แนวหลัง XB) วางตามแนวท่อ
 mesh(Bx(1.1,.15,1.6),cwT,XB,G+.075,bZ-.15);mesh(Bx(.7,.75,.9),M(0x3d6fb3,{metalness:.35,roughness:.45}),XB,G+.53,bZ);
 mesh(new THREE.CylinderGeometry(.2,.2,.45,14).rotateX(Math.PI/2),M(0x6b7380,{metalness:.5,roughness:.4}),XB,G+.5,bZ-.65);
 run([V(XB,G+.9,bZ+.2),V(XB,G+1.15,bZ+.2),V(XB-.45,G+1.15,bZ+.2),V(XB-.45,G+1.15,45.3),V(XB-.45,hY,45.3),V(hX,hY,45.3)],.07,bluP);   // ท่อลมเยื้องออกจากแนวท่อดำ 0.45 ม.
 sign('บ่อเติมอากาศ','Aeration Tank',-12.25,1.45,40.5,1,2.0,true);
 {const lx=T2.x1+.28,lz=44.85;for(const d of[-.22,.22])mesh(Bx(.05,T2.top+1.1,.05),stl,lx,(T2.top+1.1)/2,lz+d);   // บันไดลิงขึ้นบ่อ
  for(let y=.4;y<T2.top+.9;y+=.3)mesh(new THREE.CylinderGeometry(.018,.018,.44,6).rotateX(Math.PI/2),stl,lx,y,lz,false)}
 // ตู้ควบคุมระบบบำบัดน้ำเสีย (WWTP CONTROL PANEL) ตามรูปจริง: ตู้เทาบนขาเหล็ก ติดผนังบ่อเติมอากาศด้านที่ติดบ่อ EQ หน้าตู้หันไปทางปั๊ม/บ่อ EQ
 //   หน้าต่างกรอบยางดำ, มิเตอร์ 2 ตัว, ไฟแสดงสถานะ + สวิตช์บิด, ตู้เล็กข้างตู้ (ซ้าย), ท่อร้อยสายเหลืองแนวตั้ง (ขวา) + แถบเหลืองโคนผนัง
 {const wz=T2.z1,px=-14.3,pW=1.15,pH=1.55,pD=.32,pY=.95+pH/2,ylC=M(0xf1c40f,{roughness:.5}),grC=M(0xc9cdcf,{metalness:.35,roughness:.5});
  const ft=cv(256,344,(g,w,h)=>{g.fillStyle='#c9cdcf';g.fillRect(0,0,w,h);g.fillStyle='#1d1f22';g.beginPath();g.roundRect?g.roundRect(16,16,w-32,h-40,22):g.rect(16,16,w-32,h-40);g.fill();
   g.fillStyle='#b9bfc4';g.beginPath();g.roundRect?g.roundRect(22,22,w-44,h-52,18):g.rect(22,22,w-44,h-52);g.fill();
   g.fillStyle='#2350b8';g.font='bold 15px "Segoe UI", Arial';g.textAlign='center';g.fillText('WWTP CONTROL PANEL',w/2,42);
   for(const x of[48,w-48]){g.fillStyle='#f4f4ef';g.fillRect(x-18,48,36,32);g.strokeStyle='#222';g.lineWidth=1.5;g.beginPath();g.arc(x,74,18,Math.PI*1.2,Math.PI*1.8);g.stroke();g.beginPath();g.moveTo(x,74);g.lineTo(x+10,58);g.stroke();
    g.fillStyle='#f2b233';g.fillRect(x-14,86,28,18);g.fillStyle='#b81d24';g.beginPath();g.arc(x,96,6,0,Math.PI*2);g.fill()}
   for(const [x,c] of[[104,'#e8323c'],[128,'#e8e4dc'],[152,'#3d6fe0']]){g.fillStyle=c;g.beginPath();g.arc(x,50,5,0,Math.PI*2);g.fill()}
   for(let r=0;r<2;r++)for(let c=0;c<4;c++){g.fillStyle='#f0a62a';g.beginPath();g.arc(98+c*20,70+r*16,5,0,Math.PI*2);g.fill()}
   const row=(y,cols)=>{for(let i=0;i<8;i++){const x=40+i*25.5;g.fillStyle=cols[i%cols.length];g.beginPath();g.arc(x,y,6,0,Math.PI*2);g.fill();g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=1;g.stroke()}};
   for(const y0 of[128,226]){row(y0,['#c62a2f']);row(y0+17,['#2e8a4d','#2e8a4d','#2e8a4d','#2e8a4d','#2e8a4d','#2e8a4d','#46e070','#2e8a4d']);row(y0+34,['#c62a2f']);row(y0+51,['#2e8a4d']);row(y0+68,['#1c1c1c']);
    g.fillStyle='#f4f4f4';for(let i=0;i<8;i++)g.fillRect(32+i*25.5,y0+80,16,5)}});
  for(const dx of[-1,1])for(const dz of[0,1])mesh(Bx(.05,.95,.05),grC,px+dx*(pW/2-.04),.95/2,wz+.1+dz*(pD-.04));                  // ขาตั้งเหล็ก
  for(const yy of[.3,.9])mesh(Bx(pW-.04,.04,pD),grC,px,yy,wz+.06+pD/2);
  mesh(Bx(pW,pH,pD),[grC,grC,grC,grC,M(0xffffff,{map:ft,roughness:.45}),grC],px,pY,wz+.06+pD/2);                             // ตัวตู้ (หน้าตู้ +Z)
  mesh(Bx(pW+.05,.03,pD+.05),grC,px,.95+pH+.015,wz+.06+pD/2);                                                                // หลังคาตู้
  mesh(Bx(.4,.48,.18),M(0xc3c1b4,{metalness:.25,roughness:.55}),px-pW/2-.38,1.7,wz+.1);                                    // ตู้เล็กข้างตู้
  mesh(Bx(.12,.14,.06),M(0xb4b6b8),px-pW/2-.38,2.1,wz+.04,false);
  mesh(Bx(T2.W,.3,.03),ylC,T2.cx,G+.45,wz+.015,false);                                                                        // แถบเหลืองโคนผนัง
  for(let k=0;k<6;k++){const xx=px+pW/2+.18+k*.075;run([V(xx,G+.6,wz+.05),V(xx,3.0-k*.02,wz+.05)],.022,ylC)}                  // ท่อร้อยสายเหลืองแนวตั้ง
  for(let k=0;k<5;k++)run([V(px-pW/2-.05,2.35+k*.07,wz+.05),V(px-pW/2-.75,2.35+k*.07,wz+.05)],.02,ylC);                    // ท่อร้อยสายแนวนอนเหนือตู้เล็ก
  mesh(Bx(T2.W-.4,.06,.08),M(0x9aa0a6,{metalness:.5,roughness:.45}),T2.cx,3.05,wz+.25,false);for(let k=0;k<4;k++)run([V(T2.x0+.2,3.12,wz+.18+k*.05),V(T2.x1-.2,3.12,wz+.18+k*.05)],.024,ylC);   // รางท่อร้อยสายด้านบน
  run([V(px+pW/2+.55,G+.6,wz+.05),V(px+pW/2+.55,G+.08,wz+.05),V(px+pW/2+.55,G+.08,47.0),V(-16.0,G+.08,47.0)],.025,ylC)}  // สายไฟไปปั๊ม (เดินบนพื้นหลังแท่นปั๊ม)
 zone('o_wwtp_panel',-14.55,1.4,T2.z1+.3,2.4,2.8,.8);
 zone('o_wt_aer',T2.cx,(T2.top+1)/2,T2.cz,T2.W+.2,T2.top+1,T2.L+.2);

 // --- 3 บ่อกรองทราย / ลานตากตะกอน 2 ช่อง สูง 2 ม.: ชั้นทรายสีน้ำตาลอ่อน ช่องหนึ่งมีตะกอนแห้งแตกระแหง
 const T3a=tank(-17.5,-12.5,33.3,35.6,2.0),T3b=tank(-17.5,-12.5,31.0,33.3,2.0);
 surf(T3a,0xd8c08a,.5,{roughness:1});surf(T3b,0xd8c08a,.5,{roughness:1});
 {const ck=cv(256,128,(g,w,h)=>{g.fillStyle='#6b5a44';g.fillRect(0,0,w,h);let r=5;const R=()=>(r=(r*16807)%2147483647)/2147483647;   // ตะกอนแห้งแตกระแหง
   for(let i=0;i<260;i++){g.fillStyle=`rgba(${120+R()*40|0},${100+R()*30|0},${70+R()*25|0},.35)`;g.fillRect(R()*w,R()*h,4+R()*10,3+R()*8)}
   g.strokeStyle='#2e241a';g.lineWidth=1.6;for(let i=0;i<70;i++){let x=R()*w,y=R()*h;g.beginPath();g.moveTo(x,y);for(let k=0;k<4;k++){x+=(R()-.5)*34;y+=(R()-.5)*34;g.lineTo(x,y)}g.stroke()}});
  mesh(Bx(T3a.W-2*T3a.t,.02,T3a.L-2*T3a.t),new THREE.MeshStandardMaterial({map:ck,roughness:1}),T3a.cx,T3a.top-.49,T3a.cz,false);
  surf({...T3b,W:T3b.W*.45,cx:T3b.x0+T3b.W*.25},0x6f6a52,.47,{metalness:.2,roughness:.15})}                      // น้ำค้างบนชั้นทราย (ช่องกรอง)
 run([V(T3a.x0+.2,G+.25,31.6),V(T3a.x0-.3,G+.25,31.6)],.06,pvc);run([V(T3a.x0+.2,G+.25,34.9),V(T3a.x0-.3,G+.25,34.9)],.06,pvc);  // ท่อระบายน้ำใต้ชั้นทราย (ด้านหลัง)
 sign('บ่อกรองทราย / ลานตากตะกอน','Sand Filter / Sludge Drying Bed',-12.25,1.45,33.3,1,2.6,true);
 zone('o_wt_sand',(T3a.x0+T3a.x1)/2,(T3a.top+.2)/2,(T3b.z0+T3a.z1)/2,T3a.W+.2,T3a.top+.2,T3a.z1-T3b.z0+.2);

 // --- 4 บ่อหมักแบบไม่ใช้อากาศ / บ่อพักตะกอน (ปิดทึบ): ฝาคอนกรีต + ฝาท่อเหล็ก + ท่อระบายก๊าซคอห่าน + ป้ายเตือน
 const T4=tank(-17.3,-12.9,13.3,24.8,1.0,.25);
 mesh(Bx(T4.W+.1,.16,T4.L+.1),cwT,T4.cx,T4.top+.08,T4.cz);
 for(const zz of[15.6,19.05,22.5]){mesh(new THREE.CylinderGeometry(.36,.36,.04,20),M(0x3a3f45,{metalness:.6,roughness:.5}),T4.cx,T4.top+.18,zz);
  mesh(new THREE.TorusGeometry(.3,.015,6,20).rotateX(Math.PI/2),M(0x2a2e33),T4.cx,T4.top+.2,zz,false)}
 for(const zz of[14.3,23.8]){run([V(T4.x1-.6,T4.top+.16,zz),V(T4.x1-.6,T4.top+1.5,zz)],.06,pvc);
  mesh(new THREE.TorusGeometry(.14,.06,8,12,Math.PI),pvc,T4.x1-.6,T4.top+1.5,zz+.14).rotation.y=Math.PI/2;run([V(T4.x1-.6,T4.top+1.5,zz+.28),V(T4.x1-.6,T4.top+1.3,zz+.28)],.06,pvc)}
 sign('บ่อหมักไม่ใช้อากาศ / บ่อพักตะกอน','Anaerobic / Sludge Tank',-12.55,1.45,20.6,1,2.6,true);
 sign('อันตราย! ก๊าซพิษ ห้ามเข้า','DANGER: TOXIC GAS (H₂S)',-12.55,1.45,17.4,1,2.2,true,'#f2c21b','#1b1b1b');
 zone('o_wt_anae',T4.cx,G+.65,T4.cz,T4.W+.2,1.3,T4.L+.2);

 // ท่อ: EQ → บ่อเติมอากาศ → บ่อกรองทราย, ตะกอนส่วนเกินจากบ่อเติมอากาศ → บ่อหมัก (ท่อวางบนพื้นริมบ่อ)
 run([V(-17.0,T2.top-.2,39.3),V(-17.0,T2.top+.35,39.3),V(XB,T2.top+.35,39.3),V(XB,T3a.top+.35,39.3),V(XB,T3a.top+.35,35.1),V(-17.0,T3a.top+.35,35.1),V(-17.0,T3a.top-.3,35.1)],.06,pvc);
 run([V(-16.6,T2.top-.2,38.75),V(-16.6,T2.top+.65,38.75),V(XB-.55,T2.top+.65,38.75),V(XB-.55,G+.15,38.75),V(XB-.55,G+.15,24.2),V(XB-.55,T4.top+.45,24.2),V(-16.7,T4.top+.45,24.2),V(-16.7,T4.top+.16,24.2)],.06,M(0x6b5a3c,{roughness:.6}));

 {const OX=FXW+12.5;for(let i=_w0;i<scene.children.length;i++)scene.children[i].position.x+=OX;for(const id of['o_wt_eq','o_wt_eqpump','o_wwtp_panel','o_wt_aer','o_wt_sand','o_wt_anae'])ZONES[id].x+=OX}

 // --- 5 ห้องน้ำคลัง: ผนังปูนทาสีครีม ฐานกระเบื้องเทา, หลังคาพื้นคอนกรีต (ดาดฟ้า) + ผนังกันตก, ประตูอะลูมิเนียม 2 บาน + ช่องระบายอากาศ, ป้ายชาย/หญิง
 const wx1=wh.cx-wh.ex/2-1.8,wx0=wx1-3.5,wz0=41.4,wz1=50.6,wH=3,wcx=(wx0+wx1)/2,wcz=(wz0+wz1)/2,wW=wx1-wx0,wL=wz1-wz0;
 mesh(Bx(wW,wH,wL),M(0xefe6d2,{roughness:.85}),wcx,G+wH/2,wcz);
 mesh(Bx(wW+.04,.5,wL+.04),M(0x9ea3a8,{roughness:.8}),wcx,G+.25,wcz,false);                                     // ฐานกระเบื้อง
 mesh(Bx(wW+.3,.18,wL+.3),cwT,wcx,G+wH+.09,wcz);                                                                 // พื้นดาดฟ้า (คอนกรีต)
 for(const [a,b,c,d] of[[wW+.3,.12,wcx,wz0-.09],[wW+.3,.12,wcx,wz1+.09]])mesh(Bx(a,.6,b),cw,c,G+wH+.48,d);           // ผนังกันตกรอบดาดฟ้า
 for(const xx of[wx0-.09,wx1+.09])mesh(Bx(.12,.6,wL+.06),cw,xx,G+wH+.48,wcz);
 run([V(wx0-.05,G+wH+.1,wz0+.3),V(wx0-.05,G+.1,wz0+.3)],.05,pvc);run([V(wx0-.05,G+wH+.1,wz1-.3),V(wx0-.05,G+.1,wz1-.3)],.05,pvc);   // ท่อระบายน้ำฝน
 const dM=M(0xc9ced4,{metalness:.55,roughness:.35}),dG=M(0x5b6672,{metalness:.4,roughness:.3}),lvM=M(0x3b4148,{roughness:.6});
 for(const [zz,th,en,ic] of[[48.6,'ห้องน้ำชาย','MEN','#2b6fd6'],[43.4,'ห้องน้ำหญิง','WOMEN','#e0508c']]){
  mesh(Bx(.06,2.15,1.0),dM,wx1+.03,G+1.08,zz);mesh(Bx(.02,.5,.5),dG,wx1+.065,G+1.6,zz);mesh(Bx(.04,.04,.14),M(0x30353b),wx1+.08,G+1.0,zz+.36);   // ประตู + ช่องกระจกฝ้า + มือจับ
  mesh(Bx(.9,.12,1.6),cwT,wx1+.45,G+.06,zz,false);                                                            // ชานหน้าประตู
  sign(th,en,wx1+.03,G+2.5,zz,1,1.6);
  const pt=cv(64,64,(g,w,h)=>{g.fillStyle=ic;g.fillRect(0,0,w,h);g.fillStyle='#fff';g.beginPath();g.arc(32,14,8,0,Math.PI*2);g.fill();
   if(en==='MEN')g.fillRect(24,25,16,30);else{g.beginPath();g.moveTo(32,24);g.lineTo(46,54);g.lineTo(18,54);g.closePath();g.fill()}});
  mesh(new THREE.PlaneGeometry(.32,.32).rotateY(Math.PI/2),new THREE.MeshStandardMaterial({map:pt,roughness:.5}),wx1+.07,G+1.6,zz-.75,false);   // รูปสัญลักษณ์ข้างประตู
  for(const d of[-1,1])mesh(Bx(.04,.3,.6),lvM,wx1+.02,G+2.5,zz+d*1.3,false)}                                    // ช่องลมระบายอากาศ (ซ้าย/ขวาของป้าย)
 for(let z=wz0+.8;z<wz1-.5;z+=1.6)mesh(Bx(.04,.35,.9),lvM,wx0-.02,G+2.5,z,false);                               // ช่องระบายอากาศด้านหลัง
 mesh(Bx(.06,.04,wL-.2),M(0xd9cfb8),wx1+.03,G+wH-.05,wcz,false);                                                // คิ้วใต้ดาดฟ้า
 zone('o_wh_wc',wcx,G+(wH+.7)/2,wcz,wW+.4,wH+.7,wL+.4)}
// cars (ตัวเทียบสเกล)
// ลานจอดรถข้างอาคาร 4: เว้น 2 ม. กว้าง 10 ม. ยาวเท่าอาคาร ช่องจอด 2 ช่องคั่นด้วยเกาะต้นไม้
// ขยายลานไปทางถนนจนชิดขอบถนน (กว้าง 10 → LW ม.) เพิ่มระยะห่างระหว่างรถคันหน้า-คันหลัง
const pb=B[3],lx0=pb.cx+pb.ex/2+2,bx=lx0,LW=+(rdX-rdW/2-.1-bx).toFixed(2),lc=lx0+LW/2;
mesh(new THREE.BoxGeometry(LW,.06,pb.ez),M(0x3c3f46,{roughness:1}),lc,.13,pb.cz,false);
const lnM=M(0xf2f2f2),cbM=M(0xc9cbd0),gsM=M(0x5a8f45),carC=[0xf2f2f2,0xc8ccd2,0x2b2e35,0xb3262d,0x2f5fa8,0x2f6b4a,0x8a8f98,0xe7e0d0];
const carShape=(pts,depth,bev)=>{const s=new THREE.Shape();pts.forEach((q,i)=>i?s.lineTo(q[0],q[1]):s.moveTo(q[0],q[1]));return new THREE.ExtrudeGeometry(s,bev?{depth,bevelEnabled:true,bevelThickness:.06,bevelSize:.06,bevelSegments:2}:{depth,bevelEnabled:false}).translate(0,0,-depth/2)};
const carBodyG=carShape([[-2.25,.3],[-2.25,.85],[-1.5,.95],[-.95,1.42],[.55,1.42],[1.25,.97],[2.2,.85],[2.3,.65],[2.3,.3]],1.8,true);
const carGlassG=carShape([[-1.4,.99],[-.92,1.38],[.5,1.38],[1.12,.99]],1.96,false);
const whG=new THREE.CylinderGeometry(.34,.34,.24,20).rotateX(Math.PI/2),hubG=new THREE.CylinderGeometry(.19,.19,.26,12).rotateX(Math.PI/2),lampG=new THREE.BoxGeometry(.06,.14,.34);
const glM=new THREE.MeshStandardMaterial({color:0x1b2733,metalness:.9,roughness:.08}),tyM=M(0x15171a,{roughness:.9}),hbM=M(0xb8bcc4,{metalness:.8,roughness:.3});
const hlM=new THREE.MeshStandardMaterial({color:0xfff6cf,emissive:0xfff0a0,emissiveIntensity:.6}),tlM=new THREE.MeshStandardMaterial({color:0xaa1111,emissive:0xcc1111,emissiveIntensity:.5});
// รายละเอียดรถเก๋ง: กระจกมองข้าง, เส้นประตู, มือจับโครเมียม, เสากลาง, กระจังหน้า, กันชนล่าง, ป้ายทะเบียน, ล้อแม็ก 5 ก้าน, ซุ้มล้อ
const dkM=M(0x1a1d22,{roughness:.6}),chM=M(0xf2f4f7,{metalness:.5,roughness:.22}),plM=M(0xf4f4ee,{roughness:.5}),
 spkG=new THREE.BoxGeometry(.035,.15,.02),rimG=new THREE.CylinderGeometry(.22,.22,.02,20).rotateX(Math.PI/2),archG=new THREE.CylinderGeometry(.4,.4,.02,20,1,false,0,Math.PI).rotateX(Math.PI/2);
function addCar(color,x,z,ry=0,sc=1){const g=new THREE.Group(),add=(ge,m,px,py,pz,rz=0)=>{const o=new THREE.Mesh(ge,m);o.position.set(px,py,pz);o.rotation.z=rz;o.castShadow=true;o.receiveShadow=true;g.add(o);return o},bm=M(color,{metalness:.55,roughness:.28}),Bx=(a,b,c)=>new THREE.BoxGeometry(a,b,c);
 add(carBodyG,bm,0,0,0);add(carGlassG,glM,0,0,0);
 for(const sx of[-1.4,1.4])for(const sz of[-.86,.86]){const s=Math.sign(sz);add(whG,tyM,sx,.34,sz);add(rimG,hbM,sx,.34,sz+s*.125);add(hubG,dkM,sx,.34,sz*1.0);   // ล้อ + แม็ก
  for(let k=0;k<5;k++){const a=k*Math.PI*2/5;add(spkG,chM,sx+Math.sin(a)*.09,.34+Math.cos(a)*.09,sz+s*.138,-a)}add(archG,dkM,sx,.34,s*.985)}             // ก้านล้อ + ซุ้มล้อสีดำ
 for(const s of[-1,1]){const zs=s*.975;
  add(Bx(.14,.1,.16),bm,.62,1.02,s*1.04);add(Bx(.02,.08,.13),glM,.55,1.02,s*1.05);                                     // กระจกมองข้าง
  for(const dx of[-.35,.62])add(Bx(.012,.48,.012),dkM,dx,.68,zs);                                                       // เส้นประตู
  for(const dx of[.25,-.72])add(Bx(.15,.03,.02),chM,dx,.86,zs*1.005);                                                   // มือจับประตู
  add(Bx(4.3,.06,.012),dkM,0,.4,zs)}                                                                                    // คิ้วล่างข้างตัวรถ
 add(Bx(.07,.37,1.97),dkM,-.2,1.19,0);                                                                                 // เสากลาง (B-pillar)
 add(Bx(.04,.16,.92),dkM,2.37,.58,0);add(Bx(.03,.025,.92),chM,2.39,.66,0);                                            // กระจังหน้า + คิ้วโครเมียม
 add(Bx(.1,.12,1.8),dkM,2.33,.36,0);add(Bx(.1,.12,1.8),dkM,-2.28,.38,0);                                             // กันชนล่างหน้า/หลัง
 add(Bx(.02,.11,.34),plM,2.39,.47,0);add(Bx(.02,.11,.34),plM,-2.33,.56,0);                                             // ป้ายทะเบียน
 for(const sz of[-.62,.62]){add(lampG,hlM,2.36,.72,sz);add(lampG,tlM,-2.32,.7,sz*1.05)}
 g.position.set(x,.16,z);g.rotation.y=ry;g.scale.setScalar(sc);scene.add(g);return g}
// ป้ายทะเบียนไทยของรถ DENZA D9 (6ขฎ 3224 กรุงเทพมหานคร)
const plateTex=cv(340,150,(g,w,h)=>{g.fillStyle='#ffffff';g.fillRect(0,0,w,h);g.strokeStyle='#111';g.lineWidth=6;g.strokeRect(5,5,w-10,h-10);
 g.fillStyle='#111';g.textAlign='center';g.textBaseline='middle';g.font='bold 74px "Leelawadee UI", "Noto Sans Thai", Tahoma, sans-serif';g.fillText('6ขฎ 3224',w/2,58);
 g.font='bold 30px "Leelawadee UI", "Noto Sans Thai", Tahoma, sans-serif';g.fillText('กรุงเทพมหานคร',w/2,122)});
plateTex.wrapS=plateTex.wrapT=THREE.ClampToEdgeWrapping;
// รถ DENZA D9 — โมเดลที่ผู้ใช้สร้างเอง (src/lib/denzaD9Model.tsx): หน้ารถ +Z → หมุนให้หน้ารถไป +X (หันหน้าออก), ป้ายทะเบียนไทย, เงาสะท้อนจาก RoomEnvironment (สร้างครั้งเดียว ใช้เฉพาะวัสดุรถ)
let D9ENV=null;
function addDenza(x,z,ry=0){if(!D9ENV){const pm=new THREE.PMREMGenerator(renderer);D9ENV=pm.fromScene(new RoomEnvironment(),.04).texture;pm.dispose()}
 const car=createDenzaD9({plateTexture:plateTex,envMap:D9ENV,envScale:.35,envScaleMetal:.9});car.rotation.y=Math.PI/2;car.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});
 const g=new THREE.Group();g.add(car);g.position.set(x,.16,z);g.rotation.y=ry;scene.add(g);return g}
let lz=pb.z0+.5;
for(let gi=0;gi<8;gi++){
 if(gi===7){const tz=lz+2.5+1.25,yl=M(0xf2c218,{roughness:.5});                                              // บ่อเก็บน้ำใต้ดิน อาคาร 1, 4 (พื้นปูน + กรอบเส้นเหลือง)
  mesh(new THREE.BoxGeometry(LW,.08,2.5),M(0xb5b8be,{roughness:1}),lc,.15,tz,false);
  for(const dz of[-1.15,1.15])mesh(new THREE.BoxGeometry(LW-.2,.02,.15),yl,lc,.2,tz+dz,false);
  for(const dx of[.15,LW-.15])mesh(new THREE.BoxGeometry(.15,.02,2.45),yl,bx+dx,.2,tz,false);
  for(const dx of[2.5,LW-2.5])mesh(new THREE.BoxGeometry(.7,.03,.7),M(0x4a4f57,{metalness:.5,roughness:.6}),bx+dx,.2,tz,false);   // ฝาบ่อ
  zone('o_tank14',lc,.5,tz,LW,1,2.5)}
 for(let k=0;k<2;k++)for(let j=0;j<2;j++){const n=(gi*2+k)*2+j;if(gi===7&&k===1)continue;                         // รถทุกคันจอดหันหน้าออก (หัวรถไปทางถนนโรงงาน)
  if(gi===0&&k===0&&j===1){addDenza(bx+LW-2.72,lz+1.25,0);continue}                                                   // Denza D9 ช่องแรกติดอาคาร 5 ฝั่งถนน
  if((n*7+3)%5!==0)addCar(carC[n%8],j?bx+LW-2.4:bx+2.3,lz+2.5*k+1.25,0,.93)}
 for(let k=0;k<=2;k++)mesh(new THREE.BoxGeometry(LW,.02,.12),lnM,lc,.17,lz+2.5*k,false);
 lz+=5;
 if(gi<7){mesh(new THREE.BoxGeometry(LW,.3,2),cbM,lc,.25,lz+1,false);mesh(new THREE.BoxGeometry(LW-.4,.34,1.6),gsM,lc,.27,lz+1,false);
  [2.5,LW-2.5].forEach((o,oi)=>{mesh(new THREE.CylinderGeometry(.18,.28,3.5,8),M(0x6b4a2e),bx+o,2,lz+1);mesh(new THREE.SphereGeometry(2.1,12,10),M((gi+oi)%2?0x3f7a3a:0x4f8f45),bx+o,5,lz+1).scale.y=1.1});lz+=2}
}
// ถนนเข้าโรงงานด้านขวา (ตะวันออก) กว้าง 6 ม. ยาวจากหัวโรงงานจนถึงถนนหน้าโรงงาน
const rdZ0=-17,rdZ1=MRZ-MRH,rdL=rdZ1-rdZ0,rdC=(rdZ0+rdZ1)/2;
mesh(new THREE.BoxGeometry(rdW,.06,rdL),M(0x3c3f46,{roughness:1}),rdX,.13,rdC,false);
for(const s of[-1,1])mesh(new THREE.BoxGeometry(.15,.02,rdL),lnM,rdX+s*(rdW/2-.3),.17,rdC,false);
for(let rz=rdZ0+3;rz<rdZ1-3;rz+=8)mesh(new THREE.BoxGeometry(.15,.02,3.5),M(0xf2d21b),rdX,.17,rz+1.75,false);
// ลานจอดมอเตอร์ไซค์ 2 หลัง (กว้าง 2.65 ยาว 18 ม. ห่างกัน 0.5 ม.) ขวาของถนน เริ่มจากขอบล่างโรงงาน
const mzf=fc.z0+fc.ez,mxs=rdX+rdW/2+1,mrT=grib.clone();mrT.needsUpdate=true;mrT.repeat.set(1,30);
const mrM=new THREE.MeshStandardMaterial({map:mrT,roughness:.4,metalness:.5}),mbM=M(0x2a2d33,{roughness:.6,metalness:.4}),mpost=M(0x555b66);
const mWh=new THREE.CylinderGeometry(.3,.3,.1,16).rotateX(Math.PI/2),mFork=new THREE.CylinderGeometry(.025,.025,.7,6),mBar=new THREE.CylinderGeometry(.02,.02,.6,6).rotateX(Math.PI/2),mTank=new THREE.SphereGeometry(.2,10,8);
const mFrame=new THREE.BoxGeometry(.9,.16,.2),mEng=new THREE.BoxGeometry(.3,.25,.2),mSeat=new THREE.BoxGeometry(.5,.1,.24),mTail=new THREE.BoxGeometry(.35,.12,.2),mLamp=new THREE.SphereGeometry(.09,8,6);
const bikeC=[0xcc2222,0x1d4ea0,0x222222,0xdddddd,0xe08a1a,0x2e7d4a,0x7a2bb0];
function addBike(color,x,z){const g=new THREE.Group(),pm=M(color,{metalness:.5,roughness:.3}),add=(ge,m,px,py,pz,rz,sx,sy,sz)=>{const o=new THREE.Mesh(ge,m);o.position.set(px,py,pz);if(rz)o.rotation.z=rz;if(sx)o.scale.set(sx,sy,sz);o.castShadow=true;g.add(o)};
 add(mWh,tyM,.62,.3,0);add(mWh,tyM,-.62,.3,0);add(mFrame,mbM,-.05,.5,0);add(mEng,hbM,0,.35,0);add(mTank,pm,.15,.72,0,0,1.4,.8,1);add(mSeat,mbM,-.3,.7,0);add(mTail,pm,-.62,.78,0,.15);add(mFork,hbM,.56,.6,0,.3);add(mBar,mbM,.5,.95,0);add(mLamp,hlM,.6,.85,0);
 g.position.set(x,.16,z);g.rotation.y=Math.PI;scene.add(g)}
for(let s=0;s<2;s++){const mcx=mxs+1.325,mzc=mzf-9-s*18.5;
 mesh(new THREE.BoxGeometry(2.65,.06,18),M(0xa5a8ae,{roughness:1}),mcx,.13,mzc,false);
 mesh(new THREE.BoxGeometry(3.05,.12,18.4),[pwm,pwm,mrM,mrM,pwm,pwm],mcx,2.6,mzc);
 for(let k=0;k<=6;k++)for(const o of[-1,1])mesh(new THREE.BoxGeometry(.1,2.4,.1),mpost,mcx+o*1.2,1.36,mzc-8.8+k*(17.6/6));
 for(let i=0;i<21;i++)if((i*5+s*3)%4!==0)addBike(bikeC[(i+s*3)%7],mcx,mzc-8.4+i*.84)}
// โรงจอดมอเตอร์ไซค์หลังที่ 3 ยาว 30 ม. เริ่มจากแนวขอบล่างโรงงาน ยาวลงมาทางใต้
{const mL=30,mcx3=mxs+1.325,mzc3=fc.z0+mL/2,rT=grib.clone();rT.needsUpdate=true;rT.repeat.set(1,50);
 const rM=new THREE.MeshStandardMaterial({map:rT,roughness:.4,metalness:.5});
 mesh(new THREE.BoxGeometry(2.65,.06,mL),M(0xa5a8ae,{roughness:1}),mcx3,.13,mzc3,false);
 mesh(new THREE.BoxGeometry(3.05,.12,mL+.4),[pwm,pwm,rM,rM,pwm,pwm],mcx3,2.6,mzc3);
 for(let k=0;k<=10;k++)for(const o of[-1,1])mesh(new THREE.BoxGeometry(.1,2.4,.1),mpost,mcx3+o*1.2,1.36,mzc3-14.8+k*(29.6/10));
 for(let i=0;i<35;i++)if((i*5+3)%4!==0)addBike(bikeC[(i+1)%7],mcx3,mzc3-mL/2+.6+i*.84)}
// ป้อม รปภ. มุมล่างขวาสุดหน้าโรงงาน (ตามรูปจริง): ป้อมปูนขาว หน้าต่างบานเลื่อนใหญ่ เคาน์เตอร์หินแกรนิตดำ, แผ่นหลังคาคอนกรีตยื่นคลุมลานข้างป้อม,
// ลานยกพื้นขอบทาสีแดง-ขาว, ชั้นวางของ เก้าอี้พลาสติกขาว พัดลม, ประตูเหล็กคนเดินสีเทาข้างทางรถ, เสาธงชาติ+ธงเหลือง, กระจกโค้งจราจร, ป้ายบนหลังคา + ไม้กั้นทางเข้า
{const n0=scene.children.length,gzz=TOTAL+10,Bx=(a,c,d)=>new THREE.BoxGeometry(a,c,d),wht=M(0xf2f2f0,{roughness:.8}),gry=M(0xcfd2d5,{roughness:.8}),gra=M(0x1c1f23,{metalness:.3,roughness:.2}),
  alu=M(0xc8cdd2,{metalness:.7,roughness:.3}),gls=new THREE.MeshStandardMaterial({color:0x7aa3bd,metalness:.5,roughness:.1,transparent:true,opacity:.5}),stl=M(0x7d858d,{metalness:.5,roughness:.45});
 const X0=26.7,X1=34.2,Z0=gzz-2.6,Z1=gzz+2.2,bx0=27.9,bx1=31.0,bz0=gzz-1.4,bz1=gzz+1.4,BH=2.6;
 mesh(Bx(X1-X0,.18,Z1-Z0),M(0xbfc2c6,{roughness:1}),(X0+X1)/2,.09,(Z0+Z1)/2);                                // ลานยกพื้น
 const curb=(x0,z0,x1,z1)=>{const L=Math.hypot(x1-x0,z1-z0),n=Math.max(1,Math.round(L/.6));for(let i=0;i<n;i++){const t0=i/n,t1=(i+1)/n,o=mesh(Bx(L/n,.22,.16),M(i%2?0xf1f1ef:0xc8262c,{roughness:.6}),x0+(x1-x0)*(t0+t1)/2,.11,z0+(z1-z0)*(t0+t1)/2,false);o.rotation.y=-Math.atan2(z1-z0,x1-x0)}};
 curb(X0,Z0,X1,Z0);curb(X1,Z0,X1,Z1-1.2);curb(X0,Z0,X0,Z1);
 // ตัวป้อม
 const bk=mesh(Bx(bx1-bx0,BH,bz1-bz0),wht,(bx0+bx1)/2,.18+BH/2,gzz);
 {const wx=(bx0+bx1)/2,wz=bz0-.03;mesh(Bx(2.3,1.25,.04),gls,wx,1.95,wz,false);
  for(const x of[-1.15,-.38,.38,1.15])mesh(Bx(.06,1.3,.08),alu,wx+x,1.95,wz);for(const y of[1.3,2.6])mesh(Bx(2.36,.06,.08),alu,wx,y,wz);
  mesh(Bx(2.6,.45,.35),gra,wx,1.05,bz0-.15);mesh(Bx(2.6,.05,.45),gra,wx,1.3,bz0-.2)}                          // เคาน์เตอร์แกรนิตดำ
 mesh(Bx(.04,2.0,.85),alu,bx1+.02,1.2,gzz-.6,false);mesh(Bx(.03,1.0,.7),gls,bx1+.05,1.65,gzz-.6,false);       // ประตูอะลูมิเนียมด้านข้าง
 // แผ่นหลังคาคอนกรีต (คลุมป้อม + ลานข้างป้อม) + ระแนงเหล็กบังแดด + โคมฟลูออเรสเซนต์ใต้หลังคา
 const rY=.18+BH;mesh(Bx(bx1-bx0+.7,.5,bz1-bz0+.9),gry,(bx0+bx1)/2,rY+.25,gzz-.1);
 mesh(Bx(X1-bx1-.2,.3,3.2),gry,(bx1+X1-.2)/2,rY+.15,gzz-.2);
 for(let k=0;k<4;k++)mesh(Bx(.08,.08,3.2),stl,X1-.3-k*.7,rY+.38,gzz-.2,false);mesh(Bx(X1-bx1-.2,.08,.08),stl,(bx1+X1-.2)/2,rY+.38,gzz-1.75,false);
 for(const x of[bx1+.9,X1-1.2])mesh(Bx(1.2,.06,.12),M(0xfffbe8,{emissive:0xfff3c8,emissiveIntensity:.4}),x,rY-.04,gzz-.6,false);
 // ลานข้างป้อม: ผนังหลังขาว, ชั้นวางเหล็ก, เก้าอี้พลาสติกขาว 2 ตัว, พัดลมตั้งพื้น
 mesh(Bx(X1-bx1,2.4,.15),wht,(bx1+X1)/2,1.38,bz1);mesh(Bx(.15,2.4,1.5),wht,X1-.08,1.38,bz1-.75);
 {const sx=bx1+1.0;for(const s2 of[-.45,.45])for(const z of[bz1-.15,bz1-.6])mesh(Bx(.04,1.9,.04),stl,sx+s2,1.13,z);for(const y of[.4,.9,1.4,1.9])mesh(Bx(.95,.03,.5),stl,sx,y,bz1-.38)
  mesh(Bx(.4,.3,.35),M(0xc8a070),sx-.2,.6,bz1-.38);mesh(Bx(.35,.25,.3),M(0xe8e8e8),sx+.2,1.55,bz1-.38)}
 const chair=(x,z)=>{const c=M(0xf6f6f4,{roughness:.5});mesh(Bx(.45,.04,.42),c,x,.62,z);for(const a of[-.19,.19])for(const b2 of[-.17,.17])mesh(new THREE.CylinderGeometry(.02,.025,.44,6),c,x+a,.4,z+b2);mesh(Bx(.45,.45,.04),c,x,.86,z+.2)};
 chair(bx1+1.2,gzz-1.0);chair(bx1+2.6,gzz-1.2);
 mesh(new THREE.CylinderGeometry(.02,.02,.9,6),stl,X1-1.2,.63,gzz);mesh(new THREE.CylinderGeometry(.3,.3,.08,16).rotateX(Math.PI/2),M(0x2b2f35),X1-1.2,1.1,gzz-.05);
 // กระจกโค้งจราจร (มุมหลังคา) + ป้ายบนหลังคา
 {const mx=bx0-.2,mz=bz0-.3;mesh(Bx(.05,.4,.05),stl,mx,rY-.05,mz);mesh(new THREE.TorusGeometry(.32,.05,8,20).rotateY(Math.PI/4),M(0xd8402e),mx-.1,rY-.45,mz-.1);
  mesh(new THREE.CircleGeometry(.3,20).rotateY(Math.PI/4+Math.PI),M(0xbcd0dc,{metalness:.9,roughness:.05}),mx-.11,rY-.45,mz-.11,false)}
 mesh(Bx(1.9,1.0,.06),M(0x253c78,{roughness:.6}),(bx0+bx1)/2+.6,rY+1.0,bz1-.2);for(const x of[-.6,.6])mesh(Bx(.05,.6,.05),stl,(bx0+bx1)/2+.6+x,rY+.55,bz1-.15);
 label({name:'ป้อม รปภ.',w:3.1,l:2.8,h:BH,cz:gzz,lx:(bx0+bx1)/2});
 // หมุนป้อมทั้งชุด 90° ให้ด้านยาว (หน้าต่าง/เคาน์เตอร์) หันไปทางถนนโรงงาน (ทิศ -X) แล้ววางชิดข้างทางรถ
 {const pcx=(X0+X1)/2,pcz=(Z0+Z1)/2,ncx=29.3,ncz=gzz,q=new THREE.Quaternion().setFromAxisAngle(V(0,1,0),Math.PI/2);
  for(let i=n0;i<scene.children.length;i++){const o=scene.children[i],dx=o.position.x-pcx,dz=o.position.z-pcz;o.position.x=ncx+dz;o.position.z=ncz-dx;o.quaternion.premultiply(q)}}
 // ไม้กั้นทางเข้า (เดิม)
 // ไม้กั้นทางเข้า: เสาไม้กั้นย้ายไปฝั่งซ้าย (ตรงข้ามป้อม) แขนยื่นไปทางป้อม
 {const hx=rdX-rdW/2-.3-RXS;mesh(Bx(.35,1.2,.35),M(0x6b7078),hx,.7,gzz-1.6);mesh(Bx(.45,.35,.5),M(0xf2c218,{roughness:.5}),hx,1.15,gzz-1.6);
  {const a=new THREE.Group();a.position.set(hx+.2,1.1,gzz-1.6);for(let i=0;i<8;i++){const o=new THREE.Mesh(Bx(.7,.12,.12),M(i%2?0xd22222:0xf2f2f2));o.position.x=.35+i*.7;o.castShadow=true;a.add(o)}scene.add(a);ANIMK.push(a);GATE.arm=a;GATE.z=gzz-1.6}}   // แขนไม้กั้นยกขึ้นเมื่อรถบรรทุกเข้า-ออก
 // เลื่อนป้อม รปภ. ทั้งชุดตามถนน
 for(let i=n0;i<scene.children.length;i++)scene.children[i].position.x+=RXS;
 zone('o_guard',29.3+RXS,1.6,gzz,5,3.4,7.6);
 // แนวหน้าป้อม (มองจากหน้าบริษัท ซ้าย→ขวา): ทางรถ | เสากำแพง (เสมอขอบสีแดงของลานป้อม) + เสาธงปักบนหัวเสา | ประตูเหล็กคนเดินสีเทา | กำแพงรั้ว — แนวเดียวกับกำแพงหน้าโรงงานฝั่งซ้าย
 {const zW=TOTAL+14.7,xa=rdX+rdW/2,H=1.8,wl=M(0xeeeeea,{roughness:.85}),cp=M(0xc9ccd0,{roughness:.7}),bs=M(0x2f5fb8,{roughness:.6}),gyM=M(0x7b858f,{metalness:.4,roughness:.5});
  const cX=29.3+RXS-(Z1-Z0)/2-.08,g0=cX+.175,g1=g0+1.55,fx=g0,fz=zW;                                         // cX = ผิวนอกขอบสีแดงฝั่งทางรถ, g0 = เสากำแพงต้นแรก (เสมอขอบแดง)
  mesh(new THREE.CylinderGeometry(.03,.045,4.0,8),M(0xc9ced6,{metalness:.6}),fx,2.6+2.0,fz);mesh(new THREE.SphereGeometry(.06,10,8),M(0xd9c46a,{metalness:.7,roughness:.3}),fx,6.65,fz,false);   // เสาธงบนหัวเสากำแพง
  const th=cv(300,200,(g,w,h)=>{let y=0;[['#a51931',1],['#f4f5f8',1],['#2d2a4a',2],['#f4f5f8',1],['#a51931',1]].forEach(q=>{const hh=h*q[1]/6;g.fillStyle=q[0];g.fillRect(0,y,w,hh+1);y+=hh})});
  mesh(new THREE.PlaneGeometry(1.2,.8),new THREE.MeshStandardMaterial({map:th,side:THREE.DoubleSide}),fx+.62,6.15,fz,false);                    // ธงชาติ
  mesh(new THREE.PlaneGeometry(1.0,.66),new THREE.MeshStandardMaterial({color:0xf2c218,side:THREE.DoubleSide,roughness:.8}),fx+.52,5.15,fz,false);   // ธงเหลือง
  for(const x of[g0,g1]){mesh(Bx(.35,2.5,.35),wl,x,1.25,zW);mesh(Bx(.45,.1,.45),cp,x,2.55,zW);mesh(Bx(.37,.35,.37),bs,x,.175,zW,false)}   // เสาประตู
  {const gc=(g0+g1)/2,gw=g1-g0-.4;mesh(Bx(gw,2.0,.05),gyM,gc,1.08,zW,false);for(let i=0;i<6;i++)mesh(Bx(.03,.8,.07),M(0x5f6870,{metalness:.5}),gc-gw/2+.15+i*(gw-.3)/5,1.6,zW,false);
   mesh(Bx(gw,.05,.08),M(0x5f6870,{metalness:.5}),gc,1.18,zW,false);mesh(Bx(.04,.04,.14),M(0x2b2f35),gc+gw/2-.12,1.05,zW+.05,false)}           // ประตูเหล็กคนเดินสีเทา
  const w0=g1+.18,xe=xa+8.6;mesh(Bx(xe-w0,H,.22),wl,(w0+xe)/2,H/2,zW);mesh(Bx(xe-w0,.08,.32),cp,(w0+xe)/2,H+.04,zW,false);mesh(Bx(xe-w0+.01,.35,.24),bs,(w0+xe)/2,.175,zW,false);   // กำแพง + ทับหลัง + ฐานน้ำเงิน
  for(let x=w0+3;x<xe-.5;x+=3)mesh(Bx(.4,H+.15,.4),wl,x,(H+.15)/2,zW);mesh(Bx(.4,H+.15,.4),wl,xe,(H+.15)/2,zW)}                                  // เสากำแพง
 }
// โรงจอดรถหน้าอาคาร 1 (กว้าง 6 × ยาว 22 × สูง 3 ม. มุงหลังคา)
{const sx0=B[4].cx,sz0=B[4].z0+B[4].ez+8.5+3,                                         // ขอบโรงจอดห่างหน้าอาคาร 1 = 8.5 ม.
 shT=cv(16,16,(g,w,h)=>{for(let j=0;j<h;j++){g.fillStyle=j<8?'#d9dce1':'#bcc1c8';g.fillRect(0,j,w,1)}});shT.repeat.set(1,10);
 const shM=new THREE.MeshStandardMaterial({map:shT,roughness:.4,metalness:.5}),shS=M(0xdfe2e6);
 mesh(new THREE.BoxGeometry(22,.06,6),M(0x9a9da3,{roughness:1}),sx0,.13,sz0,false);
 mesh(new THREE.BoxGeometry(22.4,.14,6.4),[shS,shS,shM,shM,shS,shS],sx0,3.07,sz0);
 for(let k=0;k<5;k++)for(const o of[-1,1])mesh(new THREE.BoxGeometry(.14,3,.14),M(0x6b7078),sx0-10.9+k*5.45,1.6,sz0+o*2.9);
 for(let i=0;i<8;i++)if((i*3+1)%4!==0)addCar(carC[i%8],sx0-9.1+i*2.6,sz0,-Math.PI/2);                         // หันหน้าออก (ไปทางถนนหน้าโรงงาน)
 label({name:'โรงจอดรถ',w:6,l:22,h:3,cz:sz0,lx:sx0})}
// ศาลพระภูมิ ข้างโรงจอดรถหน้าอาคาร 1 ฝั่งป้อม รปภ. (ตามรูปจริง): ลานยกพื้นปูกระเบื้องสีแดงเลือดหมู, เสาศาลปูนขาวฐานย่อมุม หัวเสาบานแดง-ทอง,
// แท่นศาลขาวขอบแดงทอง + ไฟประดับรอบแท่น, เรือนศาลขาวลายแดงทอง หลังคาซ้อนชั้น ยอดเจดีย์ทอง, พวงมาลัยดาวเรือง, โต๊ะเครื่องเซ่นขาตั้งแดง,
// รูปปั้นช้าง/ม้าลายขาว, ต้นจันทน์ผาและดอกไม้สีเหลืองด้านหลัง — ศาลหันหน้าเข้าหาอาคาร 1 (ทิศ -Z)
const SHRINE_X=13.6;                                                                    // แนวศาลพระภูมิ (น้ำพุหน้าอาคาร 1 อยู่แนวเดียวกัน)
{const Bx=(a,c,d)=>new THREE.BoxGeometry(a,c,d),cs=B[4].z0+B[4].ez+8.5+3,sx=SHRINE_X,sz=cs+.6,P=.4;
 const wh=M(0xf4f2ec,{roughness:.7}),red=M(0xb5313a,{roughness:.55}),gold=M(0xd9a628,{metalness:.7,roughness:.35}),org=M(0xf08a12,{roughness:.9});
 const tT=cv(64,64,(g,w,h)=>{g.fillStyle='#8e3a44';g.fillRect(0,0,w,h);g.strokeStyle='#d9c9c4';g.lineWidth=2;g.strokeRect(0,0,w,h)});tT.repeat.set(3.4/.3,3.0/.3);
 const tile=M(0xffffff,{map:tT,roughness:.45});
 mesh(Bx(3.4,P,3.0),[tile,tile,tile,tile,tile,tile],sx,P/2,sz);                                           // ลานยกพื้นกระเบื้อง
 // เสาศาล
 const px=sx+.4,pz=sz+.4;
 mesh(Bx(.95,.25,.95),wh,px,P+.125,pz);mesh(Bx(.78,.2,.78),wh,px,P+.35,pz);mesh(Bx(.5,1.0,.5),wh,px,P+.95,pz);
 {const c=mesh(new THREE.CylinderGeometry(.62,.3,.6,4),red,px,P+1.75,pz);c.rotation.y=Math.PI/4}
 for(const [a,b] of[[1,0],[-1,0],[0,1],[0,-1]])mesh(Bx(a?.03:.35,.45,a?.35:.03),gold,px+a*.33,P+1.72,pz+b*.33,false);  // ลายทองที่หัวเสา
 mesh(Bx(.4,.6,.03),M(0x2f7d4a,{roughness:.8}),px,P+1.3,pz-.27,false);                                   // ผ้าแพรผูกเสา
 const dy=P+2.05;mesh(Bx(1.8,.12,1.8),wh,px,dy,pz);mesh(Bx(1.84,.07,1.84),red,px,dy-.09,pz,false);
 // ไฟประดับรอบแท่น
 const bulb=new THREE.MeshStandardMaterial({color:0xfff6d8,emissive:0xffe9a8,emissiveIntensity:.6,roughness:.2});
 for(let i=0;i<24;i++){const t=i/24*4,sd=t|0,f=t-sd,h=.9,[x,z]=[[-h+2*h*f,-h],[h,-h+2*h*f],[h-2*h*f,h],[-h,h-2*h*f]][sd];mesh(new THREE.SphereGeometry(.045,8,6),bulb,px+x,dy-.2,pz+z,false)}
 // เรือนศาล
 const hy=dy+.06;mesh(Bx(.95,.1,.95),gold,px,hy+.05,pz);
 mesh(Bx(.7,.7,.7),wh,px,hy+.45,pz);
 for(const a of[-1,1])for(const b of[-1,1])mesh(new THREE.CylinderGeometry(.04,.04,.75,8),red,px+a*.38,hy+.47,pz+b*.38);
 mesh(Bx(.3,.45,.03),M(0x3a2a22),px,hy+.4,pz-.36,false);                                               // ช่องประตูเรือน
 for(const [r,h,y,m] of[[.72,.35,hy+.97,red],[.55,.32,hy+1.2,wh],[.4,.3,hy+1.42,red]]){const c=mesh(new THREE.ConeGeometry(r,h,4),m,px,y,pz);c.rotation.y=Math.PI/4}
 for(const a of[-1,1]){const g=mesh(new THREE.ConeGeometry(.08,.35,4),gold,px+a*.5,hy+1.05,pz-.0);g.rotation.z=a*.5}   // ช่อฟ้า
 mesh(new THREE.CylinderGeometry(.1,.16,.25,10),gold,px,hy+1.65,pz);
 mesh(new THREE.TorusGeometry(.17,.06,8,16).rotateX(Math.PI/2),org,px,hy+1.62,pz);                       // พวงมาลัยดาวเรืองรอบยอด
 mesh(new THREE.ConeGeometry(.11,.65,10),gold,px,hy+2.08,pz);
 // เจดีย์จำลองเล็ก + พวงมาลัยดาวเรืองที่ขอบแท่นด้านหน้า
 for(const a of[-.7,-.25,.7])mesh(new THREE.ConeGeometry(.06,.25,8),gold,px+a,dy+.19,pz-.7);
 for(const a of[-.1,.25,.6]){mesh(new THREE.TorusGeometry(.12,.05,6,12).rotateX(Math.PI/2),org,px+a,dy+.1,pz-.72,false);mesh(Bx(.04,.45,.04),org,px+a,dy-.3,pz-.86,false)}
 // โต๊ะเครื่องเซ่น (หน้าศาล ด้านขวาเมื่อมองจากหน้าศาล)
 const tx=sx-.55,tz=sz-.55;
 mesh(Bx(.6,.15,.6),wh,tx,P+.075,tz);mesh(Bx(.42,.75,.42),red,tx,P+.52,tz);
 {const c=mesh(new THREE.CylinderGeometry(.45,.24,.3,4),red,tx,P+1.04,tz);c.rotation.y=Math.PI/4}
 mesh(Bx(.95,.06,.85),M(0xeeeeec,{roughness:.3}),tx,P+1.22,tz);
 mesh(new THREE.CylinderGeometry(.11,.09,.17,14),M(0xf2f4f8),tx+.1,P+1.34,tz,false);                  // กระถางธูป
 mesh(new THREE.CylinderGeometry(.13,.05,.12,12),gold,tx-.25,P+1.32,tz,false);                         // พานทอง
 // รูปปั้นช้าง/ม้า บนลาน
 const ele=(x,z,sc,m)=>{mesh(Bx(.5*sc,.32*sc,.28*sc),m,x,P+.28*sc,z);mesh(Bx(.2*sc,.24*sc,.22*sc),m,x,P+.42*sc,z-.24*sc);mesh(Bx(.06*sc,.3*sc,.06*sc),m,x,P+.24*sc,z-.36*sc);
  for(const a of[-1,1])for(const b of[-1,1])mesh(Bx(.08*sc,.16*sc,.08*sc),m,x+a*.15*sc,P+.08*sc,z+b*.1*sc,false)};
 const hrs=(x,z)=>{const m=M(0xf6f6f2,{roughness:.5});mesh(Bx(.14,.16,.38),m,x,P+.32,z);mesh(Bx(.1,.22,.12),m,x,P+.47,z-.2);for(const a of[-1,1])for(const b of[-1,1])mesh(Bx(.04,.24,.04),m,x+a*.05,P+.12,z+b*.14,false);mesh(Bx(.15,.03,.18),red,x,P+.41,z,false)};
 const eG=M(0x8c8a86,{roughness:.6}),eW=M(0xe6e3dc,{roughness:.6}),eB=M(0x5d4636,{roughness:.6});
 ele(sx+.2,sz-1.15,1.6,eW);ele(sx+.85,sz-1.1,1.0,eG);ele(sx+1.3,sz-1.05,1.0,eB);ele(sx-1.2,sz-.9,1.5,eW);ele(sx-1.35,sz-1.25,.6,eB);
 hrs(sx-.45,sz-1.15);hrs(sx-.85,sz-1.1);
 // ต้นจันทน์ผาและดอกไม้สีเหลืองด้านหลังศาล
 const trk=M(0x7b6a55,{roughness:1}),lf=M(0x4f8a3a,{roughness:.9}),yl=M(0xe8c21a,{roughness:.9}),bsh=M(0x5f8f40,{roughness:1});
 for(const [x,z,h] of[[sx-1.4,sz+1.9,5.2],[sx+.1,sz+2.1,6.4],[sx+1.6,sz+1.8,5.6],[sx+2.2,sz+.2,4.6]]){mesh(new THREE.CylinderGeometry(.06,.09,h,8),trk,x,h/2,z);
  for(let k=0;k<5;k++){const a=k/5*Math.PI*2,c=mesh(new THREE.ConeGeometry(.12,1.1,6),lf,x+Math.cos(a)*.35,h-.1,z+Math.sin(a)*.35);c.rotation.set(Math.sin(a)*1.0,0,-Math.cos(a)*1.0)}
  mesh(new THREE.SphereGeometry(.3,8,6),lf,x,h+.1,z)}
 for(let i=0;i<9;i++){const x=sx-1.9+i*.5,z=sz+1.75+(i%2)*.25;mesh(new THREE.SphereGeometry(.38,8,6),bsh,x,.35,z);for(let k=0;k<3;k++)mesh(new THREE.SphereGeometry(.06,6,4),yl,x+(k-1)*.2,.72,z-.15+k*.1,false)}
 label({name:'ศาลพระภูมิ',w:3.4,l:3.0,h:4.7,cz:sz,lx:sx})}
// ===== มิเตอร์น้ำประปา (ท่อรูปตัว C คว่ำ ∩ ต่อเข้าโรงงาน) + เสาไฟหน้าโรงงานพร้อมมิเตอร์ไฟฟ้า — ขยายใหญ่กว่าจริง (×1.6) ให้มองเห็นชัด
// มิเตอร์น้ำสีน้ำเงิน / มิเตอร์ไฟสีเหลือง + สัญลักษณ์หยดน้ำ/สายฟ้าลอยเหนือจุดติดตั้ง
let icon;   // สร้างไอคอนลอย + ป้ายตัวเลข (ใช้ทั้งมิเตอร์และหม้อแปลง)
{const SC=1.6,SW=1.2,zM=TOTAL+15.2,zW=TOTAL+10,xP=32+RXS,Bx=(a,c,d)=>new THREE.BoxGeometry(a,c,d),Cy=(a,b,h,n=16)=>new THREE.CylinderGeometry(a,b,h,n);
 // สัญลักษณ์ลอยเหนือจุดติดตั้ง: หยดน้ำ (น้ำเงิน) / สายฟ้า (เหลือง) — ป้ายกลมพื้นขาว ขอบสี
 // สัญลักษณ์แบบล้ำ ๆ: ป้ายหกเหลี่ยมกระจกสีเข้ม ขอบนีออนเรืองแสง + สัญลักษณ์เรืองแสง (หยดน้ำ/สายฟ้า), ก้านแสง และเงาทอดบนพื้น
 icon=(kind,x,y,z,sz,y0=.1,key=kind==='drop'?'water':'power',top=false)=>{const F=kind==='flow',neon=kind==='bolt'?'#f6b73c':kind==='level'?'#2ec4b6':F?'#8b5cf6':'#4aa8f0',deep=kind==='bolt'?'#e08e0b':kind==='level'?'#139e92':F?'#6d28d9':'#2b7fd4',
  lite=kind==='bolt'?'#ffdc85':F?'#ddd6fe':'#94d3ff',AL={on:false},                                     // flow = ความเร็วการไหล (ม่วง), AL = สถานะแจ้งเตือน
  // ไอคอนแบบมินิมอลน่ารัก: หมุดวงกลมสีพาสเทลขอบขาว + สัญลักษณ์สีขาว (หยดน้ำ/สายฟ้า) หรือระดับน้ำในวงกลม + หน้ายิ้มแก้มชมพู + หางชี้ลงหาอุปกรณ์
  lvl={p:.5},draw=(g,w,h)=>{const c=w/2,cy=104,R=84,r=R-10;g.clearRect(0,0,w,h);
   g.save();g.shadowColor='rgba(15,23,42,.3)';g.shadowBlur=14;g.shadowOffsetY=6;g.fillStyle='#ffffff';
   g.beginPath();g.arc(c,cy,R,0,Math.PI*2);g.fill();g.beginPath();g.moveTo(c-26,cy+R-14);g.quadraticCurveTo(c-4,cy+R+30,c,h-4);g.quadraticCurveTo(c+4,cy+R+30,c+26,cy+R-14);g.closePath();g.fill();g.restore();
   const bg=g.createLinearGradient(0,cy-r,0,cy+r);if(AL.on){bg.addColorStop(0,'#ff8f8f');bg.addColorStop(1,'#ef1c1c')}else if(kind==='level'){bg.addColorStop(0,'#f2fdfb');bg.addColorStop(1,'#d8f6f2')}else{bg.addColorStop(0,lite);bg.addColorStop(1,neon)}   // alarm → พื้นแดงสว่าง
   g.beginPath();g.arc(c,cy,r,0,Math.PI*2);g.fillStyle=bg;g.fill();
   if(kind==='level'){g.save();g.beginPath();g.arc(c,cy,r,0,Math.PI*2);g.clip();const wy=cy+r-2*r*Math.min(1,Math.max(0,lvl.p)),wg=g.createLinearGradient(0,wy,0,cy+r);
    wg.addColorStop(0,'#6fe6d9');wg.addColorStop(1,deep);g.beginPath();g.moveTo(c-R,wy);for(let i=0;i<=34;i++)g.lineTo(c-R+i*2*R/34,wy+Math.sin(i*.75+.4)*5);
    g.lineTo(c+R,cy+R);g.lineTo(c-R,cy+R);g.closePath();g.fillStyle=wg;g.fill();g.restore()}                                   // น้ำในวงกลมสูงตามค่า %
   else if(F){g.strokeStyle='#ffffff';g.lineWidth=9;g.lineCap='round';g.lineJoin='round';for(const dy of[-30,0,30]){g.beginPath();for(let i=0;i<=20;i++){const xx=c-46+i*4.2;g.lineTo(xx,cy+dy+Math.sin(i*.6)*6)}g.stroke();   // คลื่นการไหล 3 เส้น + หัวลูกศร
     g.beginPath();g.moveTo(c+30,cy+dy-12);g.lineTo(c+46,cy+dy+Math.sin(20*.6)*6);g.lineTo(c+30,cy+dy+16);g.stroke()}}
   else{g.beginPath();if(kind==='drop'){g.moveTo(c,cy-56);g.bezierCurveTo(c+14,cy-30,c+40,cy-6,c+40,cy+14);g.arc(c,cy+14,40,0,Math.PI);g.bezierCurveTo(c-40,cy-6,c-14,cy-30,c,cy-56)}
    else{const P=[[14,-60],[-34,6],[-4,6],[-16,60],[34,-8],[4,-8],[18,-60]];g.moveTo(c+P[0][0],cy+P[0][1]);P.slice(1).forEach(([a,b])=>g.lineTo(c+a,cy+b))}
    g.closePath();g.fillStyle='#ffffff';g.lineJoin='round';g.lineWidth=8;g.strokeStyle='#ffffff';g.fill();g.stroke()}
   const B=kind==='bolt'||F,fy=kind==='drop'?cy+16:F?cy+46:B?cy-2:cy-4,ink=AL.on?'#7f1d1d':kind==='level'?'#0f5e57':F?'#4c1d95':B?'#9a5b00':'#1d4f8f',ex=B?9:13;   // หน้ายิ้ม
   g.fillStyle=ink;for(const sx of[-1,1]){g.beginPath();g.arc(c+sx*ex,fy,B?3.6:5,0,Math.PI*2);g.fill()}
   g.strokeStyle=ink;g.lineWidth=B?2.6:3.4;g.lineCap='round';g.beginPath();g.arc(c,fy+4,B?4:6,.15*Math.PI,.85*Math.PI);g.stroke();
   g.fillStyle='rgba(255,120,150,.55)';for(const sx of[-1,1]){g.beginPath();g.ellipse(c+sx*(ex+9),fy+7,B?4:6,B?2.6:3.6,0,0,Math.PI*2);g.fill()}},t=cv(256,256,draw);
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthWrite:false}));sp.position.set(x,y,z);sp.scale.set(sz,sz,1);sp.renderOrder=5;sp.userData={sz,y0:y,sh:null,lb:null,top,pickId:ICONID[key]||null,isIcon:true,key};scene.add(sp);ICONS.push(sp);
  {const hg=cv(128,128,(g,w,h)=>{const r=g.createRadialGradient(64,64,10,64,64,64);r.addColorStop(0,'rgba(255,40,40,.95)');r.addColorStop(.55,'rgba(255,30,30,.55)');r.addColorStop(1,'rgba(255,0,0,0)');g.fillStyle=r;g.fillRect(0,0,w,h)}),
   ha=new THREE.Sprite(new THREE.SpriteMaterial({map:hg,transparent:true,depthWrite:false}));ha.renderOrder=4;ha.visible=false;scene.add(ha);sp.userData.halo=ha}   // แสงแดงกะพริบรอบไอคอนเมื่อ alarm
  {const lb=new THREE.Sprite(new THREE.SpriteMaterial({transparent:true,depthWrite:false}));lb.renderOrder=6;lb.userData={side:kind==='drop'?-1:1,ar:4,pickId:ICONID[key]||null};scene.add(lb);sp.userData.lb=lb;   // ป้ายตัวเลข (ขนาดกรอบพอดีข้อความ)
   const rd=()=>{const g=t.image.getContext('2d');g.clearRect(0,0,256,256);draw(g,256,256);t.needsUpdate=true};
   METERS[key]={c:null,tx:null,lb,neon,al:AL,rd,last:'',unit:kind==='drop'?'m³':kind==='level'?'%':F?'m/s':'kWh',
    lv:kind==='level'?p=>{lvl.p=p;rd()}:null}}   // ไอคอนระดับน้ำ: ความสูงน้ำตามค่า %
  {const st=new THREE.MeshBasicMaterial({color:deep}),m=mesh(new THREE.CylinderGeometry(.03,.03,y-sz/2-y0,10),st,x,(y-sz/2+y0)/2,z,false),   // เส้นชี้สีทึบจากหางไอคอนลงถึงอุปกรณ์
   d=mesh(new THREE.SphereGeometry(.08,14,10),st,x,y0,z,false),rg=mesh(new THREE.TorusGeometry(.13,.024,8,28).rotateX(Math.PI/2),new THREE.MeshBasicMaterial({color:0xffffff}),x,y0,z,false);   // จุด + วงแหวนที่ปลายเส้น
   for(const o of[m,d,rg]){ICONX.push(o);ANIMK.push(o)}sp.userData.st=[m,d,rg]}   // ก้านแสง
  if(top)return sp;
  const sh=cv(128,128,(g,w,h)=>{const r=g.createRadialGradient(64,64,0,64,64,64);r.addColorStop(0,'rgba(0,0,0,.45)');r.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=r;g.fillRect(0,0,w,h)});
  const sm=mesh(new THREE.PlaneGeometry(sz*1.1,sz*1.1).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({map:sh,transparent:true,depthWrite:false}),x+.25,.16,z+.25,false);sm.renderOrder=1;sp.userData.sh=sm;ICONX.push(sm);ANIMK.push(sm);return sp};   // เงาทอดบนพื้น
 // --- มิเตอร์น้ำ
 {const x=xP+.45,g=new THREE.Group(),pb=M(0x1f5fd0,{roughness:.35,metalness:.2}),ss=M(0xc9ced3,{metalness:.75,roughness:.3}),blk=M(0x1b1d20);
  const add=(geo,m,px,py,pz,rx=0,rz=0)=>{const o=new THREE.Mesh(geo,m);o.position.set(px,py,pz);o.rotation.set(rx,0,rz);o.castShadow=true;o.receiveShadow=true;g.add(o);return o};
  // ท่อรูปตัว C คว่ำ (∩): ขาท่อโผล่จากพื้น 2 ข้าง + ท่อบนแนวนอน มิเตอร์อยู่กลางท่อบน, ท่อฝั่งหนึ่งมุดดินต่อเข้าโรงงาน
  const r=.07,span=1.1,yT=.95,PI2=Math.PI/2;
  add(Bx(.6,.1,span+.6),M(0xbfc2c6,{roughness:.95}),0,.05,0);                                          // แท่นปูน
  for(const s2 of[-1,1]){add(Cy(r,r,yT-.1),pb,0,.1+(yT-.1)/2,s2*span/2);add(Cy(r*1.5,r*1.5,.05),ss,0,.12,s2*span/2);
   add(new THREE.SphereGeometry(r*1.15,12,10),pb,0,yT,s2*span/2)}                                        // ขาท่อ + ข้องอ
  add(Cy(r,r,span),pb,0,yT,0,PI2);                                                                        // ท่อบน
  add(Cy(.17,.17,.26,20),pb,0,yT,0,PI2);                                                                  // ตัวมิเตอร์
  add(Cy(.12,.12,.12,16),pb,0,yT+.14,0);add(Cy(.135,.135,.03,20),M(0xeef3f8,{roughness:.15}),0,yT+.21,0);add(Cy(.14,.14,.015,20),blk,0,yT+.23,0);   // หน้าปัด
  for(const s2 of[-1,1])add(Cy(.11,.11,.035,16),ss,0,yT,s2*.16,PI2);                                     // หน้าแปลน
  add(Cy(.04,.04,.12,8),M(0xc81e1e),0,yT+.1,-.36);add(Bx(.22,.03,.05),M(0xc81e1e),0,yT+.17,-.36);         // วาล์วแดง
  add(Cy(r,r,1.4),pb,0,.1,span/2+.7,PI2);                                                                // ท่อมุดดินต่อเข้าโรงงาน
  g.scale.setScalar(SW);g.position.set(x,.13,zW);g.rotation.y=0;scene.add(g);                       // ติดหลังป้อม รปภ. (ด้านตะวันออก)
  icon('drop',x,3.2,zW,1.1,1.45);zone('o_wmeter',x,.9,zW,1.2,1.8,2.0)}
 // --- เสาไฟฟ้าหน้าโรงงาน + มิเตอร์ไฟฟ้า
 {const x=xP,pH=12.7,ylw=M(0xf2c218,{roughness:.4,metalness:.2}),blk=M(0x1b1d20,{roughness:.6});
  const g=new THREE.Group(),add=(geo,m,px,py,pz)=>{const o=new THREE.Mesh(geo,m);o.position.set(px,py,pz);o.castShadow=true;g.add(o);return o};
  add(Bx(.42,.6,.22),ylw,0,0,0);                                                                       // ตู้มิเตอร์
  add(Bx(.3,.22,.02),M(0xeef3f8,{roughness:.15,transparent:true,opacity:.85}),0,.1,.12);               // กระจกหน้า
  add(Bx(.22,.06,.025),blk,0,.12,.125);add(Cy(.05,.05,.02),M(0x1b1d20),0,-.12,.125).rotation.x=Math.PI/2;
  add(Bx(.46,.04,.26),ylw,0,.32,0);                                                                    // หลังคาตู้
  g.scale.setScalar(SC);g.position.set(x,2.3,zM+.4);scene.add(g);

  icon('bolt',x,4.4,zM+.55,1.1,3.05);zone('o_emeter',x,2.4,zM+.4,1.4,2.2,1.2)}}
// ===== กำแพงรั้วหน้าโรงงาน + เสาประตูฝั่งซ้ายทางเข้า (ตรงข้ามป้อม รปภ.) =====
{const zW=TOTAL+14.7,xR=rdX-rdW/2-.35,xL=-38,H=1.8,Bx=(a,c,d)=>new THREE.BoxGeometry(a,c,d),wl=M(0xeeeeea,{roughness:.85}),cap=M(0xc9ccd0,{roughness:.7}),bs=M(0x2f5fb8,{roughness:.6});
 const sX1=xR-.65,sX0=sX1-7.2,wE=sX0;                                                                  // ช่วงป้ายหินแกรนิตชื่อบริษัท (ติดเสาประตู) — กำแพงสิ้นสุดที่ขอบป้าย
 mesh(Bx(wE-xL,H,.22),wl,(xL+wE)/2,H/2,zW);mesh(Bx(wE-xL,.08,.32),cap,(xL+wE)/2,H+.04,zW,false);mesh(Bx(wE-xL+.01,.35,.24),bs,(xL+wE)/2,.175,zW,false);   // กำแพง + ทับหลัง + ฐานน้ำเงิน
 for(let x=xL+3;x<wE-.5;x+=3)mesh(Bx(.4,H+.15,.4),wl,x,(H+.15)/2,zW);                                    // เสากำแพง
 // ป้ายชื่อบริษัทหินแกรนิตดำ (ตามรูปจริง): ผนังหินดำขอบบนขาว ตัวอักษรสแตนเลส "บริษัท โปลิฟาร์ม จำกัด / POLIPHARM CO., LTD. / 109 หมู่ 2"
 //   หันออกถนนหลัก + พุ่มไม้ตัดแต่งเตี้ยหน้าป้าย บนแนวหญ้าริมรั้ว
 {const L=sX1-sX0,cx=(sX0+sX1)/2,SH=2.0,sz=zW+.02,gr=cv(512,128,(g,w,h)=>{g.fillStyle='#2c2e31';g.fillRect(0,0,w,h);for(let i=0;i<2600;i++){const v=40+Math.random()*50|0;g.fillStyle=`rgba(${v},${v+2},${v+5},.55)`;g.fillRect(Math.random()*w,Math.random()*h,1.5,1.5)}
    g.strokeStyle='rgba(15,15,17,.8)';g.lineWidth=1.2;for(let x=w/4;x<w;x+=w/4){g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke()}g.beginPath();g.moveTo(0,h/2);g.lineTo(w,h/2);g.stroke()});
  gr.repeat.set(1,1);const grM=new THREE.MeshStandardMaterial({map:gr,roughness:.25,metalness:.15});
  mesh(Bx(L,SH,.5),grM,cx,SH/2,sz);mesh(Bx(L+.12,.14,.62),M(0xf4f4f1,{roughness:.6}),cx,SH+.07,sz);mesh(Bx(.3,SH+.14,.62),M(0xf4f4f1,{roughness:.6}),sX1-.15,(SH+.14)/2,sz);   // หินดำ + ขอบบนขาว + เสาปลายขาว
  const tx=cv(1536,384,(g,w,h)=>{g.clearRect(0,0,w,h);const met=(y0,y1)=>{const q=g.createLinearGradient(0,y0,0,y1);q.addColorStop(0,'#f4f6f8');q.addColorStop(.45,'#b8bec6');q.addColorStop(.55,'#8d949c');q.addColorStop(1,'#e2e6ea');return q};
   g.textBaseline='alphabetic';g.shadowColor='rgba(0,0,0,.65)';g.shadowOffsetX=4;g.shadowOffsetY=5;g.shadowBlur=3;
   g.font='bold 118px "Leelawadee UI", "Noto Sans Thai", Tahoma, sans-serif';g.fillStyle=met(30,150);g.textAlign='left';
   const t1='บริษัท   โปลิฟาร์ม   จำกัด';g.fillText(t1,(w-g.measureText(t1).width)/2,128);
   g.font='bold 112px "Times New Roman", Georgia, serif';const a='POLIPH',b2='ARM',c=' CO., LTD.',wa=g.measureText(a).width,wb=g.measureText(b2).width,wc=g.measureText(c).width;let x=(w-wa-wb-wc)/2;
   g.fillStyle=met(170,270);g.fillText(a,x,262);x+=wa;g.fillStyle='#c0473a';g.fillText(b2,x,262);x+=wb;g.fillStyle=met(170,270);g.fillText(c,x,262);
   g.font='bold 62px "Leelawadee UI", "Noto Sans Thai", Tahoma, sans-serif';g.fillStyle=met(290,345);g.textAlign='right';g.fillText('109 หมู่ 2',w-150,340)});
  mesh(new THREE.PlaneGeometry(5.2,1.3),new THREE.MeshStandardMaterial({map:tx,transparent:true,metalness:.6,roughness:.3}),cx-.15,SH-.72,sz+.26,false);
  mesh(new THREE.BoxGeometry(L-.3,.42,.55),M(0x3f6b2e,{roughness:1}),cx,.31,zW+.62);                                                  // พุ่มไม้ตัดแต่งหน้าป้าย
  for(let i=0;i<Math.round(L/.45);i++)mesh(new THREE.SphereGeometry(.24,7,5),M(i%3?0x46762f:0x3a6528,{roughness:1}),sX0+.35+i*.45,.5,zW+.62,false);
  label({name:'ป้ายชื่อบริษัท',w:.5,l:L,h:SH,cz:sz,lx:cx})}
 mesh(Bx(.8,2.6,.8),wl,xR-.2,1.3,zW);mesh(Bx(.95,.12,.95),cap,xR-.2,2.66,zW);mesh(Bx(.82,.4,.82),bs,xR-.2,.2,zW,false);   // เสาประตูฝั่งซ้าย
 mesh(new THREE.SphereGeometry(.18,14,10),M(0xffffff,{emissive:0xfff1c8,emissiveIntensity:.35,roughness:.3}),xR-.2,2.9,zW)}   // โคมหัวเสา
// ===== ทางเท้าริมถนนหลัก (มองจากหน้าบริษัท): แนวหญ้าริมรั้ว + ฟุตบาทอิฐตัวหนอนสีส้ม กว้าง 1.5 ม. + ขอบคันหิน ตลอดแนวสองข้างทาง เว้นช่องทางเข้า =====
{const zF=TOTAL+14.7+.11,vD=.8,fD=1.5,z1=zF+vD,z2=z1+fD,yT=.24,Bx=(a,c,d)=>new THREE.BoxGeometry(a,c,d),gL=rdX-rdW/2,gR=rdX+rdW/2,
  pv=cv(256,256,(g,w,h)=>{g.fillStyle='#c8623a';g.fillRect(0,0,w,h);const u=w/4;                                   // อิฐตัวหนอน (ขอบหยัก) สลับสีส้มเข้ม/อ่อน
   for(let r=0;r<8;r++)for(let c=0;c<4;c++){const x0=c*u,y0=r*h/8,hh=h/8,k=(r+c)%3;g.fillStyle=['#d0703f','#bf5a33','#d87c4a'][k];
    g.beginPath();g.moveTo(x0,y0);g.lineTo(x0+u*.25,y0+hh*.22);g.lineTo(x0+u*.5,y0);g.lineTo(x0+u*.75,y0+hh*.22);g.lineTo(x0+u,y0);g.lineTo(x0+u,y0+hh);
    g.lineTo(x0+u*.75,y0+hh+hh*.22);g.lineTo(x0+u*.5,y0+hh);g.lineTo(x0+u*.25,y0+hh+hh*.22);g.lineTo(x0,y0+hh);g.closePath();g.fill();g.strokeStyle='rgba(90,40,22,.75)';g.lineWidth=2;g.stroke()}
   for(let i=0;i<500;i++){g.fillStyle=`rgba(255,230,200,${Math.random()*.08})`;g.fillRect(Math.random()*w,Math.random()*h,2,2)}});
 pv.wrapS=pv.wrapT=THREE.RepeatWrapping;
 const cM=M(0xe6e6e2,{roughness:.8}),gM=M(0x7fae55,{roughness:1});
 const verge=(x0,x1)=>mesh(Bx(x1-x0,yT,vD),gM,(x0+x1)/2,yT/2-.02,(zF+z1)/2,false);                                                  // แนวหญ้าริมรั้ว
 const path=(x0,x1)=>{const L=x1-x0,cx=(x0+x1)/2,t=pv.clone();t.needsUpdate=true;t.repeat.set(L/.9,fD/.9);
  mesh(Bx(L,yT,fD),[M(0xb85a35),M(0xb85a35),new THREE.MeshStandardMaterial({map:t,roughness:.9}),M(0xb85a35),M(0xb85a35),M(0xb85a35)],cx,yT/2,(z1+z2)/2,false);   // ฟุตบาทอิฐตัวหนอนสีส้ม
  mesh(Bx(L,yT+.06,.15),cM,cx,(yT+.06)/2,z2+.075,false)};                                                                            // ขอบคันหินขาว (ฝั่งถนน)
 // ปากทางเข้า: ฟุตบาทเว้นกว้างกว่าถนนเข้าข้างละ ~1.8 ม. (ผายปากทางให้รถบรรทุกเลี้ยวเข้า-ออกได้ไม่ทับขอบคันหิน)
 const wP=gL-2.1,eP=gR+1.8;
 verge(-38,gL-.35);path(-700,wP);verge(gR+.3,40);path(eP,700);                                                              // ฝั่งโรงงาน: ตลอดแนวจนสุดแผนที่
 {const zA=MRZ+MRH,t=pv.clone();t.needsUpdate=true;t.repeat.set(1400/.9,fD/.9);                                                   // ฝั่งตรงข้ามถนน: คันหิน + ฟุตบาท ตลอดแนว
  mesh(Bx(1400,yT+.06,.15),cM,0,(yT+.06)/2,zA+.075,false);mesh(Bx(1400,yT,fD),[M(0xb85a35),M(0xb85a35),new THREE.MeshStandardMaterial({map:t,roughness:.9}),M(0xb85a35),M(0xb85a35),M(0xb85a35)],0,yT/2,zA+.15+fD/2,false)}
 for(const [x,za,zb] of[[wP+.075,z1,z2+.15],[eP-.075,z1,z2+.15],[gL-.35-.075,zF,z1],[gR+.3+.075,zF,z1]])mesh(Bx(.15,yT+.06,zb-za),cM,x,(yT+.06)/2,(za+zb)/2,false);   // ขอบคันหินปลายฟุตบาท/แนวหญ้า
 mesh(Bx((gL-.35)-wP,.02,fD+.15),M(0x8d9096,{roughness:1}),(wP+gL-.35)/2,.16,(z1+z2+.15)/2,false);mesh(Bx(eP-(gR+.3),.02,fD+.15),M(0x8d9096,{roughness:1}),(eP+gR+.3)/2,.16,(z1+z2+.15)/2,false)}   // ลานคอนกรีตปากทาง
// เสาไฟฟ้าแรงสูงริมด้านขวา ห่างต้นละ 100 ม. จนถึงหน้าอาคารโกดัง + หม้อแปลง 5 ตัว
{const px0=32+RXS,pH=13,poleM=M(0xb9b9b4,{roughness:.9}),armM=M(0x4a4f57),insM=M(0xd9d2c0,{roughness:.3}),pz=[];
 pz.push(TOTAL+15.2);                                                                   // เสาหน้าโรงงานฝั่งถนนหลัก (ติดมิเตอร์ไฟฟ้า) แนวเดียวกับเสาในโรงงาน
 for(let z=TOTAL;z>gz0+10;z-=50)pz.push(z);pz.push(gz0-8);
 pz.forEach(z=>{mesh(new THREE.CylinderGeometry(.14,.24,pH,10),poleM,px0,pH/2,z);mesh(new THREE.BoxGeometry(3.4,.14,.14),armM,px0,pH-.6,z);for(const xo of[-1.4,0,1.4])mesh(new THREE.CylinderGeometry(.05,.06,.35,8),insM,px0+xo,pH-.6+.25,z)});
 for(let i=0;i<pz.length-1;i++)for(const xo of[-1.4,0,1.4]){const pts=[];for(let j=0;j<=20;j++){const t=j/20;pts.push(V(px0+xo,pH-.15-1.4*4*t*(1-t),pz[i]+(pz[i+1]-pz[i])*t))}scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0x222222})))}
 const cn=M(0xcfcfc8,{roughness:.9}),trB=M(0xa59a8e,{metalness:.35,roughness:.55}),trL=M(0x8d8174,{metalness:.3,roughness:.6}),blk=M(0x15171a,{roughness:.7}),whP=M(0xe9e5dc,{roughness:.3}),brn=M(0x3a1f18,{roughness:.35}),gry=M(0xb0b4b8,{metalness:.4,roughness:.5});
 const finT=cv(16,16,(g,w,h)=>{g.fillStyle='#b9ad9f';g.fillRect(0,0,w,h);g.fillStyle='#6f655a';g.fillRect(0,0,6,h)});finT.repeat.set(15,1);
 const finM=new THREE.MeshStandardMaterial({map:finT,metalness:.3,roughness:.6});
 const plT=cv(128,64,(g,w,h)=>{g.fillStyle='#fff';g.fillRect(0,0,w,h);g.fillStyle='#222';g.font='bold 30px sans-serif';g.textAlign='center';g.fillText('2PEA-TR',w/2,40)});
 const plM=new THREE.MeshStandardMaterial({map:plT});
 // หม้อแปลงบนนั่งร้านเสาคู่ (ตามรูปจริง): เสาคอนกรีตสี่เหลี่ยม 2 ต้น คาดแถบขาว, คานคอนกรีตรับหม้อแปลง, คอนสาย/คัทเอาท์/กับดักฟ้าผ่า, ท่อร้อยสายแรงต่ำลงดิน
 // พิกัดภายในกลุ่ม: x = ตามแนวสายไฟ, z+ = ด้านหน้า (หันเข้าถนน)
 const tkM=M(0xc4c8cc,{metalness:.45,roughness:.45}),bandM=M(0xf2f2ee,{roughness:.4}),stl=M(0x8f969f,{metalness:.6,roughness:.4}),cndM=M(0xb7bcc2,{metalness:.7,roughness:.35});
 const fT=(n)=>{const t=cv(16,16,(g,w,h)=>{g.fillStyle='#d3d6da';g.fillRect(0,0,w,h);g.fillStyle='#8e9399';g.fillRect(0,0,5,h)});t.repeat.set(n,1);return new THREE.MeshStandardMaterial({map:t,metalness:.4,roughness:.5})};
 const finZ=fT(16),finX=fT(9);
 const addTrf=(x,z)=>{const g=new THREE.Group(),add=(ge,m,ax,ay,az,rx=0,ry=0,rz=0)=>{const o=new THREE.Mesh(ge,m);o.position.set(ax,ay,az);o.rotation.set(rx,ry,rz);o.castShadow=true;o.receiveShadow=true;g.add(o);return o},
  cab=(pts,r,m=blk)=>{const o=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p=>V(p[0],p[1],p[2]))),24,r,6),m);o.castShadow=true;g.add(o)},
  Bx=(a,b,c)=>new THREE.BoxGeometry(a,b,c),Cy=(r1,r2,h,n=12)=>new THREE.CylinderGeometry(r1,r2,h,n);
  const PX=1.75,H=pH,bY=4.2,tY=bY+.225,cY=9.4,aY=8.1,cz=.3;
  // เสาคอนกรีตสี่เหลี่ยมเรียว 2 ต้น + แถบขาวสะท้อนแสง + ฐาน
  for(const s of[-1,1]){const px=s*PX;
   add(Cy(.14,.21,H,4),cn,px,H/2,0,0,Math.PI/4);
   add(Cy(.205,.205,.8,4),bandM,px,3,0,0,Math.PI/4);
   add(Bx(.7,.3,.7),cn,px,.15,0);
   // คอนสายบนยอดเสา (ตั้งฉากแนวสาย) 2 ชั้น + ลูกถ้วย
   for(const yy of[H-.6,H-1.3])add(Bx(.12,.12,3.4),armM,px,yy,0);
   [-1.4,0,1.4].forEach(iz=>{add(Cy(.05,.07,.25,10),brn,px,H-.6+.19,iz);add(Cy(.09,.09,.03,10),brn,px,H-.6+.12,iz);
    add(Cy(.055,.055,.35,10),brn,px,H-1.3,iz,0,0,Math.PI/2)});
   for(const t of[-1,1])add(Bx(.05,.95,.05),armM,px,H-1.0,t*.42,t*.85,0,0)}                         // เหล็กค้ำคอนสาย
  // คานคอนกรีตคู่รับหม้อแปลง (ยื่นเลยเสาเล็กน้อย) + คานรองขวาง
  for(const t of[-1,1])add(Bx(5.2,.45,.22),cn,0,bY,t*.36);
  for(const sx of[-.45,.45])add(Bx(.22,.12,.95),cn,sx,bY+.17,0);
  // ตัวหม้อแปลง: ถัง + ครีบระบายความร้อนรอบด้าน + ฝา + ถังน้ำมันสำรอง (conservator) + บุชชิ่ง
  add(Bx(1.2,.1,.8),tkM,0,tY+.05,0);
  add(Bx(1.1,1.0,.75),tkM,0,tY+.6,0);
  for(const t of[-1,1]){add(Bx(1.05,.85,.28),[tkM,tkM,tkM,tkM,finZ,finZ],0,tY+.57,t*.515);add(Bx(.26,.85,.6),[finX,finX,tkM,tkM,tkM,tkM],t*.68,tY+.57,0)}
  add(Bx(1.25,.08,.9),tkM,0,tY+1.14,0);
  add(Bx(.02,.2,.34),plM,.82,tY+.6,0);                                                           // ป้ายชื่อ
  for(const sx of[-.3,.3])add(Bx(.06,.22,.06),tkM,sx,tY+1.28,-.25);
  add(Cy(.22,.22,.95,18),tkM,-.05,tY+1.55,-.25,0,0,Math.PI/2);                                    // conservator
  add(Cy(.23,.23,.04,18),bandM,.44,tY+1.55,-.25,0,0,Math.PI/2);
  add(Cy(.05,.05,.25,10),M(0x3d8fd0,{roughness:.4}),-.62,tY+1.25,-.25);                           // ซิลิกาเจล breather
  const hvX=[-.35,0,.35],lvX=[-.42,-.14,.14,.42];
  hvX.forEach(hx=>{add(Cy(.08,.08,.1,10),tkM,hx,tY+1.23,.15);add(Cy(.045,.07,.48,10),brn,hx,tY+1.52,.15);
   for(let k=0;k<3;k++)add(Cy(.085,.085,.025,10),brn,hx,tY+1.38+k*.12,.15)});
  lvX.forEach(lx=>{add(Cy(.04,.05,.22,8),blk,lx,tY+1.29,.38);add(Cy(.05,.05,.05,8),whP,lx,tY+1.42,.38)});
  // คอนเหล็กระหว่างเสา (แนวเดียวกับสาย) 2 ระดับ: คัทเอาท์ฟิวส์ (บน) และกับดักฟ้าผ่า (ล่าง)
  for(const yy of[cY,aY])for(const t of[-1,1])add(Bx(2*PX+.3,.1,.08),armM,0,yy,t*cz);
  for(const t of[-1,1])add(Bx(.05,cY-aY,.05),armM,0,(cY+aY)/2,t*cz);
  [-1,0,1].forEach(lx=>{
   add(Bx(.08,.12,.16),gry,lx,cY+.08,cz+.08);
   add(Cy(.05,.05,.42,10),brn,lx,cY+.3,cz+.12,.35);                                               // คัทเอาท์: ฉนวน
   add(Cy(.032,.032,.5,8),gry,lx,cY+.3,cz+.3,.35);                                                // กระบอกฟิวส์
   add(Bx(.1,.06,.12),gry,lx,cY+.56,cz+.36);add(Bx(.1,.06,.12),gry,lx,cY+.05,cz+.22);
   add(Bx(.1,.06,.14),gry,lx,aY+.08,cz+.06);                                                      // กับดักฟ้าผ่า
   add(Cy(.055,.06,.4,10),brn,lx,aY+.32,cz+.06);for(let k=0;k<4;k++)add(Cy(.085,.085,.02,10),brn,lx,aY+.17+k*.1,cz+.06);
   add(Cy(.03,.03,.06,8),gry,lx,aY+.55,cz+.06);
   // สายแรงสูง: คัทเอาท์ -> กับดักฟ้าผ่า -> บุชชิ่งแรงสูงหม้อแปลง
   const hx=hvX[lx+1];
   cab([[lx,cY+.03,cz+.24],[lx*1.08,(cY+aY)/2+.25,cz+.45],[lx,aY+.58,cz+.06]],.02);
   cab([[lx,aY+.58,cz+.06],[lx*.9+.1,aY-.6,cz+.5],[hx*1.3,tY+2.3,.45],[hx,tY+1.77,.15]],.02)});
  // ท่อร้อยสายแรงต่ำ 3 ท่อ ลงดินข้างเสาขวา + เข็มขัดรัด + โครงเหล็กรองที่พื้น
  const cX=[PX+.32,PX+.45,PX+.58],cZ=.12,cTop=tY+.2;
  cX.forEach(xx=>{add(Cy(.05,.05,cTop,10),cndM,xx,cTop/2,cZ);add(Cy(.05,.05,.35,10),cndM,xx-.1,cTop+.12,cZ+.05,0,0,.9)});
  for(const yy of[1,2.2,3.4])add(Bx(.5,.04,.14),stl,PX+.4,yy,cZ);
  add(Bx(.06,1.2,.06),stl,PX+.75,.6,cZ);add(Bx(.6,.06,.06),stl,PX+.45,1.15,cZ);
  lvX.forEach((lx,i)=>cab([[lx,tY+1.45,.38],[(lx+PX)/2,tY+1.6,.62],[cX[i%3]-.2,cTop+.35,cZ+.1]],.03));
  // แท่นเหล็กข้างเสาซ้าย (ตามรูป)
  add(Bx(1.3,.06,.8),stl,-PX-.75,tY+1.0,0);for(const t of[-1,1])add(Bx(.05,1.15,.05),stl,-PX-.55,tY+.55,t*.35,0,0,-.75);
  g.position.set(x,0,z);g.rotation.y=-Math.PI/2;scene.add(g)};
 const wy=zq=>{for(let i=0;i<pz.length-1;i++){const a=pz[i],b=pz[i+1];if((zq-a)*(zq-b)<=0){const t=(zq-a)/(b-a);return pH-.15-1.4*4*t*(1-t)}}return pH-.15};
 // (หม้อแปลงหน้าแผนกวิศวกรรมฝั่งหน้าโรงงาน อยู่ตรงกลางประตูม้วนแผนกวิศวกรรม: fc.z0+48.1)
 // หม้อแปลง 5 ตัว เรียงเลข 1–5 จากด้านหน้า (ประตู) เข้าไปด้านใน: ไอคอนสายฟ้าเหนือยอดเสา + ป้ายตัวเลขเหนือไอคอน + โซนคลิก o_tr1..o_tr5
 [B[3].z0+B[3].ez,B[2].z0+B[2].ez,fc.z0+fc.ez/2-22.5,fc.z0+48.1,gz0].sort((a,b)=>b-a).forEach((z,n)=>{icon('bolt',px0,14.6,z,1.1,13.15,'tr'+(n+1),true);zone('o_tr'+(n+1),px0,8.5,z,1.8,9.4,4.2)});
 [B[3].z0+B[3].ez,B[2].z0+B[2].ez,fc.z0+fc.ez/2-22.5,fc.z0+48.1,gz0].forEach(z=>{addTrf(px0,z);[-1.4,0,1.4].forEach((xo,i)=>{const zq=z+i-1,y0=wy(zq),c=new THREE.CatmullRomCurve3([V(px0+xo,y0,zq),V(px0+xo*.5-.3,(y0+9.96)/2+.4,zq),V(px0-.66,9.96,zq)]);scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(c.getPoints(12)),new THREE.LineBasicMaterial({color:0x222222})))})})}
// ไอคอน + ตัวเลข เหนืออุปกรณ์: ระดับน้ำ (ถัง/บ่อ) และมิเตอร์ไฟ (Chiller, ห้อง CDA) — ป้ายตัวเลขอยู่เหนือไอคอน
{const at=(kind,id,key)=>{const z=ZONES[id];if(z)icon(kind,z.x,z.top+1.75,z.z,1.1,z.top+.15,key,true)};
 at('level','o_tank14','tank14');at('level','o_b5tank','b5tank');at('level','o_pump','pump');
 at('bolt','o_b5chiller','b5chiller');at('bolt','o_chiller','chiller');
 if(CDAP)icon('bolt',CDAP.x,7.4,CDAP.z,1.1,5.8,'cda',true);
 {const r=ROOMS.find(q=>q.id==='r_pw');if(r&&CDAP){const z=fc.z0+r.o;icon('level',CDAP.x,7.4,z-1.6,1.1,5.8,'pwtank',true);icon('flow',CDAP.x,7.4,z+1.6,1.1,5.8,'pwvel',true)}}}   // ห้องระบบน้ำ Purified: ระดับน้ำในถัง (%) + ความเร็วการไหล (m/s)
// โคมไฟถนนด้านเสาไฟ ห่างกัน 25 ม. จากทางเข้าจนถึงท้ายโรงงาน
const lampM=new THREE.MeshStandardMaterial({color:0xfff4d0,emissive:0xffe9a8,emissiveIntensity:.15});
// ตำแหน่งเสาไฟถนน (ทุก 25 ม.) — ต้นที่ตรงหน้าลานโหลดเฟส 2 และหน้าลานโหลดโกดังเลื่อนไป 8 ม. ไม่ให้ขวางรถเทียบท่า
const LAMPZ=[];for(let z=TOTAL;z>=0;z-=25)LAMPZ.push(SHUT[42]&&Math.abs(z-SHUT[42].z)<6?SHUT[42].z+8:Math.abs(z-fc.z0)<4?fc.z0+7:z);   // ต้นหน้าลานโหลดโกดังเลื่อน 8 ม. ไม่ให้ขวางรถเลี้ยวออกจากช่องจอด
{const lpM=M(0x6b7078,{metalness:.5,roughness:.5}),lamx=rdX+rdW/2+.4;
 for(const z of LAMPZ){mesh(new THREE.CylinderGeometry(.08,.12,9,8),lpM,lamx,4.5,z);mesh(new THREE.BoxGeometry(2.4,.08,.08),lpM,lamx-1.2,9,z);mesh(new THREE.BoxGeometry(.9,.14,.34),lpM,lamx-2.4,9.05,z);mesh(new THREE.BoxGeometry(.8,.03,.28),lampM,lamx-2.4,8.96,z,false)}}
// อาคาร 4 (ฝ่ายขาย) ตามรูปจริง (มุมด้านติดอาคาร 5 กับด้านลานจอดรถ): ผนังปูนขาว, ชายคากล่องหนา 1.4 ม. ยื่น 1.2 ม. ใต้ชายคาลาดเข้าหาผนัง,
// ครีบค้ำสามเหลี่ยมใต้ชายคาด้านยาว, ท่อน้ำฝนที่มุม, เลข 4 สีน้ำเงิน, ฐานปูนยกพร้อมกระถางต้นไม้ (ฝั่งลานจอดรถ),
// ด้านติดอาคาร 5: ประตูบานคู่สีเทา + บอร์ดประกาศกระจก 3 ช่อง
{const b=B[3],xW=b.cx-b.ex/2,xE=b.cx+b.ex/2,zN=b.z0,zS=b.z0+b.ez,H=b.h,P=1.2,yB=b.eaveY,yW=3.9,Bx=(a,c,d)=>new THREE.BoxGeometry(a,c,d);
 const wh=M(0xf3f3f0,{roughness:.9}),whS=M(0xe6e7e3,{roughness:.95}),grey=M(0x9ea3a6,{roughness:.6,metalness:.2}),stl=M(0xb9bcc0,{metalness:.6,roughness:.4});
 // ชายคากล่อง: หน้าตั้ง y 4.6–6.2 รอบอาคาร + ขอบบน
 const fh=H+.2-yB,fy=yB+fh/2;
 mesh(Bx(b.ex+2*P,fh,.2),wh,b.cx,fy,zN-P+.1);mesh(Bx(b.ex+2*P,fh,.2),wh,b.cx,fy,zS+P-.1);
 mesh(Bx(.2,fh,b.ez+2*P),wh,xW-P+.1,fy,b.cz);mesh(Bx(.2,fh,b.ez+2*P),wh,xE+P-.1,fy,b.cz);
 mesh(Bx(b.ex+2*P,.12,b.ez+2*P),M(0xd9dad6),b.cx,H+.26,b.cz,false);                       // แผ่นปิดบน/ขอบหลังคา
 // ใต้ชายคาลาด: จากขอบนอก (y 4.6) ลงเข้าหาผนัง (y 3.9)
 const sl=Math.hypot(P,yB-yW),ang=Math.atan2(yB-yW,P);
 {const m=mesh(Bx(b.ex+2*P,.08,sl),whS,b.cx,(yB+yW)/2,zN-P/2,false);m.rotation.x=ang}
 {const m=mesh(Bx(b.ex+2*P,.08,sl),whS,b.cx,(yB+yW)/2,zS+P/2,false);m.rotation.x=-ang}
 {const m=mesh(Bx(sl,.08,b.ez),whS,xW-P/2,(yB+yW)/2,b.cz,false);m.rotation.z=-ang}
 {const m=mesh(Bx(sl,.08,b.ez),whS,xE+P/2,(yB+yW)/2,b.cz,false);m.rotation.z=ang}
 // ครีบค้ำสามเหลี่ยมใต้ชายคา ด้านยาวทั้งสองฝั่ง ห่างกันประมาณ 6 ม.
 const fs=new THREE.Shape();fs.moveTo(0,3.0);fs.lineTo(0,yW);fs.lineTo(P,yB);fs.lineTo(0,3.0);
 const finG=new THREE.ExtrudeGeometry(fs,{depth:.7,bevelEnabled:false}).translate(0,0,-.35);
 for(let z=zN+3;z<zS-1;z+=6.1)[[xE,0],[xW,Math.PI]].forEach(([x,r])=>{const f=mesh(finG,wh,x,0,z);f.rotation.y=r});
 // ท่อน้ำฝนที่มุมฝั่งอาคาร 5 / ลานจอดรถ
 mesh(Bx(.14,yW,.14),M(0xf7f7f5,{roughness:.6}),xE+.1,yW/2,zN+.35);
 mesh(Bx(.3,.08,.5),M(0x6b5a48,{roughness:1}),xE+.25,.15,zN+.35,false);                   // ตะแกรงรางระบายที่ฐาน
 // แนวรอยต่อผนังด้านยาว (ฝั่งลานจอดรถ)
 mesh(Bx(.02,.03,b.ez),M(0xc9cac6),xE+.01,1.5,b.cz,false);
 // เลข 4 สีน้ำเงิน ที่ผนังด้านยาว ใกล้มุมฝั่งอาคาร 5
 {const t=cv(128,128,(g,w,h)=>{g.clearRect(0,0,w,h);g.fillStyle='#1f4f9f';g.font='bold 116px Arial, sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('4',w/2,h/2+6)});
  const n=mesh(new THREE.PlaneGeometry(.8,.8),new THREE.MeshBasicMaterial({map:t,transparent:true}),xE+.02,2.9,zN+1.6,false);n.rotation.y=Math.PI/2}
 // ฐานปูนยก + กระถางต้นไม้ ตามแนวผนังด้านยาวฝั่งลานจอดรถ
 // ประตูทางเข้ากระจก (ฝั่งลานจอดรถ) ตรงกับช่องจอดที่ 6 นับจากฝั่งอาคาร 1
 const dz=zN+.5+5*7+1.25,dg=1.6;                                                                       // ช่องจอดที่ 6 จากฝั่งอาคาร 1 = กลุ่มที่ 6 ช่องแรก
 for(const [a,c] of[[zN+.6,dz-dg],[dz+dg,zS]])mesh(Bx(.7,.45,c-a),wh,xE+.35,.225,(a+c)/2);                 // ฐานปูนยก เว้นช่องหน้าประตู
 const potM=M(0xe9e9e6,{roughness:.8}),bushM=M(0x4f7f35,{roughness:1});
 for(let z=zN+4.5;z<zS-1;z+=1.6){if(Math.abs(z-dz)<dg+.2)continue;mesh(Bx(.45,.35,.45),potM,xE+.38,.62,z);mesh(new THREE.SphereGeometry(.32,8,6),bushM,xE+.38,1.0,z)}
 {const al=M(0xc0c5ca,{metalness:.8,roughness:.3}),gl=new THREE.MeshStandardMaterial({color:0x2a3d4d,metalness:.6,roughness:.08,transparent:true,opacity:.82}),
   dw=2.0,dh=2.4,fx=xE+.03;
  mesh(Bx(.04,dh,dw),gl,fx,dh/2,dz,false);                                                               // บานกระจกคู่
  for(const o of[-dw/2,0,dw/2])mesh(Bx(.08,dh+.08,.07),al,fx+.01,dh/2,dz+o,false);mesh(Bx(.08,.1,dw+.07),al,fx+.01,dh+.04,dz,false);
  mesh(Bx(.04,.5,dw),gl,fx,dh+.38,dz,false);mesh(Bx(.08,.06,dw+.07),al,fx+.01,dh+.66,dz,false);           // ช่องแสงเหนือประตู
  for(const s2 of[-1,1])mesh(Bx(.05,.9,.04),al,fx+.07,1.1,dz+s2*.12,false);                               // มือจับยาว
  mesh(Bx(1.4,.12,2.8),M(0xb9bcbf,{roughness:.9}),xE+.7,.06,dz,false)}                                    // ชานหน้าประตู
 // ด้านตะวันตก (อีกฝั่ง): หน้าต่างบานเลื่อนคู่ 3 ชุด เฉพาะช่วงฝั่งอาคาร 1
 {const al=M(0xc9ced3,{metalness:.7,roughness:.35}),gl=new THREE.MeshStandardMaterial({color:0x2c4152,metalness:.55,roughness:.1}),
   ww=1.8,wh2=1.2,wy=1.95,fx=xW-.03;
  for(const z of[zS-2.5,zS-6.0,zS-9.5]){
   mesh(Bx(.06,wh2+.12,ww+.12),al,fx+.01,wy,z,false);                                                     // กรอบนอก
   mesh(Bx(.03,wh2-.04,ww/2+.04),gl,fx-.02,wy,z-ww/4+.02,false);mesh(Bx(.03,wh2-.04,ww/2+.04),gl,fx-.06,wy,z+ww/4-.02,false);  // บานเลื่อน 2 บาน (ซ้อนกันคนละราง)
   mesh(Bx(.05,wh2,.05),al,fx-.04,wy,z-.04,false);mesh(Bx(.05,wh2,.05),al,fx-.08,wy,z+.04,false);           // กรอบกลางบานเลื่อน
   mesh(Bx(.03,.14,.025),M(0x3a3f44),fx-.1,wy,z+.12,false);                                               // มือจับ
   mesh(Bx(.18,.05,ww+.2),al,fx-.06,wy-wh2/2-.08,z,false)}}                                               // ขอบธรณีหน้าต่าง
 // ด้านติดอาคาร 5 (หัวอาคาร -Z): ประตูบานคู่สีเทา + ธรณี, บอร์ดประกาศกระจก 3 ช่อง
 const dX=xW+6.2;
 mesh(Bx(1.7,2.3,.06),grey,dX,1.15+.12,zN-.03);mesh(Bx(.03,2.3,.07),M(0x6f7477),dX,1.27,zN-.04,false);
 mesh(Bx(.04,.25,.06),M(0x444a4e,{metalness:.6}),dX-.12,1.2,zN-.07,false);mesh(Bx(.04,.25,.06),M(0x444a4e,{metalness:.6}),dX+.12,1.2,zN-.07,false);
 mesh(Bx(2.2,.12,.6),M(0x3a3d42),dX,.06,zN-.3,false);
 {const t=cv(256,96,(g,w,h)=>{g.fillStyle='#8c9196';g.fillRect(0,0,w,h);for(let i=0;i<3;i++){g.fillStyle='#dfe6ea';g.fillRect(8+i*82,8,74,h-16);g.fillStyle='#ffffff';g.fillRect(16+i*82,16,26,34);g.fillRect(46+i*82,22,28,40)}});
  mesh(Bx(2.6,.95,.1),[grey,grey,grey,grey,grey,M(0xffffff,{map:t,roughness:.3})],dX-3.4,1.75,zN-.05,false)}
}
// ส่วนต่อเติมหลังอาคาร 1 (ฝั่งอาคาร 4): สูงเท่าชั้น 1 ของอาคาร 1, ยาวเท่าความกว้างอาคาร 4 (17 ม.), กว้าง 3 ม.
// + ทางเดินกว้าง 2 ม. ระหว่างส่วนต่อเติมกับอาคาร 4 มีหลังคาเชื่อมถึงกันที่ระดับขอบล่างชายคาอาคาร 4
{const b4=B[3],b1=B[4],Bx=(a,c,d)=>new THREE.BoxGeometry(a,c,d),x0=b4.cx-b4.ex/2,x1=b4.cx+b4.ex/2,ax=(x0+x1)/2,aw=x1-x0,
  zA1=b1.z0,zA0=zA1-3,zW0=b4.z0+b4.ez,Y=b4.eaveY,base=b1.base;
 const wh=M(0xf4f4f1,{roughness:.85}),bs=M(0xd9dad6,{roughness:.9}),gl=M(0x1d2a35,{roughness:.15,metalness:.5}),fr=M(0x2b3036,{metalness:.5,roughness:.4});
 // โถงทางเข้ากลางส่วนต่อเติม ตรงกับประตูกลางอาคาร 4: เปิดโล่งด้านทางเดิน, บันไดขึ้นระดับพื้นอาคาร 1, ประตูหลังอาคาร 1 อยู่ที่แนวผนังหลังตัวอาคาร
 const hx=b4.cx,hw=3.2,hL=hx-hw/2,hR=hx+hw/2,zc=(zA0+zA1)/2,dk=M(0xe4e5e1,{roughness:.9});
 for(const [a,c] of[[x0,hL],[hR,x1]]){const w=c-a,cx=(a+c)/2;
  mesh(Bx(w+(a===x0?.1:0)+(c===x1?.1:0),base,3.2),bs,cx+(a===x0?-.05:0)+(c===x1?.05:0),base/2,zc);         // ฐานยกพื้น (ต่อจากอาคาร 1)
  const an=mesh(Bx(w,Y-base,3),wh,cx,base+(Y-base)/2,zc);an.userData.id='b1';pick.push(an)}               // ตัวส่วนต่อเติม ซ้าย/ขวาของโถง
 mesh(Bx(hw,Y-3.5,3),wh,hx,3.5+(Y-3.5)/2,zc);                                                            // คานทับหลังเหนือโถง
 mesh(Bx(aw+.3,.3,3.3),M(0x8d9097),ax,Y,zc,false);                                                        // ขอบหลังคา
 // พื้นโถง + บันได 5 ขั้นจากทางเดินขึ้นระดับพื้นอาคาร 1
 const sr=.25,nS=5,rs=base/nS,zL=zA0+sr*nS;
 mesh(Bx(hw,base,zA1-zL),dk,hx,base/2,(zL+zA1)/2);
 for(let k=0;k<nS;k++){const h=rs*(k+1);mesh(Bx(hw,h,sr),dk,hx,h/2,zA0+sr*(k+.5))}
 mesh(Bx(hw,.02,zA1-zA0),M(0xf3f3f1),hx,3.49,zc,false);                                                    // ฝ้าโถง
 mesh(Bx(1.2,.06,.15),M(0xfffbe8,{emissive:0xfff3c8,emissiveIntensity:.4}),hx,3.45,zc,false);
 // ประตูหลังอาคาร 1 (กระจกบานคู่ กรอบอะลูมิเนียม) ที่แนวผนังหลังตัวอาคาร
 {const dw=1.8,dh=2.4,al=M(0xc0c5ca,{metalness:.8,roughness:.3});
  mesh(Bx(dw,dh,.06),gl,hx,base+dh/2,zA1-.03,false);mesh(Bx(.06,dh,.1),al,hx,base+dh/2,zA1-.06,false);
  for(const s of[-1,1]){mesh(Bx(.08,dh+.1,.12),al,hx+s*dw/2,base+dh/2,zA1-.06,false);mesh(Bx(.03,.5,.04),al,hx+s*.12,base+1.1,zA1-.1,false)}
  mesh(Bx(dw+.16,.08,.12),al,hx,base+dh+.04,zA1-.06,false);
  mesh(Bx(hw,3.5-base-dh-.08,.06),wh,hx,(base+dh+.08+3.5)/2,zA1-.03,false)}                                  // ผนังเหนือประตู
 // หน้าต่างด้านทางเดิน (ฝั่งอาคาร 4) เว้นช่องโถง และด้านถนน
 for(let x=x0+1.6;x<x1-1;x+=3.2){if(x+.85>hL-.3&&x-.85<hR+.3)continue;mesh(Bx(1.6,1.3,.06),gl,x,base+1.9,zA0-.03,false);mesh(Bx(1.7,.06,.1),fr,x,base+1.25,zA0-.05,false);mesh(Bx(1.7,.06,.1),fr,x,base+2.55,zA0-.05,false)}
 mesh(Bx(.06,1.3,1.6),gl,x1+.03,base+1.9,zc,false);
 // ประตูทางเข้ากลางอาคาร 4 ด้านที่ติดอาคาร 1 (ตรงกับโถง/ประตูหลังอาคาร 1)
 {const z4=zW0,dw=1.8,dh=2.3,gy=M(0x9ea3a6,{metalness:.3,roughness:.5}),fr2=M(0x6f7477,{metalness:.4,roughness:.5});
  mesh(Bx(dw,dh,.06),gy,hx,dh/2+.12,z4+.03,false);mesh(Bx(.04,dh,.08),fr2,hx,dh/2+.12,z4+.05,false);
  for(const s of[-1,1]){mesh(Bx(.08,dh+.1,.1),fr2,hx+s*dw/2,dh/2+.12,z4+.05,false);mesh(Bx(.4,.6,.07),gl,hx+s*.45,1.75,z4+.07,false);mesh(Bx(.04,.25,.06),M(0x444a4e,{metalness:.6}),hx+s*.12,1.2,z4+.09,false)}
  mesh(Bx(dw+.16,.08,.1),fr2,hx,dh+.16,z4+.05,false);mesh(Bx(2.4,.12,.8),M(0x3a3d42),hx,.06,z4+.4,false)}
 // ทางเดิน 2 ม. + หลังคาเชื่อม (ท็อปเสมอขอบล่างชายคาอาคาร 4 / หลังคาส่วนต่อเติม)
 const wz=(zW0+zA0)/2,wl=zA0-zW0;
 mesh(Bx(aw,.04,wl),M(0xb9bcbf,{roughness:1}),ax,.13,wz,false);
 const rz0=zW0+1.2,rl=zA0-rz0,rc=(rz0+zA0)/2;                                                          // หลังคาเริ่มที่ขอบนอกชายคาอาคาร 4 (ยื่น 1.2 ม.)
 const rf=mesh(Bx(aw+.6,.15,rl),M(0xe9eaec,{roughness:.6,metalness:.2}),ax,Y-.075,rc);rf.userData.id='b1';pick.push(rf);
 mesh(Bx(aw+.6,.02,rl),M(0xf6f6f4),ax,Y-.16,rc,false);                                                  // ฝ้าใต้หลังคา
 for(const x of[x0-.2,x1+.2])mesh(Bx(.06,.25,rl),M(0x2f8a99,{metalness:.3,roughness:.5}),x,Y-.12,rc,false);  // ขอบหลังคาสองด้าน
 // ขอบทางเดินทาสีแดง-ขาว
 for(let x=x0;x<x1;x+=.6)for(const z of[zW0+.06,zA0-.06])if(!(x+.6>hx-(z<zA0-1?1.2:hw/2)&&x<hx+(z<zA0-1?1.2:hw/2)))mesh(Bx(.6,.12,.12),M(((x-x0)/.6|0)%2?0xf1f1ef:0xc8262c,{roughness:.6}),x+.3,.19,z,false);
 // โคมไฟใต้หลังคาเชื่อม
 for(let x=x0+2;x<x1;x+=4)mesh(Bx(1.2,.06,.12),M(0xfffbe8,{emissive:0xfff3c8,emissiveIntensity:.4}),x,Y-.19,rc,false)}
// ข้างอาคาร 1 ฝั่งถนน: ทางเดินต่อจากทางเดินมีหลังคาออกไปถึงถนนโรงงาน, ทางเท้าเลียบถนน,
// สวนดอกไม้ข้างอาคาร 1 + ต้นไม้ 3 ต้นด้านหลังอาคาร 1 (ติดทางเดิน), ศาลาเรือนไทยหลังเล็ก 2×2 ม. หลังอาคาร 1 ฝั่งอาคาร 4 ข้างส่วนต่อเติม
{const b4=B[3],b1=B[4],Bx=(a,c,d)=>new THREE.BoxGeometry(a,c,d),Cy=(a,b,h,n=12)=>new THREE.CylinderGeometry(a,b,h,n);
 const zW0=b4.z0+b4.ez,zA0=b1.z0-3,xA=b4.cx+b4.ex/2,xR=b1.cx+b1.ex/2,xRd=rdX-rdW/2,zF=b1.z0+b1.ez;
 const conc=M(0xc4c6c9,{roughness:1}),curbW=M(0xf1f1ef,{roughness:.6}),curbR=M(0xc8262c,{roughness:.6});
 const curb=(xa,xb,z)=>{for(let x=xa;x<xb-.05;x+=.6)mesh(Bx(Math.min(.6,xb-x),.12,.12),((x-xa)/.6|0)%2?curbW:curbR,x+Math.min(.6,xb-x)/2,.19,z,false)};
 // ทางเดินต่อออกถนน (กว้างเท่าทางเดินเดิม 2 ม.)
 mesh(Bx(xRd-xA,.06,zA0-zW0),conc,(xA+xRd)/2,.14,(zW0+zA0)/2,false);
 curb(xA,xRd,zW0+.06);curb(xA,xA+.8,zA0-.06);curb(xA+2.0,xRd-1.6,zA0-.06);                    // เว้นขอบหน้าบันไดศาลา
 // ทางเท้าเลียบถนน กว้าง 1.5 ม. จากทางเดินถึงหน้าอาคาร 1
 const xP0=xRd-1.6,xP1=xRd-.1;mesh(Bx(xP1-xP0,.06,zF+1-zA0),conc,(xP0+xP1)/2,.14,(zA0+zF+1)/2,false);
 // พื้นสวน (หญ้า) ข้างส่วนต่อเติมและข้างอาคาร 1
 const gx0=xR+.7,gx1=xP0-.15,grs=M(0x6f9f4a,{roughness:1}),edge=M(0x8a6a4a,{roughness:1});
 mesh(Bx(gx1-xA-.2,.08,3-.2),grs,(xA+.2+gx1)/2,.15,zA0+1.5,false);                                       // ข้างส่วนต่อเติม
 mesh(Bx(gx1-gx0,.08,zF-b1.z0),grs,(gx0+gx1)/2,.15,(b1.z0+zF)/2,false);                                 // ข้างอาคาร 1
 // แปลงดอกไม้ขอบไม้ + ดอกไม้หลายสี
 const fC=[0xe0447a,0xf2c21b,0xd8342c,0x9b4fd0,0xf28a1a,0xffffff],lfM=M(0x4f8a3a,{roughness:1});
 const bed=(cx,cz,w,d,seed)=>{mesh(Bx(w,.22,d),M(0x5b4636,{roughness:1}),cx,.2,cz,false);
  for(const [x,z,ww,dd] of[[cx,cz-d/2,w,.08],[cx,cz+d/2,w,.08],[cx-w/2,cz,.08,d],[cx+w/2,cz,.08,d]])mesh(Bx(ww,.26,dd),edge,x,.22,z,false);
  let k=seed;for(let x=cx-w/2+.25;x<cx+w/2-.15;x+=.42)for(let z=cz-d/2+.25;z<cz+d/2-.15;z+=.42){k=(k*37+11)%97;
   mesh(new THREE.SphereGeometry(.2,6,5),lfM,x,.42,z,false);mesh(new THREE.SphereGeometry(.09,6,4),M(fC[k%6],{roughness:.8}),x+.05,.6,z-.04,false)}};
 bed((xA+4.2+gx1)/2,zA0+1.5,gx1-xA-4.6,1.4,3);                                                      // ถัดจากศาลา
 bed((gx0+gx1)/2,b1.z0+1.6,gx1-gx0-.6,1.6,7);
 bed(gx0+.6,b1.z0+6.5,.9,5.2,13);                                                                     // แนวดอกไม้ชิดผนังอาคาร 1
 bed((gx0+1.4+gx1)/2,b1.z0+4.6,gx1-gx0-2.2,1.6,19);bed((gx0+1.4+gx1)/2,b1.z0+7.4,gx1-gx0-2.2,1.6,29);   // แปลงดอกไม้ด้านหน้า
 // แนวต้นไม้ประดับข้างอาคาร 1 หลังน้ำพุ: ลีลาวดี 3 ต้น (ดอกขาว/ชมพู) สลับพุ่มไม้ตัดทรงกลม + ขอบพุ่มเตี้ย
 {const trk=M(0x8a7a66,{roughness:1}),lfP=M(0x3f7f35,{roughness:.9}),bx=M(0x3e7a33,{roughness:1}),fw=[M(0xfbf6e8,{roughness:.6}),M(0xf2a3c0,{roughness:.6})];
  const plumeria=(x,z,sc,fc)=>{mesh(Cy(.12*sc,.18*sc,1.3*sc,8),trk,x,.2+.65*sc,z);
   for(let k=0;k<5;k++){const a=k/5*Math.PI*2+sc,dx=Math.cos(a),dz=Math.sin(a),L=1.1*sc,br=mesh(Cy(.05*sc,.08*sc,L,6),trk,x+dx*L*.3,.2+1.3*sc+L*.38,z+dz*L*.3);
    br.rotation.set(dz*.7,0,-dx*.7);const tx=x+dx*L*.6,tz=z+dz*L*.6,ty=.2+1.3*sc+L*.78;
    mesh(new THREE.SphereGeometry(.45*sc,8,6),lfP,tx,ty,tz).scale.y=.6;
    for(let f=0;f<5;f++){const b=f/5*Math.PI*2;mesh(new THREE.SphereGeometry(.08*sc,6,4),fw[fc],tx+Math.cos(b)*.25*sc,ty+.18*sc,tz+Math.sin(b)*.25*sc,false)}}};
  const zT=zF-1.1;plumeria(gx0+1.9,zT,1.15,1);plumeria(SHRINE_X,zT,1.3,0);plumeria(gx1-1.2,zT,1.1,1);
  for(const x of[(gx0+1.9+SHRINE_X)/2,(SHRINE_X+gx1-1.2)/2])mesh(new THREE.SphereGeometry(.55,10,8),bx,x,.7,zT);
  mesh(Bx(gx1-gx0-1.2,.5,.45),bx,(gx0+.8+gx1)/2,.4,zF-.3)}                                                                 // พุ่มเตี้ยขอบสวนด้านน้ำพุ
 // ต้นไม้ 3 ต้นด้านหลังอาคาร 1 (ริมทางเดิน)
 for(const [x,z] of[[xA+5.0,zA0+.9],[(xA+4.2+gx1)/2+.8,zA0+.9],[gx1-1.2,zA0+.9]]){mesh(Cy(.16,.26,3.2,8),M(0x6b4a2e),x,1.75,z);
  const c=mesh(new THREE.SphereGeometry(1.7,12,10),M(0x4a8a40),x,4.4,z);c.scale.y=1.05}
 // ศาลาเรือนไทยหลังเล็ก 2×2 ม. ชิดส่วนต่อเติม (ไม้สัก หลังคาจั่วซ้อน 2 ชั้น กระเบื้องส้ม ปั้นลมเขียว ช่อฟ้า/หางหงส์สีทอง) ม้านั่ง 2 ข้าง บันไดลงทางเดิน
 const sw=2,sl=2,sx=xA+.4+sw/2,sz=zA0+1.5,pH=.4,cH=2.1;
 const wd=M(0x8a5a32,{roughness:.75}),wdD=M(0x6a4122,{roughness:.8}),tile=M(0xc5532c,{roughness:.6}),grn=M(0x2f6b3a,{roughness:.6}),gold=M(0xd9a628,{metalness:.7,roughness:.35}),cem=M(0xd8d2c4,{roughness:.9});
 mesh(Bx(sw+.4,pH,sl+.4),cem,sx,pH/2,sz);mesh(Bx(sw+.2,.06,sl+.2),wd,sx,pH+.03,sz);                       // ฐานปูน + พื้นไม้
 for(let k=0;k<2;k++)mesh(Bx(.9,pH*(2-k)/2,.25),cem,sx,pH*(2-k)/4,sz-sl/2-.2-.125-k*.25);                 // บันไดลงทางเดิน
 for(const a of[-1,1])for(const b of[-1,1]){const x=sx+a*(sw/2-.08),z=sz+b*(sl/2-.08);mesh(Cy(.07,.08,cH,10),wd,x,pH+cH/2,z);mesh(Bx(.2,.1,.2),wdD,x,pH+.05,z)}
 for(const a of[-1,1])mesh(Bx(.12,.18,sl),wdD,sx+a*(sw/2-.08),pH+cH,sz);for(const b of[-1,1])mesh(Bx(sw,.18,.12),wdD,sx,pH+cH,sz+b*(sl/2-.08));
 for(const a of[-1,1]){mesh(Bx(.35,.05,sl-.35),wd,sx+a*(sw/2-.3),pH+.42,sz);for(const z of[-.6,.6])mesh(Bx(.3,.4,.06),wdD,sx+a*(sw/2-.3),pH+.2,sz+z);
  mesh(Bx(.05,.06,sl-.2),wd,sx+a*(sw/2-.06),pH+.8,sz);for(let z=-sl/2+.3;z<sl/2-.2;z+=.3)mesh(Bx(.03,.34,.03),wdD,sx+a*(sw/2-.06),pH+.6,sz+z,false)}
 // หลังคาจั่วซ้อน 2 ชั้น (สันตามแกน z)
 const gable=(w,h,len,y,m)=>{const sh=new THREE.Shape();sh.moveTo(-w/2,0);sh.lineTo(0,h);sh.lineTo(w/2,0);sh.lineTo(-w/2,0);
  return mesh(new THREE.ExtrudeGeometry(sh,{depth:len,bevelEnabled:false}).translate(0,y,-len/2),m,sx,0,sz)};
 const yR=pH+cH+.09,w2=sw+.3,h2=1.25,y2=yR+.3,l2=sl+.4;
 gable(sw+1.0,.45,sl+.8,yR,tile);gable(w2,h2,l2,y2,tile);
 const ang=Math.atan2(h2,w2/2),L=Math.hypot(h2,w2/2);
 for(const zz of[-1,1]){const z=sz+zz*l2/2;
  for(const a of[-1,1]){const pl=mesh(Bx(L+.15,.1,.07),grn,sx+a*w2/4,y2+h2/2,z+zz*.02,false);pl.rotation.z=-a*ang}   // ปั้นลม
  {const sh=new THREE.Shape();sh.moveTo(-(w2-.15)/2,0);sh.lineTo(0,h2-.1);sh.lineTo((w2-.15)/2,0);sh.lineTo(-(w2-.15)/2,0);
   mesh(new THREE.ShapeGeometry(sh),M(0x7a4a26,{roughness:.8,side:THREE.DoubleSide}),sx,y2+.03,z-zz*.02,false)}         // หน้าบัน
  const cf=mesh(Cy(.015,.06,.5,6),gold,sx,y2+h2+.2,z+zz*.1);cf.rotation.x=zz*.55;                                         // ช่อฟ้า
  for(const a of[-1,1]){const hh=mesh(Cy(.015,.05,.3,6),gold,sx+a*w2/2,y2+.08,z+zz*.05);hh.rotation.z=-a*.7}}            // หางหงส์
 mesh(Bx(.1,.1,l2+.1),grn,sx,y2+h2+.02,sz,false);                                                                        // สันหลังคา
 label({name:'ศาลาเรือนไทย',w:sw,l:sl,h:+(y2+h2).toFixed(1),cz:sz,lx:sx})}
// เครื่องกำเนิดไฟฟ้าสำรองของอาคาร 5 (ตามรูปจริง): ติดผนังด้านหลัง (ตะวันตก) ฝั่งขวา (ทางอาคาร 4) ด้านยาวแนบผนังอาคาร
// ตู้ครอบเก็บเสียงสีครีม แบ่ง 2 ตอนด้วยแถบดำ, ประตูมีบานตะแกรงระบาย + มือจับดำ, ปลายด้านถนนมีตะแกรงใหญ่ + ปุ่มหยุดฉุกเฉิน,
// ฐานแชสซีเหล็กดำมีหูยก, ไฟสัญญาณแดง-เขียวบนหลังตู้, ตั้งบนแท่นคอนกรีต
{const b=B[2],xW=b.cx-b.ex/2,z1=b.z0+b.ez,Bx=(a,c,d)=>new THREE.BoxGeometry(a,c,d);
 const GL=4.2,GW=1.5,GH=1.85,pad=.22,sk=.28,gx=xW-.35-GW/2,gz=z1-.8-GL/2,y0=pad+sk;
 const cr=M(0xe9e3d3,{roughness:.6,metalness:.15}),crD=M(0xddd6c4,{roughness:.6,metalness:.15}),bk=M(0x1e2124,{roughness:.6,metalness:.3});
 const grT=cv(64,64,(g,w,h)=>{g.fillStyle='#d9d2bf';g.fillRect(0,0,w,h);g.fillStyle='#4a4740';for(let y=4;y<h;y+=10)for(let x=4;x<w;x+=10)g.fillRect(x,y,7,6)}),
  gr=(rw,rh)=>{const t=grT.clone();t.needsUpdate=true;t.repeat.set(rw/.12,rh/.12);return M(0xffffff,{map:t,roughness:.7})};
 mesh(Bx(GW+1.2,pad,GL+1.0),M(0xc4c6c8,{roughness:.95}),gx-.2,pad/2,gz);                                       // แท่นคอนกรีต
 mesh(Bx(GW+.1,sk,GL+.1),bk,gx,pad+sk/2,gz);                                                                    // แชสซีดำ
 for(const dz of[-1,1])for(const dx of[-1,1]){const l=mesh(Bx(.12,.32,.32),bk,gx+dx*(GW/2+.08),pad+.2,gz+dz*(GL/2-.35));}   // หูยก
 const body=mesh(Bx(GW,GH,GL),[cr,cr,crD,cr,cr,cr],gx,y0+GH/2,gz);
 mesh(Bx(GW+.02,.06,GL+.02),crD,gx,y0+GH-.05,gz,false);                                                       // ขอบบน
 const zs=gz-GL/2+1.35;mesh(Bx(GW+.03,GH,.16),bk,gx,y0+GH/2,zs,false);mesh(Bx(.16,.04,.16),bk,gx,y0+GH+.02,zs,false);   // แถบดำแบ่งตอน
 // ด้านทางเดิน (ฝั่งนอก -X): ประตู + ตะแกรง + มือจับ
 const xo=gx-GW/2-.01,doors=[[gz-GL/2+.35,.6],[gz-GL/2+.95,.6],[zs+.45,.65],[zs+1.15,.75],[gz+GL/2-.75,1.0]];
 for(const [z,w] of doors){mesh(Bx(.01,GH-.25,.02),crD,xo,y0+GH/2,z-w/2,false)}
 for(const [z,h,y] of[[gz-GL/2+.65,.35,y0+1.25],[gz-GL/2+.65,.35,y0+.45],[zs+.45,.35,y0+1.25],[zs+.45,.3,y0+.35],[zs+1.15,.35,y0+1.45],[zs+1.15,.35,y0+.85],[zs+1.15,.35,y0+.3]])
  mesh(Bx(.015,h,.4),gr(.4,h),xo-.005,y,z,false);
 for(const z of[gz-GL/2+.95,zs+.8,zs+.8])mesh(Bx(.04,.18,.07),bk,xo-.02,y0+1.25,z,false);
 for(const [z,y] of[[zs+.6,y0+1.0],[zs+.6,y0+1.55],[zs+.6,y0+.4],[gz-GL/2+.95,y0+.7]])mesh(Bx(.03,.14,.06),bk,xo-.02,y,z,false);
 mesh(Bx(.012,.25,.32),M(0xf2f2f0),xo-.01,y0+.95,zs+.3,false);                                                 // ป้ายคำเตือน
 // ปลายด้านทิศอาคาร 4 (+Z): แผงตะแกรงใหญ่ + ปุ่มหยุดฉุกเฉิน + QR
 const ze=gz+GL/2+.01;mesh(Bx(GW-.2,GH-.5,.01),crD,gx,y0+GH/2-.1,ze,false);
 mesh(Bx(GW-.6,.32,.015),gr(GW-.6,.32),gx-.05,y0+GH-.55,ze+.005,false);
 {const eb=mesh(Bx(.18,.18,.05),bk,gx+GW/2-.12,y0+GH-.6,ze+.01,false);mesh(new THREE.CylinderGeometry(.045,.045,.03,14).rotateX(Math.PI/2),M(0xc81e1e),gx+GW/2-.12,y0+GH-.6,ze+.05,false)}
 mesh(Bx(.13,.15,.01),M(0xf5f5f5),gx-GW/2+.2,y0+GH-.55,ze+.01,false);
 // ไฟสัญญาณแดง-เขียวบนหลังตู้
 {const tx=gx+GW/2-.25,tz=gz+GL/2-.3,ty=y0+GH;mesh(new THREE.CylinderGeometry(.05,.05,.18,12),M(0xd8dadc),tx,ty+.09,tz);
  mesh(new THREE.CylinderGeometry(.055,.055,.09,12),M(0x1fae4b,{emissive:0x1fae4b,emissiveIntensity:.5}),tx,ty+.23,tz);
  mesh(new THREE.CylinderGeometry(.055,.055,.09,12),M(0xd8262c,{emissive:0xd8262c,emissiveIntensity:.3}),tx,ty+.32,tz);
  mesh(new THREE.CylinderGeometry(.05,.05,.02,12),M(0x9ea3a6),tx,ty+.375,tz)}
 label({name:'เครื่องกำเนิดไฟฟ้าสำรอง',w:GW,l:GL,h:+(y0+GH).toFixed(1),cz:gz,lx:gx});zone('o_gen',gx,(y0+GH)/2,gz,GW+.3,y0+GH+.4,GL+.3)}
// ===== โคมไฟรอบอาคาร (ติดผนัง/ใต้หลังคา) สว่างเมื่อเวลามืด =====
const glT=cv(128,128,(g,w,h)=>{const r=g.createRadialGradient(64,64,0,64,64,64);r.addColorStop(0,'rgba(255,236,170,1)');r.addColorStop(.35,'rgba(255,214,120,.45)');r.addColorStop(1,'rgba(255,200,100,0)');g.fillStyle=r;g.fillRect(0,0,w,h)});
glT.wrapS=glT.wrapT=THREE.ClampToEdgeWrapping;
const glowM=new THREE.SpriteMaterial({map:glT,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,opacity:0}),
 poolM=new THREE.MeshBasicMaterial({map:glT,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,opacity:0,polygonOffset:true,polygonOffsetFactor:-2}),
 // ไฟรอบอาคาร: หลอด LED T8 ยาว 1.2 ม. แสงขาว (ไฟถนนยังใช้ lampM/glowM/poolM สีโทนอุ่นเหมือนเดิม)
 glWT=cv(128,128,(g,w,h)=>{const r=g.createRadialGradient(64,64,0,64,64,64);r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.35,'rgba(235,244,255,.45)');r.addColorStop(1,'rgba(225,238,255,0)');g.fillStyle=r;g.fillRect(0,0,w,h)}),
 tubeM=new THREE.MeshStandardMaterial({color:0xf4f8ff,emissive:0xf2f7ff,emissiveIntensity:.1,roughness:.3}),
 glowW=new THREE.SpriteMaterial({map:glWT,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,opacity:0}),
 poolW=new THREE.MeshBasicMaterial({map:glWT,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,opacity:0,polygonOffset:true,polygonOffsetFactor:-2}),
 batG=new THREE.BoxGeometry(1.26,.04,.07),tubeG=new THREE.CylinderGeometry(.0135,.0135,1.2,10).rotateZ(Math.PI/2),capG=new THREE.CylinderGeometry(.02,.02,.04,10).rotateZ(Math.PI/2),batM=M(0xe9ebee,{roughness:.5,metalness:.2}),
 fixM=M(0x4a4f57,{metalness:.5,roughness:.5}),lensG=new THREE.BoxGeometry(.3,.03,.22),fixG=new THREE.BoxGeometry(.38,.14,.28),poolG=new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2);
const lamp=(x,y,z,nx,nz,pr)=>{const ox=x+nx*.2,oz=z+nz*.2,ry=nx?Math.PI/2:0;
 const f=new THREE.Mesh(batG,batM);f.position.set(ox,y,oz);f.rotation.y=ry;scene.add(f);                // รางหลอด (ขนานผนัง)
 const l=new THREE.Mesh(tubeG,tubeM);l.position.set(ox,y-.045,oz);l.rotation.y=ry;scene.add(l);            // หลอด LED T8
 for(const e of[-.61,.61]){const c=new THREE.Mesh(capG,batM);c.position.set(ox+(ry?0:e),y-.045,oz+(ry?e:0));c.rotation.y=ry;scene.add(c)}  // ขั้วหลอด
 const sp=new THREE.Sprite(glowW);sp.position.set(ox+nx*.25,y-.12,oz+nz*.25);sp.scale.set(2.6,1.3,1);scene.add(sp);
 const pl=new THREE.Mesh(poolG,poolW);pl.position.set(x+nx*pr*.5,.2,z+nz*pr*.5);pl.scale.set(pr*2,1,pr*2);scene.add(pl)};
{const E=b=>b.cx+b.ex/2,Wd=b=>b.cx-b.ex/2,w0=B[0],f0=B[1],b5=B[2],b4=B[3],b1=B[4];
 // โกดัง
 [8,21,34,47].forEach(z=>{lamp(Wd(w0),6.5,z,-1,0,5);lamp(E(w0),6.5,z,1,0,5)});
 [-7,7].forEach(o=>{lamp(w0.cx+o,6.5,0,0,-1,5);lamp(w0.cx+o*.85,5.5,gz0,0,1,5)});
 [-4.5,4.5].forEach(o=>lamp(w0.cx+o,7.6,gz0+6,0,0,5));
 // โรงงาน
 for(let k=0;k<6;k++)lamp(Wd(f0),6,f0.z0+10+k*20,-1,0,5);
 for(let z=f0.z0+6;z<f0.z0+f0.ez;z+=12)lamp(16.1,3.6,z,1,0,4);
 [-5,5].forEach(o=>{lamp(f0.cx+o,7,f0.z0,0,-1,5);lamp(f0.cx+o*1.6,6.2,f0.z0+f0.ez+.05,0,1,5)});
 // อาคาร 5
 [200,206].forEach(z=>{lamp(Wd(b5),4,z,-1,0,5)});[201,207,213].forEach(z=>lamp(E(b5)+2.2,3.75,z,0,0,4));
 [-5,5].forEach(o=>{lamp(b5.cx+o,4,b5.z0,0,-1,4);lamp(b5.cx+o,4,b5.z0+b5.ez,0,1,5)});
 // อาคาร 4 (ฝั่งตะวันออกส่องลานจอดรถ) — โคมติดผนังใต้ชายคา
 [9,22,35,48].forEach(o=>{lamp(Wd(b4),3.6,b4.z0+o,-1,0,5);lamp(E(b4),3.6,b4.z0+o,1,0,6)});
 [-4,4].forEach(o=>lamp(b4.cx+o,3.6,b4.z0+b4.ez,0,1,5));lamp(b4.cx+5,3.6,b4.z0,0,-1,4);
 // อาคาร 1
 [-7,0,7].forEach(o=>lamp(b1.cx+o,3.5,b1.z0+b1.ez,0,1,5));lamp(Wd(b1),3.5,b1.z0+5,-1,0,5);lamp(E(b1),3.5,b1.z0+5,1,0,5);
 // โรงจอดมอเตอร์ไซค์ 3 หลัง
 const mlx=mxs+1.325;[mzf-15,mzf-9,mzf-3,mzf-33.5,mzf-27.5,mzf-21.5].forEach(z=>lamp(mlx,2.5,z,0,0,4));
 [-2,-1,0,1,2].forEach(k=>lamp(mlx,2.5,fc.z0+15+k*6,0,0,4));
 // โรงจอดรถหน้าอาคาร 1 และป้อม รปภ.
 [-8,-2.7,2.7,8].forEach(o=>lamp(b1.cx+o,2.95,b1.z0+b1.ez+11.5,0,0,4.5));lamp(28.05+RXS,2.72,TOTAL+10,-1,0,5);   // โคมป้อม รปภ.: ติดใต้ชายคาหลังคาเหนือหน้าต่าง (ผนังหน้าต่างอยู่ที่ x = 28.1+RXS)
 // แสงจากโคมไฟถนน
 for(const z of LAMPZ){const sp=new THREE.Sprite(glowM);sp.position.set(24.5+RXS,8.8,z);sp.scale.set(4,4,1);scene.add(sp);const pl=new THREE.Mesh(poolG,poolM);pl.position.set(24.5+RXS,.2,z);pl.scale.set(16,1,16);scene.add(pl)}}
// โรงอาหาร ผังตามแบบร่าง (ผัง L): แถวห้องด้านหลัง (ซักรีด/เก็บของ/ห้องน้ำ+เคาน์เตอร์) เต็มความกว้าง 15 ม. + ขาโซนนั่งกินข้าวฝั่งตะวันออกลงมาด้านหน้า, สระน้ำฝั่งตะวันตก; พื้นยก 1 ม. สูง 12 ม.
{const rx1=23.5+4.4,zS=-16,zN=-40,xL=rx1-15,bx0=xL+6.2,zB=-31.65,pc=M(0xbdbfc4,{roughness:1}),rm=M(0xb4b6ba,{roughness:.9});
  const _n0=scene.children.length,SX=(rdX+rdW/2)-rx1;const dx=rx1-4.4,Bx=(a,b,c)=>new THREE.BoxGeometry(a,b,c),Std=o=>new THREE.MeshStandardMaterial(o);
  const wT=M(0xf3f3f0,{roughness:.85}),dkM=M(0x2f4656,{roughness:.7,metalness:.25}),stM=M(0xd7dbe0,{metalness:.7,roughness:.3}),cc=M(0xe6e4de,{roughness:.9});
  const slatT=cv(64,64,(g,w,h)=>{g.fillStyle='#3a6073';g.fillRect(0,0,w,h);for(let j=0;j<h;j+=8){g.fillStyle='#1f3947';g.fillRect(0,j+5,w,3);g.fillStyle='#4b7589';g.fillRect(0,j,w,1)}});
  const slatM=(rx,ry)=>{const t=slatT.clone();t.needsUpdate=true;t.repeat.set(rx,ry);return Std({map:t,roughness:.55,metalness:.3})};
  const tileT=cv(64,64,(g,w,h)=>{g.fillStyle='#c98a63';g.fillRect(0,0,w,h);g.strokeStyle='#9e6444';g.lineWidth=2;g.strokeRect(1,1,w/2-1,h/2-1);g.strokeRect(w/2,1,w/2-1,h/2-1);g.strokeRect(1,h/2,w/2-1,h/2-1);g.strokeRect(w/2,h/2,w/2-1,h/2-1)});
  const tileM=(rx,ry)=>{const t=tileT.clone();t.needsUpdate=true;t.repeat.set(rx,ry);return Std({map:t,roughness:.6})};
  const stripeT=cv(64,16,(g,w,h)=>{for(let i=0;i<8;i++){g.fillStyle=i%2?'#f4f6f8':'#2a7fb5';g.fillRect(i*8,0,8,h)}});
  const stripeM=rep=>{const t=stripeT.clone();t.needsUpdate=true;t.repeat.set(rep,1);return Std({map:t,roughness:.6})};
  const signM=txt=>M(0xffffff,{map:cv(256,64,(g,w,h)=>{g.fillStyle='#1f5f8b';g.fillRect(0,0,w,h);g.fillStyle='#fff';g.font='bold 38px sans-serif';g.textAlign='center';g.fillText(txt,w/2,45)})});
  const edge=(x1,z1,x2,z2,solid)=>{const len=Math.hypot(x2-x1,z2-z1),cx=(x1+x2)/2,cz=(z1+z2)/2,alongX=Math.abs(x2-x1)>Math.abs(z2-z1);
   if(solid){mesh(alongX?Bx(len,4,.3):Bx(.3,4,len),wT,cx,3,cz);return}
   const n=Math.max(1,Math.ceil(len/4.2));
   for(let i=0;i<=n;i++){const t=i/n;mesh(new THREE.CylinderGeometry(.22,.22,4,14),wT,x1+(x2-x1)*t,3,z1+(z2-z1)*t)}
   for(const hy of[1.5,2.0])rail(V(x1,hy,z1),V(x2,hy,z2));
   for(let i=0;i<=n*3;i++){const t=i/(n*3);mesh(new THREE.CylinderGeometry(.025,.025,1,6),stM,x1+(x2-x1)*t,1.5,z1+(z2-z1)*t,false)}};
  const blk=(x0,x1,z0,z1)=>{const X=x1-x0,Z=z1-z0,cx=(x0+x1)/2,cz=(z0+z1)/2,sl=()=>slatM(Math.max(1,X/6),8);
   mesh(Bx(X+.6,1,Z+.6),pc,cx,.5,cz);
   mesh(Bx(X+.4,.04,Z+.4),M(0xdfe3e6,{roughness:.35}),cx,1.02,cz,false);
   mesh(Bx(X,4.5,Z),[sl(),sl(),dkM,dkM,sl(),sl()],cx,7.25,cz);
   mesh(Bx(X+1.8,.3,Z+1.8),M(0x3d5568,{roughness:.6,metalness:.4}),cx,9.65,cz)};
  blk(xL,rx1,zN,zB);blk(bx0,rx1,zB,zS);
  // ผนังรอบนอก: ด้านหน้า(ฝั่งโกดัง)โล่ง ด้านหลังทึบ
  const gx0=dx-1.7,gx1=dx+1.7;
  edge(bx0,zS,dx-3.8,zS,false);edge(dx-.8,zS,dx+.8,zS,false);edge(dx+3.8,zS,rx1,zS,false);
  edge(bx0,zB+1.6,bx0,zS,false);                                                                         // ฝั่งซ้ายโซนนั่งกิน (เว้นช่องเชื่อมระเบียงหน้าห้องซักรีด)
  // ผนังขวา (มองจากหน้าโรงงาน): เปิดโล่งตั้งแต่ด้านหน้าถึงแนวหน้าห้องน้ำ (zB) เหมือนฝั่งซ้าย, หลังจากนั้นทึบ; หน้าห้องซักรีด (แนว zB ฝั่งซ้าย) เปิดโล่ง
  // ผนังทิศเหนือ (ฝั่ง xL, ทิศเหนือจริง = -X) เปลี่ยนเป็นผนังกระจก + ระเบียงทางเดินพร้อมราวจับ + บันไดปูนลงทางทิศเหนือ
  edge(xL,zN,rx1,zN,true);edge(rx1,zN,rx1,zB,true);edge(rx1,zB,rx1,zS,false);
  for(let i=0;i<=2;i++)mesh(new THREE.CylinderGeometry(.22,.22,4,14),wT,xL+(bx0-xL)*i/2,3,zB);                         // หน้าห้องซักรีด: เปิดโล่ง (เสาอย่างเดียว) เดินต่อออกระเบียงได้
  {const L=zB-zN,cz=(zN+zB)/2,al=M(0xc9ced4,{metalness:.7,roughness:.3}),gl=Std({color:0xbfe3ee,transparent:true,opacity:.35,metalness:.5,roughness:.05}),n=Math.round(L/1.4);
   mesh(Bx(.05,3.3,L-.3),gl,xL,2.75,cz,false);for(let i=0;i<=n;i++)mesh(Bx(.1,3.4,.08),al,xL,2.75,zN+.15+(L-.3)*i/n,false);   // ผนังกระจก + เสาอะลูมิเนียม
   for(const y of[1.1,4.45])mesh(Bx(.1,.06,L-.3),al,xL,y,cz,false);mesh(Bx(.3,.55,L),wT,xL,4.73,cz);for(const z of[zN+.15,zB-.15])mesh(Bx(.3,4,.3),wT,xL,3,z);   // คานบน + เสามุม
   const bz0=zN,bz1=zB,bw=1.5,bxo=xL-.3-bw,sw=2.4,sz=zB-1.4,fz=zB+1.5;                                      // ระเบียงเต็มแนว + ต่อเลี้ยวมุมมาด้านหน้าห้องซักรีด (ถึงโซนนั่งกิน), บันไดปลายฝั่งด้านหน้า
   mesh(Bx(bw,1,fz-bz0),pc,bxo+bw/2,.5,(bz0+fz)/2);mesh(Bx(bw-.05,.04,fz-bz0-.05),M(0xdfe3e6,{roughness:.35}),bxo+bw/2,1.02,(bz0+fz)/2,false);
   mesh(Bx(bx0-xL,1,fz-zB),pc,(xL+bx0)/2,.5,(zB+fz)/2);mesh(Bx(bx0-xL,.04,fz-zB-.05),M(0xdfe3e6,{roughness:.35}),(xL+bx0)/2,1.02,(zB+fz)/2,false);   // ระเบียงหน้าห้องซักรีด
   const rl=(x1,z1,x2,z2)=>{const l=Math.hypot(x2-x1,z2-z1);if(l<.05)return;for(const hy of[1.5,2.0])rail(V(x1,hy,z1),V(x2,hy,z2));const k=Math.max(1,Math.round(l/.5));for(let i=0;i<=k;i++)mesh(new THREE.CylinderGeometry(.025,.025,1,6),stM,x1+(x2-x1)*i/k,1.5,z1+(z2-z1)*i/k,false)};
   const xr=bxo+.05;rl(xr,bz0+.05,xr,sz-sw/2);rl(xr,sz+sw/2,xr,fz-.05);rl(xr,fz-.05,bx0-.3,fz-.05);rl(xr,bz0+.05,xL-.3,bz0+.05);   // ราวจับรอบระเบียง (เว้นช่องบันได)
   for(let k=1;k<=4;k++)mesh(Bx(.35,.25*k,sw),M(0xd9dad6,{roughness:.9}),bxo-.175-(4-k)*.35,.125*k,sz);                         // บันไดปูน 4 ขั้น ลงทางทิศเหนือ
   for(const s2 of[-1,1]){const z=sz+s2*(sw/2+.05);rail(V(bxo,2.0,z),V(bxo-1.45,1.0,z));for(const [px,py] of[[0,1.5],[-1.45,.5]])mesh(new THREE.CylinderGeometry(.03,.03,1,6),stM,bxo+px,py,z,false)}}
  // ห้อง: ซักรีด / เก็บของ / ห้องน้ำ + เคาน์เตอร์
  const room=(x0,x1,z0,z1,txt)=>{const cx=(x0+x1)/2;mesh(Bx(x1-x0,4,z1-z0),wT,cx,3,(z0+z1)/2);
   mesh(Bx(1,2.1,.08),M(0x6b4a2e),cx,2.05,z1+.04);mesh(Bx(Math.min(2.6,x1-x0-.3),.5,.06),signM(txt),cx,4.2,z1+.04,false)};
  const glassRoom=(x0,x1,z0,z1,txt,noW=false)=>{const w=x1-x0,d=z1-z0,cx=(x0+x1)/2,cz=(z0+z1)/2,al=M(0xc9ced4,{metalness:.7,roughness:.3}),gl=Std({color:0xbfe3ee,transparent:true,opacity:.35,metalness:.5,roughness:.05});
   if(!noW)mesh(Bx(.2,4,d),wT,x0+.1,3,cz);mesh(Bx(.2,4,d),wT,x1-.1,3,cz);mesh(Bx(w,4,.2),wT,cx,3,z0+.1);mesh(Bx(w,.2,d),wT,cx,4.9,cz);
   mesh(Bx(w-.4,3.3,.05),gl,cx,2.75,z1,false);
   for(let i=0;i<=6;i++)mesh(Bx(.06,3.4,.08),al,x0+.2+(w-.4)*i/6,2.75,z1+.02,false);
   for(const y of[1.1,4.45])mesh(Bx(w-.4,.06,.08),al,cx,y,z1+.02,false);
   const aw2=mesh(Bx(w,.06,1.1),M(0x24304a,{roughness:.8}),cx,4.45,z1+.55);aw2.rotation.x=.25;mesh(Bx(w,.2,.05),M(0x24304a),cx,4.0,z1+1.05,false);
   mesh(Bx(2.6,.4,.05),signM(txt),cx,4.72,z1+.05,false);
   for(let i=0;i<3;i++){mesh(Bx(.8,1,.8),M(0xf4f4f4,{roughness:.4}),x0+1.2+i*1.5,1.55,z0+1);mesh(new THREE.CylinderGeometry(.28,.28,.05,16).rotateX(Math.PI/2),M(0x3b4a5a),x0+1.2+i*1.5,1.55,z0+1.42,false)}
   mesh(Bx(.06,1.3,2.2),M(0x2a2f78),x1+.03,2.8,cz,false);
   [[-.7,.5,0xffffff],[0,.4,0xf2d66b],[.7,.5,0x7fc8e8]].forEach(([oz,hh,c])=>mesh(Bx(.02,hh,.5),M(c),x1+.07,2.8,cz+oz,false))};
  glassRoom(xL+.2,bx0-.2,zN+.2,-32.7,'ห้องซักรีด',true);room(xL+7.85,xL+11.2,zN+.2,-34.4,'ห้องเก็บของ');room(xL+12.5,xL+14.85,zN+.2,zB-.1,'ห้องน้ำ');
  mesh(Bx(3.4,1.1,.7),M(0x8a5a3a),xL+9.5,1.55,-32.95);mesh(Bx(3.5,.08,.85),cc,xL+9.5,2.14,-32.95);
  // โต๊ะยาว 6 ตัว (เก้าอี้ข้างละ 3) 2 แถว × 3
  const tb=(tx,tz)=>{mesh(Bx(.8,.06,2.0),M(0xc9a47a,{roughness:.7}),tx,1.78,tz);for(const s of[-1,1])mesh(Bx(.7,.72,.08),M(0x8d9097),tx,1.4,tz+s*.85,false);
   const cm=M(0x2a7fb5,{roughness:.6});for(const sx of[-1,1])for(const sz of[-.65,0,.65]){mesh(Bx(.4,.05,.4),cm,tx+sx*.68,1.47,tz+sz,false);mesh(Bx(.05,.4,.4),cm,tx+sx*.9,1.7,tz+sz,false);mesh(Bx(.06,.45,.06),stM,tx+sx*.68,1.22,tz+sz,false)}};
  for(const tx of[dx-2,dx+2])for(const tz of[-28.2,-24.2,-20.2])tb(tx,tz);
  // บันไดทางขึ้น + ราวสแตนเลส
  const stT=M(0xf2f2f0,{roughness:.5});
  for(const fx of[dx-2.3,dx+2.3]){for(let k=1;k<=4;k++)mesh(Bx(3,.25*k,.35),stT,fx,.125*k,zS+.5+(4-k)*.35);
   for(const s of[-1,1]){rail(V(fx+s*1.55,1.9,zS+.4),V(fx+s*1.55,.9,zS+1.9));for(const pz of[.4,1.9])mesh(new THREE.CylinderGeometry(.03,.03,1,6),stM,fx+s*1.55,(pz>1?.5:1.5)+.4,zS+pz,false)}}
  mesh(Bx(1.6,.5,1.2),wT,dx,.25,zS+.7);mesh(Bx(1.4,.04,1),M(0x3f6a2e,{roughness:1}),dx,.52,zS+.7,false);
  {const jr=mesh(new THREE.SphereGeometry(.45,14,12),M(0x5a3a14,{roughness:.35,metalness:.2}),dx,1.0,zS+.7);jr.scale.y=1.15;mesh(new THREE.CylinderGeometry(.22,.3,.22,12),M(0x5a3a14,{roughness:.35}),dx,1.6,zS+.7);
   [[-.55,.25],[.55,.2]].forEach(([ox,sz])=>{const q=mesh(new THREE.SphereGeometry(sz+.15,8,6),M(0x8a6a4a,{roughness:1}),dx+ox,.65,zS+.4);q.scale.y=1.4})}
  // ชายคายื่นหน้า/ด้านสระ พร้อมผ้าใบลายขาว-ฟ้า
  const aw=2,Wd=rx1-bx0,Lz=zS-zB;
  mesh(Bx(Wd+2*aw,.5,aw),wT,(bx0+rx1)/2,5.25,zS+aw/2);
  mesh(Bx(Wd+2*aw,.14,.1),M(0x2a6fa8),(bx0+rx1)/2,4.95,zS+aw,false);
  mesh(Bx(aw,.4,Lz),wT,bx0-aw/2,5.2,(zB+zS)/2);
  mesh(Bx(.12,.55,Lz),stripeM(Lz/1.2),bx0-aw,4.85,(zB+zS)/2,false);
  mesh(Bx(aw,.4,Lz),wT,rx1+aw/2,5.2,(zB+zS)/2);mesh(Bx(.12,.55,Lz),stripeM(Lz/1.2),rx1+aw,4.85,(zB+zS)/2,false);   // ชายคาฝั่งขวา (เปิดโล่งเหมือนฝั่งซ้าย)
  // ลานกระเบื้องหน้าอาคาร โต๊ะ-ม้านั่งหินอ่อน
  mesh(Bx(8.8,.06,6),tileM(5.8,3.6),dx,.13,zS+5.2,false);
  for(const[tx,tz]of[[dx-2.2,zS+5.6],[dx+3,zS+5.2]]){
   mesh(Bx(2.2,.1,1.2),cc,tx,.78,tz);mesh(Bx(.5,.7,.5),cc,tx,.4,tz);mesh(Bx(1.2,.08,.9),cc,tx,.12,tz,false);
   for(const s of[-1,1]){mesh(Bx(.45,.06,1.8),cc,tx+s*1.2,.46,tz);for(const t of[-.7,.7])mesh(Bx(.35,.4,.1),cc,tx+s*1.2,.23,tz+t)}}
  // สระน้ำ (รูปทรงอิสระตามแบบร่าง) ด้านตะวันตก
  {const WL=(wh.cx-wh.ex/2)-SX+.45;                                                                            // ขอบสระฝั่งตะวันตก (รวมขอบหิน 0.45 ม.) เสมอแนวผนังโกดัง หลังเลื่อนชุดโรงอาหาร
   const pp=[[45,200],[70,182],[110,180],[145,190],[160,215],[175,250],[250,252],[283,262],[292,320],[285,400],[280,450],[200,448],[110,440],[60,405],[42,300]].map(([a,b])=>{const wl=WL;return new THREE.Vector3(a<167?wl+(a-40)/127*(xL-wl):xL+(a-167)*.0411,0,-40+(b-103)*(24/347))});
   const RC=[[xL-.3,rx1+.3,zN-.3,zB+.3],[xL-1.8,bx0,zN,zB+1.5],[xL-3.25,xL-1.8,zB-2.6,zB-.2],[bx0-.3,rx1+.3,zB,zS+.3]],PD=2.45;   // แนวอาคาร/ระเบียง/บันได — ขอบสระห่าง 2 ม.
   const push=p=>{for(let it=0;it<4;it++)for(const [a,b,c,d] of RC){const x=p.x,z=-p.y;if(x>a-PD&&x<b+PD&&z>c-PD&&z<d+PD){const m=[x-(a-PD),(b+PD)-x,z-(c-PD),(d+PD)-z],k=m.indexOf(Math.min(...m));
     if(k===0)p.x=a-PD;else if(k===1)p.x=b+PD;else if(k===2)p.y=-(c-PD);else p.y=-(d+PD)}}return p};
   const pts=new THREE.CatmullRomCurve3(pp,true).getPoints(90).map(v=>push(new THREE.Vector2(v.x,-v.z)));
   for(let r=0;r<3;r++){const q=pts.map(p=>p.clone());for(let i=0;i<pts.length;i++){const a=q[(i+pts.length-1)%pts.length],b=q[(i+1)%pts.length];pts[i].set((a.x+2*q[i].x+b.x)/4,(a.y+2*q[i].y+b.y)/4);push(pts[i])}}
   const cen=pts.reduce((a,p)=>a.add(p),new THREE.Vector2()).multiplyScalar(1/pts.length);
   {let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;pts.forEach(p=>{x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);z0=Math.min(z0,-p.y);z1=Math.max(z1,-p.y)});zone('o_pool',(x0+x1)/2,.5,(z0+z1)/2,x1-x0,1,z1-z0,-10,-1);icon('level',(x0+x1)/2,2.95,(z0+z1)/2,1.1,.35,'pool',true)}
   const rimP=pts.map(p=>{const d=p.clone().sub(cen);return cen.clone().add(d.multiplyScalar(1+.45/d.length()))});
   mesh(new THREE.ShapeGeometry(new THREE.Shape(rimP)).rotateX(-Math.PI/2),M(0x9b8f7e,{roughness:1}),0,.14,0,false);
   mesh(new THREE.ShapeGeometry(new THREE.Shape(pts)).rotateX(-Math.PI/2),Std({color:0x2a4f8f,metalness:.15,roughness:.12}),0,.17,0,false);
   [[0,0,.5],[40,10,.4],[88,0,.6],[20,0,.35],[66,0,.45]].forEach(([i,,sz])=>{const p=pts[i%pts.length],r=mesh(new THREE.SphereGeometry(sz,8,6),M(0x8f9296,{roughness:1}),p.x,.35,-p.y);r.scale.y=.6});
   const inP=(x,y)=>{let c=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const A=pts[i],B2=pts[j];if((A.y>y)!==(B2.y>y)&&x<(B2.x-A.x)*(y-A.y)/(B2.y-A.y)+A.x)c=!c}return c};   // น้ำพุเฉพาะจุดที่อยู่ในสระ
   [[-2,1],[1,-2],[-1,-5],[2,3],[0,5],[-3,-3],[-4,2],[3,-1]].filter(([ox,oy])=>inP(cen.x+ox,cen.y+oy)&&inP(cen.x+ox+.8,cen.y+oy)&&inP(cen.x+ox-.8,cen.y+oy)&&inP(cen.x+ox,cen.y+oy+.8)&&inP(cen.x+ox,cen.y+oy-.8)).forEach(([ox,oy])=>{const f=mesh(new THREE.ConeGeometry(.28,.8,8),new THREE.MeshStandardMaterial({color:0xffffff,transparent:true,opacity:.7}),cen.x+ox,.55,-(cen.y+oy),false)});
   const palm=(x,z,h)=>{mesh(new THREE.CylinderGeometry(.14,.24,h,8),M(0x8a7a5a),x,h/2,z);for(let i=0;i<8;i++){const a=i*Math.PI/4,o=mesh(Bx(2.8,.04,.55),M(0x2f7d32),x+Math.cos(a)*1.3,h,z+Math.sin(a)*1.3,false);o.rotation.order='YZX';o.rotation.y=-a;o.rotation.z=-.4}};
   [[-4.8,-35.6,9],[-9,-36.8,7.5],[-14,-36,8.5],[1.0,zS+2.6,6.5]].forEach(([ox,z,h])=>palm(xL+ox,z,h));   // ต้นที่ 4: ย้ายพ้นชายคา/หลังคาโซนนั่งกิน (ใบห่างชายคา > 2.7 ม.)
   [[-6.9,0xd33a3a],[-6.3,0x3a8fd3],[-5.7,0xe0b020],[-5.1,0x3aa35a]].forEach(([ox,c])=>{mesh(new THREE.ConeGeometry(.22,.5,8),M(c),xL+ox,.25,-36.6);mesh(new THREE.SphereGeometry(.12,8,6),M(0xf2c9a0),xL+ox,.58,-36.6,false)});
   mesh(new THREE.ConeGeometry(.35,1.1,10),M(0xf2cf30),xL-4.3,.55,-36.6);mesh(new THREE.SphereGeometry(.18,8,6),M(0xf2c9a0),xL-4.3,1.2,-36.6,false)
   // ===== สวนริมสระฝั่งทิศเหนือ (ทิศเหนือจริง = -X: ปลายสระฝั่งแนวโกดัง) ตามรูปตัวอย่าง: แถวรูปปั้นหันหน้าเข้าสระ, ต้นไม้ด้านหลัง — ปาล์มหางกระรอกลำต้นสูง, หมากเหลืองเป็นกอ, พุ่มไม้ยอดแดง, รูปปั้นคนแคระหมวกแหลมหลากสี, กวาง, กระต่ายขาว =====
   {const gx=WL-2.4,gz0=-31.5,gz1=-20.5,skin=M(0xf2c9a0,{roughness:.6}),wht=M(0xf3f1ea,{roughness:.6}),cyl=(r1,r2,h,n=12)=>new THREE.CylinderGeometry(r1,r2,h,n);
    const gnome=(x,z,hat,shirt,pants,ry=0)=>{const g=new THREE.Group(),a=(ge,m,px,py,pz,s)=>{const o=new THREE.Mesh(ge,m);o.position.set(px,py,pz);if(s)o.scale.set(...s);o.castShadow=true;g.add(o);return o};
      a(cyl(.3,.32,.08,14),M(0x9aa58f,{roughness:1}),0,.04,0);                                                             // ฐานหญ้าเทียม
      for(const s of[-1,1]){a(cyl(.07,.08,.28,8),M(pants,{roughness:.6}),s*.09,.22,0);a(new THREE.BoxGeometry(.14,.08,.22),M(0x3b2a1e,{roughness:.6}),s*.09,.12,.04)}   // ขา + รองเท้า
      a(cyl(.16,.2,.36,12),M(shirt,{roughness:.55}),0,.53,0);a(cyl(.205,.205,.05,12),M(0x2a2420),0,.4,0);                    // ลำตัว + เข็มขัด
      for(const s of[-1,1]){const arm=a(cyl(.05,.05,.3,8),M(shirt,{roughness:.55}),s*.2,.55,.05);arm.rotation.z=s*.5;arm.rotation.x=-.5;a(new THREE.SphereGeometry(.055,8,6),skin,s*.15,.48,.17)}
      a(new THREE.SphereGeometry(.15,14,10),skin,0,.84,0);a(new THREE.SphereGeometry(.045,8,6),M(0xe8a08a,{roughness:.5}),0,.84,.15);   // หัว + จมูก
      const bd=a(new THREE.ConeGeometry(.14,.3,12),wht,0,.66,.07);bd.rotation.x=Math.PI;                                     // เครา
      for(const s of[-1,1])a(new THREE.SphereGeometry(.022,6,4),M(0x222222),s*.055,.88,.135);                                 // ตา
      const ht=a(new THREE.ConeGeometry(.17,.42,14),M(hat,{roughness:.5}),0,1.12,-.02);ht.rotation.x=-.18;                   // หมวกแหลม
      g.position.set(x,.1,z);g.rotation.y=ry;scene.add(g)};
    const C=[[0xd8342c,0xf2c21b,0x2c6fd0],[0x5fbf4a,0xe35d8f,0x8b5a2b],[0x2f6fd0,0xd8342c,0x8b5a2b],[0x6c3fb0,0x5fbf4a,0x5fbf4a],[0xf2c21b,0xd8342c,0x2f6fd0],[0xe0802a,0x3a8fd3,0x6b4a2e],[0xd8342c,0x9b5fc0,0x5fbf4a]];   // รูปปั้นคนแคระ 7 ตัว
    const GT=[0,.125,.25,.375,.625,.8125,1];                                                                                 // ตำแหน่งตามแนวแถว (เว้นกลางแถว t = 0.5 ไว้วางรูปปั้นตรงกลาง)
    C.forEach(([h,s2,p],i)=>{const t=GT[i];gnome(gx-(i%2)*.35,gz0+(gz1-gz0)*t,h,s2,p,Math.PI/2+(Math.random()-.5)*.3)});   // หันหน้าเข้าสระ (+X)
    // ===== จุดวางรูปปั้นตรงกลางแถว (ผู้ใช้สร้างโมเดลเอง): แผ่นหินฐานรอไว้ — วางโมเดลที่ x = gx-.2, z = (gz0+gz1)/2, y = .15 หันหน้า +X (rotation.y = Math.PI/2)
    {const sx=gx-.2,sz=(gz0+gz1)/2;const st=mesh(new THREE.CylinderGeometry(.75,.8,.08,9),M(0x9a8f80,{roughness:1}),sx,.13,sz);st.scale.z=.8}
    // รูปปั้นหญิงสาวกระโปรงยาวบานถือตะกร้าผลไม้ (รูปปั้นแต่งสวนทั่วไป) ยืนบนแผ่นหินกลางแถว หันหน้าเข้าสระ
    {const sx=gx-.2,sz=(gz0+gz1)/2,g=new THREE.Group(),a=(ge,m,px,py,pz)=>{const o=new THREE.Mesh(ge,m);o.position.set(px,py,pz);o.castShadow=true;g.add(o);return o};
     const dress=M(0xe48aa8,{roughness:.5}),hem=M(0xf6eee2,{roughness:.5}),blouse=M(0xf4efe6,{roughness:.5}),hair=M(0x6a4128,{roughness:.6}),bsk=M(0xa8743c,{roughness:.8});
     a(cyl(.17,.46,.82,18),dress,0,.41,0);a(cyl(.465,.47,.06,18),hem,0,.05,0);                                              // กระโปรงยาวบาน + ชายกระโปรง
     a(cyl(.15,.17,.36,14),dress,0,1.0,0);a(cyl(.175,.175,.05,14),hem,0,.84,0);                                             // เสื้อตัว + เข็มขัดผ้า
     a(cyl(.075,.1,.08,12),blouse,0,1.2,0);a(cyl(.045,.05,.1,8),skin,0,1.27,0);                                            // คอเสื้อ + คอ
     a(new THREE.SphereGeometry(.13,16,12),skin,0,1.42,0);for(const s of[-1,1])a(new THREE.SphereGeometry(.018,6,4),M(0x2b2b2b),s*.045,1.44,.12);
     a(new THREE.SphereGeometry(.024,6,4),M(0xd4706a),0,1.37,.125);                                                          // ปาก
     const hr=a(new THREE.SphereGeometry(.142,16,12,0,Math.PI*2,0,Math.PI*.55),hair,0,1.44,-.015);hr.rotation.x=-.25;          // ผมด้านบน
     a(new THREE.BoxGeometry(.24,.42,.08),hair,0,1.25,-.1);a(new THREE.SphereGeometry(.06,10,8),hair,0,1.5,-.14);              // ผมยาวด้านหลัง + มวยผม
     for(const s of[-1,1]){const ua=a(cyl(.042,.04,.3,8),blouse,s*.2,1.03,0);ua.rotation.z=s*.25}                             // แขนเสื้อ
     const fa=a(cyl(.036,.032,.26,8),skin,.24,.84,.1);fa.rotation.x=-1.1;a(new THREE.SphereGeometry(.04,8,6),skin,.24,.78,.22);   // แขนขวายื่นถือตะกร้า
     a(cyl(.035,.03,.28,8),skin,-.24,.8,0);a(new THREE.SphereGeometry(.04,8,6),skin,-.25,.66,0);                               // แขนซ้ายแนบลำตัว
     a(cyl(.13,.1,.12,14),bsk,.25,.74,.26);const hd=a(new THREE.TorusGeometry(.1,.012,6,16,Math.PI),bsk,.25,.8,.26);hd.rotation.y=Math.PI/2;   // ตะกร้า + หูหิ้ว
     for(const [ox,oz,c] of[[-.04,-.03,0xd8342c],[.05,.02,0xf2a33a],[0,.05,0x8fbf3a],[.03,-.05,0xd8342c]])a(new THREE.SphereGeometry(.04,8,6),M(c,{roughness:.5}),.25+ox,.82,.26+oz);   // ผลไม้
     g.position.set(sx,.17,sz);g.rotation.y=Math.PI/2;g.scale.setScalar(1.05);scene.add(g)}
    {const dx2=gx-1.3,dz=gz0+(gz1-gz0)*.42,dM=M(0xe0a03a,{roughness:.5}),g=new THREE.Group(),a=(ge,m,px,py,pz)=>{const o=new THREE.Mesh(ge,m);o.position.set(px,py,pz);o.castShadow=true;g.add(o);return o};   // กวางปั้น
     const bdy=a(new THREE.SphereGeometry(.3,14,10),dM,0,.85,0);bdy.scale.set(1.6,.85,.75);
     for(const [lx,lz] of[[-.32,-.12],[-.32,.12],[.32,-.12],[.32,.12]])a(cyl(.035,.03,.75,8),dM,lx,.42,lz);
     const nk=a(cyl(.07,.1,.45,10),dM,.42,1.12,0);nk.rotation.z=-.55;a(new THREE.SphereGeometry(.1,10,8),dM,.58,1.35,0).scale.set(1.5,.9,.85);
     for(const s of[-1,1]){a(new THREE.ConeGeometry(.04,.12,6),dM,.55,1.46,s*.07).rotation.z=-.3;
      for(const [ax,ay,rz] of[[.5,1.62,.25],[.46,1.72,-.4],[.56,1.74,.6]]){const an=a(cyl(.012,.015,.26,5),M(0xf3e8cf),ax,ay,s*.09);an.rotation.z=rz;an.rotation.x=s*.25}}
     g.position.set(dx2,.1,dz);g.rotation.y=.9;scene.add(g)}
    for(const [rx,rz,sc] of[[gx+.6,gz0-1.6,1],[gx+.85,gz0-1.25,.7],[gx+.95,gz0-1.9,.65]]){const r=new THREE.Group();                // กระต่ายขาว
     const b=new THREE.Mesh(new THREE.SphereGeometry(.13,10,8),wht);b.scale.set(1,1.2,1.3);b.position.y=.13;r.add(b);const h=new THREE.Mesh(new THREE.SphereGeometry(.08,10,8),wht);h.position.set(0,.3,.08);r.add(h);
     for(const s of[-1,1]){const e=new THREE.Mesh(new THREE.CylinderGeometry(.02,.025,.18,6),wht);e.position.set(s*.035,.44,.06);e.rotation.z=s*.15;r.add(e)}
     r.scale.setScalar(sc*1.4);r.position.set(rx,.1,rz);r.traverse(o=>o.castShadow=true);scene.add(r)}
    // ปาล์มหางกระรอก: ลำต้นเทาเรียวสูง + ทางใบโค้งห้อยฟูรอบยอด
    const foxtail=(x,z,h)=>{mesh(cyl(.13,.2,h,10),M(0x9a958a,{roughness:.9}),x,h/2,z);mesh(cyl(.15,.14,.9,10),M(0x6f8f4a,{roughness:.8}),x,h+.35,z);
     for(let i=0;i<14;i++){const a=i/14*Math.PI*2+(i%2)*.2,up=i%3===0;for(let k=0;k<5;k++){const t=k/4,r=.3+t*2.0,y=h+.7+(up?.6:.25)*Math.sin(t*Math.PI*.9)-(up?.2:1.0)*t*t,o=mesh(new THREE.BoxGeometry(.5,.05,.4),M(k%2?0x3f7a35:0x4d8a3c,{roughness:.9}),x+Math.cos(a)*r,y,z+Math.sin(a)*r,false);o.rotation.y=-a;o.rotation.z=-(up?.2:.6)*t}}};
    // หมากเหลือง: กอลำต้นเล็กหลายต้น ใบเป็นแผงขนนก
    const areca=(x,z)=>{for(let j=0;j<5;j++){const ox=Math.cos(j*1.3)*.35,oz=Math.sin(j*1.3)*.35,h=2.2+j*.45;mesh(cyl(.04,.06,h,6),M(0x9db35a,{roughness:.8}),x+ox,h/2,z+oz,false);
      for(let i=0;i<5;i++){const a=i/5*Math.PI*2+j,o=mesh(new THREE.BoxGeometry(1.4,.03,.35),M(0x5f9a3e,{roughness:.9}),x+ox+Math.cos(a)*.65,h+.1,z+oz+Math.sin(a)*.65,false);o.rotation.y=-a;o.rotation.z=-.35}}};
    const shrub=(x,z,s)=>{for(let i=0;i<4;i++){const o=mesh(new THREE.SphereGeometry(.45*s,8,6),M(i===3?0xc0452e:0x3d7a33,{roughness:1}),x+(i%2-.5)*.4*s,(.55+i*.25)*s,z+(i>1?.2:-.2)*s);o.scale.y=1.1}};
    foxtail(gx-.7,gz0+(gz1-gz0)*.62,7.2);foxtail(gx-1.7,gz1+1.8,6.4);
    for(const t of[.08,.3,.52,.82])areca(gx-2.1,gz0+(gz1-gz0)*t);
    for(const t of[.18,.45,.7,.95])shrub(gx-1.4,gz0+(gz1-gz0)*t,1)}}
  const bigTree=(x,z,s)=>{mesh(new THREE.CylinderGeometry(.45*s,.7*s,6*s,8),M(0x6b4a2e),x,3*s,z);
   [[0,8.5,0,4.4,0x3f7a3a],[2.8,7.2,1,3.4,0x4f8f45],[-2.6,7.6,-1,3.6,0x468540],[.5,10.8,.5,3,0x57994b]].forEach(q=>{const f=mesh(new THREE.SphereGeometry(q[3]*s,12,10),M(q[4]),x+q[0]*s,q[1]*s,z+q[2]*s);f.scale.y=.85})};
  bigTree(dx-3.6,zS+3.8,1.2);bigTree(rx1+3.5,zS+4,1);
  // พื้นปูนต่อจากลานคอนกรีตหลักมาถึงแนวต้นไม้ใหญ่หน้าโรงอาหาร (ก่อนเลื่อนชุด: ขอบลานหลัก z=-2 → แนวต้นไม้ zS+3.8-1)
  {const za=zS+3.8-1.2,zb=-2;mesh(Bx(76,.2,zb-za),M(0xb5b8be),-SX,0,(za+zb)/2,false)}   // -SX: ชดเชยการเลื่อนชุดโรงอาหาร (ลานปูนอยู่ที่เดิม)
  for(let i=0;i<10;i++)addBike(bikeC[i%bikeC.length],rx1+2.7,zS-1.6-i*1.15);                                        // มอเตอร์ไซค์จอดเรียงด้านข้าง 10 คัน
 const eq=M(0xdfe2e6,{metalness:.3,roughness:.5});
 [[xL+3.75,-36],[xL+10,-36],[dx,-27],[dx,-21]].forEach(([fx,z])=>{mesh(new THREE.BoxGeometry(1.6,1.2,1.6),eq,fx,10.6,z);mesh(new THREE.CylinderGeometry(.5,.5,.15,16),M(0x2b2e33),fx,11.27,z)});
 label({name:'โรงอาหาร',w:15,l:24,h:9,cz:-28,lx:xL+7.5});zone('o_canteen',xL+7.5,4.6,(zN+zS)/2,15.2,9.2,zS-zN+.2,-10);
 [-26,-20].forEach(z=>lamp(bx0,5,z,-1,0,5));lamp(xL,5,-37,-1,0,5);
 [-37,-31,-26,-20].forEach(z=>lamp(rx1,5,z,1,0,5));
 [0,3.5].forEach(o=>lamp(xL+1.5+o,5,zN,0,-1,5));
 [rx1-6.5,rx1-1].forEach(x=>lamp(x,5,zS,0,1,5));lamp(dx,4.2,zS+.9,0,0,4);
 // เลื่อนโรงอาหารทั้งชุดห่างจากโกดังเพิ่มอีก 10 ม. (ห่างรวม 26 ม.)
 for(let i=_n0;i<scene.children.length;i++)scene.children[i].position.z-=10;
 // เลื่อนโรงอาหาร (รวมต้นไม้/สระ) ไปทางซ้ายเมื่อมองจากหน้าโรงงาน ให้ขอบขวาเสมอขอบถนนเข้าโรงงาน
 for(let i=_n0;i<scene.children.length;i++)scene.children[i].position.x+=SX;for(const id of['o_canteen','o_pool'])ZONES[id].x+=SX}
// อาคาร 1 (ออฟฟิศ) ด้านหน้าตามรูปจริง: กล่องสีขาว กรอบลึก, ช่องกระจกใหญ่ 2 ชั้นซ้าย-ขวา, เสากลางมีหน้าต่างบน,
// กันสาดครึ่งวงกลมเหนือทางเข้า, ประตูกระจก, บันไดหินทรายกว้าง, ป้าย POLIPHARM / ISO 9001 CERTIFIED, โคมไฟลูกโลก, แนวพุ่มไม้สีเหลืองเขียว,
// น้ำพุหินแกรนิตดำด้านขวา, ช้างหินคู่, ราวสแตนเลส, เลข 1, ธงชาติติดผนัง
{const o1=B[4],bz=o1.z0+o1.ez,cx=o1.cx,xL=cx-o1.ex/2,xR=cx+o1.ex/2,H=o1.h,F1=o1.base+o1.fh1,UP=F1-4,D=.6,PAR=1.3,CB=F1,CT=.4,PHt=.9*.85,GB=CB+CT+PHt,GT=5.95+UP+1.35,fz=bz+D,Bx=(a,c,d)=>new THREE.BoxGeometry(a,c,d);
 const wh=M(0xf7f7f5,{roughness:.8}),whS=M(0xe9e9e6,{roughness:.85}),dk=new THREE.MeshStandardMaterial({color:0x14212c,metalness:.7,roughness:.15}),
  sand=M(0x5d6167,{roughness:.6}),hedge=M(0x4f7f35,{roughness:1}),hedgeD=M(0x3e6a2c,{roughness:1}),blkM=M(0x23272c,{metalness:.4,roughness:.5});
 const gl=(w,h,cols,rows)=>{const t=cv(256,256,(g,W,Hh)=>{const gr=g.createLinearGradient(0,0,W,Hh);gr.addColorStop(0,'#0d1720');gr.addColorStop(.5,'#25394a');gr.addColorStop(1,'#0f1a24');g.fillStyle=gr;g.fillRect(0,0,W,Hh);
   g.strokeStyle='#0a0d10';g.lineWidth=7;for(let i=0;i<=cols;i++){g.beginPath();g.moveTo(i*W/cols,0);g.lineTo(i*W/cols,Hh);g.stroke()}for(let j=0;j<=rows;j++){g.beginPath();g.moveTo(0,j*Hh/rows);g.lineTo(W,j*Hh/rows);g.stroke()}});
  return new THREE.MeshStandardMaterial({map:t,metalness:.7,roughness:.15})};
 // โครงด้านหน้า (กรอบลึก 0.6 ม.): เสาซ้าย-ขวา, เสากลาง, คานบน (ยกสูงเป็นเชิงผนัง), ขอบล่าง
 const pier=(x0,x1)=>mesh(Bx(x1-x0,H+PAR,D),wh,(x0+x1)/2,(H+PAR)/2,bz+D/2);
 const P=[[xL,xL+1.2],[cx-3.1,cx+3.1],[xR-1.3,xR]];P.forEach(([a,c])=>pier(a,c));   // เสากลาง (ทางเข้า) อยู่กึ่งกลางอาคาร
 mesh(Bx(o1.ex,PAR+.9,D),wh,cx,H+(PAR-.9)/2,bz+D/2);                                                                      // คานบน/เชิงผนังหน้า
 mesh(Bx(o1.ex+.02,PAR,o1.ez+.02),wh,cx,H+PAR/2,o1.z0+o1.ez/2);                                                         // เชิงผนังรอบหลังคา
 // ช่องกระจกซ้าย (2 ชั้น) และขวา (2 ชั้น) + กระจกหน้าต่างเสากลางชั้นบน
 [[xL+1.2,cx-3.1],[cx+3.1,xR-1.3]].forEach(([a,c])=>{const w=c-a,cxx=(a+c)/2;
  mesh(Bx(w,H-1.5-.9,.08),gl(w,H-2.4,Math.round(w/1.5),4),cxx,.9+(H-2.4)/2,bz+.06,false);
  mesh(Bx(w,.25,.5),whS,cxx,F1-.1,bz+.3,false);                                                                        // แถบพื้นชั้น 2 ในช่อง
  mesh(Bx(w,.9,D+.5),wh,cxx,.45,bz+(D+.5)/2);                                                                         // กระบะต้นไม้ใต้กระจก
  mesh(Bx(w-.3,.7,.9),hedge,cxx,1.25,bz+.55);for(let x=a+.6;x<c-.4;x+=1.1)mesh(new THREE.SphereGeometry(.55,8,6),x%2.2<1.1?hedge:hedgeD,x,1.45,bz+.6)});
 {const a=cx-2.1,c=cx+2.1;mesh(Bx(c-a,GT-GB,.08),gl(c-a,GT-GB,4,2),(a+c)/2,(GB+GT)/2,fz+.01,false);mesh(Bx(c-a+.3,.12,.15),whS,(a+c)/2,GB-.06,fz+.05,false)}
 // ทางเข้า: กันสาดครึ่งวงกลม + ผนังข้างทางเข้า + ประตูกระจก
 const ex=cx,R=2.3;                                                                   // ทางเข้ากึ่งกลางอาคาร
 {const g=new THREE.CylinderGeometry(R,R,CT,40,1,false,-Math.PI/2,Math.PI);mesh(g,wh,ex,CB+CT/2,fz);mesh(new THREE.CylinderGeometry(R-.05,R-.05,.02,40,1,false,-Math.PI/2,Math.PI),whS,ex,CB-.01,fz,false)   // ใต้ระเบียงเสมอขอบบนชั้น 1
  // ขอบปูนรอบระเบียงครึ่งวงกลม: สูงจากพื้นระเบียง (4.375) ขึ้นมาเสมอขอบล่างกระจกช่องกลางชั้นบน
  {const yB=CB+CT,yT=GB,t=.15,sh=new THREE.Shape(),n=40;
   for(let i=0;i<=n;i++){const a=-Math.PI/2+Math.PI*i/n;const x=R*Math.sin(a),y=-R*Math.cos(a);i?sh.lineTo(x,y):sh.moveTo(x,y)}
   for(let i=n;i>=0;i--){const a=-Math.PI/2+Math.PI*i/n;sh.lineTo((R-t)*Math.sin(a),-(R-t)*Math.cos(a))}
   mesh(new THREE.ExtrudeGeometry(sh,{depth:yT-yB,bevelEnabled:false,curveSegments:1}).rotateX(-Math.PI/2),wh,ex,yB,fz)}}
 // ระเบียงยื่นยึดกับตัวอาคาร (ไม่มีเสา/ผนังค้ำ)                                          // ผนังข้างช่องทางเข้า
 mesh(Bx(2.6,2.75,.08),gl(2.6,2.75,2,2),ex,.9+1.375,fz+.04,false);mesh(Bx(.05,2.75,.1),M(0xc0c5ca,{metalness:.8}),ex,2.275,fz+.08,false);
 for(const s of[-1,1])mesh(Bx(.03,.5,.04),M(0xc0c5ca,{metalness:.8}),ex+s*.12,2.0,fz+.11,false);
 // บันไดหินทรายกว้าง 5 ขั้น
 const sw=6.2,sh=.18,sr=.42;mesh(Bx(sw,.9,1.6),sand,ex,.45,fz+.8);
 for(let k=0;k<5;k++){const h=.9-sh*(k+1);if(h>0)mesh(Bx(sw+.5*(k+1),h,sr),sand,ex,h/2,fz+1.6+sr*(k+.5))}
 mesh(Bx(sw+3,.06,sr*5+.4),sand,ex,.03,fz+1.6+sr*2.5,false);
 {const pot=M(0xeeeeec,{roughness:.5});mesh(new THREE.CylinderGeometry(.22,.16,.5,12),pot,ex-1.0,1.15,fz+1.2);mesh(new THREE.SphereGeometry(.35,8,6),M(0x4c8a3c),ex-1.0,1.6,fz+1.2);
  mesh(new THREE.CylinderGeometry(.22,.16,.5,12),pot,ex+1.0,1.15,fz+1.2);mesh(new THREE.SphereGeometry(.35,8,6),M(0x4c8a3c),ex+1.0,1.6,fz+1.2)}
 // ป้ายชื่อ (วาดในผืนเดียวเพื่อจัดแนวตัวอักษร): โพลิฟาร์ม ชิดซ้ายเสมอตัว P, POLIPHARM (น้ำเงิน),
 // ISO 9001 (แดง) + CERTIFIED (น้ำเงิน) ชิดขวาให้ขอบขวาตัว D ตรงกับขอบขวาตัว M
 const sgT=cv(1024,320,(g,w,h)=>{g.clearRect(0,0,w,h);g.textAlign='left';g.textBaseline='alphabetic';
  const blue='#16418f',red='#d02a2a';
  g.font='bold 150px Arial Black, Arial, sans-serif';const mP=g.measureText('POLIPHARM'),inkW=mP.actualBoundingBoxLeft+mP.actualBoundingBoxRight,
   inkL=(w-inkW)/2,inkR=inkL+inkW;g.fillStyle=blue;g.fillText('POLIPHARM',inkL+mP.actualBoundingBoxLeft,200);
  g.font='bold 34px Tahoma, sans-serif';const mT=g.measureText('โพลิฟาร์ม');g.fillStyle=blue;g.fillText('โพลิฟาร์ม',inkL+mT.actualBoundingBoxLeft,78);
  g.font='bold 58px Arial, sans-serif';const mC=g.measureText('CERTIFIED'),xC=inkR-mC.actualBoundingBoxRight,wI=g.measureText('ISO 9001 ').width;
  g.fillStyle=blue;g.fillText('CERTIFIED',xC,270);g.fillStyle=red;g.fillText('ISO 9001 ',xC-wI,270)});
 mesh(new THREE.PlaneGeometry(6.4,2.0),new THREE.MeshStandardMaterial({map:sgT,transparent:true,roughness:.5,metalness:.2}),cx,H+.3625,fz+.09,false);
 // โคมไฟลูกโลกติดผนัง
 const glb=M(0xffffff,{emissive:0xfff1c8,emissiveIntensity:.35,roughness:.3});
 [xL+.6,cx-2.8,cx+2.8,xR-.65].forEach(x=>{mesh(Bx(.12,.12,.25),blkM,x,2.5,fz+.12,false);mesh(new THREE.SphereGeometry(.17,12,10),glb,x,2.55,fz+.32,false)});
 // ด้านข้างฝั่งถนน: ช่องหน้าต่างลึก 2 ชั้น
 {const xs=xR+.05;for(const [y,h] of[[(o1.base+F1)/2,o1.fh1-1.6],[5.6+UP,2.7]]){mesh(Bx(.08,h,4.2),gl(4.2,h,3,2),xs-.02,y,o1.z0+o1.ez/2+1.5,false)}
  mesh(Bx(.6,H+PAR,.8),wh,xR+.3,(H+PAR)/2,o1.z0+o1.ez/2-1.1);mesh(Bx(.6,H+PAR,.8),wh,xR+.3,(H+PAR)/2,o1.z0+o1.ez/2+4.1)}
 // น้ำพุหินแกรนิตดำ 2 ชั้นหน้าช่องกระจกขวา (แทนต้นปาล์มเดิม)
 {const fx=SHRINE_X,fzz=bz+(D+.5)+1.4,                // น้ำพุแนวเดียวกับศาลพระภูมิ; ขอบหลังน้ำพุ (อ่างล่างลึก 2.8 ม.) เสมอขอบหน้ากระถางต้นไม้หน้าอาคาร 1
  gra=M(0x1d2024,{metalness:.3,roughness:.25}),wat=new THREE.MeshStandardMaterial({color:0x6fa8c8,metalness:.2,roughness:.05,transparent:true,opacity:.75}),
   jet=new THREE.MeshStandardMaterial({color:0xffffff,transparent:true,opacity:.55,roughness:.1,emissive:0x9fc6dc,emissiveIntensity:.2});
  mesh(Bx(4.2,.55,2.8),gra,fx,.275,fzz);mesh(Bx(3.8,.04,2.4),wat,fx,.53,fzz,false);                          // อ่างล่าง
  mesh(Bx(2.7,.45,1.5),gra,fx,.55+.225,fzz-.15);mesh(Bx(2.4,.04,1.2),wat,fx,1.0,fzz-.15,false);             // ชั้นบน
  for(let i=0;i<6;i++)mesh(new THREE.CylinderGeometry(.03,.05,.45+(i%2)*.15,6),jet,fx-1.0+i*.4,1.25+(i%2)*.07,fzz-.15,false);
  for(const x of[-1.7,1.7])for(const z of[-.95,.95])mesh(new THREE.CylinderGeometry(.025,.04,.3,6),jet,fx+x,.7,fzz+z,false)}
 // ช้างหินคู่ข้างประตู + ราวจับสแตนเลสที่บันได
 {const st=M(0x9a9690,{roughness:.9});[-1,1].forEach(sd=>{const ex2=ex+sd*1.15,ez2=fz+1.3,g=new THREE.Group();
   const b=new THREE.Mesh(new THREE.SphereGeometry(.38,12,10),st);b.scale.set(1.35,1,1);b.position.y=.62;g.add(b);
   const h=new THREE.Mesh(new THREE.SphereGeometry(.24,10,8),st);h.position.set(.5,.82,0);g.add(h);
   const tk=new THREE.Mesh(new THREE.CylinderGeometry(.05,.08,.6,8),st);tk.position.set(.66,.55,0);tk.rotation.z=.25;g.add(tk);
   for(const e of[-1,1]){const ear=new THREE.Mesh(new THREE.BoxGeometry(.04,.3,.25),st);ear.position.set(.42,.85,e*.22);g.add(ear)}
   for(const lx of[-.3,.3])for(const lz of[-.17,.17]){const l=new THREE.Mesh(new THREE.CylinderGeometry(.08,.09,.4,8),st);l.position.set(lx,.2,lz);g.add(l)}
   const base=new THREE.Mesh(new THREE.BoxGeometry(1.0,.08,.6),st);base.position.y=.04;g.add(base);
   g.traverse(o=>{o.castShadow=true});g.position.set(ex2,.9,ez2);g.rotation.y=sd<0?-Math.PI/2:-Math.PI/2;scene.add(g)});
  const ss=M(0xd5d9de,{metalness:.85,roughness:.25}),hr=(a,c)=>{const d=V(0,0,0).subVectors(c,a),o=mesh(new THREE.CylinderGeometry(.025,.025,d.length(),8),ss,0,0,0);o.position.copy(a).addScaledVector(d,.5);o.quaternion.setFromUnitVectors(V(0,1,0),d.normalize())};
  for(const x of[ex-2.4,ex-1.5]){const z0=fz+1.6,z1=fz+1.6+sr*4.5;hr(V(x,1.85,z0),V(x,.95,z1));for(const [z,y] of[[z0,.9],[z1,.05]])mesh(new THREE.CylinderGeometry(.025,.025,.95,8),ss,x,y+.475,z)}}
 // เลข 1 สีน้ำเงินที่เสาขวา
 {const t=cv(128,128,(g,w,h)=>{g.clearRect(0,0,w,h);g.fillStyle='#2463b5';g.font='bold 120px Arial, sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('1',w/2,h/2+6)});
  mesh(new THREE.PlaneGeometry(.75,.75),new THREE.MeshBasicMaterial({map:t,transparent:true}),xR-.65,1.75,fz+.02,false)}
 // ธงชาติปักตรงกลางระเบียงครึ่งวงกลม (บนกันสาดเหนือทางเข้า)
 {const fx=ex,fzz=fz+4*R/(3*Math.PI),y0=CB+CT,pH=2.6,pole=M(0xc9ced6,{metalness:.6,roughness:.3});
  mesh(new THREE.CylinderGeometry(.18,.22,.15,16),M(0xd5d7da,{roughness:.6}),fx,y0+.075,fzz);                                   // ฐานเสา
  mesh(new THREE.CylinderGeometry(.03,.04,pH,8),pole,fx,y0+pH/2,fzz);mesh(new THREE.SphereGeometry(.06,10,8),M(0xd4a62a,{metalness:.7,roughness:.3}),fx,y0+pH+.04,fzz);
  const tfT=cv(300,200,(g,w,h)=>{let y=0;[['#a51931',1],['#f4f5f8',1],['#2d2a4a',2],['#f4f5f8',1],['#a51931',1]].forEach(q=>{const hh=h*q[1]/6;g.fillStyle=q[0];g.fillRect(0,y,w,hh+1);y+=hh})});
  mesh(new THREE.PlaneGeometry(1.35,.9),new THREE.MeshStandardMaterial({map:tfT,side:THREE.DoubleSide,roughness:.9}),fx+.7,y0+pH-.5,fzz,false)}
}
// บ้านฝั่งตะวันตก
const roofC=[0x8a4a3a,0xb59a68,0x7a5a50,0x9a7a60];
for(let i=0;i<11;i++){const z=6+i*25.5,x=-52;
 mesh(new THREE.BoxGeometry(14,4,16),M(0xe4dccf),x,2,z);
 const r=mesh(new THREE.ConeGeometry(11,3.6,4).rotateY(Math.PI/4),M(roofC[i%4]),x,5.8,z);r.scale.set(1.0,1,1.15)}
// เข็มทิศแบบ HUD มุมล่างซ้ายของจอ แสดงตลอด หมุนตามมุมกล้อง (ลูกศร N ชี้เหนือจริง = แกน -X ของแบบจำลอง)
const compassEl=document.createElement('canvas');compassEl.width=compassEl.height=256;
compassEl.style.cssText='position:absolute;left:10px;bottom:34px;width:72px;height:72px;pointer-events:none;border-radius:50%;opacity:.88;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);box-shadow:0 2px 10px rgba(0,0,0,.25);z-index:2';
// ดีไซน์โมเดิร์น: วงกระจกโปร่งแสงสีเข้ม, วงแหวนบาง + ขีดทุก 15° (ขีดยาวทุก 90°), เข็มเรียวสองสี (เหนือแดง/ใต้ขาว), ตัวอักษรทิศ
{const g=compassEl.getContext('2d'),w=256,c=w/2,R=120,TAU=Math.PI*2;
 const bg=g.createRadialGradient(c,c-30,10,c,c,R);bg.addColorStop(0,'rgba(51,65,85,.55)');bg.addColorStop(1,'rgba(15,23,42,.62)');
 g.fillStyle=bg;g.beginPath();g.arc(c,c,R,0,TAU);g.fill();
 g.strokeStyle='rgba(255,255,255,.55)';g.lineWidth=3;g.beginPath();g.arc(c,c,R-3,0,TAU);g.stroke();
 g.strokeStyle='rgba(255,255,255,.18)';g.lineWidth=2;g.beginPath();g.arc(c,c,R-40,0,TAU);g.stroke();
 for(let k=0;k<24;k++){const a=k/24*TAU,big=k%6===0,r0=R-(big?22:14),r1=R-8;g.strokeStyle=big?'rgba(255,255,255,.9)':'rgba(255,255,255,.4)';g.lineWidth=big?5:3;g.lineCap='round';
  g.beginPath();g.moveTo(c+Math.sin(a)*r0,c-Math.cos(a)*r0);g.lineTo(c+Math.sin(a)*r1,c-Math.cos(a)*r1);g.stroke()}
 const needle=(dir,col)=>{g.fillStyle=col;g.beginPath();g.moveTo(c,c+dir*72);g.lineTo(c+13,c);g.lineTo(c-13,c);g.closePath();g.fill()};
 needle(-1,'#ef4444');needle(1,'rgba(241,245,249,.92)');
 g.fillStyle='rgba(0,0,0,.18)';g.beginPath();g.moveTo(c,c-72);g.lineTo(c+13,c);g.lineTo(c,c);g.closePath();g.fill();          // เงาครึ่งซีกให้ดูมีมิติ
 g.fillStyle='#fff';g.beginPath();g.arc(c,c,9,0,TAU);g.fill();g.fillStyle='#0f172a';g.beginPath();g.arc(c,c,4,0,TAU);g.fill();
 g.textAlign='center';g.textBaseline='middle';g.font='600 30px system-ui, -apple-system, Segoe UI, sans-serif';
 g.fillStyle='#f87171';g.fillText('N',c,c-R+46);g.fillStyle='rgba(255,255,255,.75)';g.font='500 22px system-ui, -apple-system, Segoe UI, sans-serif';
 g.fillText('S',c,c+R-44);g.fillText('E',c+R-44,c);g.fillText('W',c-R+44,c)}
host.appendChild(compassEl);
const _cr=new THREE.Vector3();let _ca=1e9;
function updateCompass(){_cr.setFromMatrixColumn(cam.matrixWorld,0);const a=Math.atan2(-_cr.x,-_cr.z);   // มุมของทิศเหนือบนจอ (ตามเข็มนาฬิกาจากด้านบน)
 if(Math.abs(a-_ca)>1e-3){_ca=a;compassEl.style.transform=`rotate(${a}rad)`}}
// ต้นไม้
let sd=7;const rnd=()=>(sd=(sd*16807)%2147483647)/2147483647;
const RDZ=MRZ,RDH=MRH+1.8;                                                                  // ถนนหลักหน้าโรงงาน (กึ่งกลาง z, ครึ่งความกว้าง)
for(let i=0;i<85;i++){const east=i%3!==0,x=east?48+rnd()*70:-44+rnd()*-6-(rnd()>.7?30:0),h=5+rnd()*6;let z=-40+rnd()*(TOTAL+70);
 if(Math.abs(z-RDZ)<RDH+h*.42+.5)z=RDZ+Math.sign(z-RDZ||1)*(RDH+h*.42+1.2);                            // ต้นไม้ที่ตกบนถนนหลัก ย้ายไปริมถนน (ทรงพุ่มไม่ล้ำผิวถนน)
 mesh(new THREE.CylinderGeometry(.4,.55,h*.5,6),M(0x6b4a2e),x,h*.25,z);
 mesh(new THREE.SphereGeometry(h*.42,10,8),M(rnd()>.5?0x3f7a3a:0x4f8f45),x,h*.7,z).scale.y=1.1}

// ===== รวม mesh ที่ไม่ต้องโต้ตอบและใช้วัสดุเดียวกันเป็นก้อนเดียว (ลด draw call จากหลักพันเหลือหลักร้อย → โหลด/หมุนกล้องลื่นขึ้น) =====
// ไม่รวม: ชิ้นที่คลิกเลือกได้ (pick), แผงโซลาร์ (เปิด/ปิดได้), วัสดุหลายชิ้น, กลุ่ม (รถ/รถจักรยานยนต์), sprite/เส้น
{const keep=new Set([...pick,...solars,...ANIMK]),groups=new Map();scene.updateMatrixWorld(true);
 const cand=[];for(const o of scene.children){if(o.isGroup&&!keep.has(o))o.traverse(c=>{if(c!==o)cand.push(c)});else cand.push(o)}   // กลุ่ม (รถ/จักรยานยนต์/หม้อแปลง) แยกชิ้นมารวมด้วย
 const zb=Object.entries(ZONES).map(([id,z])=>[id,new THREE.Box3().setFromObject(z.m).expandByScalar(.05)]),_bb=new THREE.Box3(),_bc=new THREE.Vector3();
 for(const o of cand){if(!o.isMesh||keep.has(o)||!o.visible||o.renderOrder||!o.geometry.attributes.position)continue;
  if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();_bb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld).getCenter(_bc);
  const hz=zb.find(([,b])=>b.containsPoint(_bc)),zid=hz?hz[0]:'';                     // ชิ้นส่วนของ object ที่คลิกได้ → รวมแยกตาม object (เพื่อไฮไลต์เฉพาะ object ได้)
  if(Array.isArray(o.material)||o.userData.id){if(zid)(HLM[zid]||(HLM[zid]=[])).push(o);continue}
  const k=zid+'|'+o.material.uuid+(o.castShadow?'1':'0')+(o.receiveShadow?'1':'0');let g=groups.get(k);if(!g){groups.set(k,g=[]);g.zid=zid}g.push(o)}
 const norm=(o)=>{let g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(o.matrixWorld);
  for(const n of Object.keys(g.attributes))if(!['position','normal','uv'].includes(n))g.deleteAttribute(n);
  if(!g.attributes.normal)g.computeVertexNormals();if(!g.attributes.uv)g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
  g.morphAttributes={};g.clearGroups();return g};
 const hl=(zid,o)=>{if(zid)(HLM[zid]||(HLM[zid]=[])).push(o)};
 for(const list of groups.values()){if(list.length<2){hl(list.zid,list[0]);continue}
  const geo=mergeGeometries(list.map(norm),false);if(!geo){list.forEach(o=>hl(list.zid,o));continue}geo.computeBoundingSphere();
  const m=new THREE.Mesh(geo,list[0].material);m.castShadow=list[0].castShadow;m.receiveShadow=list[0].receiveShadow;
  list.forEach(o=>o.parent.remove(o));scene.add(m);hl(list.zid,m)}
 for(const o of [...scene.children]){if(!o.isGroup)continue;let n=0;o.traverse(c=>{if(c.isMesh||c.isSprite||c.isLine)n++});if(!n)scene.remove(o)}}   // ลบกลุ่มที่ว่างแล้ว
// ===== การจราจรในโรงงาน (ภาพเคลื่อนไหว) =====
// รถยก (โฟล์คลิฟท์ไฟฟ้า 2 ตัน สีส้ม-เทา ตามรูปจริง) 2 คัน: ตักพาเลทจากลานโหลดโกดัง ไปส่งลานโหลดเฟส 1 (คันที่ 1) / เฟส 2 (คันที่ 2) แล้ววิ่งกลับ
// รถบรรทุกหกล้อ 2 คัน: วิ่งเข้าประตูหน้า → ถอยเทียบท่าลานโหลดโกดัง (ส่งเฉพาะลานโกดัง) รับ-ส่งสินค้า → วิ่งออกประตูหน้า (truckP สำรองไว้สำหรับลานเฟส)
// กันชน: (1) วิ่งชิดซ้ายตามเลน ขาขึ้น (ไปทางโกดัง) เลน x = rdX-1.5, ขาลง (ไปทางประตู) เลน x = rdX+1.5
//        (2) โซนเทียบท่า/กลับรถ (ลานโกดัง, หน้าเฟส 1, หน้าเฟส 2) เข้าได้ทีละคัน ต่อคิวตามลำดับที่มาถึง (รอที่จุดรอนอกโซน)
//        (3) ทุกคันตรวจกรอบรถล่วงหน้าตามระยะเบรก ถ้าจะทับคันอื่นให้หยุดรอ
const TRAF=(()=>{
 const Y0=.12,LN=rdX-1.5,LS=rdX+1.5,H=Math.PI/2,Bx=(a,b,c)=>new THREE.BoxGeometry(a,b,c),Cy=(a,b,h,n=14)=>new THREE.CylinderGeometry(a,b,h,n);
 const part=(par,ge,m,x,y,z,rx=0,ry=0,rz=0)=>{const o=new THREE.Mesh(ge,m);o.position.set(x,y,z);o.rotation.set(rx,ry,rz);o.castShadow=true;o.receiveShadow=true;par.add(o);return o};
 // ---------- ไฟหน้ารถ (กลางคืน): แสงฟุ้งที่โคม + ลำแสงตกกระทบพื้นด้านหน้า (แบบเดียวกับแสงไฟถนน ไม่ใช้แหล่งแสงจริงเพื่อให้ลื่น)
 const hlTex=cv(128,128,(g,w,h)=>{const r=g.createRadialGradient(64,64,0,64,64,64);r.addColorStop(0,'rgba(255,250,235,1)');r.addColorStop(.25,'rgba(255,240,200,.55)');r.addColorStop(1,'rgba(255,230,180,0)');g.fillStyle=r;g.fillRect(0,0,w,h)});
 const bmTex=cv(256,128,(g,w,h)=>{const lg=g.createLinearGradient(0,0,w,0);lg.addColorStop(0,'rgba(255,244,214,.95)');lg.addColorStop(.35,'rgba(255,240,205,.5)');lg.addColorStop(1,'rgba(255,236,196,0)');
  g.filter='blur(6px)';g.fillStyle=lg;g.beginPath();g.moveTo(4,h*.42);g.lineTo(w,8);g.lineTo(w,h-8);g.lineTo(4,h*.58);g.closePath();g.fill()});
 hlTex.wrapS=hlTex.wrapT=bmTex.wrapS=bmTex.wrapT=THREE.ClampToEdgeWrapping;
 const hlM=new THREE.SpriteMaterial({map:hlTex,color:0xfff2d0,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}),
  bmM=new THREE.MeshBasicMaterial({map:bmTex,color:0xfff0c8,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false});
 function headlights(g,lamps,len,wid,x0){const bg=new THREE.PlaneGeometry(len,wid).rotateX(-Math.PI/2);                // ลำแสงแยกตามโคมซ้าย-ขวา บานออกเล็กน้อย
  for(const [x,y,z,sz] of lamps){const sp=new THREE.Sprite(hlM);sp.position.set(x,y,z);sp.scale.set(sz,sz,1);sp.renderOrder=3;g.add(sp);
   const a=Math.sign(z)*.06,b=new THREE.Mesh(bg,bmM);b.position.set(x0+Math.cos(a)*len/2,.09,z+Math.sin(a)*len/2);b.rotation.y=-a;b.renderOrder=2;g.add(b)}}
 // ---------- ลานโหลด ----------
 const xWH=wh.cx+wh.ex/2-4,topWH=1.0,BAYZ=[fc.z0-11.4,fc.z0-6.6],BAY=[null,null];   // ขอบแท่นโหลดโกดัง (x), ช่องเทียบท่า 2 ช่อง (z) — ใช้ร่วมกันทั้งรถบรรทุก/รถกระบะ/รถยก            // ขอบแท่นโหลดโกดัง (x), จุดรถยก / จุดจอดรถบรรทุก (z)
 const reg=(s,name)=>({name,d:s.z,fx:s.fx,top:s.sill,lo:s.z-14,hi:s.z+14,door:s});
 const R1=reg(SHUT[112.1],'P1'),R2=reg(SHUT[42],'P2'),YH=fc.z0+11;              // โซนเฟส 1 / เฟส 2 (±14 ม.) และโซนลานโกดัง (z < YH)
 const REG=[R1,R2];
 // ช่องประตูม้วนเปิดแล้วเห็นด้านในมืด (แผ่นมืดซ้อนหลังบานประตู)
 for(const r of REG){const s=r.door;mesh(new THREE.PlaneGeometry(s.w,s.h).rotateY(H),M(0x15181c,{roughness:1}),s.fx-.015,s.sill+s.h/2,s.z,false);s.k=0;s.n=0}
 // ---------- พาเลท + สินค้า ----------
 const palM=M(0xc49a62,{roughness:.9}),boxM=M(0xc9a777,{roughness:.85}),drM=M(0x1f5fd0,{roughness:.4}),
  wrapM=new THREE.MeshStandardMaterial({color:0xeef3f6,transparent:true,opacity:.3,roughness:.2,depthWrite:false});
 function pallet(kind){const g=new THREE.Group();
  for(const z of[-.47,0,.47])part(g,Bx(1.0,.1,.12),palM,0,.05,z);for(let i=0;i<5;i++)part(g,Bx(.16,.03,1.1),palM,-.42+i*.21,.115,0);   // ไม้รอง (ช่องสอดงา) + ไม้ปูบน
  const Q=[[-.24,-.27],[.24,-.27],[-.24,.27],[.24,.27]];
  if(kind)Q.forEach(([x,z])=>part(g,Cy(.24,.24,.85),drM,x,.555,z));                                                              // ถังน้ำเงิน 4 ถัง
  else{for(let k=0;k<2;k++)Q.forEach(([x,z])=>part(g,Bx(.46,.4,.52),boxM,x,.33+k*.41,z));part(g,Bx(.98,.84,1.08),wrapM,0,.55,0).castShadow=false}  // กล่องกระดาษ + ฟิล์มยืด
  scene.add(g);return g}
 // พาเลทพร้อมยกที่ขอบแท่นโหลดโกดัง (หยิบแล้วเติมใหม่ใน 8 วินาที)
 // พาเลทพร้อมยกที่ขอบแท่นโหลด ตรงช่องเทียบท่าละ 1 พาเลท (หยิบแล้วเติมใหม่ใน 8 วินาที)
 const WHP=BAYZ.map(z=>({g:null,t:0,z,place(){const g=pallet(Math.random()<.5?1:0);g.position.set(xWH-.5,topWH,this.z);g.rotation.y=Math.PI;this.g=g;g.scale.setScalar(.01)}}));WHP.forEach(w=>w.place());
 const SLIDE=[];                                                                                                                      // พาเลทที่วางแล้วเลื่อนเข้าอาคาร
 // ---------- รถยก ----------
 const orM=M(0xe8542a,{roughness:.45,metalness:.15}),dgM=M(0x4b4f56,{roughness:.6,metalness:.3}),lgM=M(0x8f9399,{roughness:.5,metalness:.3}),
  bkM=M(0x1d1f23,{roughness:.55,metalness:.4}),tyF=M(0x141517,{roughness:.95}),rimM=M(0x2b2d31,{metalness:.5,roughness:.5}),rlM=M(0xb01818,{roughness:.4});
 function forklift(){const g=new THREE.Group(),p=(ge,m,x,y,z,rx,ry,rz)=>part(g,ge,m,x,y,z,rx,ry,rz);
  const wF=Cy(.33,.33,.24,18).rotateX(H),wR=Cy(.27,.27,.2,16).rotateX(H),hF=Cy(.17,.17,.25,12).rotateX(H),hR=Cy(.13,.13,.21,12).rotateX(H);
  for(const s of[-1,1]){p(wF,tyF,.35,.33,s*.43);p(hF,rimM,.35,.33,s*.435);p(wR,tyF,-1.0,.27,s*.42);p(hR,rimM,-1.0,.27,s*.425)}       // ล้อยางตัน
  p(Bx(1.5,.45,.86),orM,-.4,.45,0);                                                                                                   // ตัวถังล่าง (ส้ม)
  p(Bx(.5,.62,1.1),orM,-1.22,.62,0);p(Bx(.56,.16,1.12),lgM,-1.2,1.0,0);                                                              // ถ่วงน้ำหนักท้าย (ส้ม) + ฝาบนสีเทา
  p(Bx(1.0,.32,.96),dgM,-.5,.84,0);p(Bx(.62,.06,.96),bkM,.12,.7,0);                                                                 // ฝาครอบแบตเตอรี่ + พื้นวางเท้า
  for(const s of[-1,1])p(Bx(.55,.22,.16),dgM,.33,.72,s*.47);p(Bx(.22,.5,.72),dgM,.38,.98,0);                                       // บังโคลนหน้า + คอนโซล
  p(Cy(.025,.025,.5,8),bkM,.25,1.3,0,0,0,.45);p(new THREE.TorusGeometry(.15,.022,6,18),bkM,.16,1.52,0,H,.5,0);                     // พวงมาลัย
  p(Bx(.46,.12,.5),bkM,-.52,1.06,0);p(Bx(.1,.48,.48),bkM,-.78,1.3,0,0,0,.18);                                                       // เบาะ
  // คนขับ: นั่งเบาะ มือจับพวงมาลัย เท้าวางพื้นรถ — เสื้อกั๊กสะท้อนแสง แถบเทา, กางเกงช่างสีกรม, รองเท้าเซฟตี้, หมวกนิรภัยสีขาว
  {const lg=(a,b,r,m)=>{const A=V(...a),B=V(...b),d=B.clone().sub(A),o=new THREE.Mesh(Cy(r,r*.9,d.length(),10),m);o.position.copy(A).add(B).multiplyScalar(.5);
    o.quaternion.setFromUnitVectors(V(0,1,0),d.normalize());o.castShadow=true;g.add(o)};
   const pnt=M(0x24324f,{roughness:.85}),vst=M(0xc6e02a,{roughness:.6}),rfl=M(0xc9ccd0,{metalness:.4,roughness:.3}),skn=M(0xc98f62,{roughness:.7}),shoe=M(0x1a1b1d,{roughness:.8}),hel=M(0xf4f4f2,{roughness:.35}),sl=M(0x3a4b6e,{roughness:.8});
   p(Bx(.3,.16,.36),pnt,-.5,1.2,0);                                                                                                   // สะโพก
   for(const s of[-1,1]){lg([-.45,1.2,s*.1],[-.02,1.21,s*.11],.075,pnt);lg([-.02,1.21,s*.11],[.08,.8,s*.12],.06,pnt);p(Bx(.24,.08,.11),shoe,.13,.77,s*.12)}   // ขา + รองเท้า
   p(Bx(.24,.5,.38),vst,-.55,1.5,0,0,0,.08);for(const y of[1.38,1.56])p(Bx(.25,.04,.39),rfl,-.55,y,0,0,0,.08);                     // ลำตัว: เสื้อกั๊ก + แถบสะท้อนแสง
   for(const s of[-1,1]){lg([-.54,1.68,s*.22],[-.32,1.43,s*.25],.05,sl);lg([-.32,1.43,s*.25],[.1,1.54,s*.13],.042,sl);p(new THREE.SphereGeometry(.045,8,6),skn,.12,1.55,s*.12)}   // แขนจับพวงมาลัย
   lg([-.55,1.75,0],[-.54,1.82,0],.05,skn);p(new THREE.SphereGeometry(.105,14,10),skn,-.53,1.88,0);                                  // คอ + ศีรษะ
   p(new THREE.SphereGeometry(.125,14,8,0,Math.PI*2,0,Math.PI/2),hel,-.53,1.91,0);p(Cy(.14,.14,.02,16),hel,-.51,1.91,0)}             // หมวกนิรภัย
  for(const s of[-1,1]){p(Bx(.06,1.25,.06),bkM,.36,1.55,s*.46);p(Bx(.07,1.15,.07),dgM,-1.05,1.62,s*.46);p(Bx(.04,.12,.08),rlM,-1.49,.85,s*.45)}  // เสาหลังคา + ไฟท้าย
  p(Bx(1.55,.05,1.0),bkM,-.33,2.2,0);                                                                                                 // หลังคากันของตก
  const bcn=new THREE.MeshStandardMaterial({color:0xff9a1a,emissive:0xff7a00,emissiveIntensity:.2});p(Cy(.07,.08,.12,12),bcn,-1.02,2.29,.38);  // ไฟหมุนสีส้ม
  for(const s of[-1,1]){p(Bx(.08,2.05,.1),bkM,.62,1.305,s*.33);p(Cy(.035,.035,.62,8),lgM,.47,.78,s*.4,0,0,-.9)}                    // เสากระโดงนอก + กระบอกเอียงเสา
  p(Bx(.08,.08,.74),bkM,.62,2.29,0);p(Bx(.08,.1,.74),bkM,.62,.4,0);
  const im=new THREE.Group();g.add(im);for(const s of[-1,1])part(im,Bx(.07,1.95,.08),bkM,.67,1.275,s*.26);part(im,Bx(.07,.08,.6),bkM,.67,2.21,0);   // เสากระโดงใน
  const cg=new THREE.Group();g.add(cg);                                                                                               // ชุดงายก (ขึ้น-ลง)
  part(cg,Bx(.08,.4,.95),bkM,.76,.25,0);for(let i=0;i<5;i++)part(cg,Bx(.03,.95,.03),bkM,.74,.85,-.42+i*.21);part(cg,Bx(.03,.03,.9),bkM,.74,1.32,0);
  for(const s of[-1,1]){part(cg,Bx(.05,.55,.1),bkM,.79,.275,s*.3);part(cg,Bx(1.07,.045,.1),bkM,1.335,.0225,s*.3)}                  // งา 2 ข้าง
  for(const s of[-1,1]){p(Bx(.1,.12,.12),bkM,.42,1.92,s*.46);p(Bx(.02,.09,.09),lampM,.48,1.92,s*.46)}                             // ไฟหน้าบนเสาหลังคา
  headlights(g,[[.52,1.92,.46,.55],[.52,1.92,-.46,.55]],6,1.5,1.0);
  cg.position.y=.15;scene.add(g);return {g,cg,im,bcn}}
 // ---------- รถบรรทุก ----------
 function truck(cab,cargo){const g=new THREE.Group(),p=(ge,m,x,y,z)=>part(g,ge,m,x,y,z);
  p(trG.cargo,M(cargo,{roughness:.5,metalness:.2}),-.88,2.25,0);p(trG.cab,M(cab,{metalness:.5,roughness:.3}),2.9,1.8,0);
  p(trG.ws,trGl,3.78,2.3,0);p(trG.sw,trGl,2.9,2.3,0);p(trG.chs,trD,0,.85,0);
  for(const wx of[-2.6,-1.4,2.9])for(const wz of[-1.05,1.05])p(trG.wh,trT,wx,.5,wz);
  for(const lz of[-.9,.9])p(trG.lp,trL,-3.72,1.3,lz);for(const lz of[-.8,.8])p(trG.lp,lampM,3.76,1.0,lz);headlights(g,[[3.86,1.0,.8,1.0],[3.86,1.0,-.8,1.0]],11,2.6,3.8);
  g.visible=false;scene.add(g);return g}
 // ---------- รถกระบะตอนเดียวติดตู้ของบริษัท (ตามรูปจริง): ตัวรถขาว ตู้ขาวขอบเหลือง สติกเกอร์ชมพู POLIPHARM ----------
 const pkSide=cv(1024,620,(g,w,h)=>{g.fillStyle='#ffffff';g.fillRect(0,0,w,h);
  const pk='#ec7fb3',pk2='#f6b9d4',th='"Leelawadee UI", "Noto Sans Thai", Tahoma, sans-serif';
  g.fillStyle=pk2;g.beginPath();g.moveTo(w*.62,0);g.bezierCurveTo(w*.7,h*.18,w*.9,h*.05,w,h*.22);g.lineTo(w,0);g.closePath();g.fill();                 // คลื่นชมพูมุมขวาบน
  g.fillStyle=pk;g.beginPath();g.moveTo(0,h*.62);g.bezierCurveTo(w*.18,h*.5,w*.3,h*.78,w*.52,h*.66);g.bezierCurveTo(w*.72,h*.55,w*.85,h*.7,w,h*.6);g.lineTo(w,h);g.lineTo(0,h);g.closePath();g.fill();   // คลื่นชมพูล่าง
  g.fillStyle='#d4569a';g.fillRect(0,h*.9,w,h*.1);g.fillStyle='#fff';g.font='600 30px "Segoe UI", Arial, sans-serif';g.textBaseline='middle';
  g.textAlign='left';g.fillText('POLIPHARM CO.,LTD.',24,h*.95);g.textAlign='center';g.fillText('☎ 02 316 9419',w*.52,h*.95);g.textAlign='right';g.fillText('www.polipharm.com',w-24,h*.95);
  g.fillStyle='#4a4a52';g.textAlign='left';g.font=`bold 50px ${th}`;g.fillText('"มีปัญหาเรื่องยา  ปรึกษาเภสัชกร"',30,h*.1);
  g.fillStyle=pk;g.font='bold 34px "Segoe UI", Arial, sans-serif';g.textAlign='right';g.fillText('POLI',w-40,h*.1);g.fillText('PHARM',w-40,h*.17);
  const cloud=(cx,cy,r,txt)=>{g.fillStyle='#fff';g.strokeStyle=pk;g.lineWidth=6;g.beginPath();for(let i=0;i<9;i++){const a=i/9*Math.PI*2;g.moveTo(cx+Math.cos(a)*r*1.25+r*.38,cy+Math.sin(a)*r*.75);g.arc(cx+Math.cos(a)*r*1.25,cy+Math.sin(a)*r*.75,r*.38,0,Math.PI*2)}
   g.stroke();g.fill();g.beginPath();g.ellipse(cx,cy,r*1.3,r*.8,0,0,Math.PI*2);g.fill();for(const [dx,dy,rr] of[[r*.3,r*1.15,9],[r*.5,r*1.45,6]]){g.beginPath();g.arc(cx+dx,cy+dy,rr,0,Math.PI*2);g.fill();g.stroke()}
   g.fillStyle='#d4569a';g.font=`bold 40px ${th}`;g.textAlign='center';g.fillText(txt,cx,cy+2)};
  cloud(w*.2,h*.33,78,'สบายดีไหม');cloud(w*.74,h*.38,78,'สบายดีแล้วจ้า');
  const mon=(cx,cy,s)=>{g.save();g.translate(cx,cy);g.scale(s,s);                                                            // ตัวการ์ตูนน่ารักสีฟ้า
   g.fillStyle='#9fdcf6';for(let i=-2;i<=2;i++){g.beginPath();g.moveTo(i*22-12,-78);g.lineTo(i*22,-104+Math.abs(i)*8);g.lineTo(i*22+12,-78);g.fill()}
   g.fillStyle='#7cc8ee';g.beginPath();g.ellipse(0,0,80,86,0,0,Math.PI*2);g.fill();g.fillStyle='#e6f7fd';g.beginPath();g.ellipse(0,34,48,42,0,0,Math.PI*2);g.fill();
   for(const sx of[-1,1]){g.fillStyle='#fff';g.beginPath();g.ellipse(sx*28,-26,17,19,0,0,Math.PI*2);g.fill();g.fillStyle='#1b2433';g.beginPath();g.arc(sx*28,-23,9,0,Math.PI*2);g.fill()}
   g.fillStyle='#b8324a';g.beginPath();g.ellipse(0,8,30,22,0,0,Math.PI);g.fill();g.fillStyle='#f58aa6';g.beginPath();g.ellipse(0,20,16,9,0,0,Math.PI*2);g.fill();
   g.fillStyle='#7cc8ee';for(const sx of[-1,1]){g.beginPath();g.ellipse(sx*78,24,16,26,sx*.5,0,Math.PI*2);g.fill()}g.restore()};
  mon(w*.42,h*.7,1.05);mon(w*.66,h*.72,.9)});
 const pkBack=cv(512,460,(g,w,h)=>{g.fillStyle='#ffffff';g.fillRect(0,0,w,h);const th='"Leelawadee UI", Tahoma, sans-serif',pk='#ec7fb3';
  g.fillStyle=pk;g.beginPath();g.moveTo(0,h*.78);g.bezierCurveTo(w*.3,h*.68,w*.6,h*.86,w,h*.74);g.lineTo(w,h);g.lineTo(0,h);g.closePath();g.fill();
  g.fillStyle='#4a4a52';g.font=`bold 30px ${th}`;g.textAlign='center';g.textBaseline='middle';g.fillText('มีปัญหาเรื่องยา',w*.27,h*.1);g.fillText('ปรึกษาเภสัชกร',w*.27,h*.19);
  g.fillStyle=pk;g.font='bold 34px "Segoe UI", Arial';g.fillText('POLIPHARM',w*.74,h*.12);g.fillStyle='#4a4a52';g.font='24px "Segoe UI", Arial';g.fillText('☎ 02 316 9419',w*.74,h*.21);
  for(const [x,t] of[[.27,'สบายดีไหม'],[.74,'สบายดีแล้วจ้า']]){g.fillStyle='#fff';g.strokeStyle=pk;g.lineWidth=5;g.beginPath();g.ellipse(w*x,h*.4,w*.2,h*.08,0,0,Math.PI*2);g.fill();g.stroke();g.fillStyle='#d4569a';g.font=`bold 28px ${th}`;g.fillText(t,w*x,h*.4)}
  for(const x of[.27,.74]){g.fillStyle='#7cc8ee';g.beginPath();g.ellipse(w*x,h*.64,52,56,0,0,Math.PI*2);g.fill();g.fillStyle='#fff';for(const sx of[-1,1]){g.beginPath();g.arc(w*x+sx*18,h*.6,11,0,Math.PI*2);g.fill()}
   g.fillStyle='#1b2433';for(const sx of[-1,1]){g.beginPath();g.arc(w*x+sx*18,h*.61,6,0,Math.PI*2);g.fill()}g.fillStyle='#b8324a';g.beginPath();g.ellipse(w*x,h*.67,18,13,0,0,Math.PI);g.fill()}
  g.strokeStyle='#9aa0a8';g.lineWidth=4;g.beginPath();g.moveTo(w/2,0);g.lineTo(w/2,h);g.stroke();                                   // ร่องประตูคู่
  g.fillStyle='#fff';g.font='600 20px "Segoe UI", Arial';g.textAlign='left';g.fillText('POLIPHARM CO.,LTD.',16,h*.94);g.textAlign='right';g.fillText('www.polipharm.com',w-16,h*.94)});
 const pkDoor=cv(256,128,(g,w,h)=>{g.fillStyle='#ffffff';g.fillRect(0,0,w,h);g.fillStyle='#ec7fb3';g.font='bold 40px "Segoe UI", Arial';g.textAlign='center';g.textBaseline='middle';g.fillText('POLI',w/2,h*.33);g.fillText('PHARM',w/2,h*.72)});
 for(const t of[pkSide,pkBack,pkDoor])t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;
 const pkWh=M(0xf4f5f3,{roughness:.35,metalness:.25}),pkBx=M(0xf7f7f5,{roughness:.5}),pkYl=M(0xf2b51c,{roughness:.5}),pkGl=M(0x1c2530,{roughness:.1,metalness:.6}),
  pkBk=M(0x232527,{roughness:.6}),pkTy=M(0x161718,{roughness:.95}),pkRm=M(0xc4c8cc,{metalness:.7,roughness:.3}),pkTl=M(0xd42b2b,{emissive:0x550000}),
  pkSM=new THREE.MeshStandardMaterial({map:pkSide,roughness:.45}),pkBM=new THREE.MeshStandardMaterial({map:pkBack,roughness:.45}),pkDM=new THREE.MeshStandardMaterial({map:pkDoor,roughness:.4});
 function pickup(){const g=new THREE.Group(),p=(ge,m,x,y,z,rx,ry,rz)=>part(g,ge,m,x,y,z,rx,ry,rz);
  const wh=Cy(.36,.36,.26,18).rotateX(H),rim=Cy(.22,.22,.27,12).rotateX(H);
  for(const x of[1.55,-1.45])for(const s of[-1,1]){p(wh,pkTy,x,.36,s*.78);p(rim,pkRm,x,.36,s*.79)}                                // ล้อ
  p(Bx(5.0,.22,1.6),pkBk,-.05,.5,0);                                                                                                // แชสซี
  p(Bx(1.05,.5,1.76),pkWh,2.0,.82,0);p(Bx(.12,.28,.86),pkBk,2.54,.82,0);p(Bx(.1,.16,1.8),pkBk,2.55,.5,0);                            // ฝากระโปรง + กระจังหน้า + กันชน
  p(Bx(1.2,.72,1.76),pkWh,.95,1.0,0);p(Bx(1.0,.62,1.66),pkWh,.85,1.68,0);                                                         // ห้องโดยสาร
  p(Bx(.06,.56,1.5),pkGl,1.42,1.64,0,0,0,.5);for(const s of[-1,1]){p(Bx(.7,.42,.02),pkGl,.88,1.7,s*.835);p(new THREE.PlaneGeometry(.5,.25),pkDM,1.05,1.08,s*.882,0,s>0?0:Math.PI,0)}  // กระจก + โลโก้ประตู
  for(const s of[-1,1]){p(Bx(.08,.17,.34),pkBk,2.53,.92,s*.66);p(Bx(.03,.13,.3),lampM,2.585,.92,s*.66);p(Bx(.1,.08,.12),pkBk,1.25,1.5,s*.93)}                             // ไฟหน้าซ้าย-ขวา + กระจกข้าง
  p(Bx(2.8,1.72,1.9),pkBx,-1.15,1.82,0);                                                                                            // ตู้ทึบ
  for(const s of[-1,1])p(new THREE.PlaneGeometry(2.76,1.68),pkSM,-1.15,1.82,s*.952,0,s>0?0:Math.PI,0);                             // สติกเกอร์ข้างตู้
  p(new THREE.PlaneGeometry(1.86,1.68),pkBM,-2.552,1.82,0,0,-H,0);                                                                  // สติกเกอร์ท้ายตู้
  for(const [y,z] of[[2.69,.9],[2.69,-.9],[.97,.9],[.97,-.9]])p(Bx(2.84,.07,.07),pkYl,-1.15,y,z);for(const x of[-2.56,.26])for(const s of[-1,1])p(Bx(.07,1.76,.07),pkYl,x,1.82,s*.93);   // ขอบตู้สีเหลือง
  p(Bx(.12,.16,1.8),pkBk,-2.6,.6,0);for(const s of[-1,1])p(Bx(.04,.2,.22),pkTl,-2.62,.82,s*.72);                                   // กันชนท้าย + ไฟท้าย
  headlights(g,[[2.66,.92,.66,.75],[2.66,.92,-.66,.75]],9,2.2,2.55);
  g.visible=false;scene.add(g);return g}
 // ---------- เส้นทาง ----------
 const P=(x,z)=>({x,z});
 function Path(x,z){const pts=[P(x,z)],last=()=>pts[pts.length-1],o={pts,
  to(x2,z2){const a=last(),n=Math.max(1,Math.ceil(Math.hypot(x2-a.x,z2-a.z)/.3));for(let i=1;i<=n;i++)pts.push(P(a.x+(x2-a.x)*i/n,a.z+(z2-a.z)*i/n));return o},
  arc(cx,cz,a0,a1){const a=last(),R=Math.hypot(a.x-cx,a.z-cz),n=Math.max(2,Math.ceil(Math.abs(a1-a0)*R/.3));for(let i=1;i<=n;i++){const t=a0+(a1-a0)*i/n;pts.push(P(cx+R*Math.cos(t),cz+R*Math.sin(t)))}return o},
  shift(x2,z2){const a=last(),n=Math.max(2,Math.ceil(Math.hypot(x2-a.x,z2-a.z)/.3));for(let i=1;i<=n;i++){const t=i/n,s=(1-Math.cos(Math.PI*t))/2;pts.push(P(a.x+(x2-a.x)*s,a.z+(z2-a.z)*t))}return o}};return o}
 // ---------- คิวเข้าโซน ----------
 const LOCK={},LQ={};
 const want=(V,n)=>{if(LOCK[n]===V)return true;const q=LQ[n]||(LQ[n]=[]);if(!q.includes(V))q.push(V);if(!LOCK[n]&&q[0]===V){LOCK[n]=V;q.shift();return true}return false};
 const free=(V,n)=>{if(LOCK[n]===V)LOCK[n]=null};
 const unq=(V,n)=>{const q=LQ[n];if(q){const i=q.indexOf(V);if(i>=0)q.splice(i,1)}};
 // จุดที่จะออกจากโซนต้องว่างก่อนจึงขอคิวเข้าโซน (กันรถถือคิวโซนแล้วออกไม่ได้เพราะมีคันจอดรอคิวโซนถัดไปขวาง)
 const laneFree=(V,x,z)=>VEH.every(O=>O===V||O.ghost||Math.abs(O.x-x)>1.6||Math.abs(O.z-z)>7.5);
 // ---------- กรอบรถ (OBB) ----------
 const obb=(V,x,z,h,m,mw=m)=>{const c=Math.cos(h),s=Math.sin(h),o=(V.fx+V.rx)/2;return {x:x+c*o,z:z+s*o,ux:c,uz:s,hl:(V.fx-V.rx)/2+m,hw:V.hw+mw}};   // m = ระยะเผื่อหน้า-หลัง, mw = ด้านข้าง
 const hit=(a,b)=>{const dx=b.x-a.x,dz=b.z-a.z;for(const [ux,uz] of[[a.ux,a.uz],[-a.uz,a.ux],[b.ux,b.uz],[-b.uz,b.ux]]){
  const ra=a.hl*Math.abs(ux*a.ux+uz*a.uz)+a.hw*Math.abs(-ux*a.uz+uz*a.ux),rb=b.hl*Math.abs(ux*b.ux+uz*b.uz)+b.hw*Math.abs(-ux*b.uz+uz*b.ux);
  if(Math.abs(dx*ux+dz*uz)>ra+rb)return false}return true};
 // ---------- ตัวรถ + ตัวรันแผน ----------
 const VEH=[];
 function Veh(kind,g,ext,prog){const V={kind,g,...ext,x:0,z:0,h:0,v:0,cur:null,ghost:false,blk:null,blkT:0,id:VEH.length};V.gen=prog(V);VEH.push(V);return V}
 const go=(path,o={})=>({t:'go',pts:path.pts,...o}),lock=(n,cond)=>({t:'lock',n,cond}),wait=d=>({t:'wait',d}),act=f=>({t:'do',f}),fork=h=>({t:'fork',h}),until=f=>({t:'until',f});
 function poseAt(st,s){const L=st.L,pts=st.pts;s=Math.max(0,Math.min(st.len,s));let i=st.i;while(i>0&&L[i]>s)i--;while(i<L.length-2&&L[i+1]<s)i++;st.i=i;
  const a=pts[i],b=pts[i+1],t=L[i+1]>L[i]?(s-L[i])/(L[i+1]-L[i]):0;return P(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t)}
 function headAt(st,s){const w=Math.min(.7,st.len),s0=Math.max(0,Math.min(st.len-w,s-w/2)),a=poseAt(st,s0),b=poseAt(st,s0+w);let h=Math.atan2(b.z-a.z,b.x-a.x);if(st.rev)h+=Math.PI;return h}   // ทิศรถจากเส้นทางช่วง ±0.35 ม. (ชิดปลายทางก็ยังได้ทิศถูก)
 function setPose(V){V.g.position.set(V.x,Y0,V.z);V.g.rotation.y=-V.h}
 function step(V,dt){
  if(!V.cur){const n=V.gen.next();if(n.done)return;const st=V.cur=n.value;
   if(st.t==='go'){st.L=[0];for(let i=1;i<st.pts.length;i++)st.L.push(st.L[i-1]+Math.hypot(st.pts[i].x-st.pts[i-1].x,st.pts[i].z-st.pts[i-1].z));st.len=st.L[st.L.length-1];st.s=0;st.i=0}
   if(st.t==='wait')st.left=st.d}
  const st=V.cur;
  if(st.t==='do'){st.f();V.cur=null;return}
  if(st.t==='wait'){V.v=0;if((st.left-=dt)<=0)V.cur=null;return}
  if(st.t==='until'){V.v=0;if(st.f())V.cur=null;return}
  if(st.t==='lock'){V.v=0;if(LOCK[st.n]!==V&&st.cond&&!st.cond()){unq(V,st.n);return}if(want(V,st.n))V.cur=null;return}
  if(st.t==='fork'){V.v=0;const c=V.cg.position,d=st.h-c.y,sp=.45*dt;c.y=Math.abs(d)<=sp?st.h:c.y+Math.sign(d)*sp;V.im.position.y=Math.max(0,c.y-1.0);if(c.y===st.h)V.cur=null;return}
  // go
  if(st.acq&&LOCK[st.acq]!==V&&st.cond&&!st.cond()){unq(V,st.acq);V.v=0;return}
  if(st.acq&&!want(V,st.acq)){V.v=0;return}
  const vmax=Math.min(st.v,Math.sqrt(2*V.dec*Math.max(0,st.len-st.s))+.25);
  const look=.6+V.v*V.v/(2*V.dec)+V.v*.4,sl=st.s+look,pa=poseAt(st,sl),ha=headAt(st,sl),A=obb(V,pa.x,pa.z,ha,.35,.12);
  let blk=null;for(const O of VEH){if(O===V||O.ghost)continue;if(hit(A,obb(O,O.x,O.z,O.h,.35,.12))){blk=O;break}}
  V.blk=blk;V.blkT=blk?V.blkT+dt:0;
  if(blk)V.v=0;else V.v=V.v<vmax?Math.min(vmax,V.v+V.acc*dt):Math.max(vmax,V.v-V.dec*dt);
  st.s=Math.min(st.len,st.s+V.v*dt);const p=poseAt(st,st.s);V.x=p.x;V.z=p.z;V.h=headAt(st,st.s);setPose(V);
  if(st.s>=st.len-1e-6){if(st.rel)free(V,st.rel);V.cur=null}}
 // ---------- เดินทางตามเลน (ผ่านโซนต้องได้คิว) ----------
 function* travel(V,dir,z1,v){const x=dir<0?LN:LS;let z=V.z;
  for(const r of dir<0?[R1,R2]:[R2,R1]){
   if(dir<0&&z>r.hi&&z1<r.lo){if(z>r.hi+4)yield go(Path(V.x,V.z).to(x,r.hi+4),{v});yield go(Path(V.x,V.z).to(x,r.lo-4),{v,acq:r.name,rel:r.name,cond:()=>laneFree(V,x,r.lo-4)});z=r.lo-4}
   if(dir>0&&z<r.lo&&z1>r.hi){if(z<r.lo-4)yield go(Path(V.x,V.z).to(x,r.lo-4),{v});yield go(Path(V.x,V.z).to(x,r.hi+4),{v,acq:r.name,rel:r.name,cond:()=>laneFree(V,x,r.hi+4)});z=r.hi+4}}
  if(Math.abs(V.z-z1)>.01)yield go(Path(V.x,V.z).to(x,z1),{v})}
 // ---------- ประตูม้วน ----------
 const door=(r,o)=>act(()=>{r.door.n+=o?1:-1});
 // ---------- แผนรถยก ----------
 function* forkWH(V){                                                                                 // ตักพาเลทที่ลานโหลดโกดัง ใช้ช่องเทียบท่าเดียวกับรถ (เริ่มที่จุดรอ LN, YH+4 หันขึ้นเหนือ)
  yield* takeBay(V,()=>laneFree(V,LS,YH+4));                                                          // จองช่องว่าง + คิวลาน (ถือไว้จนออกจากลาน)
  const XA=LN-3,xd=xWH+1.35,z=BAYZ[V.bay],R=LS-XA,w=WHP[V.bay];
  yield go(Path(V.x,V.z).to(LN,z+3),{v:3});
  yield go(Path(V.x,V.z).arc(XA,z+3,0,-H).to(xd+2,z),{v:1.8});
  yield until(()=>w.g&&w.g.scale.x>=1);yield fork(topWH-Y0+.03);
  yield go(Path(V.x,V.z).to(xd,z),{v:.5});
  yield act(()=>{V.cg.attach(w.g);V.load=w.g;w.g=null;w.t=8});yield fork(topWH-Y0+.13);
  yield go(Path(V.x,V.z).to(xd+2,z),{v:.5,rev:true});yield fork(.2);
  yield go(Path(V.x,V.z).to(XA,z),{v:1.6,rev:true});
  yield go(Path(V.x,V.z).arc(XA,z-R,H,0),{v:1.4,rev:true});
  yield act(()=>{BAY[V.bay]=null;V.bay=-1});
  yield go(Path(V.x,V.z).to(LS,YH+4),{v:3,rel:'YARD'})}
 function* forkP(V,r){                                                                                 // ส่งพาเลทที่ลานโหลดเฟส (เริ่มที่จุดรอ LS, r.lo-4 หันลงใต้)
  const d=r.d,xd=r.fx+1.02,xa=LS-4;
  yield go(Path(V.x,V.z).to(LS,d-4),{v:3,acq:r.name,cond:()=>laneFree(V,LN,r.lo-4)});
  yield go(Path(V.x,V.z).arc(xa,d-4,0,H),{v:1.5});
  yield door(r,1);yield until(()=>r.door.k>=1);yield fork(r.top-Y0+.13);
  yield go(Path(V.x,V.z).to(xd,d),{v:.5});
  yield fork(r.top-Y0+.03);yield act(()=>{if(V.load){scene.attach(V.load);V.load.position.y=r.top;SLIDE.push({g:V.load,t:4.5,dx:Math.cos(V.h)*.55,dz:Math.sin(V.h)*.55});V.load=null}});
  yield fork(r.top-Y0-.03);
  yield go(Path(V.x,V.z).to(xa,d),{v:.5,rev:true});yield door(r,0);yield fork(.15);
  yield go(Path(V.x,V.z).arc(xa,d+1,-H,0),{v:.8,rev:true});
  yield go(Path(V.x,V.z).to(LN,r.lo-4),{v:3,rel:r.name})}
 function forkProg(r,first){return function*(V){
  if(first==='P'){yield* travel(V,1,r.lo-4,3.2);yield* forkP(V,r)}
  while(true){yield* travel(V,-1,YH+4,3.2);yield* forkWH(V);yield* travel(V,1,r.lo-4,3.2);yield* forkP(V,r)}}}
 // ---------- แผนรถบรรทุก ----------
 const ZE=MRZ-2,ZG=TOTAL+14;                                                                            // เลนขาเข้า/ออกบนถนนหน้าโรงงาน, จุดเลี้ยวที่ประตู
 // ---------- เทียบท่าลานโหลดโกดัง 2 ช่อง: จอดรับสินค้าพร้อมกันได้ 2 คัน แต่ถอยเข้า/ออกได้ทีละคัน (คิว 'YARD' เฉพาะตอนเคลื่อนที่)
 function* takeBay(V,cond){                                                                             // ได้คิวลาน + จองช่องว่าง (ถ้าเต็มให้ปล่อยคิวแล้วรอ)
  while(true){yield until(()=>BAY.some(o=>!o));yield lock('YARD',cond);const b=BAY.findIndex(o=>!o);if(b>=0){BAY[b]=V;V.bay=b;return}free(V,'YARD')}}
 function* dockWH(V,fromS){                                                                             // fromS: มาจากเลนขาออก (LS) หันลงใต้ (รถกระบะจากที่จอด) / ไม่ใช่: มาจากเลน LN หันขึ้นเหนือ
  const z=BAYZ[V.bay],xe=xWH+.1-V.rx;                                                                    // ท้ายรถห่างขอบแท่น 10 ซม.
  if(fromS){const xa=xe+1,R=LS-xa,zs=z+R;yield go(Path(V.x,V.z).to(LS,zs),{v:3});yield go(Path(V.x,V.z).arc(xa,zs,0,-H),{v:1.5,rev:true})}
  else{const xa=xe+1,R=LN-xa,zs=z-R;yield go(Path(V.x,V.z).to(LN,zs),{v:4});yield go(Path(V.x,V.z).arc(xa,zs,0,H),{v:1.6,rev:true})}
  yield go(Path(V.x,V.z).to(xe,z),{v:.6,rev:true});
  yield act(()=>free(V,'YARD'));                                                                        // ถอยเทียบเสร็จ → คันอื่นเข้าช่องที่เหลือได้
  yield wait(V.dwell);                                                                                   // เวลาขนสินค้าตามขนาดรถ
  yield lock('YARD',()=>laneFree(V,LS,YH+4));
  yield go(Path(V.x,V.z).to(LS-4,z).arc(LS-4,z+4,-H,0),{v:2.2});
  yield act(()=>{BAY[V.bay]=null;V.bay=-1});
  yield go(Path(V.x,V.z).to(LS,YH+4),{v:4,rel:'YARD'})}
 function* truckWH(V){yield* takeBay(V);yield* dockWH(V,false)}                                        // รถหกล้อ: จากจุดรอ LN, YH+4
 function* truckP(V,r){                                                                                // ถอยเทียบท่าลานโหลดเฟส (ท้ายรถชิดยางกันชน) (เริ่มที่จุดรอ LN, r.hi+4)
  const d=r.d,xe=r.fx+.25+3.75,Rr=3.5;
  yield go(Path(V.x,V.z).to(LN,d+10),{v:3.5,acq:r.name});
  yield go(Path(V.x,V.z).shift(xe+Rr,d-Rr),{v:2});
  yield door(r,1);yield go(Path(V.x,V.z).arc(xe,d-Rr,0,H),{v:1.2,rev:true});
  yield wait(15);yield door(r,0);
  yield go(Path(V.x,V.z).arc(xe,d+(LS-xe),-H,0),{v:1.8});
  yield go(Path(V.x,V.z).to(LS,r.hi+4),{v:4,rel:r.name})}
 function* gateIn(V){                                                                                  // เข้าประตูหน้า (จากถนนด้านหน้า) ถึงจุด LN, ZG-12
  yield until(()=>{if(!VEH.every(O=>O===V||O.ghost||Math.hypot(O.x+230,O.z-ZE)>25))return false;          // รอจุดเริ่มว่าง แล้วปล่อยรถทันทีในขั้นเดียวกัน (กันปล่อยพร้อมกัน 2 คัน)
   V.x=-230;V.z=ZE;V.h=0;V.ghost=false;V.g.visible=true;setPose(V);return true});
  yield go(Path(V.x,V.z).to(LN-16,ZE),{v:9});                                                        // รอคิวเลี้ยวเข้าประตู (เลี้ยวเข้า-ออกได้ทีละคัน)
  yield go(Path(V.x,V.z).to(LN-6,ZE).arc(LN-6,ZE-6,H,0).to(LN,ZG),{v:3.5,acq:'GATE'});
  yield go(Path(V.x,V.z).to(LN,ZG-12),{v:5,rel:'GATE'})}
 function* gateOut(V,idle){                                                                             // จากเลนขาออก → ออกประตูหน้า → ไปส่งของข้างนอก (ซ่อนรถ) idle วินาที
  yield* travel(V,1,ZG-12,5);
  yield go(Path(V.x,V.z).to(LS,ZE-6).arc(LS+6,ZE-6,Math.PI,H),{v:3.5,acq:'GATE'});
  yield go(Path(V.x,V.z).to(LS+20,ZE),{v:6,rel:'GATE'});
  yield go(Path(V.x,V.z).to(250,ZE),{v:9});
  yield act(()=>{V.ghost=true;V.g.visible=false});yield wait(idle[0]+Math.random()*(idle[1]-idle[0]))}
 function truckProg(seq,delay,idle=[20,45]){return function*(V){let k=0;yield wait(delay);
  while(true){const tg=seq[k++%seq.length];yield* gateIn(V);
   if(tg==='WH'){yield* travel(V,-1,YH+4,5);yield* truckWH(V)}else{yield* travel(V,-1,R2.hi+4,5);yield* truckP(V,R2)}
   yield* gateOut(V,idle)}}}
 // ---------- รถกระบะบริษัท: จอดรอเรียงคิวบนถนนข้างโกดัง เลนฝั่งตะวันออก หันหน้าไปทางป้อม รปภ. (ทิศใต้) ห่างกัน 3 ม.
 //  คันหน้าสุดของคิวออกก่อน (เมื่อลานโหลดมีช่องว่าง) → วิ่งตรงเลยลานโหลดแล้วถอยโค้งเข้าเทียบช่องจอด รับสินค้า → ออกประตูหน้าไปส่ง
 //  → กลับเข้ามาทางเลนฝั่งโกดัง (ผ่านข้างแถวจอด) → กลับรถ 3 จังหวะเลยแถวจอดไปทางเหนือ → วิ่งลงมาจอดต่อท้ายคิว
 //  คันในคิวขยับตามขึ้นมาเองเมื่อคันหน้าออกไป | คิว: ลานโกดัง 'YARD', จุดกลับรถ 'KT' (ทีละคัน)
 const PKL=5.32,SPOTZ=[0,1,2,3].map(i=>gz0-12-i*(PKL+3)),PQ=[];                                       // ช่องจอด (z) เรียงจากใกล้ลานโหลด
 function* pickupReturn(V){                                                                             // จาก LN, YH+4 (หันขึ้นเหนือ) → กลับรถ → เข้าคิว
  yield go(Path(V.x,V.z).to(LN,SPOTZ[0]+2.5),{v:4,acq:'YARD',rel:'YARD'});                             // ผ่านเขตลานโหลด (ถือคิวลานชั่วคราว)
  const zk=SPOTZ[2]-9.5;                                                                                // จุดกลับรถ เลยแถวจอดไปทางเหนือ
  yield go(Path(V.x,V.z).to(LN,zk+8),{v:4});
  yield go(Path(V.x,V.z).to(LN,zk).arc(LN+2.2,zk,Math.PI,1.5*Math.PI),{v:2,acq:'KT'});                 // จังหวะ 1: เดินหน้าเลี้ยวขวา
  yield go(Path(V.x,V.z).arc(V.x,V.z-2.2,H,Math.PI),{v:1.2,rev:true});                                // จังหวะ 2: ถอยเลี้ยว หันหัวลงใต้
  yield act(()=>PQ.push(V));
  yield go(Path(V.x,V.z).shift(LS,zk+6),{v:2,rel:'KT'})}                                              // จังหวะ 3: เดินหน้าเข้าเลนฝั่งจอด
 function pickupProg(delay){return function*(V){yield wait(delay);
  while(true){
   while(true){const i=PQ.indexOf(V);                                                                 // ขยับตามคิวให้ถึงช่องของตัวเอง
    if(Math.abs(V.z-SPOTZ[i])>.05||Math.abs(V.x-LS)>.05){yield go(Path(V.x,V.z).to(LS,SPOTZ[i]),{v:2.5});continue}
    if(i===0)break;yield until(()=>PQ.indexOf(V)!==i)}
   yield wait(4+Math.random()*6);
   yield* takeBay(V);yield act(()=>PQ.splice(PQ.indexOf(V),1));                                        // ได้คิวลาน + ช่องว่าง → ออกจากคิวจอด (คันหลังขยับตาม)
   yield* dockWH(V,true);
   yield* gateOut(V,[50,110]);
   yield* gateIn(V);yield* travel(V,-1,YH+4,5);
   yield* pickupReturn(V)}}}
 // ---------- สร้างรถ ----------
 const FX={fx:1.9,rx:-1.5,hw:.56,acc:1.2,dec:2.5},TX={fx:3.8,rx:-3.75,hw:1.25,acc:1.0,dec:2.5,dwell:30},PX={fx:2.68,rx:-2.64,hw:.96,acc:1.3,dec:2.8,dwell:15};   // dwell = เวลาขนสินค้า (วินาที) ตามขนาดรถ
 [[R1,LN,YH+30,-H,'WH'],[R2,LS,YH+20,H,'P']].forEach(([r,x,z,h,first])=>{const f=forklift(),V=Veh('fork',f.g,FX,forkProg(r,first));Object.assign(V,{cg:f.cg,im:f.im,bcn:f.bcn,x,z,h});setPose(V)});
 [[0x2f6b4a,0xdcdfe3,['WH'],2],[0x1f4fa8,0xf3f3f1,['WH'],38]].forEach(([c1,c2,seq,dl])=>{const V=Veh('truck',truck(c1,c2),TX,truckProg(seq,dl));V.ghost=true});
 [0,1,2].forEach(i=>{const V=Veh('truck',pickup(),PX,pickupProg(6));V.sub='pickup';PQ.push(V);Object.assign(V,{x:LS,z:SPOTZ[i],h:H});V.g.visible=true;setPose(V)});   // รถกระบะบริษัท 3 คัน เริ่มจอดเรียงคิวที่ถนนข้างโกดัง หันหน้าไปทางป้อม รปภ.
 // ---------- อัปเดตทุกเฟรม ----------
 let T=0;
 function update(dt){T+=dt;hlM.opacity=NIGHTK*.95;bmM.opacity=NIGHTK*.42;hlM.visible=bmM.visible=NIGHTK>.02;
  for(const V of VEH)step(V,dt);
  for(const V of VEH)if(V.bcn)V.bcn.emissiveIntensity=V.v>.05?((T*2.5)%1<.5?2.2:.15):.15;                     // ไฟหมุนกระพริบขณะเคลื่อนที่
  for(const w of WHP){if(!w.g){if((w.t-=dt)<=0)w.place()}else if(w.g.scale.x<1)w.g.scale.setScalar(Math.min(1,w.g.scale.x+dt*1.5))}
  for(let i=SLIDE.length-1;i>=0;i--){const s=SLIDE[i];s.g.position.x+=s.dx*dt;s.g.position.z+=s.dz*dt;if((s.t-=dt)<=0){scene.remove(s.g);SLIDE.splice(i,1)}}
  for(const r of REG){const s=r.door,tk=s.n>0?1:0;s.k=tk>s.k?Math.min(1,s.k+dt*.6):Math.max(0,s.k-dt*.6);const f=1-.93*s.k;s.m.scale.y=f;s.m.position.y=s.sill+s.h-s.h*f/2}
  if(GATE.arm){let open=false;for(const V of VEH)if(V.kind==='truck'&&!V.ghost&&Math.hypot(V.x-rdX,V.z-GATE.z)<14)open=true;
   const a=GATE.arm.rotation,tg=open?1.45:0;a.z+=Math.sign(tg-a.z)*Math.min(Math.abs(tg-a.z),dt*1.2)}}
 return {update,VEH,LOCK}})();
// ตัวเลขมิเตอร์ (ค่าจำลอง — เรียก api.setMeter() เพื่อใส่ค่าจริง)
function setMeter(kind,value,unit){const m=METERS[kind];if(!m)return;if(unit)m.unit=unit;m.last=value;const AL=m.al&&m.al.on;
 if(m.lv&&typeof value==='number')m.lv(value/100);
 const v=typeof value==='number'?value.toLocaleString('en-US',m.unit==='%'?{minimumFractionDigits:1,maximumFractionDigits:1}:{maximumFractionDigits:2}):String(value),H=128,P=40,GAP=14,fV='700 56px "Segoe UI", system-ui, sans-serif',fU='600 32px "Segoe UI", system-ui, sans-serif',DOT=30;
 const mg=(m.c||document.createElement('canvas')).getContext('2d');mg.font=fV;const vw=mg.measureText(v).width;mg.font=fU;const uw=mg.measureText(m.unit).width;
 const W=Math.ceil(DOT+vw+GAP+uw+P*2+28);                                                       // ความกว้างกรอบพอดีกับข้อความ
 if(!m.c||m.c.width!==W){const c=document.createElement('canvas');c.width=W;c.height=H;const tx=new THREE.CanvasTexture(c);tx.colorSpace=THREE.SRGBColorSpace;tx.anisotropy=8;
  if(m.tx)m.tx.dispose();m.c=c;m.tx=tx;m.lb.material.map=tx;m.lb.material.needsUpdate=true;m.lb.userData.ar=W/H}
 const g=m.c.getContext('2d');g.clearRect(0,0,W,H);
 const rr=()=>{g.beginPath();g.roundRect?g.roundRect(14,14,W-28,H-28,(H-28)/2):g.rect(14,14,W-28,H-28)};
 g.save();g.shadowColor=AL?'rgba(255,0,0,.75)':'rgba(15,23,42,.3)';g.shadowBlur=AL?22:12;g.shadowOffsetY=AL?0:5;g.fillStyle=AL?'#ff2a2a':'rgba(255,255,255,.96)';rr();g.fill();g.restore();   // ป้ายขาวมินิมอล ขอบสีตามไอคอน (alarm: พื้นแดงสว่าง)
 g.lineWidth=4;g.strokeStyle=AL?'#fff1f1':m.neon;rr();g.stroke();
 const x0=(W-(DOT+vw+GAP+uw))/2+DOT;g.textBaseline='middle';g.textAlign='left';g.fillStyle=AL?'#ffffff':m.neon;g.beginPath();g.arc(x0-DOT+9,H/2,9,0,Math.PI*2);g.fill();                        // ตัวเลข + หน่วย จัดกึ่งกลางกรอบ
 g.fillStyle=AL?'#ffffff':'#1e293b';g.font=fV;g.fillText(v,x0,H/2+3);
 g.font=fU;g.fillStyle=AL?'#ffe4e4':'#64748b';g.fillText(m.unit,x0+vw+GAP,H/2+4);m.tx.needsUpdate=true}
// แจ้งเตือน: พื้นหลังไอคอน + ป้ายตัวเลขเป็นสีแดงสว่าง และกะพริบวูบวาบ (ทำใน loop)
function setAlarm(kind,on){const m=METERS[kind];if(!m||!m.al||m.al.on===!!on)return;m.al.on=!!on;m.rd();setMeter(kind,m.last,m.unit)}
setMeter('water',12845.6,'m³');setMeter('power',98432,'kWh');[412530,287640,356210,198870,243905].forEach((v,i)=>setMeter('tr'+(i+1),v,'kWh'));
setMeter('tank14',78.5,'%');setMeter('pool',71.3,'%');setMeter('b5tank',64.2,'%');setMeter('pump',82.0,'%');setMeter('b5chiller',154320,'kWh');setMeter('chiller',87650,'kWh');setMeter('cda',63210,'kWh');
let sel=null,goal=null;
function hlClear(){for(const o of HLM[hlOn]||[])if(o.userData.m0){o.material=o.userData.m0;delete o.userData.m0}hlC.forEach(c=>c.dispose());hlC=[];hlOn=null}
function hlApply(id){hlClear();const L=HLM[id];if(!L)return;hlOn=id;hlNight=isNight;const cache=new Map();
 const tw=m=>{if(cache.has(m))return cache.get(m);const c=m.clone();
  if(isNight){if(c.emissive){c.emissive.add(_hc.copy(m.color).multiplyScalar(.55));c.emissiveIntensity=Math.max(1,c.emissiveIntensity);if(m.map&&!m.emissiveMap)c.emissiveMap=m.map}else if(c.color)c.color.multiplyScalar(1.8)}   // กลางคืน: เรืองแสงขึ้น
  else if(c.color)c.color.multiplyScalar(.5);                                                                                  // กลางวัน: มืดลง
  cache.set(m,c);hlC.push(c);return c};
 for(const o of L){o.userData.m0=o.material;o.material=Array.isArray(o.material)?o.material.map(tw):tw(o.material)}}
const _hc=new THREE.Color();
function select(id,fly=true){sel=id;hlApply(id);                                                         // ไม่แสดงกรอบสีแดงรอบอาคารที่เลือก

 const zn=ZONES[id];
 if(zn){if(fly){const d=Math.max(zn.s*2.2,zn.s<5?8:26);const sx=zn.dir||(zn.x<0?-1:1);goal={p:V(zn.x+sx*d*.75,zn.y+d*.55,zn.z+d*.35),t:V(zn.x,zn.y,zn.z)}}opts.onSelect&&opts.onSelect(id);return}
 const rm=ROOMS.find(x=>x.id===id);
 if(rm){if(fly){const z=fc.z0+rm.o,x=FXE+3.5;goal={p:V(x+26,14,z+14),t:V(x,2.5,z)}}opts.onSelect&&opts.onSelect(id);return}
 const b=B.find(x=>x.id===id);if(!b)return;
 if(fly){const d=Math.max(b.l*.9,80);goal={p:V(b.cx+d*.7,b.h+d*.45,b.cz+d*.8),t:V(b.cx,b.h/2,b.cz)}}
 opts.onSelect&&opts.onSelect(id)}
ctl.addEventListener('start',()=>{goal=null});
// มุมมองสำเร็จรูป: ภาพรวม (เฉียงจากหน้า-ฝั่งถนนโรงงาน), ด้านบน/ด้านข้าง/ด้านหน้าแบบตั้งฉากกับแนวอาคารพอดี และย่อ/ขยายให้พอดีจอตามสัดส่วนจอ
const VZ0=-55,VZ1=MRZ+MRH+4,VX0=-62,VX1=40;                                                              // ขอบเขตพื้นที่ที่ต้องเห็นในมุมด้านบน/ด้านข้าง
const fitD=(w,h,mg=1.06)=>{const t=Math.tan(cam.fov*Math.PI/360);return Math.max(w/2/(t*cam.aspect),h/2/t)*mg};
const views={
 ov:()=>[V(118,92,TOTAL+62),V(-4,0,C+22)],                                                              // ภาพรวม (มุมเฉียงจากหน้าโรงงาน ฝั่งถนนโรงงาน)
 top:()=>{const cx=(VX0+VX1)/2,cz=(VZ0+VZ1)/2,h=fitD(VZ1-VZ0,VX1-VX0);return [V(cx+h*1e-4,h,cz),V(cx,0,cz)]},   // มองตรงลงมา: แนวยาวโรงงานแนวนอนเต็มจอ ด้านหน้าอยู่ซ้าย
 side:()=>{const cz=(VZ0+VZ1)/2,y=8,d=fitD(VZ1-VZ0,40),pt=12*Math.PI/180;return [V(d*Math.cos(pt),y+d*Math.sin(pt),cz),V(0,y,cz)]}, // มองจากฝั่งถนนโรงงาน ตั้งฉากกับแนวอาคาร
 gate:()=>{const x=8,y=5,d=fitD(80,26),pt=7*Math.PI/180;return [V(x,y+d*Math.sin(pt),TOTAL+d*Math.cos(pt)),V(x,y,TOTAL)]}            // มองตรงเข้าหน้าอาคาร 1 จากถนนหน้าโรงงาน
};
function setView(k){const f=views[k];if(!f)return;const v=f();goal={p:v[0],t:v[1]}}
function setLabels(on){labels.forEach(l=>{l.visible=on})}
function setSolar(on){solars.forEach(x=>{x.visible=on})}
function setAutoRotate(on){ctl.autoRotate=on;ctl.autoRotateSpeed=.8}
function stopAuto(){if(ctl.autoRotate){setAutoRotate(false);opts.onAutoRotateChange&&opts.onAutoRotateChange(false)}}   // ผู้ใช้ควบคุมเอง → หยุดหมุนอัตโนมัติ

const sky=new THREE.Color(),day=new THREE.Color(0xbfe0f5),night=new THREE.Color(0x0a0f20),dusk=new THREE.Color(0xf0b890),sunWarm=new THREE.Color(0xff9a55),sunWhite=new THREE.Color(0xfff2dd);
// ตำแหน่งดวงอาทิตย์ตามจริง: ละติจูดที่ตั้ง + มุมเดคลิเนชันของวันนี้ (h = เวลาสุริยะโดยประมาณ)
const SITE_LAT=13.6237*Math.PI/180;
// เวลาฟ้าสาง/พระอาทิตย์ขึ้น/ตก/พลบค่ำ (เวลาท้องถิ่น ชม.) ตามตารางที่กำหนด (9–10 พ.ย. 2026: รุ่งอรุณ 05:53, ขึ้น 06:15, ตก 17:43, พลบค่ำ 18:06)
//   กลางคืนเต็ม: ก่อนรุ่งอรุณ/หลังพลบค่ำ · ช่วงสนธยา: รุ่งอรุณ→ขึ้น และ ตก→พลบค่ำ (ค่อย ๆ สว่าง/มืด) · กลางวัน: ขึ้น→ตก
const SUNT={dawn:5+53/60,rise:6+15/60,set:17+43/60,dusk:18+6/60};
const dayK=h=>h<=SUNT.dawn||h>=SUNT.dusk?0:h<SUNT.rise?(h-SUNT.dawn)/(SUNT.rise-SUNT.dawn):h>SUNT.set?(SUNT.dusk-h)/(SUNT.dusk-SUNT.set):1;
function sunPos(hc){const d=new Date(),doy=Math.floor((d-new Date(d.getFullYear(),0,0))/864e5),dec=-23.44*Math.PI/180*Math.cos(2*Math.PI/365*(doy+10)),
  H0=Math.acos(Math.max(-1,Math.min(1,-Math.tan(SITE_LAT)*Math.tan(dec)))),noon=(SUNT.rise+SUNT.set)/2,H=(hc-noon)/((SUNT.set-SUNT.rise)/2)*H0;   // เวลานาฬิกา → มุมชั่วโมง (ดวงอาทิตย์แตะขอบฟ้าตรงเวลาขึ้น/ตกในตาราง)
 const sa=Math.sin(SITE_LAT)*Math.sin(dec)+Math.cos(SITE_LAT)*Math.cos(dec)*Math.cos(H),ca=Math.sqrt(Math.max(0,1-sa*sa)),
  az=Math.atan2(Math.sin(H),Math.cos(H)*Math.sin(SITE_LAT)-Math.tan(dec)*Math.cos(SITE_LAT))+Math.PI;      // มุมทิศจากเหนือจริง ตามเข็ม
 return {sa,x:-Math.cos(az)*ca,z:-Math.sin(az)*ca}}                                                         // เหนือจริง = -X, ตะวันออกจริง = -Z
function setTime(h){h=((h%24)+24)%24;const sp=sunPos(h),sn=sp.sa,s=Math.min(1,Math.max(sn*1.15,0)),tw=dayK(h),nk=1-tw;lampM.emissiveIntensity=.15+2.6*nk;glowM.opacity=.9*nk;poolM.opacity=.6*nk;tubeM.emissiveIntensity=.1+2.8*nk;glowW.opacity=.85*nk;poolW.opacity=.5*nk;
 sun.position.set(sp.x*300,Math.max(sn*300,12),C+sp.z*300);sun.intensity=(.04+1.06*s)*Math.PI;hemi.intensity=(.18+.45*Math.max(s,.3*tw))*Math.PI;sun.color.copy(sunWarm).lerp(sunWhite,Math.min(s*3,1));
 sky.copy(night).lerp(dusk,tw).lerp(day,Math.min(Math.max(s*2.5,0),1));scene.background=sky;scene.fog.color.copy(sky);
 isNight=nk>.5;NIGHTK=nk;if(hlOn&&hlNight!==isNight)hlApply(hlOn)}   // เปลี่ยนกลางวัน/กลางคืน → สลับแบบไฮไลต์

let dn=null;const rc=new THREE.Raycaster(),pt=new THREE.Vector2();
const onDown=e=>{dn=[e.clientX,e.clientY]};
const onUp=e=>{if(!dn)return;if(Math.hypot(e.clientX-dn[0],e.clientY-dn[1])>5){dn=null;stopAuto();return}dn=null;   // ลากหมุน/เลื่อนกล้องเอง → หยุดหมุนอัตโนมัติ
 const r=renderer.domElement.getBoundingClientRect();pt.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);rc.setFromCamera(pt,cam);
 const hs=rc.intersectObjects(iconTargets()),hi=hs.find(h=>h.object.userData.isIcon)||hs[0];if(hi){stopAuto();select(hi.object.userData.pickId);return}   // กดไอคอน/ป้ายตัวเลข: ตัวไอคอนได้ก่อนป้าย (ป้ายอีกตัวอาจบังอยู่)
 const h=rc.intersectObjects(pick.filter(o=>o.visible))[0];if(h){stopAuto();select(h.object.userData.id)}};           // คลิก object → หยุดหมุนอัตโนมัติ
const iconTargets=()=>{const a=[];for(const o of ICONS)if(o.visible&&o.userData.pickId){a.push(o);if(o.userData.lb)a.push(o.userData.lb)}return a};
let mvT=0;const onMove=e=>{if(e.buttons)return;const now=performance.now();if(now-mvT<60)return;mvT=now;              // เคอร์เซอร์รูปมือเมื่อชี้ไอคอน
 const r=renderer.domElement.getBoundingClientRect();pt.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);rc.setFromCamera(pt,cam);
 renderer.domElement.style.cursor=rc.intersectObjects(iconTargets()).length?'pointer':''};
renderer.domElement.addEventListener('pointermove',onMove);
const onWheel=()=>stopAuto();renderer.domElement.addEventListener('wheel',onWheel,{passive:true});   // ซูมกล้องเอง → หยุดหมุนอัตโนมัติ
renderer.domElement.addEventListener('pointerdown',onDown);
renderer.domElement.addEventListener('pointerup',onUp);
function size(){const w=host.clientWidth||1,h=host.clientHeight||1;renderer.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix()}
const ro=new ResizeObserver(size);ro.observe(host);size();
{const v=views.ov();cam.position.copy(v[0]);ctl.target.copy(v[1])}select(opts.initialId||'fac',false);setTime(opts.initialTime!==undefined?opts.initialTime:14);
setLabels(opts.initialLabels!==false);setAutoRotate(!!opts.initialAutoRotate);
let raf=0,alive=true;
(function loop(){if(!alive)return;raf=requestAnimationFrame(loop);
 const now=performance.now(),dt=Math.min((now-(loop.t||now))/1000,.25);loop.t=now;
 if(goal){const k=1-Math.pow(.93,dt*60);cam.position.lerp(goal.p,k);ctl.target.lerp(goal.t,k);   // เคลื่อนกล้องตามเวลา (ไม่ขึ้นกับ fps)
 if(cam.position.distanceTo(goal.p)<.05&&ctl.target.distanceTo(goal.t)<.05){cam.position.copy(goal.p);ctl.target.copy(goal.t);goal=null}}  // จบที่ตำแหน่งตรงเป๊ะ
 ctl.update();updateCompass();TRAF.update(dt);
 _cr.setFromMatrixColumn(cam.matrixWorld,0);
 {const sd=ICONS.filter(o=>!o.userData.top);if(sd.length===2){const a=sd[0].position.dot(_cr)<=sd[1].position.dot(_cr);sd[0].userData.lb.userData.side=a?-1:1;sd[1].userData.lb.userData.side=a?1:-1}}   // มิเตอร์หน้าโรงงาน: ไอคอนที่อยู่ซ้ายบนจอ ป้ายอยู่ซ้าย
 for(const o of ICONS){const k=Math.min(6,Math.max(1,cam.position.distanceTo(o.position)/14)),s2=o.userData.sz*k;o.scale.set(s2,s2,1);o.position.y=o.userData.y0+(s2-o.userData.sz)/2;if(o.userData.sh)o.userData.sh.scale.set(k,1,k);if(o.userData.st){const [m,d,rg]=o.userData.st;m.scale.set(k,1,k);d.scale.setScalar(k);rg.scale.setScalar(k)}   // ไอคอนขยายเมื่อซูมออก
  {const mm=METERS[o.userData.key],on=!!(mm&&mm.al&&mm.al.on),ph=on?.5+.5*Math.sin(now*.0126):1,ha=o.userData.halo;o.material.opacity=on?.55+.45*ph:1;if(o.userData.lb)o.userData.lb.material.opacity=on?.5+.5*ph:1;   // alarm: กะพริบ ~2 ครั้ง/วินาที
   if(ha){ha.visible=on&&o.visible;if(on){ha.position.copy(o.position);ha.scale.set(s2*1.9,s2*1.9,1);ha.material.opacity=.25+.75*ph}}}
  const lb=o.userData.lb;if(lb){const lh=s2*.42;lb.scale.set(lh*lb.userData.ar,lh,1);
   if(o.userData.top){lb.center.set(.5,0);lb.position.copy(o.position);lb.position.y+=s2*.5}                 // หม้อแปลง: ป้ายตัวเลขอยู่เหนือไอคอน
   else{lb.center.set(lb.userData.side<0?1:0,.5);lb.position.copy(o.position).addScaledVector(_cr,lb.userData.side*s2*.5)}}}   // มิเตอร์: ป้ายข้างไอคอน ไม่ทับกัน
 {const d=cam.position.distanceTo(ctl.target);scene.fog.near=Math.max(450,d*.9);scene.fog.far=scene.fog.near+750}   // หมอกถอยตามระยะกล้อง (มุมด้านบนจอแคบ)
 renderer.render(scene,cam)})();
function dispose(){alive=false;cancelAnimationFrame(raf);ro.disconnect();
 renderer.domElement.removeEventListener('pointerdown',onDown);renderer.domElement.removeEventListener('pointerup',onUp);renderer.domElement.removeEventListener('pointermove',onMove);renderer.domElement.removeEventListener('wheel',onWheel);ctl.dispose();
 const seen=new Set();scene.traverse(o=>{if(o.geometry&&!seen.has(o.geometry)){seen.add(o.geometry);o.geometry.dispose()}
  const ms=Array.isArray(o.material)?o.material:o.material?[o.material]:[];ms.forEach(m=>{if(seen.has(m))return;seen.add(m);Object.values(m).forEach(v=>{if(v&&v.isTexture)v.dispose()});m.dispose()})});
 renderer.dispose();if(renderer.domElement.parentNode===host)host.removeChild(renderer.domElement);if(compassEl.parentNode===host)host.removeChild(compassEl)}
function setIcons(on){for(const sp of ICONS){sp.visible=on;if(sp.userData.lb)sp.userData.lb.visible=on}for(const o of ICONX)o.visible=on}
return {select,setView,setLabels,setSolar,setAutoRotate,setTime,setMeter,setAlarm,setIcons,dispose}
}
