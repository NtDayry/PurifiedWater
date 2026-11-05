// ฉาก 3 มิติของผังระบบปั๊มน้ำ — เรนเดอร์ด้วย Canvas 2D + กล้องเปอร์สเปกทีฟเขียนเอง
// (ไม่ต้องติดตั้งไลบรารีเพิ่ม) ลากเมาส์เพื่อหมุน / ล้อเมาส์เพื่อซูม / ดับเบิลคลิกเพื่อรีเซ็ต
import type { DisplayUnit, TankCalculations, TankConfig, TankData } from '@/types/waterSupply.types';
import { DEFAULT_TANK_CONFIG } from '@/lib/tankCalculations';

export interface SceneInput {
  data: TankData;
  percent: number;
  low: boolean;
  high: boolean;
  tankConfig?: TankConfig;
  displayUnit?: DisplayUnit;
  tankCalculations?: TankCalculations;
}

// ใส่หน่วยที่ใช้จริง เช่น "L/min", "m³"
const FLOW_UNIT = "m³/h";
const VOL_UNIT = "m³";

type V3 = [number, number, number];
type P2 = [number, number];
type RGB = [number, number, number];
interface Face {
  pts: V3[];
  n: V3;
}
interface Item {
  z: number;
  draw: () => void;
}

/* ---------- เวกเตอร์ / สี ---------- */
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const css = (c: RGB, k = 1, a = 1) =>
  `rgba(${clamp(Math.round(c[0] * k), 0, 255)},${clamp(Math.round(c[1] * k), 0, 255)},${clamp(Math.round(c[2] * k), 0, 255)},${a})`;

const LIGHT = norm([-0.45, 0.85, 0.55]);
const light = (n: V3) => 0.4 + 0.72 * Math.max(0, dot(n, LIGHT));

/* ---------- ค่าคงที่ของฉาก (หน่วยสมมติ) ---------- */
const TY0 = 0.3; // ก้นบ่ออ้างอิง
const TANK_W = 8.0; // กราฟฟิกขนาด 3D ของบ่อเก็บน้ำทั้งสองบ่อเท่ากัน (ความกว้าง 8)
const TANK_D = 4.2; // ความลึกบ่อ (z)
const TANK_H = 4.2; // ความสูงบ่อ (y)
const TANK_X = [-6.0, 6.0]; // ขยายระยะห่างระหว่างบ่อ (ขอบบ่อ 1: -2.0, ขอบบ่อ 2: +2.0, ระยะห่าง 4.0)
const PY = 1.25; // ความสูงท่อด้านล่าง
const PUMP_X = 14.0;
const PUMP_Z = [-2.4, 2.4];
const PRESSURE_X = 18.2; // ตำแหน่งแนวท่อและเกจวัด Pressure Switch
const TARGET: V3 = [4.5, 2.0, -0.3];

// ค่าตำแหน่งจุดเชื่อมต่อท่อ ข้อต่อสามทาง และหน้าแปลนปั๊ม
const TEE_SUCTION_X = 12.0;    // จุดแยกสามทางท่อดูดก่อนเข้าปั๊ม
const TEE_DISCHARGE_X = 16.5;  // จุดรวมสามทางท่อจ่ายหลังออกจากปั๊ม
const PUMP_IN_X = 12.92;       // ขอบหน้าแปลนดูดของปั๊ม (PUMP_X - 0.98 - 0.10)
const PUMP_OUT_X = 15.08;      // ขอบหน้าแปลนจ่ายของปั๊ม (PUMP_X + 0.98 + 0.10)
const GAUGE_BOTTOM_Y = 3.10;   // ขอบล่างของก้าน Pressure Gauge (3.95 - 0.60 - 0.25)
const FLOW_METER_POS: V3 = [-12.5, 5.8, 0]; // ตำแหน่งโฟลว์มิเตอร์
const FLOW_METER_TOP: V3 = [-12.5, 6.92, 0]; // ตำแหน่งหน้าปัดโฟลว์มิเตอร์ (5.8 + 1.12)

const PAL = {
  n: { top: hex("#a5f3fc"), mid: hex("#38bdf8"), deep: hex("#075985") },
  l: { top: hex("#fecaca"), mid: hex("#ef4444"), deep: hex("#7f1d1d") },
  h: { top: hex("#fef08a"), mid: hex("#fbbf24"), deep: hex("#92400e") },
};
const STEEL = hex("#8294ab");
const GREEN = "#34d399";

/* ---------- เรขาคณิต ---------- */
function boxFaces(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): Face[] {
  const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
  return [
    { pts: [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], n: [0, 1, 0] },
    { pts: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], n: [0, -1, 0] },
    { pts: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], n: [0, 0, 1] },
    { pts: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], n: [0, 0, -1] },
    { pts: [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], n: [1, 0, 0] },
    { pts: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], n: [-1, 0, 0] },
  ];
}

const UNIT: V3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

/** ทรงกระบอก: คืนด้านข้าง n หน้า + ฝาลบ + ฝาบวก (สองตัวสุดท้าย) */
function cylFaces(c: V3, axis: 0 | 1 | 2, r: number, len: number, n = 22): Face[] {
  const ax = UNIT[axis], u = UNIT[(axis + 1) % 3], v = UNIT[(axis + 2) % 3];
  const pt = (a: number, s: number): V3 => [
    c[0] + ax[0] * s * len / 2 + u[0] * r * Math.cos(a) + v[0] * r * Math.sin(a),
    c[1] + ax[1] * s * len / 2 + u[1] * r * Math.cos(a) + v[1] * r * Math.sin(a),
    c[2] + ax[2] * s * len / 2 + u[2] * r * Math.cos(a) + v[2] * r * Math.sin(a),
  ];
  const faces: Face[] = [];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2;
    faces.push({
      pts: [pt(a0, -1), pt(a1, -1), pt(a1, 1), pt(a0, 1)],
      n: [u[0] * Math.cos(am) + v[0] * Math.sin(am), u[1] * Math.cos(am) + v[1] * Math.sin(am), u[2] * Math.cos(am) + v[2] * Math.sin(am)],
    });
  }
  const capN: V3[] = [[-ax[0], -ax[1], -ax[2]], [ax[0], ax[1], ax[2]]];
  [-1, 1].forEach((s, k) => {
    const pts: V3[] = [];
    for (let i = 0; i < n; i++) pts.push(pt((i / n) * Math.PI * 2, s));
    faces.push({ pts, n: capN[k] });
  });
  return faces;
}

const ring = (c: V3, axis: 0 | 1 | 2, r: number, n = 28): V3[] => {
  const u = UNIT[(axis + 1) % 3], v = UNIT[(axis + 2) % 3];
  const out: V3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([
      c[0] + u[0] * r * Math.cos(a) + v[0] * r * Math.sin(a),
      c[1] + u[1] * r * Math.cos(a) + v[1] * r * Math.sin(a),
      c[2] + u[2] * r * Math.cos(a) + v[2] * r * Math.sin(a),
    ]);
  }
  return out;
};

/* ---------- ท่อ ---------- */
interface PipeDef {
  pts: V3[];
  on: (c: TankData["controls"]) => boolean;
}
const zA = PUMP_Z[0], zB = PUMP_Z[1];
const PIPES: PipeDef[] = [
  // 1. ท่อน้ำเข้า สู่บ่อ 1
  { pts: [[-15.0, 5.8, 0], [TANK_X[0], 5.8, 0], [TANK_X[0], 4.9, 0]], on: (c) => c.valve_on },
  // 2. ท่อเชื่อมบ่อ 1 และ บ่อ 2
  { pts: [[-2.0, PY, 0], [2.0, PY, 0]], on: (c) => c.valve_on || (c.pump1_on && !c.pump1_overload) || (c.pump2_on && !c.pump2_overload) },
  // 3. ท่อออกจากบ่อ 2 สู่จุดแยกสามทางดูด
  { pts: [[10.0, PY, 0], [TEE_SUCTION_X, PY, 0]], on: (c) => (c.pump1_on && !c.pump1_overload) || (c.pump2_on && !c.pump2_overload) },
  // 4. ท่อแยกไปปั๊ม 1 (ชนหน้าแปลนดูดพอดีที่ PUMP_IN_X)
  { pts: [[TEE_SUCTION_X, PY, 0], [TEE_SUCTION_X, PY, zA], [PUMP_IN_X, PY, zA]], on: (c) => c.pump1_on && !c.pump1_overload },
  // 5. ท่อแยกไปปั๊ม 2 (ชนหน้าแปลนดูดพอดีที่ PUMP_IN_X)
  { pts: [[TEE_SUCTION_X, PY, 0], [TEE_SUCTION_X, PY, zB], [PUMP_IN_X, PY, zB]], on: (c) => c.pump2_on && !c.pump2_overload },
  // 6. ท่อออกจากปั๊ม 1 สู่จุดรวมสามทางจ่าย (เริ่มจากหน้าแปลนจ่ายพอดีที่ PUMP_OUT_X)
  { pts: [[PUMP_OUT_X, PY, zA], [TEE_DISCHARGE_X, PY, zA], [TEE_DISCHARGE_X, PY, 0]], on: (c) => c.pump1_on && !c.pump1_overload },
  // 7. ท่อออกจากปั๊ม 2 สู่จุดรวมสามทางจ่าย (เริ่มจากหน้าแปลนจ่ายพอดีที่ PUMP_OUT_X)
  { pts: [[PUMP_OUT_X, PY, zB], [TEE_DISCHARGE_X, PY, zB], [TEE_DISCHARGE_X, PY, 0]], on: (c) => c.pump2_on && !c.pump2_overload },
  // 8. ท่อจ่ายหลักออกไปใช้งาน
  { pts: [[TEE_DISCHARGE_X, PY, 0], [20.5, PY, 0]], on: (c) => (c.pump1_on && !c.pump1_overload) || (c.pump2_on && !c.pump2_overload) },
  // 9. ท่อแยกขึ้นสู่เกจวัด Pressure Switch (ชนขอบล่างก้านเกจวัดพอดีที่ GAUGE_BOTTOM_Y)
  { pts: [[PRESSURE_X, PY, 0], [PRESSURE_X, GAUGE_BOTTOM_Y, 0]], on: (c) => (c.pump1_on && !c.pump1_overload) || (c.pump2_on && !c.pump2_overload) },
];
const PIPE_R = 0.38;

// ค่าเริ่มต้นของกล้อง
const DEFAULT_CAM = { yaw: 0, pitch: 0.35, zoom: 0.9 };

/* ---------- ตัวเรนเดอร์ ---------- */
export class PumpScene3D {
  private ctx: CanvasRenderingContext2D;
  private input: SceneInput | null = null;
  private raf = 0;
  private ro: ResizeObserver;
  private W = 0;
  private H = 0;
  private dpr = 1;
  private last = performance.now();
  private t = 0;

  // กล้อง
  private cam = { ...DEFAULT_CAM };
  private camGoal = { ...this.cam };
  private auto = false;
  private drag: { x: number; y: number } | null = null;
  private view = { pos: [0, 0, 0] as V3, r: [1, 0, 0] as V3, u: [0, 1, 0] as V3, f: [0, 0, -1] as V3, focal: 1, dist: 52 };

  // สถานะแอนิเมชัน
  private level = 0;
  private tint = { l: 0, h: 0 };
  private omega = [0, 0];
  private angle = [0, 0];
  private valveOpen = 0;
  private isDark = true;
  private lang = 'th';
  private tankConfig: TankConfig = DEFAULT_TANK_CONFIG;
  private displayUnit: DisplayUnit = 'cm';
  private tankCalculations: TankCalculations | null = null;
  private bubbles = Array.from({ length: 16 }, (_, i) => ({
    x: ((i * 0.6180339) % 1) - 0.5,
    z: (((i * 0.7548776) + 0.3) % 1) - 0.5,
    p: (i * 0.37) % 1,
    s: 0.18 + ((i * 0.29) % 0.25),
  }));

  constructor(private canvas: HTMLCanvasElement) {
    this.isDark = typeof document !== 'undefined' ? document.documentElement.classList.contains('dark') : true;
    this.ctx = canvas.getContext("2d")!;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("dblclick", this.resetView);
    this.raf = requestAnimationFrame(this.loop);
  }

  setTheme(isDark: boolean) {
    this.isDark = isDark;
  }

  setLang(lang: string) {
    this.lang = lang;
  }

  update(input: SceneInput) {
    this.input = input;
    if (input.tankConfig) this.tankConfig = input.tankConfig;
    if (input.displayUnit) this.displayUnit = input.displayUnit;
    if (input.tankCalculations) this.tankCalculations = input.tankCalculations;
  }
  setAutoRotate(v: boolean) {
    this.auto = v;
  }
  resetView = () => {
    this.camGoal = { ...DEFAULT_CAM };
  };
  /** ตั้งมุมกล้องเอง (ใช้ตอน preview/ถ่ายภาพ) */
  setCamera(yaw: number, pitch: number, zoom = 0.9) {
    this.cam = { yaw, pitch, zoom };
    this.camGoal = { yaw, pitch, zoom };
  }
  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onDown);
    c.removeEventListener("pointermove", this.onMove);
    c.removeEventListener("pointerup", this.onUp);
    c.removeEventListener("pointercancel", this.onUp);
    c.removeEventListener("wheel", this.onWheel);
    c.removeEventListener("dblclick", this.resetView);
  }

  /* ----- อินพุต ----- */
  private onDown = (e: PointerEvent) => {
    this.drag = { x: e.clientX, y: e.clientY };
    this.canvas.setPointerCapture(e.pointerId);
    this.canvas.style.cursor = "grabbing";
  };
  private onMove = (e: PointerEvent) => {
    if (!this.drag) return;
    const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
    this.drag = { x: e.clientX, y: e.clientY };
    this.camGoal.yaw = clamp(this.camGoal.yaw - dx * 0.006, -1.15, 1.15);
    this.camGoal.pitch = clamp(this.camGoal.pitch + dy * 0.005, 0.1, 1.25);
    this.auto = false;
  };
  private onUp = (e: PointerEvent) => {
    this.drag = null;
    this.canvas.style.cursor = "grab";
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
  };
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.camGoal.zoom = clamp(this.camGoal.zoom * Math.exp(-e.deltaY * 0.0012), 0.45, 2.5);
  };

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = Math.max(1, r.width);
    this.H = Math.max(1, r.height);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
  }

  /* ----- วงจรหลัก ----- */
  private loop = (now: number) => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    this.step(dt);
    this.render();
    this.raf = requestAnimationFrame(this.loop);
  };

  private step(dt: number) {
    // กล้อง
    const k = 1 - Math.exp(-dt * 8);
    if (this.auto) this.camGoal.yaw = -0.38 + Math.sin(this.t * 0.35) * 0.55;
    this.cam.yaw += (this.camGoal.yaw - this.cam.yaw) * k;
    this.cam.pitch += (this.camGoal.pitch - this.cam.pitch) * k;
    this.cam.zoom += (this.camGoal.zoom - this.cam.zoom) * k;

    const s = this.input;
    if (!s) return;
    const c = s.data.controls;
    this.level += (s.percent - this.level) * (1 - Math.exp(-dt * 2.5));
    this.tint.l += ((s.low ? 1 : 0) - this.tint.l) * (1 - Math.exp(-dt * 4));
    this.tint.h += ((s.high ? 1 : 0) - this.tint.h) * (1 - Math.exp(-dt * 4));
    [c.pump1_on, c.pump2_on].forEach((on, i) => {
      this.omega[i] += ((on ? 9 : 0) - this.omega[i]) * (1 - Math.exp(-dt * 2.5));
      this.angle[i] += this.omega[i] * dt;
    });
    this.valveOpen += ((c.valve_on ? 1 : 0) - this.valveOpen) * (1 - Math.exp(-dt * 6));
  }

  /* ----- กล้อง / โปรเจกชัน ----- */
  private setupView() {
    const { yaw, pitch, zoom } = this.cam;
    const d = this.view.dist;
    const cp = Math.cos(pitch);
    const pos: V3 = [TARGET[0] + d * Math.sin(yaw) * cp, TARGET[1] + d * Math.sin(pitch), TARGET[2] + d * Math.cos(yaw) * cp];
    const f = norm(sub(TARGET, pos));
    const r = norm(cross(f, [0, 1, 0]));
    const u = cross(r, f);
    const base = Math.min((this.W * d) / 41.5, (this.H * d) / 16.5);
    Object.assign(this.view, { pos, f, r, u, focal: base * zoom });
  }
  private P(p: V3): [number, number, number] {
    const v = this.view;
    const d = sub(p, v.pos);
    const z = dot(d, v.f);
    const k = v.focal / z;
    return [this.W / 2 + dot(d, v.r) * k, this.H * 0.54 - dot(d, v.u) * k, z];
  }
  /** ขนาดบนหน้าจอของความยาว 1 หน่วย ณ จุดนั้น */
  private px(p: V3) {
    return this.view.focal / this.P(p)[2];
  }

  /* ----- ตัวช่วยวาด ----- */
  private poly(pts: number[][], fill: string | CanvasGradient, stroke?: string, lw = 1) {
    const g = this.ctx;
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    if (stroke) {
      g.strokeStyle = stroke;
      g.lineWidth = lw;
      g.lineJoin = "round";
      g.stroke();
    }
  }

  /** วาดกลุ่มหน้า (ทึบ หรือโปร่งใส) เรียงไกล→ใกล้ */
  private faces(
    fs: Face[],
    mat: { base: RGB; alpha?: number; glow?: number; grad?: [RGB, RGB]; edge?: string },
    side: "front" | "back" = "front"
  ) {
    const v = this.view;
    const list: { p: P2[]; z: number; k: number }[] = [];
    for (const f of fs) {
      let cx = 0, cy = 0, cz = 0;
      for (const q of f.pts) { cx += q[0]; cy += q[1]; cz += q[2]; }
      const n = f.pts.length;
      const facing = dot(f.n, sub(v.pos, [cx / n, cy / n, cz / n])) > 0;
      if ((side === "front") !== facing) continue;
      let zs = 0;
      const p = f.pts.map((q) => {
        const r = this.P(q);
        zs += r[2];
        return [r[0], r[1]] as P2;
      });
      list.push({ p, z: zs / n, k: light(side === "front" ? f.n : [-f.n[0], -f.n[1], -f.n[2]]) });
    }
    list.sort((a, b) => b.z - a.z);
    const a = mat.alpha ?? 1;
    for (const it of list) {
      const k = it.k + (mat.glow ?? 0);
      let fill: string | CanvasGradient;
      if (mat.grad) {
        let y0 = Infinity, y1 = -Infinity;
        it.p.forEach((q) => { y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); });
        const g = this.ctx.createLinearGradient(0, y0, 0, y1 + 0.01);
        g.addColorStop(0, css(mat.grad[0], k, a));
        g.addColorStop(1, css(mat.grad[1], k, a));
        fill = g;
      } else fill = css(mat.base, k, a);
      this.poly(it.p, fill, mat.edge ?? (a >= 1 ? css(mat.base, k, 1) : undefined), 0.8);
    }
  }

  private line3(a: V3, b: V3, color: string, lw: number) {
    const g = this.ctx;
    const p = this.P(a), q = this.P(b);
    g.beginPath();
    g.moveTo(p[0], p[1]);
    g.lineTo(q[0], q[1]);
    g.strokeStyle = color;
    g.lineWidth = lw;
    g.lineCap = "round";
    g.stroke();
  }

  private pill(text: string, at: V3, color = "#e2e8f0", size = 12.5, dy = 0) {
    const g = this.ctx;
    const [x, y, z] = this.P(at);
    const s = clamp((this.view.dist / z) * this.cam.zoom, 0.25, 1.35) * clamp(this.W / 1150, 0.65, 1.2);
    g.font = `600 ${(size * s).toFixed(1)}px system-ui, "Noto Sans Thai", "Sarabun", sans-serif`;
    const w = g.measureText(text).width + 14 * s, h = size * s + 9 * s;
    const px = x - w / 2, py = y - h / 2 + dy;
    g.beginPath();
    g.roundRect(px, py, w, h, Math.max(2, h / 2.6));
    g.fillStyle = this.isDark ? "rgba(8,13,26,.82)" : "rgba(255,255,255,.9)";
    g.fill();
    g.strokeStyle = this.isDark ? "rgba(148,163,184,.28)" : "rgba(148,163,184,.45)";
    g.lineWidth = Math.max(0.6, 1 * s);
    g.stroke();
    const finalColor = !this.isDark && (color === "#e2e8f0" || color === "#cbd5e1" || color === "#94a3b8") ? "#334155" : color;
    g.fillStyle = finalColor;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, x, py + h / 2 + 0.5);
  }

  private text(t: string, x: number, y: number, size: number, color: string, weight = 700, outline = true) {
    const g = this.ctx;
    g.font = `${weight} ${size.toFixed(1)}px system-ui, "Noto Sans Thai", "Sarabun", sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    if (outline) {
      g.lineJoin = "round";
      g.lineWidth = Math.max(1.2, size / 6);
      g.strokeStyle = "rgba(8,13,26,.9)";
      g.strokeText(t, x, y);
    }
    g.fillStyle = color;
    g.fillText(t, x, y);
  }

  /* ----- เรนเดอร์ ----- */
  private render() {
    const g = this.ctx;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.setupView();

    const bg = g.createLinearGradient(0, 0, 0, this.H);
    if (this.isDark) {
      bg.addColorStop(0, "#1e293b");
      bg.addColorStop(1, "#0b1220");
    } else {
      bg.addColorStop(0, "#f8fafc");
      bg.addColorStop(1, "#e2e8f0");
    }
    g.fillStyle = bg;
    g.fillRect(0, 0, this.W, this.H);

    this.floor();

    const s = this.input;
    if (!s) {
      const waitText = this.lang === 'en' ? "Waiting for data..." : "รอข้อมูล…";
      this.text(waitText, this.W / 2, this.H / 2, 18, this.isDark ? "#94a3b8" : "#64748b", 600, false);
      return;
    }
    const c = s.data.controls;
    const items: Item[] = [];
    const add = (center: V3, draw: () => void, bias = 0) => items.push({ z: this.P(center)[2] + bias, draw });

    TANK_X.forEach((x, i) => add([x, 2, 0], () => this.tank(x, i)));
    PIPES.forEach((p) => {
      // คำนวณความลึก Z จากค่าเฉลี่ยทุกจุดในเส้นท่อ เพื่อให้การจัดเรียง (Depth Sorting) แม่นยำ
      const avgZ = p.pts.reduce((acc, q) => acc + this.P(q)[2], 0) / p.pts.length;
      items.push({ z: avgZ, draw: () => this.pipe(p, p.on(c)) });
    });
    PUMP_Z.forEach((z, i) =>
      add([PUMP_X, PY, z], () =>
        this.pump(
          z,
          i,
          i === 0 ? c.pump1_on : c.pump2_on,
          Boolean(i === 0 ? c.pump1_overload : c.pump2_overload)
        )
      )
    );
    const vPos: V3 = [-10.0, 5.8, 0];
    const fmPos: V3 = FLOW_METER_POS;
    const gPos: V3 = [PRESSURE_X, 3.95, 0];
    const sPos: V3 = [TANK_X[0], 3.5, 0];

    // ข้อต่อสามทางเชื่อมท่อดูด ท่อจ่าย และท่อ Pressure Switch ให้ตรงแนวพอดี
    add([TEE_SUCTION_X, PY, 0], () => this.teeJoint([TEE_SUCTION_X, PY, 0], 2), -0.5);
    add([TEE_DISCHARGE_X, PY, 0], () => this.teeJoint([TEE_DISCHARGE_X, PY, 0], 2), -0.5);
    add([PRESSURE_X, PY, 0], () => this.teeJoint([PRESSURE_X, PY, 0], 1), -0.5);

    add(vPos, () => this.valve(c.valve_on, vPos), -1.2);
    add(fmPos, () => this.flowMeter(s.data.water_level.flow_rate > 0, fmPos), -1.2);
    add(gPos, () => this.gauge(c.pressure_switch, gPos), -1.2);
    add(sPos, () => this.stream(c.valve_on, sPos), -0.5);

    items.sort((a, b) => b.z - a.z);
    items.forEach((it) => it.draw());

    this.labels(s);
    this.hud(s);
  }

  private floor() {
    const g = this.ctx;
    const X0 = -17.5, X1 = 23.5, Z0 = -7.5, Z1 = 6.8;
    const corners: V3[] = [[X0, 0, Z0], [X1, 0, Z0], [X1, 0, Z1], [X0, 0, Z1]];
    const p = corners.map((q) => this.P(q));
    const ys = p.map((q) => q[1]);
    const gr = g.createLinearGradient(0, Math.min(...ys), 0, Math.max(...ys));
    if (this.isDark) {
      gr.addColorStop(0, "#162033");
      gr.addColorStop(1, "#0d1526");
    } else {
      gr.addColorStop(0, "#e2e8f0");
      gr.addColorStop(1, "#cbd5e1");
    }
    const borderCol = this.isDark ? "rgba(148,163,184,.18)" : "rgba(100,116,139,.35)";
    this.poly(p.map((q) => [q[0], q[1]] as P2), gr, borderCol, 1.2);
    g.save();
    const gridCol = this.isDark ? "rgba(255,255,255,.045)" : "rgba(0,0,0,.06)";
    for (let x = Math.ceil(X0 / 2) * 2; x <= X1; x += 2) this.line3([x, 0, Z0], [x, 0, Z1], gridCol, 1);
    for (let z = Math.ceil(Z0 / 2) * 2; z <= Z1; z += 2) this.line3([X0, 0, z], [X1, 0, z], gridCol, 1);
    g.restore();

    // เงา
    const shadow = (x0: number, x1: number, z0: number, z1: number, h: number) => {
      const o = h * 0.28;
      const q: V3[] = [[x0 + 0.1, 0.01, z0 - o], [x1 + o, 0.01, z0 - o], [x1 + o, 0.01, z1 - o * 0.4], [x0 + 0.1, 0.01, z1]];
      this.poly(q.map((v) => { const r = this.P(v); return [r[0], r[1]] as P2; }), "rgba(0,0,0,.28)");
    };
    TANK_X.forEach((x) => shadow(x - (TANK_W / 2 + 0.3), x + (TANK_W / 2 + 0.3), -2.3, 2.3, 3.6));
    PUMP_Z.forEach((z) => shadow(PUMP_X - 1.6, PUMP_X + 1.6, z === PUMP_Z[0] ? -4.7 : 0, z === PUMP_Z[0] ? -1.5 : 3, 1.6));
  }

  /* ----- บ่อน้ำ ----- */
  private waterRgb(): { top: RGB; mid: RGB; deep: RGB } {
    const mixP = (a: typeof PAL.n, b: typeof PAL.n, t: number) => ({
      top: mix(a.top, b.top, t), mid: mix(a.mid, b.mid, t), deep: mix(a.deep, b.deep, t),
    });
    const p = mixP(PAL.n, PAL.l, this.tint.l);
    return mixP(p, PAL.h, this.tint.h);
  }

  private tank(cx: number, idx: number) {
    const g = this.ctx;
    const calc = idx === 0 ? this.tankCalculations?.tank1 : this.tankCalculations?.tank2;

    // กราฟฟิกขนาด 3D ของบ่อเก็บน้ำทั้งสองบ่อเท่ากัน (ความกว้าง 8)
    const tw = TANK_W; // กว้าง (x) = 8.0
    const td = TANK_D; // ลึก (z) = 4.2
    const th = TANK_H; // สูง (y) = 4.2
    const ty0 = TY0;
    const ty1 = ty0 + th;
    const wy0 = ty0 + 0.1;
    const wmax = th - 0.5;

    const pct = calc ? calc.percent : this.level;
    const frac = clamp(pct / 100, 0, 1);
    const surf = wy0 + wmax * frac;
    const w = this.waterRgb();
    const t = this.t;

    // ฐาน
    this.faces(boxFaces(cx, ty0 - 0.15, 0, tw + 0.7, 0.3, td + 0.7), { base: hex("#334155") });

    // โครง/เสา (ไกล → ก่อนน้ำ, ใกล้ → หลังน้ำ)
    const cxz: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    const postFaces = (far: boolean) => {
      const fs: Face[] = [];
      cxz.forEach(([sx, sz]) => {
        const farSide = dot([sx, 0, sz], [-this.view.pos[0] + cx, 0, -this.view.pos[2]]) > 0;
        if (farSide === far) fs.push(...boxFaces(cx + (sx * tw) / 2, (ty0 + ty1) / 2, (sz * td) / 2, 0.16, ty1 - ty0, 0.16));
      });
      return fs;
    };
    const rim = () => {
      const y = ty1 + 0.04, th_r = 0.16;
      return [
        ...boxFaces(cx, y, -td / 2, tw + 0.16, th_r, th_r), ...boxFaces(cx, y, td / 2, tw + 0.16, th_r, th_r),
        ...boxFaces(cx - tw / 2, y, 0, th_r, th_r, td), ...boxFaces(cx + tw / 2, y, 0, th_r, th_r, td),
      ];
    };

    const glass = boxFaces(cx, (ty0 + ty1) / 2, 0, tw, ty1 - ty0, td).slice(2);
    const GL = hex("#bfe3ff");

    // เฟสหลัง
    this.faces(postFaces(true), { base: STEEL });
    this.faces(boxFaces(cx, ty0 + 0.04, 0, tw, 0.08, td).slice(0, 1), { base: hex("#0c1a2e") });
    this.faces(glass, { base: GL, alpha: 0.1 }, "back");

    // น้ำ
    if (surf - wy0 > 0.03) {
      const wb = boxFaces(cx, (wy0 + surf) / 2, 0, tw - 0.3, surf - wy0, td - 0.3).slice(2);
      this.faces(wb, { base: w.mid, alpha: 0.62, grad: [mix(w.mid, w.top, 0.4), w.deep] }, "back");

      // ฟอง
      g.save();
      this.bubbles.forEach((b) => {
        const prog = (t * b.s * 0.35 + b.p) % 1;
        const y = wy0 + 0.15 + prog * Math.max(0.05, surf - wy0 - 0.25);
        const pt: V3 = [cx + b.x * (tw - 0.9), y, b.z * (td - 0.9)];
        const [x, yy] = this.P(pt);
        g.beginPath();
        g.arc(x, yy, Math.max(1.2, this.px(pt) * (0.05 + (idx + 1) * 0.01)), 0, Math.PI * 2);
        g.fillStyle = `rgba(224,242,254,${(0.55 * Math.sin(prog * Math.PI)).toFixed(3)})`;
        g.fill();
      });
      g.restore();

      this.surface(cx, surf, w, idx === 0, tw - 0.3, td - 0.3, wy0);
      this.faces(wb, { base: w.mid, alpha: 0.5, grad: [mix(w.mid, w.top, 0.55), w.deep] }, "front");
    }

    // เฟสหน้า
    this.faces(glass, { base: GL, alpha: 0.13, edge: "rgba(226,240,255,.35)" }, "front");
    this.faces(postFaces(false), { base: STEEL });
    this.faces(rim(), { base: hex("#a7b6c9") });
  }

  private surface(cx: number, surf: number, w: { top: RGB; mid: RGB; deep: RGB }, hasInlet: boolean, sw: number, sd: number, wy0: number) {
    const NX = 14, NZ = 10;
    const amp = clamp((surf - wy0) / 0.6, 0, 1) * 0.055;
    const t = this.t;
    const inletX = hasInlet ? TANK_X[0] : 1e9;
    const hf = (x: number, z: number) => {
      let y = surf + amp * (Math.sin(x * 1.5 + t * 1.9) + 0.8 * Math.sin(z * 2.1 + t * 1.4) + 0.5 * Math.sin((x + z) * 2.7 - t * 2.3));
      if (hasInlet && this.valveOpen > 0.05) {
        const r = Math.hypot(x - inletX, z);
        y += 0.075 * this.valveOpen * Math.sin(r * 5.5 - t * 7) * Math.exp(-r * 0.75);
      }
      return y;
    };
    const grid: V3[][] = [];
    for (let i = 0; i <= NX; i++) {
      grid.push([]);
      for (let j = 0; j <= NZ; j++) {
        const x = cx - sw / 2 + (sw * i) / NX, z = -sd / 2 + (sd * j) / NZ;
        grid[i].push([x, hf(x, z), z]);
      }
    }
    const quads: { p: P2[]; z: number; k: number }[] = [];
    for (let i = 0; i < NX; i++)
      for (let j = 0; j < NZ; j++) {
        const q = [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]];
        const nrm = norm(cross(sub(q[1], q[0]), sub(q[3], q[0])));
        const n: V3 = nrm[1] < 0 ? [-nrm[0], -nrm[1], -nrm[2]] : nrm;
        let zs = 0;
        const p = q.map((v) => { const r = this.P(v); zs += r[2]; return [r[0], r[1]] as P2; });
        const spec = Math.pow(Math.max(0, dot(n, norm([0.1, 1, 0.35]))), 40);
        quads.push({ p, z: zs / 4, k: clamp(0.92 + (dot(n, LIGHT) - 0.85) * 3.2, 0.7, 1.25) + spec * 0.0 });
      }
    quads.sort((a, b) => b.z - a.z);
    for (const q of quads) {
      const c = mix(w.mid, w.top, clamp((q.k - 0.8) * 2.4, 0, 1));
      this.poly(q.p, css(c, 1, 0.88), css(c, 1, 0.88), 0.6);
    }
    // ประกายผิวน้ำ
    this.ctx.save();
    for (let i = 0; i < 6; i++) {
      const x = cx + Math.sin(t * 0.3 + i * 2.1) * (sw / 2 - 0.5), z = Math.cos(t * 0.25 + i * 1.7) * (sd / 2 - 0.5);
      const a: V3 = [x - 0.35, hf(x, z) + 0.01, z], b: V3 = [x + 0.35, hf(x, z) + 0.01, z];
      this.line3(a, b, `rgba(255,255,255,${(0.22 + 0.18 * Math.sin(t * 2 + i)).toFixed(2)})`, 1.4);
    }
    this.ctx.restore();
  }

  /* ----- ท่อ ----- */
  private pipe(p: PipeDef, on: boolean) {
    const g = this.ctx;
    const pts = p.pts.map((q) => this.P(q));
    const mid = p.pts[Math.floor(p.pts.length / 2)];
    const w = Math.max(5, PIPE_R * 2 * this.px(mid));

    // วาดเส้นท่อด้วย Safe Quadratic Curve ป้องกันปัญหา arcTo เพี้ยน/ระเบิดเวลาหมุนมุมมอง
    const path = () => {
      g.beginPath();
      if (pts.length === 0) return;
      g.moveTo(pts[0][0], pts[0][1]);

      for (let i = 1; i < pts.length - 1; i++) {
        const p0 = pts[i - 1];
        const p1 = pts[i];
        const p2 = pts[i + 1];

        const d1x = p0[0] - p1[0];
        const d1y = p0[1] - p1[1];
        const len1 = Math.hypot(d1x, d1y);

        const d2x = p2[0] - p1[0];
        const d2y = p2[1] - p1[1];
        const len2 = Math.hypot(d2x, d2y);

        if (len1 < 1.5 || len2 < 1.5) {
          g.lineTo(p1[0], p1[1]);
          continue;
        }

        // จำกัดระยะโค้งให้ปลอดภัย ไม่เกิน 42% ของความยาวเส้นแต่ละฝั่ง
        const cornerR = Math.min(len1 * 0.42, len2 * 0.42, w * 1.05);

        const startX = p1[0] + (d1x / len1) * cornerR;
        const startY = p1[1] + (d1y / len1) * cornerR;

        const endX = p1[0] + (d2x / len2) * cornerR;
        const endY = p1[1] + (d2y / len2) * cornerR;

        g.lineTo(startX, startY);
        g.quadraticCurveTo(p1[0], p1[1], endX, endY);
      }

      g.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    };

    g.save();
    g.lineJoin = "round";
    g.lineCap = "butt";
    g.setLineDash([]);
    path(); g.strokeStyle = "#0f172a"; g.lineWidth = w + 2; g.stroke();
    path(); g.strokeStyle = "#475569"; g.lineWidth = w; g.stroke();
    path(); g.strokeStyle = "#64748b"; g.lineWidth = w * 0.72; g.stroke();
    path(); g.strokeStyle = "#0b1220"; g.lineWidth = w * 0.52; g.stroke();
    if (on) {
      path(); g.strokeStyle = "#0284c7"; g.lineWidth = w * 0.46; g.stroke();
      g.setLineDash([w * 0.9, w * 1.05]);
      g.lineDashOffset = -this.t * w * 2.2;
      path(); g.strokeStyle = "#a5f3fc"; g.lineWidth = w * 0.3; g.stroke();
      g.setLineDash([]);
    }
    g.translate(-w * 0.14, -w * 0.18);
    path(); g.strokeStyle = "rgba(226,232,240,.5)"; g.lineWidth = Math.max(1.2, w * 0.1); g.stroke();
    g.restore();

    // หน้าแปลนปลายท่อ (เฉพาะจุดต่อที่จำเป็น ไม่วาดซ้อนที่ทางแยก 3 ทาง)
    [0, pts.length - 1].forEach((i) => {
      const a = p.pts[i], b = p.pts[i === 0 ? 1 : i - 1];
      // ข้ามหน้าแปลนที่จุดแยกสามทาง (T-Junctions) ที่ระนาบท่อหลัก
      if (
        Math.abs(a[1] - PY) < 0.15 &&
        Math.abs(a[2]) < 0.15 &&
        (Math.abs(a[0] - TEE_SUCTION_X) < 0.15 ||
          Math.abs(a[0] - TEE_DISCHARGE_X) < 0.15 ||
          Math.abs(a[0] - PRESSURE_X) < 0.15)
      ) {
        return;
      }

      const dir = norm(sub(b, a));
      const c: V3 = [a[0] + dir[0] * 0.11, a[1] + dir[1] * 0.11, a[2] + dir[2] * 0.11];
      const ax = (Math.abs(dir[0]) > 0.5 ? 0 : Math.abs(dir[1]) > 0.5 ? 1 : 2) as 0 | 1 | 2;
      const fs = cylFaces(c, ax, PIPE_R * 1.28, 0.22, 16);
      this.faces(fs, { base: hex("#7b8ba3") });
    });
  }

  /** วาดข้อต่อสามทาง (Tee Joint) เชื่อมท่อแยกเข้ากับท่อหลักอย่างแนบเนียน */
  private teeJoint(pos: V3, branchAxis: 1 | 2) {
    const r = PIPE_R * 1.22;
    // ปลอกข้อต่อในแนวท่อหลักแกน X
    this.faces(cylFaces(pos, 0, r, 0.95, 16), { base: hex("#5a6b82") });
    // ปลอกข้อต่อแยก (branch) ในแนวแกน Z หรือแกน Y
    const branchLen = branchAxis === 1 ? 0.75 : 0.95;
    this.faces(cylFaces(pos, branchAxis, r, branchLen, 16), { base: hex("#5a6b82") });
  }

  private stream(on: boolean, pos: V3 = [TANK_X[0], 3.5, 0]) {
    if (this.valveOpen < 0.05 || !on) return;
    const g = this.ctx;
    const wy0 = TY0 + 0.1;
    const wmax = 3.7;
    const pct = this.tankCalculations?.tank1.percent ?? this.level;
    const surf = wy0 + wmax * clamp(pct / 100, 0, 1);
    const top: V3 = [pos[0], 4.9, 0], bot: V3 = [pos[0], surf + 0.02, 0];
    const a = this.P(top), b = this.P(bot);
    const w = 0.3 * this.px(top);
    g.save();
    g.globalAlpha = this.valveOpen;
    g.lineCap = "butt";
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
    g.strokeStyle = "rgba(56,189,248,.65)"; g.lineWidth = w; g.stroke();
    g.setLineDash([w * 1.2, w * 1.6]);
    g.lineDashOffset = -this.t * w * 9;
    g.strokeStyle = "rgba(224,247,255,.95)"; g.lineWidth = w * 0.45; g.stroke();
    g.restore();
    // วงน้ำกระเพื่อม
    for (let k = 0; k < 2; k++) {
      const ph = (this.t * 0.9 + k * 0.5) % 1;
      const pts = ring([pos[0], surf + 0.03, 0], 1, 0.25 + ph * 1.3, 32).map((q) => { const r = this.P(q); return [r[0], r[1]] as P2; });
      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
      g.closePath();
      g.strokeStyle = `rgba(224,247,255,${((1 - ph) * 0.75 * this.valveOpen).toFixed(3)})`;
      g.lineWidth = 2;
      g.stroke();
    }
  }

  /* ----- อุปกรณ์ ----- */
  private valve(open: boolean, pos: V3 = [-10.0, 5.8, 0]) {
    const g = this.ctx;
    const body = open ? hex("#10b981") : hex("#dc2626");
    const c: V3 = [pos[0], pos[1], pos[2]];
    const glow = open ? 0.12 : 0;
    this.faces(cylFaces(c, 0, 0.62, 1.5, 20), { base: body, glow });
    [-0.78, 0.78].forEach((o) => this.faces(cylFaces([c[0] + o, c[1], c[2]], 0, 0.78, 0.16, 20), { base: hex("#8a9ab0") }));
    this.faces(cylFaces([c[0], c[1] + 0.8, c[2]], 1, 0.3, 0.8, 16), { base: hex("#9aa9bd") });
    // พวงมาลัยวาล์ว
    const top: V3 = [c[0], c[1] + 1.32, c[2]];
    const rg = ring(top, 1, 0.66, 28).map((q) => this.P(q));
    g.save();
    g.beginPath();
    rg.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.closePath();
    g.strokeStyle = open ? GREEN : "#f87171";
    g.lineWidth = Math.max(3, 0.1 * this.px(top));
    if (open) { g.shadowColor = "rgba(52,211,153,.9)"; g.shadowBlur = 12; }
    g.stroke();
    g.restore();
    this.line3([top[0] - 0.66, top[1], top[2]], [top[0] + 0.66, top[1], top[2]], "#e2e8f0", Math.max(2, 0.06 * this.px(top)));
    this.line3([top[0], top[1], top[2] - 0.66], [top[0], top[1], top[2] + 0.66], "#e2e8f0", Math.max(2, 0.06 * this.px(top)));
    this.faces(cylFaces(top, 1, 0.11, 0.2, 10), { base: hex("#e2e8f0") });
  }

  private flowMeter(flowing: boolean, pos: V3 = [-12.5, 5.8, 0]) {
    const g = this.ctx;
    const c: V3 = [pos[0], pos[1], pos[2]];
    this.faces(cylFaces(c, 0, 0.7, 1.6, 22), { base: hex("#3b4a63") });
    [-0.85, 0.85].forEach((o) => this.faces(cylFaces([c[0] + o, c[1], c[2]], 0, 0.8, 0.16, 20), { base: hex("#8a9ab0") }));
    this.faces(cylFaces([c[0], c[1] + 0.8, c[2]], 1, 0.5, 0.6, 20), { base: hex("#26334a") });
    // หน้าปัด
    const top: V3 = [c[0], c[1] + 1.12, c[2]];
    const rg = ring(top, 1, 0.42, 24).map((q) => this.P(q));
    const [cx, cy] = this.P(top);
    g.save();
    g.beginPath();
    rg.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.closePath();
    g.fillStyle = "#0b1220";
    g.fill();
    g.strokeStyle = flowing ? "#67e8f9" : "#64748b";
    g.lineWidth = Math.max(2, 0.06 * this.px(top));
    if (flowing) { g.shadowColor = "rgba(103,232,249,.8)"; g.shadowBlur = 10; }
    g.stroke();
    g.restore();
    const a = this.t * (flowing ? 3 : 0) - 1.2;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * 0.3 * this.px(top), cy + Math.sin(a) * 0.12 * this.px(top));
    g.strokeStyle = flowing ? "#67e8f9" : "#94a3b8";
    g.lineWidth = 2;
    g.stroke();
  }

  private gauge(on: boolean, pos: V3 = [PRESSURE_X, 3.95, 0]) {
    const g = this.ctx;
    const c: V3 = [pos[0], pos[1], pos[2]];
    // ก้านเกจวัดเชื่อมจากจุดต่อท่อ (GAUGE_BOTTOM_Y = 3.10) ขึ้นสู่ตัวเรือนเกจ (c[1] - 0.6 = 3.35, ยาว 0.5 ครอบ 3.10 - 3.60)
    this.faces(cylFaces([c[0], c[1] - 0.6, c[2]], 1, 0.3, 0.5, 14), { base: hex("#9aa9bd") });
    // ปลอกข้อต่อเกลียวเชื่อมระหว่างท่อกับเกจวัด
    this.faces(cylFaces([c[0], GAUGE_BOTTOM_Y + 0.08, c[2]], 1, 0.44, 0.16, 16), { base: hex("#7b8ba3") });
    const body = cylFaces(c, 2, 0.9, 0.5, 26);
    this.faces(body.slice(0, -1), { base: hex("#6b7c93") });
    const front: V3 = [c[0], c[1], c[2] + 0.26];
    const facing = dot([0, 0, 1], sub(this.view.pos, front)) > 0;
    if (!facing) { this.faces(body.slice(-1), { base: hex("#6b7c93") }); return; }
    const rg = ring(front, 2, 0.78, 28).map((q) => this.P(q));
    const [cx, cy] = this.P(front);
    g.save();
    g.beginPath();
    rg.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.closePath();
    g.fillStyle = "#0b1220";
    g.fill();
    g.strokeStyle = on ? GREEN : "#64748b";
    g.lineWidth = Math.max(3, 0.1 * this.px(front));
    if (on) { g.shadowColor = "rgba(52,211,153,.85)"; g.shadowBlur = 14; }
    g.stroke();
    g.restore();
    this.text(on ? "ON" : "OFF", cx, cy, Math.max(4, 0.46 * this.px(front)), on ? GREEN : "#94a3b8", 700, false);
  }

  /* ----- ปั๊ม ----- */
  private pump(z: number, i: number, on: boolean, overload: boolean = false) {
    const g = this.ctx;
    const front = i === 1;
    // ฐาน
    const skidZ = front ? 1.5 : -3.1, skidD = front ? 3.0 : 3.2;
    this.faces(boxFaces(PUMP_X, 0.15, skidZ, 3.2, 0.3, skidD), { base: hex("#334155") });
    this.faces(boxFaces(PUMP_X, 0.34, skidZ, 2.9, 0.08, skidD - 0.3), { base: hex("#475569") });

    const motor = () => {
      const mz = z - 1.4;
      this.faces(cylFaces([PUMP_X, PY, z - 0.62], 2, 0.46, 0.3, 18), { base: hex("#64748b") }); // คัปปลิง
      this.faces(cylFaces([PUMP_X, PY, mz], 2, 0.7, 1.9, 24), { base: hex("#2f5aa8"), glow: on ? 0.04 : 0 });
      for (let k = 0; k < 5; k++) this.faces(cylFaces([PUMP_X, PY, mz - 0.7 + k * 0.35], 2, 0.755, 0.07, 24), { base: hex("#25488a") });
      this.faces(cylFaces([PUMP_X, PY, mz - 1.0], 2, 0.62, 0.16, 20), { base: hex("#1b2f57") });
      this.faces(boxFaces(PUMP_X, PY + 0.84, mz + 0.1, 0.62, 0.38, 0.7), { base: hex("#1f3d73") });
    };
    const volute = () => {
      const cz = z;
      const fz = cz + 0.46;
      const vf = cylFaces([PUMP_X, PY, cz], 2, 0.98, 0.92, 28);
      this.faces(vf.slice(0, -1), { base: hex("#566a85") });
      this.faces(cylFaces([PUMP_X - 0.98, PY, cz], 0, 0.5, 0.2, 14), { base: hex("#7b8ba3") });
      this.faces(cylFaces([PUMP_X + 0.98, PY, cz], 0, 0.5, 0.2, 14), { base: hex("#7b8ba3") });
      const facing = dot([0, 0, 1], sub(this.view.pos, [PUMP_X, PY, fz])) > 0;
      if (!facing) { this.faces(vf.slice(-1), { base: hex("#566a85") }); return; }
      const rim = ring([PUMP_X, PY, fz], 2, 0.98, 30).map((q) => this.P(q));
      const disc = ring([PUMP_X, PY, fz], 2, 0.82, 30).map((q) => this.P(q));
      this.poly(rim, "#6d819c", "rgba(255,255,255,.18)", 1);
      g.save();
      if (overload) {
        g.shadowColor = "rgba(239,68,68,.95)";
        g.shadowBlur = 18;
      } else if (on) {
        g.shadowColor = "rgba(52,211,153,.9)";
        g.shadowBlur = 16;
      }
      this.poly(disc, "#0a1424", overload ? "#ef4444" : on ? GREEN : "#334155", Math.max(2, 0.05 * this.px([PUMP_X, PY, fz])));
      g.restore();
      // ใบพัด
      const blades = 6;
      const bladeColor = overload ? "#f87171" : on ? "#34d399" : "#7d8da3";
      for (let b = 0; b < blades; b++) {
        const a = this.angle[i] + (b / blades) * Math.PI * 2;
        const p = (r: number, off: number): P2 => {
          const q = this.P([PUMP_X + Math.cos(a + off) * r, PY + Math.sin(a + off) * r, fz - 0.04]);
          return [q[0], q[1]];
        };
        this.poly([p(0.12, -0.35), p(0.74, -0.12), p(0.74, 0.22), p(0.12, 0.2)], bladeColor, "rgba(0,0,0,.35)", 0.8);
      }
      const hub = ring([PUMP_X, PY, fz - 0.02], 2, 0.15, 14).map((q) => this.P(q));
      this.poly(hub, "#e2e8f0");
      // ประกายกระจก
      const sheen = [this.P([PUMP_X - 0.7, PY + 0.3, fz]), this.P([PUMP_X - 0.2, PY + 0.75, fz]), this.P([PUMP_X + 0.1, PY + 0.6, fz]), this.P([PUMP_X - 0.55, PY + 0.05, fz])];
      this.poly(sheen.map((q) => [q[0], q[1]] as P2), "rgba(255,255,255,.07)");
    };

    // เรียงมอเตอร์/โวลูต ตามระยะ
    const dm = this.P([PUMP_X, PY, z - 1.4])[2], dv = this.P([PUMP_X, PY, z])[2];
    if (dm >= dv) { motor(); volute(); } else { volute(); motor(); }

    // ไฟสถานะ
    const lamp: V3 = [PUMP_X, PY + 1.15, z];
    const [lx, ly] = this.P(lamp);
    const lampColor = overload ? "#ef4444" : on ? GREEN : "#475569";
    g.save();
    g.beginPath();
    g.arc(lx, ly, Math.max(3, 0.14 * this.px(lamp)), 0, Math.PI * 2);
    g.fillStyle = lampColor;
    if (on || overload) {
      g.shadowColor = lampColor;
      g.shadowBlur = 18;
    }
    g.fill();
    g.restore();
  }

  /* ----- ป้าย / HUD ----- */
  private labels(s: SceneInput) {
    const g = this.ctx;
    const c = s.data.controls, wl = s.data.water_level;
    const lbl = (on: boolean) => (on ? GREEN : (this.isDark ? "#94a3b8" : "#64748b"));
    const isEn = this.lang === 'en';

    // เปอร์เซ็นต์ในบ่อ + เครื่องหมายระดับ
    TANK_X.forEach((x, i) => {
      const cfg = this.tankConfig;
      const dims = i === 0 ? cfg.tank1 : cfg.tank2;
      const calc = i === 0 ? this.tankCalculations?.tank1 : this.tankCalculations?.tank2;
      const pct = calc ? calc.percent : s.percent;

      // กราฟฟิกขนาดบ่อเท่ากันทั้งสองบ่อ (ความกว้าง 8)
      const tw = TANK_W, td = TANK_D, th = TANK_H, ty0 = TY0;

      const anchor: V3 = [x + 0.35, ty0 + th * 0.55, td / 2];
      const [px, py, pz] = this.P(anchor);
      const sc = (this.view.focal / pz) * 0.62;

      this.text(`${pct.toFixed(1)}%`, px, py, Math.max(6, sc * 1.3), this.isDark ? "#ffffff" : "#f5f5f5");

      // แสดงเป็น cm หรือ lite (ลิตร) ตามปุ่มปรับ
      let subVal = '';
      if (this.displayUnit === 'liter') {
        const volL = calc ? calc.volume_l : wl.level_cm * 180;
        subVal = `${Math.round(volL).toLocaleString()} ${isEn ? 'L' : 'ลิตร'}`;
      } else {
        const lvlCm = calc ? calc.level_cm : wl.level_cm;
        subVal = `${lvlCm.toFixed(1)} cm`;
      }
      this.text(subVal, px, py + Math.max(6, sc * 1.3) * 0.85, Math.max(4.5, sc * 0.55), this.isDark ? "#e2e8f0" : "#f5f5f5", 500);

      [25, 50, 75].forEach((m) => {
        const y = ty0 + 0.1 + ((th - 0.5) * m) / 100;
        const a: V3 = [x - tw / 2 + 0.05, y, td / 2 + 0.02];
        this.line3(a, [a[0] + 0.45, y, a[2]], this.isDark ? "rgba(255,255,255,.55)" : "rgba(206, 206, 206, 0.35)", 1.2);
        const [tx, ty] = this.P([a[0] + 0.95, y, a[2]]);
        this.text(`${m}%`, tx, ty, Math.max(4, 0.28 * this.px(a)), this.isDark ? "rgba(226,232,240,.75)" : "rgba(51,65,85,.85)", 500, false);
      });

      const tankName = isEn ? `Tank ${i + 1}` : `บ่อเก็บน้ำ ${i + 1}`;
      const dimBadge = ` (${dims.width_m}×${dims.length_m}×${dims.height_m}m)`;
      this.pill(tankName + dimBadge, [x, ty0 - 0.15, td / 2 + 1.1], this.isDark ? "#cbd5e1" : "#1e293b", 12);
    });

    const inflowText = isEn ? "Inflow" : "น้ำประปาเข้า";
    this.pill(inflowText, [-14.5, 4.7, 0], this.isDark ? "#94a3b8" : "#475569");

    const valveText = c.valve_on
      ? (isEn ? "VALVE Open (Filling)" : "VALVE เปิด (เติมน้ำ)")
      : (isEn ? "VALVE Closed" : "VALVE ปิด");
    this.pill(valveText, [-10.0, 4.1, 0], lbl(c.valve_on));

    const pipeText = isEn ? "Pipe" : "ท่อเชื่อมบ่อ";
    this.pill(pipeText, [0, 2.35, 0], this.isDark ? "#94a3b8" : "#475569", 11.5);

    const p1Overload = Boolean(c.pump1_overload);
    const p2Overload = Boolean(c.pump2_overload);
    const p1Text = p1Overload ? "PUMP 1 · OVERLOAD" : `PUMP 1 · ${c.pump1_on ? "RUN" : "STOP"}`;
    const p1Color = p1Overload ? "#ef4444" : lbl(c.pump1_on);
    this.pill(p1Text, [PUMP_X, PY + 2.2, PUMP_Z[0]], p1Color);

    const p2Text = p2Overload ? "PUMP 2 · OVERLOAD" : `PUMP 2 · ${c.pump2_on ? "RUN" : "STOP"}`;
    const p2Color = p2Overload ? "#ef4444" : lbl(c.pump2_on);
    this.pill(p2Text, [PUMP_X + 0.2, 0, PUMP_Z[1] + 2.0], p2Color);
    this.pill("PRESSURE SWITCH", [PRESSURE_X, 5.3, 0], this.isDark ? "#94a3b8" : "#475569", 11.5);

    const outflowText = isEn ? "Distribution" : "จ่ายน้ำไปใช้งาน";
    this.pill(outflowText, [21.2, 2.3, 0], this.isDark ? "#94a3b8" : "#475569");

    // การ์ดอัตราการไหล / ปริมาณสะสม ติดกับมิเตอร์
    const [fx, fy, fz] = this.P([FLOW_METER_POS[0], 8.6, 0]);
    const sc = clamp((this.view.dist / fz) * this.cam.zoom, 0.25, 1.35) * clamp(this.W / 1150, 0.65, 1.2);
    const cw = 232 * sc, ch = 58 * sc;
    const x0 = fx - cw / 2, y0 = fy - ch / 2;
    g.save();
    g.beginPath();
    g.roundRect(x0, y0, cw, ch, Math.max(2, 11 * sc));
    g.fillStyle = this.isDark ? "rgba(8,13,26,.88)" : "rgba(255,255,255,.95)";
    g.fill();
    g.strokeStyle = this.isDark ? "rgba(100,116,139,.55)" : "rgba(203,213,225,.9)";
    g.lineWidth = Math.max(0.6, 1 * sc);
    g.stroke();
    g.beginPath();
    g.moveTo(fx, y0 + 10 * sc);
    g.lineTo(fx, y0 + ch - 10 * sc);
    g.stroke();
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    g.font = `500 ${(10.5 * sc).toFixed(1)}px system-ui, "Noto Sans Thai", sans-serif`;
    g.fillStyle = this.isDark ? "#94a3b8" : "#64748b";
    g.fillText(isEn ? "Flow Rate" : "อัตราการไหล", x0 + 12 * sc, y0 + 19 * sc);
    g.fillText(isEn ? "Total Volume" : "ปริมาณสะสม", fx + 12 * sc, y0 + 19 * sc);
    g.font = `700 ${(19 * sc).toFixed(1)}px system-ui, sans-serif`;
    g.fillStyle = wl.flow_rate > 0 ? (this.isDark ? "#67e8f9" : "#0284c7") : (this.isDark ? "#e2e8f0" : "#1e293b");
    g.fillText(wl.flow_rate.toFixed(3) + (FLOW_UNIT ? " " + FLOW_UNIT : ""), x0 + 12 * sc, y0 + 45 * sc);
    g.fillStyle = this.isDark ? "#e2e8f0" : "#1e293b";
    g.fillText(wl.volumn.toFixed(3) + (VOL_UNIT ? " " + VOL_UNIT : ""), fx + 12 * sc, y0 + 45 * sc);
    g.restore();

    // ตัวชี้ตำแหน่งป้ายแสดงการไหล ลากเส้นนำตรงไปยังหน้าปัดโฟลว์มิเตอร์ (Flow Meter)
    const [mx, my] = this.P(FLOW_METER_TOP);
    const cardBottomY = y0 + ch;
    g.save();
    g.beginPath();
    g.moveTo(fx, cardBottomY);
    g.lineTo(mx, my);
    g.strokeStyle = wl.flow_rate > 0
      ? (this.isDark ? "rgba(103,232,249,.8)" : "rgba(2,132,199,.8)")
      : (this.isDark ? "rgba(148,163,184,.65)" : "rgba(100,116,139,.65)");
    g.lineWidth = Math.max(1.2, 1.5 * sc);
    g.setLineDash([4 * sc, 3 * sc]);
    g.stroke();
    g.setLineDash([]);

    // จุดตัวชี้เป้าหมาย (Pointer indicator pin) บนหน้าปัดมิเตอร์
    g.beginPath();
    g.arc(mx, my, Math.max(2.5, 3.8 * sc), 0, Math.PI * 2);
    g.fillStyle = wl.flow_rate > 0 ? "#67e8f9" : (this.isDark ? "#94a3b8" : "#64748b");
    g.fill();
    g.strokeStyle = this.isDark ? "#0f172a" : "#ffffff";
    g.lineWidth = 1.2;
    g.stroke();
    g.restore();
  }

  private hud(s: SceneInput) {
    const g = this.ctx;
    const f = clamp(this.W / 1150, 0.8, 1.15);
    const isEn = this.lang === 'en';
    g.save();
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    g.font = `500 ${13 * f}px system-ui, "Noto Sans Thai", sans-serif`;
    g.fillStyle = this.isDark ? "#94a3b8" : "#64748b";
    const modeLabel = isEn ? "Mode" : "โหมด";
    g.fillText(`${modeLabel}: ${s.data.controls.auto_mode ? "AUTO" : "MANUAL"}`, 16, this.H - 16);
    g.textAlign = "right";
    g.font = `400 ${11 * f}px system-ui, "Noto Sans Thai", sans-serif`;
    g.fillStyle = this.isDark ? "rgba(148,163,184,.65)" : "rgba(100,116,139,.75)";
    const hintText = isEn
      ? "Drag = Rotate · Scroll = Zoom · Double-click = Reset"
      : "ลาก = หมุนมุมมอง · ล้อเมาส์ = ซูม · ดับเบิลคลิก = รีเซ็ต";
    g.fillText(hintText, this.W - 16, this.H - 16);
    g.restore();
  }
}
