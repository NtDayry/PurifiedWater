// @ts-nocheck
/**
 * โมเดล 3 มิติ DENZA D9 (สร้างโดยผู้ใช้ — แปลงจาก index.html three.js r128 มาเป็นโมดูลสำหรับ three 0.170)
 * หน่วยเป็นเมตร: +Z = หน้ารถ (ยาว 5.25 ม. Z -2.625..+2.625), X กว้าง 1.96 ม., Y = 0 ที่พื้นถึงหลังคา 1.92 ม.
 * ตัดส่วนของหน้าเว็บต้นฉบับออก (ฉาก/กล้อง/ไฟสตูดิโอ/พื้น/ปุ่ม UI/แอนิเมชัน/สปอตไลต์ไฟหน้า) เหลือเฉพาะตัวรถ
 * ไฟล์นี้ปิด type-check ไว้ (โค้ดสร้างเรขาคณิตแบบ imperative จำนวนมาก เหมือน factoryScene3d.ts)
 */
import * as THREE from 'three';

export interface DenzaD9Options {
  /** texture ป้ายทะเบียน (หน้า+หลัง) ขนาด 0.34 × 0.15 ม.; ไม่ระบุ = ป้ายโชว์ "DENZA D9" */
  plateTexture?: THREE.Texture;
  /** env map สำหรับเงาสะท้อนสีรถ/โครเมียม (ต้นฉบับใช้ RoomEnvironment) */
  envMap?: THREE.Texture | null;
  /** ตัวคูณความแรงเงาสะท้อน (envMapIntensity) ของทุกวัสดุ — ฉากที่ไม่ได้ใช้ tone mapping แบบสตูดิโอควรลดลง */
  envScale?: number;
  /** ตัวคูณเงาสะท้อนของวัสดุโลหะ (metalness ≥ 0.5 เช่น โครเมียม/ล้อ) — โลหะต้องอาศัยเงาสะท้อนจึงไม่ควรลดมาก */
  envScaleMetal?: number;
}

/** สร้างกลุ่มโมเดลรถ DENZA D9 (หน้ารถหันไป +Z, ล้อแตะพื้นที่ y = 0) */
export function createDenzaD9(opts: DenzaD9Options = {}): THREE.Group {
  const carRoot = new THREE.Group();

  const FRONT_AXLE_Z = 1.670;
  const REAR_AXLE_Z = -1.440;
  const WHEEL_RADIUS = 0.382;

  // Automotive Physically Based Materials
  const bodyPaintMat = new THREE.MeshPhysicalMaterial({
    color: 0xf4f6f9,
    metalness: 0.14,
    roughness: 0.11,
    clearcoat: 1.0,
    clearcoatRoughness: 0.035,
    reflectivity: 1.0,
    envMapIntensity: 1.45
  });

  const blackGlossMat = new THREE.MeshPhysicalMaterial({
    color: 0x05070b,
    metalness: 0.22,
    roughness: 0.06,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.5
  });

  const darkTrimMat = new THREE.MeshStandardMaterial({
    color: 0x141720,
    metalness: 0.18,
    roughness: 0.65
  });

  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    metalness: 0.98,
    roughness: 0.04,
    envMapIntensity: 1.9
  });

  const silverSatinMat = new THREE.MeshPhysicalMaterial({
    color: 0xdce2ea,
    metalness: 0.86,
    roughness: 0.16,
    clearcoat: 0.65,
    envMapIntensity: 1.55
  });

  const privacyGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x020408,
    metalness: 0.18,
    roughness: 0.025,
    transparent: true,
    opacity: 0.985,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    reflectivity: 1.0,
    envMapIntensity: 1.85
  });

  const headlightLensMat = new THREE.MeshPhysicalMaterial({
    color: 0xe0f2fe,
    metalness: 0.05,
    roughness: 0.02,
    transparent: true,
    opacity: 0.34,
    clearcoat: 1.0
  });

  const headlightLEDMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xe0f2fe,
    emissiveIntensity: 2.8,
    roughness: 0.1
  });

  const taillightLEDMat = new THREE.MeshStandardMaterial({
    color: 0xff1e1e,
    emissive: 0xef4444,
    emissiveIntensity: 2.5,
    roughness: 0.12
  });

  const batteryGlowMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7,
    emissive: 0x0ea5e9,
    emissiveIntensity: 0.9,
    metalness: 0.5,
    roughness: 0.25
  });

  const seatLeatherMat = new THREE.MeshStandardMaterial({
    color: 0xd8d3c8,
    roughness: 0.42,
    metalness: 0.04
  });

  const paintMeshes = [];
  function registerPaintMesh(mesh) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    paintMeshes.push(mesh);
    return mesh;
  }

  function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // Unified Plan-View Half-Width Function
  function getHalfWidthAtZ(z) {
    const baseW = 0.956;
    if (z > 1.80) {
      const t = smoothstep(1.80, 2.58, z);
      return baseW * (1.0 - 0.145 * Math.pow(t, 1.45));
    }
    if (z < -2.00) {
      const t = smoothstep(-2.00, -2.58, z);
      return baseW * (1.0 - 0.085 * Math.pow(t, 1.40));
    }
    return baseW;
  }

  // Master Longitudinal Silhouette Profile matching the uploaded white Denza D9 photo
  function getBodyProfileAtZ(z) {
    // 1. Lower Sill & Wheel Arch Cutouts
    let yBottom = 0.185;
    const rArch = 0.432;
    const dFront = Math.abs(z - FRONT_AXLE_Z);
    const dRear = Math.abs(z - REAR_AXLE_Z);

    if (dFront < rArch) {
      yBottom = WHEEL_RADIUS + Math.sqrt(Math.max(0, rArch * rArch - dFront * dFront)) * 0.95;
    } else if (dRear < rArch) {
      yBottom = WHEEL_RADIUS + Math.sqrt(Math.max(0, rArch * rArch - dRear * dRear)) * 0.95;
    } else if (z > FRONT_AXLE_Z + rArch) {
      yBottom = lerp(0.185, 0.198, smoothstep(2.10, 2.58, z));
    } else if (z < REAR_AXLE_Z - rArch) {
      yBottom = lerp(0.195, 0.238, smoothstep(-1.88, -2.58, z));
    }

    // 2. Window Beltline & Short Steep MPV Bonnet
    let yBelt = 1.155;
    if (z > 1.72) {
      const tHood = smoothstep(1.72, 2.58, z);
      yBelt = lerp(1.135, 0.962, Math.pow(tHood, 1.08));
    } else if (z > 0.95) {
      const tDip = smoothstep(0.95, 1.72, z);
      yBelt = lerp(1.160, 1.135, tDip);
    } else {
      const tRear = smoothstep(0.95, -2.56, z);
      yBelt = lerp(1.160, 1.185, tRear);
    }

    // 3. One-Box MPV Roofline & Steeply Raked Windshield
    let yRoof = 1.912;
    if (z > 0.48) {
      const tWs = smoothstep(0.48, 1.72, z);
      yRoof = lerp(1.912, yBelt, Math.pow(tWs, 1.15));
    } else if (z < -2.38) {
      const tTail = smoothstep(-2.38, -2.58, z);
      yRoof = lerp(1.898, 1.185, Math.pow(tTail, 1.35));
    } else {
      const tMid = (z - 0.48) / (-2.38 - 0.48);
      yRoof = 1.912 - tMid * 0.014 + Math.sin(tMid * Math.PI) * 0.008;
    }

    const halfW = getHalfWidthAtZ(z);
    return { yBottom, yBelt, yRoof, halfW };
  }

  // Exact Outer Nose Surface Z(x, y) — Single Source of Truth for Front Body, Grille, Bars & Headlights!
  function getExactNoseZ(x, y) {
    const halfWAtNose = getHalfWidthAtZ(2.58) * 0.89; // ~0.728m at top brow
    const nx = Math.min(1.15, Math.abs(x) / halfWAtNose);
    const planSweep = Math.pow(nx, 1.85) * 0.235;
    const ty = Math.max(0, Math.min(1, (y - 0.198) / (0.962 - 0.198)));
    // Subtle vertical crown that peaks around Y=0.65 and meets hood edge cleanly at Y=0.962
    const verticalCamber = Math.sin(ty * Math.PI) * 0.022;
    return 2.618 - planSweep + verticalCamber;
  }

  // Exact Outer Rear Tailgate & Bumper Surface Z(x, y) — Single Source of Truth for Rear Body & Taillights!
  function getExactRearZ(x, y) {
    const halfWAtRear = getHalfWidthAtZ(-2.58) * 0.90;
    const nx = Math.min(1.15, Math.abs(x) / halfWAtRear);
    const planSweep = Math.pow(nx, 1.85) * 0.135;
    let verticalSlope = 0;
    if (y > 1.185) {
      verticalSlope = smoothstep(1.185, 1.898, y) * 0.175;
    } else if (y < 0.44) {
      // Slight lower bumper step out
      verticalSlope = -(1 - smoothstep(0.36, 0.44, y)) * 0.024;
    }
    return -2.605 + planSweep + verticalSlope;
  }

  // Exact Side Body Surface Point at (z, tSide) where tSide=0 is Beltline and tSide=1 is Bottom Sill
  function getExactSideBodyPoint(z, tSide, side) {
    const prof = getBodyProfileAtZ(z);
    const y = lerp(prof.yBelt, prof.yBottom, tSide);

    const dFront = Math.abs(z - FRONT_AXLE_Z);
    const dRear = Math.abs(z - REAR_AXLE_Z);
    let archFlare = 0;
    if (dFront < 0.50) archFlare = Math.cos((dFront / 0.50) * (Math.PI / 2)) * 0.024;
    if (dRear < 0.50) archFlare = Math.cos((dRear / 0.50) * (Math.PI / 2)) * 0.024;

    const shoulderCrease = Math.sin(tSide * Math.PI) * 0.020;
    const betweenWheels = smoothstep(REAR_AXLE_Z + 0.42, REAR_AXLE_Z + 0.68, z) *
                          (1 - smoothstep(FRONT_AXLE_Z - 0.68, FRONT_AXLE_Z - 0.42, z));
    const lowerScallop = (tSide > 0.56 && tSide < 0.88)
      ? -Math.sin(((tSide - 0.56) / 0.32) * Math.PI) * 0.015 * betweenWheels
      : 0;
    const fenderBulge = archFlare * Math.sin(tSide * Math.PI * 0.85);

    const x = side * (prof.halfW * lerp(0.89, 0.982, Math.pow(tSide, 0.42)) + shoulderCrease + lowerScallop + fenderBulge);

    let zOut = z;
    if (z > 2.22) {
      const tNose = smoothstep(2.22, 2.58, z);
      zOut = lerp(z, getExactNoseZ(x, y), tNose);
    } else if (z < -2.22) {
      const tRear = smoothstep(-2.22, -2.58, z);
      zOut = lerp(z, getExactRearZ(x, y), tRear);
    }

    return { x, y, z: zOut };
  }

  // -------------------------------------------------------------------------
  // 1. UNIFIED WATERTIGHT LOWER BODY SHELL (Front, Sides, Hood & Rear in One Continuous Mesh)
  // -------------------------------------------------------------------------
  function buildUnifiedLowerBody() {
    const group = new THREE.Group();
    const zSteps = 104;
    const vSteps = 36;
    const positions = [];
    const uvs = [];
    const indices = [];

    for (let iz = 0; iz <= zSteps; iz++) {
      const tz = iz / zSteps;
      const z = lerp(-2.58, 2.58, tz);
      const prof = getBodyProfileAtZ(z);
      const beltHalfW = prof.halfW * 0.89;

      for (let iv = 0; iv <= vSteps; iv++) {
        const s = (iv / vSteps) * 2 - 1; // -1 (Right) to +1 (Left)
        const side = s < 0 ? -1 : 1;
        const u = Math.abs(s);

        let x = 0;
        let y = 0;
        let zOut = z;

        if (u <= 0.34) {
          // Top deck / hood / cabin waist cap between left & right beltlines
          const tDeck = u / 0.34;
          x = side * tDeck * beltHalfW;
          // Hood crown fades to 0 right at the front edge (z=2.58) so it meets the front fascia cap with zero gap!
          const frontFade = 1 - smoothstep(2.42, 2.58, z);
          const hoodCrown = z > 1.55 ? (1 - tDeck * tDeck) * 0.032 * smoothstep(1.55, 2.15, z) * frontFade : 0;
          y = prof.yBelt + hoodCrown;

          if (z > 2.22) {
            const tNose = smoothstep(2.22, 2.58, z);
            zOut = lerp(z, getExactNoseZ(x, y), tNose);
          } else if (z < -2.22) {
            const tRear = smoothstep(-2.22, -2.58, z);
            zOut = lerp(z, getExactRearZ(x, y), tRear);
          }
        } else {
          // Side body panels from beltline (u=0.34) down to sill/arch (u=1.0)
          const tSide = (u - 0.34) / 0.66;
          const pt = getExactSideBodyPoint(z, tSide, side);
          x = pt.x;
          y = pt.y;
          zOut = pt.z;
        }

        positions.push(x, y, zOut);
        uvs.push(iv / vSteps, tz);
      }
    }

    const stride = vSteps + 1;
    for (let iz = 0; iz < zSteps; iz++) {
      for (let iv = 0; iv < vSteps; iv++) {
        const a = iz * stride + iv;
        const b = (iz + 1) * stride + iv;
        const c = (iz + 1) * stride + (iv + 1);
        const d = iz * stride + (iv + 1);
        indices.push(a, b, d);
        indices.push(b, c, d);
      }
    }

    const bodyGeo = new THREE.BufferGeometry();
    bodyGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    bodyGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    bodyGeo.setIndex(indices);
    bodyGeo.computeVertexNormals();
    group.add(registerPaintMesh(new THREE.Mesh(bodyGeo, bodyPaintMat)));

    // Seamless Front Nose Cap (shares exact boundary curve at z = 2.58 with the lower body!)
    const fCols = 36;
    const fRows = 20;
    const fPos = [];
    const fIdx = [];
    for (let ir = 0; ir <= fRows; ir++) {
      const tSide = 1.0 - (ir / fRows); // 1 at bottom sill, 0 at top beltline
      const leftBoundary = getExactSideBodyPoint(2.58, tSide, 1);
      const maxX = leftBoundary.x;
      const y = leftBoundary.y;

      for (let ic = 0; ic <= fCols; ic++) {
        const tx = (ic / fCols) * 2 - 1;
        const x = tx * maxX;
        const z = getExactNoseZ(x, y);
        fPos.push(x, y, z);
      }
    }
    const fStride = fCols + 1;
    for (let ir = 0; ir < fRows; ir++) {
      for (let ic = 0; ic < fCols; ic++) {
        const a = ir * fStride + ic;
        const b = (ir + 1) * fStride + ic;
        const c = (ir + 1) * fStride + (ic + 1);
        const d = ir * fStride + (ic + 1);
        fIdx.push(a, d, b);
        fIdx.push(b, d, c);
      }
    }
    const frontCapGeo = new THREE.BufferGeometry();
    frontCapGeo.setAttribute('position', new THREE.Float32BufferAttribute(fPos, 3));
    frontCapGeo.setIndex(fIdx);
    frontCapGeo.computeVertexNormals();
    group.add(registerPaintMesh(new THREE.Mesh(frontCapGeo, bodyPaintMat)));

    // Seamless Rear Tailgate & Bumper Cap (shares exact boundary curve at z = -2.58 with the lower body!)
    const rCols = 36;
    const rRows = 22;
    const rPos = [];
    const rIdx = [];
    for (let ir = 0; ir <= rRows; ir++) {
      const tSide = 1.0 - (ir / rRows); // 1 at bottom sill, 0 at top beltline
      const leftBoundary = getExactSideBodyPoint(-2.58, tSide, 1);
      const maxX = leftBoundary.x;
      const y = leftBoundary.y;
      const inPlateZoneY = smoothstep(0.56, 0.62, y) * (1 - smoothstep(0.82, 0.88, y));

      for (let ic = 0; ic <= rCols; ic++) {
        const tx = (ic / rCols) * 2 - 1;
        const x = tx * maxX;
        const inPlateZoneX = 1 - smoothstep(0.30, 0.40, Math.abs(x));
        const plateRecess = inPlateZoneY * inPlateZoneX * 0.022;
        const z = getExactRearZ(x, y) + plateRecess;
        rPos.push(x, y, z);
      }
    }
    const rStride = rCols + 1;
    for (let ir = 0; ir < rRows; ir++) {
      for (let ic = 0; ic < rCols; ic++) {
        const a = ir * rStride + ic;
        const b = (ir + 1) * rStride + ic;
        const c = (ir + 1) * rStride + (ic + 1);
        const d = ir * rStride + (ic + 1);
        rIdx.push(a, b, d);
        rIdx.push(b, c, d);
      }
    }
    const rearCapGeo = new THREE.BufferGeometry();
    rearCapGeo.setAttribute('position', new THREE.Float32BufferAttribute(rPos, 3));
    rearCapGeo.setIndex(rIdx);
    rearCapGeo.computeVertexNormals();
    group.add(registerPaintMesh(new THREE.Mesh(rearCapGeo, bodyPaintMat)));

    return group;
  }

  carRoot.add(buildUnifiedLowerBody());

  // Dark Inner Wheel-House Liners & Fender Arches
  function buildWheelHouseLiners() {
    const linerGroup = new THREE.Group();
    [FRONT_AXLE_Z, REAR_AXLE_Z].forEach((axleZ) => {
      [-1, 1].forEach((side) => {
        const lipGeo = new THREE.CylinderGeometry(0.434, 0.434, 0.14, 40, 1, true, -Math.PI * 0.52, Math.PI * 1.04);
        lipGeo.rotateZ(Math.PI / 2);
        const lipMesh = new THREE.Mesh(lipGeo, blackGlossMat);
        lipMesh.position.set(side * 0.892, WHEEL_RADIUS, axleZ);
        linerGroup.add(lipMesh);

        const drumGeo = new THREE.CylinderGeometry(0.428, 0.428, 0.34, 32, 1, false, 0, Math.PI * 2);
        drumGeo.rotateZ(Math.PI / 2);
        const drumMesh = new THREE.Mesh(drumGeo, darkTrimMat);
        drumMesh.position.set(side * 0.74, WHEEL_RADIUS + 0.02, axleZ);
        linerGroup.add(drumMesh);
      });
    });
    return linerGroup;
  }
  carRoot.add(buildWheelHouseLiners());

  // -------------------------------------------------------------------------
  // 2. UNIFIED GREENHOUSE, SCULPTED SIDE ROOF CANTRAIL, HEAVY TINT & HARDWARE
  // -------------------------------------------------------------------------
  function buildGreenhouseAndRoof() {
    const group = new THREE.Group();

    // Dark Privacy Interior Headliner & Pillar Blackout Backing (ensures 100% opaque dark privacy film look!)
    const blackoutMat = new THREE.MeshBasicMaterial({
      color: 0x020306,
      side: THREE.DoubleSide
    });

    // Helper for exact side glass surface X at (z, tGlass) where tGlass=0 is roof cantrail, tGlass=1 is beltline
    function getSideGlassX(z, tGlass) {
      const prof = getBodyProfileAtZ(z);
      const beltHalfW = prof.halfW * 0.89; // Matches exact outer edge of lower body deck!
      const roofHalfW = prof.halfW * 0.795;
      const curveOut = Math.sin(tGlass * Math.PI) * 0.012;
      return lerp(roofHalfW, beltHalfW, tGlass) + curveOut;
    }

    // Exact Window Top Line (where side glass meets the painted side roof rail / A-pillar)
    function getWindowTopYAtZ(z) {
      const prof = getBodyProfileAtZ(z);
      const railThickness = lerp(0.048, 0.068, smoothstep(1.65, 0.45, z));
      return prof.yRoof - railThickness;
    }

    // A. Continuous Deep-Tinted Greenhouse Loft (Windshield, Side Windows & Rear Tailgate Window)
    const zSteps = 76;
    const vSteps = 28;
    const pos = [];
    const innerPos = [];
    const idx = [];

    for (let iz = 0; iz <= zSteps; iz++) {
      const tz = iz / zSteps;
      const z = lerp(-2.58, 1.72, tz);
      const prof = getBodyProfileAtZ(z);
      const roofHalfW = prof.halfW * 0.795;

      for (let iv = 0; iv <= vSteps; iv++) {
        const s = (iv / vSteps) * 2 - 1;
        const side = s < 0 ? -1 : 1;
        const u = Math.abs(s);

        let x = 0;
        let y = 0;
        let zGlass = z;

        if (u <= 0.44) {
          const tTop = u / 0.44;
          x = side * tTop * roofHalfW;
          const underRoofOffset = z <= 0.48 ? -0.008 : 0.001;
          y = prof.yRoof + underRoofOffset + (1 - tTop * tTop) * 0.014;
          if (z > 0.50) {
            zGlass += (1 - tTop * tTop) * 0.058 * smoothstep(0.50, 1.70, z);
          }
        } else {
          const tGlass = (u - 0.44) / 0.56;
          // Overlap slightly (-0.008m) into the lower body beltline so there is zero gap!
          y = lerp(prof.yRoof - 0.004, prof.yBelt - 0.008, tGlass);
          x = side * getSideGlassX(z, tGlass);
        }

        if (z < -2.25) {
          const tRear = smoothstep(-2.25, -2.58, z);
          zGlass = lerp(zGlass, getExactRearZ(x, y) + 0.004, tRear);
        }

        pos.push(x, y, zGlass);
        // Inner blackout liner sits 6mm inside the outer privacy glass
        innerPos.push(x * 0.992, y - 0.004, zGlass * 0.997);
      }
    }

    const stride = vSteps + 1;
    for (let iz = 0; iz < zSteps; iz++) {
      for (let iv = 0; iv < vSteps; iv++) {
        const a = iz * stride + iv;
        const b = (iz + 1) * stride + iv;
        const c = (iz + 1) * stride + (iv + 1);
        const d = iz * stride + (iv + 1);
        idx.push(a, b, d);
        idx.push(b, c, d);
      }
    }

    const glassGeo = new THREE.BufferGeometry();
    glassGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    glassGeo.setIndex(idx);
    glassGeo.computeVertexNormals();
    const glassMesh = new THREE.Mesh(glassGeo, privacyGlassMat);
    glassMesh.castShadow = true;
    group.add(glassMesh);

    // Inner Blackout Liner Mesh (gives deep VIP privacy film appearance; automatically hidden in X-Ray mode)
    const blackoutGeo = new THREE.BufferGeometry();
    blackoutGeo.setAttribute('position', new THREE.Float32BufferAttribute(innerPos, 3));
    blackoutGeo.setIndex(idx);
    const blackoutMesh = new THREE.Mesh(blackoutGeo, blackoutMat);
    blackoutMesh.name = 'tintBlackoutLiner';
    group.add(blackoutMesh);

    // B. Gloss-Black Windshield Header Visor Band (Z = 0.48 to 0.72)
    const visorGeo = new THREE.PlaneGeometry(1.46, 0.24, 18, 4);
    const vAttr = visorGeo.attributes.position;
    for (let i = 0; i < vAttr.count; i++) {
      const vx = vAttr.getX(i);
      const vy = vAttr.getY(i);
      const vz = lerp(0.68, 0.48, (vy + 0.12) / 0.24);
      const prof = getBodyProfileAtZ(vz);
      const vw = prof.halfW * 0.79;
      const clampedX = Math.max(-vw, Math.min(vw, vx));
      const normX = clampedX / vw;
      const wrapZ = vz + (1 - normX * normX) * 0.045 * smoothstep(0.48, 1.70, vz);
      vAttr.setXYZ(i, clampedX, prof.yRoof + 0.004 + (1 - normX * normX) * 0.015, wrapZ);
    }
    visorGeo.computeVertexNormals();
    group.add(new THREE.Mesh(visorGeo, blackGlossMat));

    // C. Unified Painted Roof Skin, Side Roof Cantrail Beams & Rear Roof Spoiler
    // Instead of round pipes on the sides, we loft the entire roof + left/right side roof rails + A-pillar upper frame as a true automotive sheet-metal stamping!
    const rZSteps = 56;
    const rXSteps = 28;
    const rPos = [];
    const rIdx = [];

    for (let iz = 0; iz <= rZSteps; iz++) {
      const tz = iz / rZSteps;
      const z = lerp(-2.58, 0.50, tz);
      const prof = getBodyProfileAtZ(Math.max(-2.38, z));
      const roofHalfW = prof.halfW * 0.795;
      const spoilerLift = z < -2.28 ? smoothstep(-2.28, -2.58, z) * 0.018 : 0;

      for (let ix = 0; ix <= rXSteps; ix++) {
        const tx = (ix / rXSteps) * 2 - 1; // -1 to +1
        const x = tx * roofHalfW;
        const crown = (1 - tx * tx) * 0.018;
        const y = prof.yRoof + crown + spoilerLift;
        const rearCurveZ = z < -2.35 ? (tx * tx) * 0.055 * smoothstep(-2.35, -2.58, z) : 0;
        rPos.push(x, y, z + rearCurveZ);
      }
    }

    const rStride = rXSteps + 1;
    for (let iz = 0; iz < rZSteps; iz++) {
      for (let ix = 0; ix < rXSteps; ix++) {
        const a = iz * rStride + ix;
        const b = (iz + 1) * rStride + ix;
        const c = (iz + 1) * rStride + (ix + 1);
        const d = iz * rStride + (ix + 1);
        rIdx.push(a, b, d);
        rIdx.push(b, c, d);
      }
    }

    const roofPanelGeo = new THREE.BufferGeometry();
    roofPanelGeo.setAttribute('position', new THREE.Float32BufferAttribute(rPos, 3));
    roofPanelGeo.setIndex(rIdx);
    roofPanelGeo.computeVertexNormals();
    group.add(registerPaintMesh(new THREE.Mesh(roofPanelGeo, bodyPaintMat)));

    // D. Flush Curvature-Conforming Panoramic Sunroofs
    function createCurvedRoofGlass(zStart, zEnd, halfWidth, yOffset, mat) {
      const gzSteps = 18;
      const gxSteps = 18;
      const gPos = [];
      const gIdx = [];
      for (let iz = 0; iz <= gzSteps; iz++) {
        const z = lerp(zStart, zEnd, iz / gzSteps);
        const prof = getBodyProfileAtZ(z);
        const roofHalfW = prof.halfW * 0.795;
        for (let ix = 0; ix <= gxSteps; ix++) {
          const tx = (ix / gxSteps) * 2 - 1;
          const x = tx * halfWidth;
          const roofNormX = x / roofHalfW;
          const crown = (1 - roofNormX * roofNormX) * 0.018;
          const y = prof.yRoof + crown + yOffset;
          gPos.push(x, y, z);
        }
      }
      const gStride = gxSteps + 1;
      for (let iz = 0; iz < gzSteps; iz++) {
        for (let ix = 0; ix < gxSteps; ix++) {
          const a = iz * gStride + ix;
          const b = (iz + 1) * gStride + ix;
          const c = (iz + 1) * gStride + (ix + 1);
          const d = iz * gStride + (ix + 1);
          gIdx.push(a, b, d);
          gIdx.push(b, c, d);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(gPos, 3));
      geo.setIndex(gIdx);
      geo.computeVertexNormals();
      return new THREE.Mesh(geo, mat);
    }

    group.add(createCurvedRoofGlass(-1.58, 0.16, 0.53, 0.002, blackGlossMat));
    group.add(createCurvedRoofGlass(-0.34, 0.12, 0.49, 0.004, privacyGlassMat));
    group.add(createCurvedRoofGlass(-1.52, -0.40, 0.49, 0.004, privacyGlassMat));

    // E. Sculpted Sheet-Metal Side Roof Cantrail, A-Pillar & Chrome Window Molding (Zero Pipes!)
    [-1, 1].forEach((side) => {
      // 1. Flat-Section Lofted Painted A-Pillar & Side Roof Cantrail Stamping (Z from +1.72 all the way to -2.56)
      // This forms the crisp white painted roof arch above the side windows seen in the uploaded photo!
      const railZSteps = 72;
      const railVSteps = 8;
      const railPos = [];
      const railIdx = [];

      for (let iz = 0; iz <= railZSteps; iz++) {
        const z = lerp(-2.56, 1.72, iz / railZSteps);
        const prof = getBodyProfileAtZ(Math.max(-2.38, z));
        const spoilerLift = z < -2.28 ? smoothstep(-2.28, -2.56, z) * 0.016 : 0;

        // Vertical thickness of the painted side roof rail (tapers cleanly toward the front fender tip)
        const railH = lerp(0.044, 0.068, smoothstep(1.72, 0.48, z));
        const tGlassBottom = Math.min(0.22, railH / Math.max(0.18, prof.yRoof - prof.yBelt));

        const xInnerRoof = (prof.halfW * 0.795) - 0.048;
        const yInnerRoof = prof.yRoof + 0.003 + spoilerLift;

        const xOuterTop = getSideGlassX(z, 0.0) + 0.004;
        const yOuterTop = prof.yRoof + spoilerLift;

        const xOuterBot = getSideGlassX(z, tGlassBottom) + 0.005;
        const yOuterBot = Math.max(prof.yBelt + 0.002, prof.yRoof - railH + spoilerLift);

        const xInnerBot = xOuterBot - 0.018;
        const yInnerBot = yOuterBot;

        for (let iv = 0; iv <= railVSteps; iv++) {
          const tv = iv / railVSteps; // 0 = inner roof seam, 0.35 = outer top edge, 0.85 = outer bottom window edge, 1.0 = inner window return
          let rx = 0;
          let ry = 0;
          if (tv <= 0.35) {
            const k = tv / 0.35;
            rx = lerp(xInnerRoof, xOuterTop, k);
            ry = lerp(yInnerRoof, yOuterTop, k) + Math.sin(k * Math.PI) * 0.004;
          } else if (tv <= 0.85) {
            const k = (tv - 0.35) / 0.50;
            rx = lerp(xOuterTop, xOuterBot, k) + Math.sin(k * Math.PI) * 0.003;
            ry = lerp(yOuterTop, yOuterBot, k);
          } else {
            const k = (tv - 0.85) / 0.15;
            rx = lerp(xOuterBot, xInnerBot, k);
            ry = lerp(yOuterBot, yInnerBot, k);
          }
          railPos.push(side * rx, ry, z);
        }
      }

      const railStride = railVSteps + 1;
      for (let iz = 0; iz < railZSteps; iz++) {
        for (let iv = 0; iv < railVSteps; iv++) {
          const a = iz * railStride + iv;
          const b = (iz + 1) * railStride + iv;
          const c = (iz + 1) * railStride + (iv + 1);
          const d = iz * railStride + (iv + 1);
          if (side > 0) {
            railIdx.push(a, b, d, b, c, d);
          } else {
            railIdx.push(a, d, b, b, d, c);
          }
        }
      }

      const cantrailGeo = new THREE.BufferGeometry();
      cantrailGeo.setAttribute('position', new THREE.Float32BufferAttribute(railPos, 3));
      cantrailGeo.setIndex(railIdx);
      cantrailGeo.computeVertexNormals();
      group.add(registerPaintMesh(new THREE.Mesh(cantrailGeo, bodyPaintMat)));

      // 2. Crisp Flat-Ribbon Upper Chrome Window Molding (sits directly along the lower edge of the painted roof cantrail!)
      const uChrPos = [];
      const uChrIdx = [];
      const chrSteps = 68;
      for (let iz = 0; iz <= chrSteps; iz++) {
        const z = lerp(-2.54, 1.70, iz / chrSteps);
        const prof = getBodyProfileAtZ(Math.max(-2.38, z));
        const spoilerLift = z < -2.28 ? smoothstep(-2.28, -2.54, z) * 0.016 : 0;
        const railH = lerp(0.044, 0.068, smoothstep(1.72, 0.48, z));
        const tTop = Math.min(0.22, railH / Math.max(0.18, prof.yRoof - prof.yBelt));
        const tBot = Math.min(0.28, (railH + 0.018) / Math.max(0.18, prof.yRoof - prof.yBelt));

        const xT = side * (getSideGlassX(z, tTop) + 0.006);
        const yT = Math.max(prof.yBelt + 0.014, prof.yRoof - railH + spoilerLift + 0.003);
        const xB = side * (getSideGlassX(z, tBot) + 0.006);
        const yB = Math.max(prof.yBelt + 0.001, yT - 0.017);

        uChrPos.push(xT, yT, z, xB, yB, z);
      }
      for (let iz = 0; iz < chrSteps; iz++) {
        const a = iz * 2;
        const b = iz * 2 + 1;
        const c = (iz + 1) * 2 + 1;
        const d = (iz + 1) * 2;
        if (side > 0) {
          uChrIdx.push(a, b, d, b, c, d);
        } else {
          uChrIdx.push(a, d, b, b, d, c);
        }
      }
      const uChrGeo = new THREE.BufferGeometry();
      uChrGeo.setAttribute('position', new THREE.Float32BufferAttribute(uChrPos, 3));
      uChrGeo.setIndex(uChrIdx);
      uChrGeo.computeVertexNormals();
      group.add(new THREE.Mesh(uChrGeo, chromeMat));

      // 3. Crisp Flat-Ribbon Lower Chrome Window Beltline Sill (sits flush along the bottom edge of the side glass)
      const lChrPos = [];
      const lChrIdx = [];
      for (let iz = 0; iz <= chrSteps; iz++) {
        const z = lerp(-2.52, 1.70, iz / chrSteps);
        const prof = getBodyProfileAtZ(z);
        const xT = side * (getSideGlassX(z, 0.96) + 0.005);
        const yT = prof.yBelt + 0.015;
        const xB = side * (getSideGlassX(z, 1.0) + 0.006);
        const yB = prof.yBelt - 0.001;
        lChrPos.push(xT, yT, z, xB, yB, z);
      }
      for (let iz = 0; iz < chrSteps; iz++) {
        const a = iz * 2;
        const b = iz * 2 + 1;
        const c = (iz + 1) * 2 + 1;
        const d = (iz + 1) * 2;
        if (side > 0) {
          lChrIdx.push(a, b, d, b, c, d);
        } else {
          lChrIdx.push(a, d, b, b, d, c);
        }
      }
      const lChrGeo = new THREE.BufferGeometry();
      lChrGeo.setAttribute('position', new THREE.Float32BufferAttribute(lChrPos, 3));
      lChrGeo.setIndex(lChrIdx);
      lChrGeo.computeVertexNormals();
      group.add(new THREE.Mesh(lChrGeo, chromeMat));

      // 4. Conformal Front Quarter Window Divider Bar at Z = 1.04 (trimmed to fit cleanly beneath the side roof rail!)
      const profQ = getBodyProfileAtZ(1.04);
      const railHQ = lerp(0.044, 0.068, smoothstep(1.72, 0.48, 1.02));
      const tTopQ = Math.min(0.25, (railHQ + 0.014) / Math.max(0.20, getBodyProfileAtZ(1.02).yRoof - getBodyProfileAtZ(1.02).yBelt));
      const qDividerPts = [
        new THREE.Vector3(side * (getSideGlassX(1.04, 0.98) + 0.003), profQ.yBelt + 0.005, 1.04),
        new THREE.Vector3(side * (getSideGlassX(1.03, 0.55) + 0.003), lerp(profQ.yRoof, profQ.yBelt, 0.55), 1.03),
        new THREE.Vector3(side * (getSideGlassX(1.02, tTopQ) + 0.003), getBodyProfileAtZ(1.02).yRoof - railHQ - 0.010, 1.02)
      ];
      const qDivGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(qDividerPts), 10, 0.022, 8, false);
      qDivGeo.scale(0.22, 1.0, 1.0);
      group.add(new THREE.Mesh(qDivGeo, blackGlossMat));

      // 5. Conformal Flush B-Pillar (Z = +0.20) & C-Pillar (Z = -1.04) Strips (trimmed under the upper chrome strip)
      [0.20, -1.04].forEach((pz) => {
        const profP = getBodyProfileAtZ(pz);
        const pillarPts = [
          new THREE.Vector3(side * (getSideGlassX(pz, 0.97) + 0.003), lerp(profP.yRoof, profP.yBelt, 0.97), pz),
          new THREE.Vector3(side * (getSideGlassX(pz, 0.52) + 0.003), lerp(profP.yRoof, profP.yBelt, 0.52), pz),
          new THREE.Vector3(side * (getSideGlassX(pz, 0.12) + 0.003), lerp(profP.yRoof, profP.yBelt, 0.12), pz)
        ];
        const pillarGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pillarPts), 12, 0.042, 8, false);
        pillarGeo.scale(0.16, 1.0, 1.0);
        group.add(new THREE.Mesh(pillarGeo, blackGlossMat));
      });

      // 6. Conformal Silver Satin D-Pillar Finisher with 5 Horizontal Chrome Ribs (sits between upper & lower window chrome at Z = -2.16 to -2.52)
      const dCols = 10;
      const dRows = 12;
      const dPos = [];
      const dIdx = [];
      for (let ir = 0; ir <= dRows; ir++) {
        const tGlass = lerp(0.11, 0.96, ir / dRows);
        for (let ic = 0; ic <= dCols; ic++) {
          const tz = ic / dCols;
          const zFront = lerp(-2.16, -2.30, tGlass);
          const zBack = lerp(-2.40, -2.52, tGlass);
          const z = lerp(zFront, zBack, tz);
          const profD = getBodyProfileAtZ(z);
          const y = lerp(profD.yRoof, profD.yBelt, tGlass);
          const x = side * (getSideGlassX(z, tGlass) + 0.004);
          dPos.push(x, y, z);
        }
      }
      const dStride = dCols + 1;
      for (let ir = 0; ir < dRows; ir++) {
        for (let ic = 0; ic < dCols; ic++) {
          const a = ir * dStride + ic;
          const b = (ir + 1) * dStride + ic;
          const c = (ir + 1) * dStride + (ic + 1);
          const d = ir * dStride + (ic + 1);
          if (side > 0) {
            dIdx.push(a, b, d, b, c, d);
          } else {
            dIdx.push(a, d, b, b, d, c);
          }
        }
      }
      const dPillarGeo = new THREE.BufferGeometry();
      dPillarGeo.setAttribute('position', new THREE.Float32BufferAttribute(dPos, 3));
      dPillarGeo.setIndex(dIdx);
      dPillarGeo.computeVertexNormals();
      group.add(new THREE.Mesh(dPillarGeo, silverSatinMat));

      // 5 Horizontal Louver Ribs on the D-Pillar Finisher
      for (let r = 1; r <= 5; r++) {
        const tGlass = 0.22 + r * 0.12;
        const z1 = lerp(-2.18, -2.32, tGlass);
        const z2 = lerp(-2.38, -2.50, tGlass);
        const prof1 = getBodyProfileAtZ(z1);
        const prof2 = getBodyProfileAtZ(z2);
        const ribPts = [
          new THREE.Vector3(side * (getSideGlassX(z1, tGlass) + 0.007), lerp(prof1.yRoof, prof1.yBelt, tGlass), z1),
          new THREE.Vector3(side * (getSideGlassX(z2, tGlass) + 0.007), lerp(prof2.yRoof, prof2.yBelt, tGlass), z2)
        ];
        group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ribPts), 8, 0.0035, 6, false), chromeMat));
      }

      // 7. Conformal Vertical Door Seam Lines (follow exact door curvature at Z=1.08, Z=0.20, Z=-1.04)
      [1.08, 0.20, -1.04].forEach((seamZ) => {
        const seamPts = [];
        for (let s = 0; s <= 10; s++) {
          const pt = getExactSideBodyPoint(seamZ, s / 10, side);
          seamPts.push(new THREE.Vector3(pt.x + side * 0.002, pt.y, pt.z));
        }
        group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(seamPts), 14, 0.003, 6, false), blackGlossMat));
      });

      // 8. Conformal Lower Door Silver/Chrome Sill Garnish Blade (Z from +1.08 to -0.92)
      const lowerBladePts = [];
      for (let s = 0; s <= 12; s++) {
        const bz = lerp(1.08, -0.92, s / 12);
        const pt = getExactSideBodyPoint(bz, 0.88, side);
        lowerBladePts.push(new THREE.Vector3(pt.x + side * 0.003, pt.y, pt.z));
      }
      const lowerBladeGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lowerBladePts), 28, 0.022, 8, false);
      lowerBladeGeo.scale(0.38, 1.15, 1.0);
      group.add(new THREE.Mesh(lowerBladeGeo, silverSatinMat));

      // 9. Front Door Handle (mounted flush onto exact door surface at Z = 0.31, tSide = 0.14)
      const fhPt = getExactSideBodyPoint(0.31, 0.14, side);
      const fHandle = registerPaintMesh(new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.028, 0.155), bodyPaintMat));
      fHandle.position.set(fhPt.x + side * 0.006, fhPt.y, fhPt.z);
      group.add(fHandle);
      const fHandleChrome = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.010, 0.145), chromeMat);
      fHandleChrome.position.set(fhPt.x + side * 0.008, fhPt.y, fhPt.z);
      group.add(fHandleChrome);

      // 10. Flag-Type Side Mirror Mounted on Front Door Shoulder (rooted inside door surface at Z = 0.94, tSide = 0.06)
      const mirRoot = getExactSideBodyPoint(0.94, 0.06, side);
      const mirrorGroup = new THREE.Group();
      mirrorGroup.position.set(mirRoot.x - side * 0.015, mirRoot.y, mirRoot.z);

      const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.040, 0.052), blackGlossMat);
      stalk.position.set(side * 0.045, -0.015, 0);
      stalk.rotation.z = side * 0.25;
      mirrorGroup.add(stalk);

      const capUpper = registerPaintMesh(new THREE.Mesh(new THREE.SphereGeometry(0.082, 24, 16), bodyPaintMat));
      capUpper.scale.set(1.18, 0.66, 0.62);
      capUpper.position.set(side * 0.11, 0.032, -0.01);
      mirrorGroup.add(capUpper);

      const capLower = new THREE.Mesh(new THREE.SphereGeometry(0.079, 20, 12), blackGlossMat);
      capLower.scale.set(1.14, 0.44, 0.58);
      capLower.position.set(side * 0.108, 0.008, -0.01);
      mirrorGroup.add(capLower);

      const ledTurn = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.011, 0.018), headlightLEDMat);
      ledTurn.position.set(side * 0.118, 0.024, 0.036);
      mirrorGroup.add(ledTurn);

      group.add(mirrorGroup);
    });

    // Windshield Wipers at Cowl Base (Z = 1.68)
    [-0.26, 0.26].forEach((wx) => {
      const wiper = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.014, 0.020), blackGlossMat);
      wiper.position.set(wx, 1.138, 1.66);
      wiper.rotation.y = -0.10;
      group.add(wiper);
    });

    // Shark Fin Roof Antenna at Rear Center (Z = -2.14)
    const sharkFin = registerPaintMesh(new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.13, 16), bodyPaintMat));
    sharkFin.scale.set(0.45, 0.65, 1.6);
    sharkFin.rotation.x = -0.35;
    sharkFin.position.set(0, 1.928, -2.14);
    group.add(sharkFin);

    return group;
  }

  carRoot.add(buildGreenhouseAndRoof());

  // -------------------------------------------------------------------------
  // 3. CONFORMAL ANIMATED POWER SLIDING DOORS (Left & Right 2nd Row: Z from +0.20 to -1.04)
  // -------------------------------------------------------------------------
  const slidingDoors = [];
  function createSlidingDoors() {
    [-1, 1].forEach((side) => {
      const doorGroup = new THREE.Group();

      // Conformal curved door skin matching getExactSideBodyPoint(z, tSide, side)
      const dZSteps = 20;
      const dYSteps = 14;
      const dPos = [];
      const dIdx = [];
      for (let iz = 0; iz <= dZSteps; iz++) {
        const z = lerp(-1.03, 0.19, iz / dZSteps);
        for (let iy = 0; iy <= dYSteps; iy++) {
          const tSide = lerp(0.02, 0.94, iy / dYSteps);
          const pt = getExactSideBodyPoint(z, tSide, side);
          dPos.push(pt.x + side * 0.0015, pt.y, pt.z);
        }
      }
      const dStride = dYSteps + 1;
      for (let iz = 0; iz < dZSteps; iz++) {
        for (let iy = 0; iy < dYSteps; iy++) {
          const a = iz * dStride + iy;
          const b = (iz + 1) * dStride + iy;
          const c = (iz + 1) * dStride + (iy + 1);
          const d = iz * dStride + (iy + 1);
          if (side > 0) {
            dIdx.push(a, d, b);
            dIdx.push(b, d, c);
          } else {
            dIdx.push(a, b, d);
            dIdx.push(b, c, d);
          }
        }
      }
      const doorSkinGeo = new THREE.BufferGeometry();
      doorSkinGeo.setAttribute('position', new THREE.Float32BufferAttribute(dPos, 3));
      doorSkinGeo.setIndex(dIdx);
      doorSkinGeo.computeVertexNormals();
      doorGroup.add(registerPaintMesh(new THREE.Mesh(doorSkinGeo, bodyPaintMat)));

      // Rear Sliding Door Handle (mounted flush onto exact door surface at Z = 0.09, tSide = 0.14)
      const rhPt = getExactSideBodyPoint(0.09, 0.14, side);
      const rHandle = registerPaintMesh(new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.028, 0.155), bodyPaintMat));
      rHandle.position.set(rhPt.x + side * 0.006, rhPt.y, rhPt.z);
      doorGroup.add(rHandle);

      const rHandleChrome = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.010, 0.145), chromeMat);
      rHandleChrome.position.set(rhPt.x + side * 0.008, rhPt.y, rhPt.z);
      doorGroup.add(rHandleChrome);

      carRoot.add(doorGroup);
      slidingDoors.push({ group: doorGroup, side: side });
    });
  }
  createSlidingDoors();

  // -------------------------------------------------------------------------
  // 4. EMBEDDED π-MOTION FRONT GRILLE, RECESSED CAVITY, CHROME RIBS & HEADLIGHTS
  // -------------------------------------------------------------------------
  function createPiMotionFront() {
    const frontGroup = new THREE.Group();

    // 1. Gloss-Black π-Motion Central Grille Cavity Backing (sits flush on getExactNoseZ + 0.002m)
    const gCols = 44;
    const gRows = 24;
    const gPos = [];
    const gIdx = [];
    for (let ir = 0; ir <= gRows; ir++) {
      const ty = ir / gRows; // 0 = bottom chin (Y=0.205), 1 = hood brow (Y=0.960)
      const y = lerp(0.205, 0.960, ty);
      // Hourglass π-Motion width profile: 0.55m at bottom, 0.49m at waist (ty=0.38), flaring to 0.62m at top where it meets headlights
      const maxW = ty < 0.45
        ? lerp(0.55, 0.49, Math.sin((ty / 0.45) * (Math.PI / 2)))
        : lerp(0.49, 0.62, Math.pow((ty - 0.45) / 0.55, 1.15));

      for (let ic = 0; ic <= gCols; ic++) {
        const tx = (ic / gCols) * 2 - 1;
        const x = tx * maxW;
        const z = getExactNoseZ(x, y) + 0.0025;
        gPos.push(x, y, z);
      }
    }
    const gStride = gCols + 1;
    for (let ir = 0; ir < gRows; ir++) {
      for (let ic = 0; ic < gCols; ic++) {
        const a = ir * gStride + ic;
        const b = (ir + 1) * gStride + ic;
        const c = (ir + 1) * gStride + (ic + 1);
        const d = ir * gStride + (ic + 1);
        gIdx.push(a, d, b);
        gIdx.push(b, d, c);
      }
    }
    const grilleMaskGeo = new THREE.BufferGeometry();
    grilleMaskGeo.setAttribute('position', new THREE.Float32BufferAttribute(gPos, 3));
    grilleMaskGeo.setIndex(gIdx);
    grilleMaskGeo.computeVertexNormals();
    frontGroup.add(new THREE.Mesh(grilleMaskGeo, blackGlossMat));

    // 2. 11 Embedded Vertical Satin-Chrome Grille Bars (Extruded directly FROM the black grille surface so they NEVER float!)
    function createEmbeddedGrilleRib(tNorm, yBot, yTop) {
      const steps = 20;
      const pos = [];
      const idx = [];
      const halfRibW = 0.0085; // 17mm wide chrome bar
      const ribOut = 0.0065;   // Protrudes only 6.5mm from the black grille backing, and roots 4mm INSIDE it!

      for (let is = 0; is <= steps; is++) {
        const sy = lerp(yBot, yTop, is / steps);
        const ty = (sy - 0.205) / (0.960 - 0.205);
        // Follow the exact π-Motion fan curve from bottom to top
        const barCenterX = (tNorm * 0.46) * lerp(0.94, 1.06, ty);

        const xL = barCenterX - halfRibW;
        const xR = barCenterX + halfRibW;
        const zBackL = getExactNoseZ(xL, sy) - 0.004; // Rooted inside nose!
        const zBackR = getExactNoseZ(xR, sy) - 0.004;
        const zFrontL = getExactNoseZ(xL, sy) + 0.0025 + ribOut;
        const zFrontR = getExactNoseZ(xR, sy) + 0.0025 + ribOut;

        // 4 vertices per cross-section: 0=BackLeft, 1=FrontLeft, 2=FrontRight, 3=BackRight
        pos.push(
          xL, sy, zBackL,
          xL, sy, zFrontL,
          xR, sy, zFrontR,
          xR, sy, zBackR
        );
      }

      for (let is = 0; is < steps; is++) {
        const b0 = is * 4;
        const b1 = (is + 1) * 4;
        // Left wall
        idx.push(b0 + 0, b0 + 1, b1 + 1, b0 + 0, b1 + 1, b1 + 0);
        // Front chrome face
        idx.push(b0 + 1, b0 + 2, b1 + 2, b0 + 1, b1 + 2, b1 + 1);
        // Right wall
        idx.push(b0 + 2, b0 + 3, b1 + 3, b0 + 2, b1 + 3, b1 + 2);
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      return new THREE.Mesh(geo, chromeMat);
    }

    const numBars = 11;
    for (let i = 0; i < numBars; i++) {
      const tNorm = (i / (numBars - 1)) * 2 - 1; // -1 to +1
      const isCenterBar = i === Math.floor(numBars / 2);
      const topY = isCenterBar ? 0.72 : (0.948 - Math.abs(tNorm) * 0.012);
      const botY = 0.225;
      frontGroup.add(createEmbeddedGrilleRib(tNorm, botY, topY));
    }

    // Conformal Dark Lower Bumper Cross-Beam behind license plate (Y = 0.34 to 0.44)
    const beamCols = 24;
    const beamRows = 4;
    const bPos = [];
    const bIdx = [];
    for (let ir = 0; ir <= beamRows; ir++) {
      const by = lerp(0.33, 0.45, ir / beamRows);
      for (let ic = 0; ic <= beamCols; ic++) {
        const bx = ((ic / beamCols) * 2 - 1) * 0.51;
        bPos.push(bx, by, getExactNoseZ(bx, by) + 0.0095);
      }
    }
    const bStride = beamCols + 1;
    for (let ir = 0; ir < beamRows; ir++) {
      for (let ic = 0; ic < beamCols; ic++) {
        const a = ir * bStride + ic;
        const b = (ir + 1) * bStride + ic;
        const c = (ir + 1) * bStride + (ic + 1);
        const d = ir * bStride + (ic + 1);
        bIdx.push(a, d, b, b, d, c);
      }
    }
    const crossBeamGeo = new THREE.BufferGeometry();
    crossBeamGeo.setAttribute('position', new THREE.Float32BufferAttribute(bPos, 3));
    crossBeamGeo.setIndex(bIdx);
    crossBeamGeo.computeVertexNormals();
    frontGroup.add(new THREE.Mesh(crossBeamGeo, blackGlossMat));

    // 3. Conformal Ribbon Trim Helper (builds a flat bevelled trim strip rooted directly onto getExactNoseZ)
    function createNoseConformalRibbon(pts2D, halfWidth, thicknessOut, mat) {
      const curvePts = pts2D.map((p) => new THREE.Vector3(p[0], p[1], 0));
      const curve = new THREE.CatmullRomCurve3(curvePts);
      const samples = 40;
      const pos = [];
      const idx = [];

      for (let i = 0; i <= samples; i++) {
        const u = i / samples;
        const pt = curve.getPoint(u);
        const tan = curve.getTangent(u);
        // Normal in XY plane
        const nx = -tan.y;
        const ny = tan.x;
        const len = Math.hypot(nx, ny) || 1;
        const ux = (nx / len) * halfWidth;
        const uy = (ny / len) * halfWidth;

        const xL = pt.x - ux;
        const yL = pt.y - uy;
        const xR = pt.x + ux;
        const yR = pt.y + uy;

        const zBackL = getExactNoseZ(xL, yL) - 0.003;
        const zBackR = getExactNoseZ(xR, yR) - 0.003;
        const zFrontL = getExactNoseZ(xL, yL) + thicknessOut;
        const zFrontR = getExactNoseZ(xR, yR) + thicknessOut;

        pos.push(
          xL, yL, zBackL,
          xL, yL, zFrontL,
          xR, yR, zFrontR,
          xR, yR, zBackR
        );
      }

      for (let i = 0; i < samples; i++) {
        const b0 = i * 4;
        const b1 = (i + 1) * 4;
        idx.push(b0 + 0, b0 + 1, b1 + 1, b0 + 0, b1 + 1, b1 + 0);
        idx.push(b0 + 1, b0 + 2, b1 + 2, b0 + 1, b1 + 2, b1 + 1);
        idx.push(b0 + 2, b0 + 3, b1 + 3, b0 + 2, b1 + 3, b1 + 2);
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      return new THREE.Mesh(geo, mat);
    }

    // 4. Conformal Silver Satin π-Motion Sweeping Cheek Blades, Side Intakes & Flush Headlights
    [-1, 1].forEach((side) => {
      // Silver Satin C-shaped "Fang" bezel rooted directly into the nose surface
      const fang2D = [
        [side * 0.81, 0.835],
        [side * 0.51, 0.720],
        [side * 0.51, 0.420],
        [side * 0.56, 0.280],
        [side * 0.80, 0.210]
      ];
      frontGroup.add(createNoseConformalRibbon(fang2D, 0.022, 0.008, silverSatinMat));

      // Conformal Subdivision Mesh for Triangular Gloss-Black Side Air Intake Pocket (Y = 0.27 to 0.64)
      const pRows = 12;
      const pCols = 10;
      const pPos = [];
      const pIdx = [];
      for (let ir = 0; ir <= pRows; ir++) {
        const ty = ir / pRows; // 0 = bottom (Y=0.27), 1 = top apex (Y=0.64)
        const py = lerp(0.27, 0.64, ty);
        const innerX = lerp(0.64, 0.72, ty);
        const outerX = lerp(0.81, 0.73, ty);
        for (let ic = 0; ic <= pCols; ic++) {
          const tx = ic / pCols;
          const px = side * lerp(innerX, outerX, tx);
          const pz = getExactNoseZ(px, py) + 0.003;
          pPos.push(px, py, pz);
        }
      }
      const pStride = pCols + 1;
      for (let ir = 0; ir < pRows; ir++) {
        for (let ic = 0; ic < pCols; ic++) {
          const a = ir * pStride + ic;
          const b = (ir + 1) * pStride + ic;
          const c = (ir + 1) * pStride + (ic + 1);
          const d = ir * pStride + (ic + 1);
          if (side > 0) {
            pIdx.push(a, d, b, b, d, c);
          } else {
            pIdx.push(a, b, d, b, c, d);
          }
        }
      }
      const pocketGeo = new THREE.BufferGeometry();
      pocketGeo.setAttribute('position', new THREE.Float32BufferAttribute(pPos, 3));
      pocketGeo.setIndex(pIdx);
      pocketGeo.computeVertexNormals();
      frontGroup.add(new THREE.Mesh(pocketGeo, blackGlossMat));

      // Conformal Horizontal Chrome Fog Blade & LED Strip cutting across the black intake at Y = 0.345
      const fog2D = [
        [side * 0.63, 0.345],
        [side * 0.72, 0.345],
        [side * 0.80, 0.345]
      ];
      frontGroup.add(createNoseConformalRibbon(fog2D, 0.011, 0.009, chromeMat));
      frontGroup.add(createNoseConformalRibbon(fog2D, 0.005, 0.011, headlightLEDMat));

      // 5. Conformal Wrap-Around "Meteor Arrow" Matrix LED Headlights (Y = 0.83 to 0.96, X = 0.48 to 0.82)
      const hlCols = 20;
      const hlRows = 10;
      const hlPos = [];
      const hlLensPos = [];
      const hlIdx = [];
      for (let ir = 0; ir <= hlRows; ir++) {
        const ty = ir / hlRows;
        for (let ic = 0; ic <= hlCols; ic++) {
          const tx = ic / hlCols;
          const absX = lerp(0.47, 0.82, tx);
          const yBot = lerp(0.830, 0.858, Math.pow(tx, 1.2));
          const yTop = lerp(0.958, 0.966, tx);
          const y = lerp(yBot, yTop, ty);
          const baseZ = getExactNoseZ(absX, y);
          hlPos.push(side * absX, y, baseZ + 0.0025);
          hlLensPos.push(side * absX, y, baseZ + 0.0095);
        }
      }
      const hlStride = hlCols + 1;
      for (let ir = 0; ir < hlRows; ir++) {
        for (let ic = 0; ic < hlCols; ic++) {
          const a = ir * hlStride + ic;
          const b = (ir + 1) * hlStride + ic;
          const c = (ir + 1) * hlStride + (ic + 1);
          const d = ir * hlStride + (ic + 1);
          if (side > 0) {
            hlIdx.push(a, d, b, b, d, c);
          } else {
            hlIdx.push(a, b, d, b, c, d);
          }
        }
      }
      const hlHousingGeo = new THREE.BufferGeometry();
      hlHousingGeo.setAttribute('position', new THREE.Float32BufferAttribute(hlPos, 3));
      hlHousingGeo.setIndex(hlIdx);
      hlHousingGeo.computeVertexNormals();
      frontGroup.add(new THREE.Mesh(hlHousingGeo, blackGlossMat));

      const hlLensGeo = new THREE.BufferGeometry();
      hlLensGeo.setAttribute('position', new THREE.Float32BufferAttribute(hlLensPos, 3));
      hlLensGeo.setIndex(hlIdx);
      hlLensGeo.computeVertexNormals();
      frontGroup.add(new THREE.Mesh(hlLensGeo, headlightLensMat));

      // Conformal Upper & Lower "Meteor Arrow" DRL Light Guides inside the headlight
      const drlTop2D = [
        [side * 0.48, 0.950],
        [side * 0.65, 0.955],
        [side * 0.81, 0.960]
      ];
      const drlBot2D = [
        [side * 0.48, 0.838],
        [side * 0.65, 0.846],
        [side * 0.81, 0.862]
      ];
      frontGroup.add(createNoseConformalRibbon(drlTop2D, 0.006, 0.007, headlightLEDMat));
      frontGroup.add(createNoseConformalRibbon(drlBot2D, 0.005, 0.007, headlightLEDMat));

      // Conformal Dual LED Projector Lenses inside each headlight (at X = 0.56 to 0.62 and X = 0.66 to 0.72)
      [
        [0.55, 0.61, 0.896],
        [0.65, 0.71, 0.904]
      ].forEach(([x1, x2, py]) => {
        const proj2D = [
          [side * x1, py],
          [side * ((x1 + x2) * 0.5), py],
          [side * x2, py]
        ];
        frontGroup.add(createNoseConformalRibbon(proj2D, 0.016, 0.007, headlightLEDMat));
      });
    });

    // 6. Conformal Full-Width Chrome Hood Leading-Edge Brow Bar (Y = 0.960)
    const brow2D = [];
    for (let i = -10; i <= 10; i++) {
      const bx = (i / 10) * 0.80;
      brow2D.push([bx, 0.960 + Math.pow(Math.abs(bx) / 0.80, 1.5) * 0.006]);
    }
    frontGroup.add(createNoseConformalRibbon(brow2D, 0.009, 0.008, chromeMat));

    // 7. Conformal Front Lower Silver Chin Splitter (Y = 0.205)
    const lip2D = [];
    for (let i = -10; i <= 10; i++) {
      const lx = (i / 10) * 0.80;
      lip2D.push([lx, 0.205]);
    }
    frontGroup.add(createNoseConformalRibbon(lip2D, 0.015, 0.010, silverSatinMat));

    // 8. Sculpted 3D Denza Emblem Badge Embedded into Upper Center Grille (Y = 0.80)
    const emblemY = 0.80;
    const emblemZ = getExactNoseZ(0, emblemY) + 0.008;
    const emblemGroup = new THREE.Group();
    emblemGroup.position.set(0, emblemY, emblemZ);
    const outerRing = new THREE.Mesh(new THREE.TorusGeometry(0.054, 0.006, 16, 36), chromeMat);
    emblemGroup.add(outerRing);
    const innerDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.052, 0.052, 0.012, 32),
      new THREE.MeshPhysicalMaterial({ color: 0x0f2952, metalness: 0.6, roughness: 0.15, clearcoat: 1.0 })
    );
    innerDisc.rotation.x = Math.PI / 2;
    emblemGroup.add(innerDisc);
    const centerDrop = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.050, 16), chromeMat);
    centerDrop.position.set(0, 0.004, 0.007);
    centerDrop.scale.set(0.8, 1.0, 0.4);
    emblemGroup.add(centerDrop);
    frontGroup.add(emblemGroup);

    // 9. Conformal "DENZA D9" Show License Plate mounted flush on Lower Center Grille (Y = 0.39)
    // ป้ายทะเบียน: ใช้ texture ที่ส่งเข้ามา (เช่น ป้ายทะเบียนไทย) ถ้าไม่มีใช้ป้ายโชว์ "DENZA D9" ตามต้นฉบับ
    let plateTex = opts.plateTexture, PLW = 0.34, PLH = 0.15;
    if (!plateTex) {
      const plateCanvas = document.createElement('canvas');
      plateCanvas.width = 512;
      plateCanvas.height = 140;
      const ctx = plateCanvas.getContext('2d');
      ctx.fillStyle = '#0d0f14';
      ctx.fillRect(0, 0, 512, 140);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, 506, 134);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 42px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('DENZA', 256, 60);
      ctx.font = 'bold 40px "Segoe UI", Arial, sans-serif';
      ctx.fillText('D9', 256, 112);
      plateTex = new THREE.CanvasTexture(plateCanvas);
      plateTex.colorSpace = THREE.SRGBColorSpace;
      PLW = 0.44; PLH = 0.118;
    }
    const plateMat = new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.25, metalness: 0.1 });
    const plateY = 0.39;
    const plateZ = getExactNoseZ(0, plateY) + 0.014;
    const plateHolder = new THREE.Mesh(new THREE.BoxGeometry(PLW + 0.01, PLH + 0.007, 0.018), blackGlossMat);
    plateHolder.position.set(0, plateY, plateZ - 0.004);
    frontGroup.add(plateHolder);

    const frontPlate = new THREE.Mesh(new THREE.PlaneGeometry(PLW, PLH), plateMat);
    frontPlate.position.set(0, plateY, plateZ + 0.006);
    frontGroup.add(frontPlate);

    // Rear License Plate (mounted inside the recessed tailgate pocket at Y = 0.72)
    const rearPlateZ = getExactRearZ(0, 0.72) + 0.012;
    const rearHolder = new THREE.Mesh(new THREE.BoxGeometry(PLW + 0.01, PLH + 0.007, 0.016), blackGlossMat);
    rearHolder.position.set(0, 0.72, rearPlateZ);
    frontGroup.add(rearHolder);

    const rearPlate = new THREE.Mesh(new THREE.PlaneGeometry(PLW, PLH), plateMat);
    rearPlate.position.set(0, 0.72, rearPlateZ - 0.009);
    rearPlate.rotation.y = Math.PI;
    frontGroup.add(rearPlate);

    return frontGroup;
  }

  carRoot.add(createPiMotionFront());

  // -------------------------------------------------------------------------
  // 5. PHOTO-ACCURATE REAR TAILGATE, "STARRY ARROW" LED BAR & DIFFUSER
  // -------------------------------------------------------------------------
  function createRearSection() {
    const rearGroup = new THREE.Group();

    // 1. Curved Full-Width Smoked Taillight Housing (wraps from X = -0.83 to +0.83 right below the rear glass at Y = 1.135)
    const tlCols = 40;
    const tlRows = 6;
    const tlPos = [];
    const tlIdx = [];
    for (let ir = 0; ir <= tlRows; ir++) {
      const ty = ir / tlRows;
      for (let ic = 0; ic <= tlCols; ic++) {
        const tx = (ic / tlCols) * 2 - 1;
        const x = tx * 0.835;
        const halfH = lerp(0.046, 0.070, smoothstep(0.48, 0.80, Math.abs(x)));
        const y = 1.135 + (ty * 2 - 1) * halfH;
        const z = getExactRearZ(x, 1.135) - 0.004;
        tlPos.push(x, y, z);
      }
    }
    const tlStride = tlCols + 1;
    for (let ir = 0; ir < tlRows; ir++) {
      for (let ic = 0; ic < tlCols; ic++) {
        const a = ir * tlStride + ic;
        const b = (ir + 1) * tlStride + ic;
        const c = (ir + 1) * tlStride + (ic + 1);
        const d = ir * tlStride + (ic + 1);
        tlIdx.push(a, b, d, b, c, d);
      }
    }
    const tlHousingGeo = new THREE.BufferGeometry();
    tlHousingGeo.setAttribute('position', new THREE.Float32BufferAttribute(tlPos, 3));
    tlHousingGeo.setIndex(tlIdx);
    tlHousingGeo.computeVertexNormals();
    rearGroup.add(new THREE.Mesh(tlHousingGeo, blackGlossMat));

    // 2. Continuous Glowing Red Upper & Lower Light Bars following the exact rear curve
    [1.152, 1.118].forEach((barY, idxBar) => {
      const barPts = [];
      for (let i = -16; i <= 16; i++) {
        const bx = (i / 16) * 0.81;
        barPts.push(new THREE.Vector3(bx, barY, getExactRearZ(bx, 1.135) - 0.008));
      }
      const barCurve = new THREE.CatmullRomCurve3(barPts);
      const rTube = idxBar === 0 ? 0.008 : 0.0065;
      rearGroup.add(new THREE.Mesh(new THREE.TubeGeometry(barCurve, 36, rTube, 8, false), taillightLEDMat));
    });

    // Side Starry Arrow Diagonal LED Feathers at outer taillight corners
    [-1, 1].forEach((side) => {
      for (let f = 0; f < 3; f++) {
        const fx = side * (0.63 + f * 0.055);
        const fy = 1.135;
        const fz = getExactRearZ(fx, fy) - 0.009;
        const feather = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.078, 0.010), taillightLEDMat);
        feather.position.set(fx, fy, fz);
        feather.rotation.z = side * -0.38;
        feather.rotation.y = side * -0.22;
        rearGroup.add(feather);
      }
    });

    // 3. "D E N Z A" Chrome Spaced Lettering below the taillight bar (Y = 1.00)
    const badgeCanvas = document.createElement('canvas');
    badgeCanvas.width = 512;
    badgeCanvas.height = 64;
    const bctx = badgeCanvas.getContext('2d');
    bctx.clearRect(0, 0, 512, 64);
    bctx.fillStyle = '#e2e8f0';
    bctx.font = 'bold 34px "Segoe UI", Arial, sans-serif';
    bctx.textAlign = 'center';
    bctx.fillText('D  E  N  Z  A', 256, 44);
    const badgeTex = new THREE.CanvasTexture(badgeCanvas);
    const badgeMat = new THREE.MeshBasicMaterial({ map: badgeTex, transparent: true });
    const badgeMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.07), badgeMat);
    badgeMesh.position.set(0, 1.00, getExactRearZ(0, 1.00) - 0.004);
    badgeMesh.rotation.y = Math.PI;
    rearGroup.add(badgeMesh);

    // High-Mount LED Brake Light Strip integrated under the rear roof spoiler
    const chmsl = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.014, 0.02), taillightLEDMat);
    chmsl.position.set(0, 1.898, -2.572);
    rearGroup.add(chmsl);

    // 4. Sculpted Rear Lower Gloss-Black Diffuser Valance & Dual Chrome Garnishes
    const diffPts = [];
    for (let i = -12; i <= 12; i++) {
      const dx = (i / 12) * 0.79;
      diffPts.push(new THREE.Vector3(dx, 0.275, getExactRearZ(dx, 0.275) - 0.008));
    }
    const diffCurve = new THREE.CatmullRomCurve3(diffPts);
    const diffGeo = new THREE.TubeGeometry(diffCurve, 32, 0.038, 10, false);
    diffGeo.scale(1.0, 0.85, 0.45);
    rearGroup.add(new THREE.Mesh(diffGeo, blackGlossMat));

    const silverBarGeo = new THREE.TubeGeometry(diffCurve, 32, 0.010, 8, false);
    silverBarGeo.translate(0, 0.020, -0.008);
    rearGroup.add(new THREE.Mesh(silverBarGeo, silverSatinMat));

    [-1, 1].forEach((side) => {
      const rx = side * 0.65;
      const rz = getExactRearZ(rx, 0.275) - 0.012;
      const chromeTip = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.038, 0.016), chromeMat);
      chromeTip.position.set(rx, 0.268, rz);
      chromeTip.rotation.y = side * -0.22;
      rearGroup.add(chromeTip);

      const innerTip = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.022, 0.018), blackGlossMat);
      innerTip.position.set(rx, 0.268, rz - 0.002);
      innerTip.rotation.y = side * -0.22;
      rearGroup.add(innerTip);

      const reflector = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.011, 0.012), taillightLEDMat);
      reflector.position.set(rx, 0.332, rz + 0.002);
      reflector.rotation.y = side * -0.22;
      rearGroup.add(reflector);
    });

    return rearGroup;
  }
  carRoot.add(createRearSection());

  // -------------------------------------------------------------------------
  // 6. HIGH-PRECISION 18" MULTI-SPOKE TURBINE ALLOY WHEELS (Positioned at Real Axles)
  // -------------------------------------------------------------------------
  const wheelMeshes = [];
  function createMultiSpokeWheel() {
    const wheelGroup = new THREE.Group();
    const tireRadius = WHEEL_RADIUS;
    const tireWidth = 0.245;

    const tirePts = [
      new THREE.Vector2(0.258, -tireWidth * 0.46),
      new THREE.Vector2(0.350, -tireWidth * 0.50),
      new THREE.Vector2(0.378, -tireWidth * 0.42),
      new THREE.Vector2(tireRadius, -tireWidth * 0.30),
      new THREE.Vector2(tireRadius, tireWidth * 0.30),
      new THREE.Vector2(0.378, tireWidth * 0.42),
      new THREE.Vector2(0.350, tireWidth * 0.50),
      new THREE.Vector2(0.258, tireWidth * 0.46)
    ];
    const tireGeo = new THREE.LatheGeometry(tirePts, 56);
    tireGeo.rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x12141a,
      roughness: 0.74,
      metalness: 0.08
    });
    const tireMesh = new THREE.Mesh(tireGeo, tireMat);
    tireMesh.castShadow = true;
    tireMesh.receiveShadow = true;
    wheelGroup.add(tireMesh);

    const barrelGeo = new THREE.CylinderGeometry(0.265, 0.265, tireWidth * 0.90, 48);
    barrelGeo.rotateZ(Math.PI / 2);
    wheelGroup.add(new THREE.Mesh(barrelGeo, blackGlossMat));

    const rotorGeo = new THREE.CylinderGeometry(0.208, 0.208, 0.035, 36);
    rotorGeo.rotateZ(Math.PI / 2);
    const rotorMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.85, roughness: 0.3 });
    wheelGroup.add(new THREE.Mesh(rotorGeo, rotorMat));

    const numPairs = 15;
    [-1, 1].forEach((faceSide) => {
      const faceX = faceSide * (tireWidth * 0.45);

      const rimLipGeo = new THREE.RingGeometry(0.248, 0.267, 48);
      rimLipGeo.rotateY(faceSide > 0 ? Math.PI / 2 : -Math.PI / 2);
      const rimLip = new THREE.Mesh(rimLipGeo, chromeMat);
      rimLip.position.x = faceX + faceSide * 0.002;
      wheelGroup.add(rimLip);

      const capRing = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.018, 32), chromeMat);
      capRing.rotateZ(Math.PI / 2);
      capRing.position.x = faceX;
      wheelGroup.add(capRing);

      const capCenter = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.020, 24), blackGlossMat);
      capCenter.rotateZ(Math.PI / 2);
      capCenter.position.x = faceX + faceSide * 0.001;
      wheelGroup.add(capCenter);

      for (let i = 0; i < numPairs; i++) {
        const baseAngle = (i / numPairs) * Math.PI * 2;

        const spokeGeo = new THREE.BoxGeometry(0.016, 0.208, 0.013);
        const spoke = new THREE.Mesh(spokeGeo, chromeMat);
        const rMid = 0.154;
        spoke.position.set(
          faceX - faceSide * 0.004,
          Math.cos(baseAngle) * rMid,
          Math.sin(baseAngle) * rMid
        );
        spoke.rotation.x = -baseAngle;
        spoke.rotation.z = faceSide * 0.05;
        wheelGroup.add(spoke);

        const splitAngle = baseAngle + (Math.PI / numPairs) * 0.72;
        const splitSpokeGeo = new THREE.BoxGeometry(0.012, 0.200, 0.009);
        const splitSpoke = new THREE.Mesh(splitSpokeGeo, silverSatinMat);
        splitSpoke.position.set(
          faceX - faceSide * 0.009,
          Math.cos(splitAngle) * rMid,
          Math.sin(splitAngle) * rMid
        );
        splitSpoke.rotation.x = -splitAngle;
        splitSpoke.rotation.z = faceSide * 0.05;
        wheelGroup.add(splitSpoke);
      }
    });

    return wheelGroup;
  }

  const wheelPositions = [
    { x: -0.84, y: WHEEL_RADIUS, z: FRONT_AXLE_Z }, // Front Right (closest to camera in hero view)
    { x: 0.84,  y: WHEEL_RADIUS, z: FRONT_AXLE_Z }, // Front Left
    { x: -0.84, y: WHEEL_RADIUS, z: REAR_AXLE_Z },  // Rear Right
    { x: 0.84,  y: WHEEL_RADIUS, z: REAR_AXLE_Z }   // Rear Left
  ];

  wheelPositions.forEach((pos) => {
    const w = createMultiSpokeWheel();
    w.position.set(pos.x, pos.y, pos.z);
    carRoot.add(w);
    wheelMeshes.push(w);
  });

  // -------------------------------------------------------------------------
  // 7. INTERIOR 2+2+3 LUXURY CABIN & BYD BLADE BATTERY (Visible in X-Ray / Door Open)
  // -------------------------------------------------------------------------
  const interiorGroup = new THREE.Group();
  carRoot.add(interiorGroup);

  function buildCabinAndPlatform() {
    // BYD e-Platform 3.0 Floor & 103.36 kWh Blade Battery Pack
    const chassisFloor = new THREE.Mesh(
      new THREE.BoxGeometry(1.66, 0.05, 4.25),
      darkTrimMat
    );
    chassisFloor.position.set(0, 0.25, -0.10);
    interiorGroup.add(chassisFloor);

    // Glowing Blade Battery Cells under floor (highlighted in X-Ray mode)
    const bladePack = new THREE.Mesh(
      new THREE.BoxGeometry(1.40, 0.11, 2.45),
      batteryGlowMat
    );
    bladePack.position.set(0, 0.22, 0.0);
    interiorGroup.add(bladePack);

    // Individual Blade Battery cell ribs visible in X-Ray mode
    for (let c = -10; c <= 10; c++) {
      const cellLine = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.115, 0.02), darkTrimMat);
      cellLine.position.set(0, 0.22, c * 0.115);
      interiorGroup.add(cellLine);
    }

    // Dashboard & 15.6" Central Infotainment Screen
    const dashMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.60, 0.40, 0.50),
      darkTrimMat
    );
    dashMesh.position.set(0, 0.82, 1.15);
    interiorGroup.add(dashMesh);

    const screenMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      emissive: 0x0284c7,
      emissiveIntensity: 0.95,
      roughness: 0.1
    });
    const centerScreen = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.23, 0.022), screenMat);
    centerScreen.position.set(0, 0.97, 0.90);
    centerScreen.rotation.x = -0.15;
    interiorGroup.add(centerScreen);

    // Steering Wheel (Right-hand drive for Thailand spec at -X)
    const steeringWheel = new THREE.Mesh(
      new THREE.TorusGeometry(0.155, 0.022, 12, 32),
      darkTrimMat
    );
    steeringWheel.position.set(-0.42, 0.96, 0.84);
    steeringWheel.rotation.x = -0.45;
    interiorGroup.add(steeringWheel);

    // Center Console with Refrigerator compartment
    const consoleBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.30, 0.42, 0.76),
      seatLeatherMat
    );
    consoleBox.position.set(0, 0.52, 0.62);
    interiorGroup.add(consoleBox);

    // Helper to build an Executive Seat
    function createSeat(isCaptainChair) {
      const seat = new THREE.Group();
      const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.48), seatLeatherMat);
      cushion.position.set(0, 0.45, 0);
      seat.add(cushion);

      const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.60, 0.12), seatLeatherMat);
      backrest.position.set(0, 0.77, -0.19);
      backrest.rotation.x = -0.18;
      seat.add(backrest);

      const headrest = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.17, 0.095), seatLeatherMat);
      headrest.position.set(0, 1.13, -0.25);
      seat.add(headrest);

      if (isCaptainChair) {
        [-1, 1].forEach((s) => {
          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.08, 0.40), seatLeatherMat);
          arm.position.set(s * 0.25, 0.62, -0.02);
          seat.add(arm);

          const miniScreen = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.01, 0.095), screenMat);
          miniScreen.position.set(s * 0.25, 0.665, 0.11);
          seat.add(miniScreen);
        });

        const legRest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.055, 0.26), seatLeatherMat);
        legRest.position.set(0, 0.34, 0.28);
        legRest.rotation.x = 0.55;
        seat.add(legRest);
      }

      return seat;
    }

    // Row 1: Driver & Front Passenger (2 seats)
    const row1Left = createSeat(false);
    row1Left.position.set(0.42, 0, 0.56);
    interiorGroup.add(row1Left);

    const row1Right = createSeat(false);
    row1Right.position.set(-0.42, 0, 0.56);
    interiorGroup.add(row1Right);

    // Row 2: Luxury Executive Captain Chairs (2 seats)
    const row2Left = createSeat(true);
    row2Left.position.set(0.38, 0.03, -0.38);
    interiorGroup.add(row2Left);

    const row2Right = createSeat(true);
    row2Right.position.set(-0.38, 0.03, -0.38);
    interiorGroup.add(row2Right);

    // Row 3: 3-Seater Rear Bench
    const row3BenchCushion = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.14, 0.46), seatLeatherMat);
    row3BenchCushion.position.set(0, 0.48, -1.42);
    interiorGroup.add(row3BenchCushion);

    const row3BenchBack = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.56, 0.12), seatLeatherMat);
    row3BenchBack.position.set(0, 0.79, -1.63);
    row3BenchBack.rotation.x = -0.15;
    interiorGroup.add(row3BenchBack);

    [-0.44, 0, 0.44].forEach((hx) => {
      const hr = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.15, 0.085), seatLeatherMat);
      hr.position.set(hx, 1.12, -1.68);
      interiorGroup.add(hr);
    });
  }
  buildCabinAndPlatform();

  // -------------------------------------------------------------------------
  // 8. HEADLIGHT FLOOR BEAMS (Toggled with LED Lights)

  const done = new Set();   // วัสดุใช้ร่วมหลายชิ้น — ปรับครั้งเดียวต่อวัสดุ
  if (opts.envMap) carRoot.traverse((o) => { const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) if (m.isMeshStandardMaterial && !done.has(m)) { done.add(m); m.envMap = opts.envMap; m.envMapIntensity = (m.envMapIntensity ?? 1) * (m.metalness >= 0.5 ? opts.envScaleMetal ?? 1 : opts.envScale ?? 1); m.needsUpdate = true } });
  carRoot.name = 'denza-d9';
  return carRoot;
}
