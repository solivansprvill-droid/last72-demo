// 程序化生成：新曙光市 —— 五个相连街区（居民公寓 / 大型超市 / 警察局 / 中心医院 / 北部撤离区）
import { World, W, H, D, CH, B, SOLID } from './voxels.js';

export const REGIONS = [
  { id: 'apt', name: '居民公寓', z0: 0, z1: 44, density: 1.0 },
  { id: 'mart', name: '大型超市', z0: 44, z1: 88, density: 1.2 },
  { id: 'police', name: '警察局', z0: 88, z1: 126, density: 1.15 },
  { id: 'hosp', name: '中心医院', z0: 126, z1: 164, density: 1.35 },
  { id: 'evac', name: '北部撤离区', z0: 164, z1: 192, density: 0.8 },
];
export function regionAt(z) { for (const r of REGIONS) if (z >= r.z0 && z < r.z1) return r; return REGIONS[REGIONS.length - 1]; }

export const START = { x: 12.5, y: 1, z: 11.5 };
export const EVAC_POS = { x: 47.5, z: 179.5, r: 5 };
export const STREETS = [40, 84, 124, 160]; // 东西向街道起点 z（宽 6）
export const AVE = { x0: 43, x1: 52 };      // 南北主干道（含人行道）

// 室内楼梯（供感染者上楼寻路）与建筑范围
export const BUILDINGS = [];

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const ri = (r, a, b) => a + Math.floor(r() * (b - a + 1));

export function generateWorld(seed = 72) {
  const w = new World();
  const r = rng(seed);
  BUILDINGS.length = 0;
  w.specials = [];
  const V = (x, y, z, t) => { if (x >= 0 && x < W && z >= 0 && z < D && y >= 0 && y < H) w.v[x + W * (z + D * y)] = t; };
  const G = (x, z, t) => V(x, 0, z, t);
  const fill = (x0, y0, z0, x1, y1, z1, t) => { for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) V(x, y, z, t); };
  const at = (x, y, z) => w.v[x + W * (z + D * y)];
  const obj = (kind, hits, name, cells, loot = kind) => { const o = w.newObject(kind, hits, loot, name); for (const [x, y, z, t] of cells) w.put(o, x, y, z, t); return o; };
  const special = (kind, name, x, y, z, t) => { const o = w.newObject(kind, 99, null, name); w.put(o, x, y, z, t); w.specials.push(o); return o; };

  // ---------- 地面 ----------
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) G(x, z, r() < 0.12 ? B.DIRT : B.GRASS);
  // 南北主干道
  for (let z = 1; z < D - 1; z++) {
    G(AVE.x0, z, B.WALK); G(AVE.x1, z, B.WALK);
    for (let x = AVE.x0 + 1; x < AVE.x1; x++) G(x, z, B.ROAD);
    if (z % 4 < 2) G(47, z, B.LINE);
  }
  // 东西街道
  for (const z0 of STREETS) for (let x = 1; x < W - 1; x++) {
    G(x, z0, B.WALK); G(x, z0 + 5, B.WALK);
    for (let z = z0 + 1; z <= z0 + 4; z++) if (x <= AVE.x0 || x >= AVE.x1) G(x, z, B.ROAD); else G(x, z, B.ROAD);
    if (x % 4 < 2 && (x < AVE.x0 || x > AVE.x1)) G(x, z0 + 2, B.LINE);
  }
  // 边界围墙（街道两端开口仅作装饰，外侧不可通行）
  for (let i = 0; i < D; i++) for (let y = 1; y <= 3; y++) {
    const open = STREETS.some(z0 => i > z0 && i < z0 + 5);
    if (!open) { V(0, y, i, B.BORDER); V(W - 1, y, i, B.BORDER); }
  }
  for (let i = 0; i < W; i++) for (let y = 1; y <= 3; y++) { if (i <= AVE.x0 || i >= AVE.x1) V(i, y, 0, B.BORDER); V(i, y, D - 1, B.BORDER); }
  for (const z0 of STREETS) { V(1, 1, z0 + 1, B.BARRIER); V(1, 1, z0 + 4, B.BARRIER); V(W - 2, 1, z0 + 1, B.BARRIER); V(W - 2, 1, z0 + 4, B.BARRIER); }
  for (let x = AVE.x0 + 1; x < AVE.x1; x += 3) V(x, 1, 1, B.BARRIER);

  // ---------- 建筑 ----------
  // o: {x0,z0,x1,z1,floors,fh,wall,trim,slab,floor,doors:[[side,a,b]],open,stairs:{sx,sz},glass}
  function bldg(o) {
    const fh = o.fh || 5, floors = o.floors || 1, top = o.height || fh * floors;
    const wall = o.wall || B.CONC, trim = o.trim || B.CONC2, slab = o.slab || B.CONC2;
    for (let x = o.x0; x <= o.x1; x++) for (let z = o.z0; z <= o.z1; z++) {
      G(x, z, o.floor || B.FLOOR);
      const edge = x === o.x0 || x === o.x1 || z === o.z0 || z === o.z1;
      const corner = (x === o.x0 || x === o.x1) && (z === o.z0 || z === o.z1);
      for (let y = 1; y <= top; y++) {
        let t = B.AIR;
        if (y === top) t = B.ROOF;
        else if (edge) {
          t = wall;
          const along = (x === o.x0 || x === o.x1) ? z : x;
          const ly = ((y - 1) % fh) + 1;
          if (!corner && along % 3 === 1 && (ly === 2 || ly === 3) && y < top - 1) t = o.glass || B.GLASS;
          if (ly === fh && y < top) t = trim;
          if (corner) t = trim;
        } else if (y % fh === 0 && y < top) t = o.open ? slab : slab; // 楼板
        else if (!o.open && y > fh) t = slab; // 未开放楼层封闭
        if (t !== B.AIR) V(x, y, z, t);
      }
      if (edge) V(x, top + 1, z, trim); // 女儿墙
    }
    for (const [side, a, b, h = 3] of o.doors || []) for (let k = a; k <= b; k++) for (let y = 1; y <= h; y++) {
      if (side === 'E') V(o.x1, y, k, B.AIR); if (side === 'W') V(o.x0, y, k, B.AIR);
      if (side === 'N') V(k, y, o.z1, B.AIR); if (side === 'S') V(k, y, o.z0, B.AIR);
    }
    const info = { x0: o.x0, z0: o.z0, x1: o.x1, z1: o.z1, floors: o.open ? floors : 1, fh, top, stairs: null, name: o.name };
    if (o.stairs && o.open) {
      const { sx, sz } = o.stairs; info.stairs = { sx, sz };
      for (let f = 0; f < floors - 1; f++) {
        const base = f * fh, dirA = f % 2 === 0;
        const lane = dirA ? sz : sz + 2;
        for (let i = 1; i <= fh; i++) {
          const x = dirA ? sx + i - 1 : sx + fh - i;
          for (const z of [lane, lane + 1]) {
            for (let y = base + 1; y <= base + i; y++) V(x, y, z, B.STAIR);
            for (let y = base + i + 1; y <= base + fh - 1; y++) V(x, y, z, B.AIR);
            if (i < fh) V(x, base + fh, z, B.AIR); // 楼板开洞
          }
        }
      }
    }
    BUILDINGS.push(info);
    return info;
  }
  const inner = (x, y, z) => at(x, y, z) === B.AIR;
  // 室内隔墙（带门洞）
  function partX(x, z0, z1, y0, h, gap0, gap1, t = B.CONC) { for (let z = z0; z <= z1; z++) for (let y = y0; y < y0 + h; y++) if (!(z >= gap0 && z <= gap1 && y < y0 + 3)) V(x, y, z, t); }
  function partZ(z, x0, x1, y0, h, gap0, gap1, t = B.CONC) { for (let x = x0; x <= x1; x++) for (let y = y0; y < y0 + h; y++) if (!(x >= gap0 && x <= gap1 && y < y0 + 3)) V(x, y, z, t); }
  const furn = {
    fridge: (x, y, z) => obj('fridge', 2, '冰箱', [[x, y, z, B.FRIDGE], [x, y + 1, z, B.FRIDGE]]),
    shelf: (x, y, z) => obj('shelf', 3, '储物柜', [[x, y, z, B.SHELF], [x, y + 1, z, B.SHELF], [x, y + 2, z, B.SHELF]]),
    table: (x, y, z) => obj('table', 2, '桌子', [[x, y, z, B.WOOD], [x + 1, y, z, B.WOOD]]),
    sofa: (x, y, z) => obj('sofa', 2, '沙发', [[x, y, z, B.SOFA], [x + 1, y, z, B.SOFA], [x + 2, y, z, B.SOFA]]),
    bed: (x, y, z) => obj('bed', 2, '床', [[x, y, z, B.BED], [x + 1, y, z, B.BED], [x, y, z + 1, B.BED], [x + 1, y, z + 1, B.BED]]),
    crate: (x, y, z) => obj('crate', 2, '物资箱', [[x, y, z, B.CRATE]]),
    desk: (x, y, z) => obj('desk', 2, '办公桌', [[x, y, z, B.DESK], [x + 1, y, z, B.DESK]]),
    locker: (x, y, z) => obj('locker', 2, '储物柜', [[x, y, z, B.LOCKER], [x, y + 1, z, B.LOCKER]]),
    medcab: (x, y, z) => obj('medcab', 2, '药品柜', [[x, y, z, B.MEDCAB], [x, y + 1, z, B.MEDCAB]]),
    mshelf: (x, y, z, dz = 1) => obj('mshelf', 2, '货架', [[x, y, z, B.MSHELF], [x, y + 1, z, B.MSHELF], [x, y, z + dz, B.MSHELF], [x, y + 1, z + dz, B.MSHELF]]),
    fuel: (x, y, z) => obj('fuelcan', 1, '燃油桶', [[x, y, z, B.FUELCAN]]),
    machine: (x, y, z) => obj('machine', 3, '旧设备', [[x, y, z, B.MACHINE], [x, y + 1, z, B.MACHINE]]),
    barrel: (x, y, z) => obj('barrel', 2, '储水桶', [[x, y, z, B.BARREL]]),
  };

  // ===== 1. 居民公寓（起点）=====
  const aptA = bldg({ name: '公寓 3 号楼', x0: 6, z0: 6, x1: 25, z1: 23, floors: 3, open: true, wall: B.CONC, doors: [['E', 13, 14], ['N', 10, 10]], stairs: { sx: 8, sz: 18 } });
  for (const f of [0, 1, 2]) { const y = f * 5 + 1; partX(16, 7, 22, y, 4, 12, 14); }
  // 1F：起居室 + 工作台
  special('wbench', '工作台', 10, 1, 9, B.WBENCH);
  furn.fridge(15, 1, 7); furn.table(19, 1, 10); furn.sofa(19, 1, 15); furn.shelf(24, 1, 7); furn.crate(23, 1, 21);
  special('sleepbed', '你的床', 7, 1, 7, B.BED); V(7, 1, 8, B.BED); w.put(w.specials[w.specials.length - 1], 7, 1, 8, B.BED);
  // 2F
  furn.bed(18, 6, 7); furn.fridge(15, 6, 7); furn.shelf(24, 6, 12); furn.crate(20, 6, 21); furn.table(9, 6, 8); furn.sofa(19, 6, 17); furn.crate(7, 6, 12);
  // 3F：电台
  special('radio', '损坏的电台', 21, 11, 8, B.RADIO);
  V(20, 11, 8, B.DESK); V(22, 11, 8, B.DESK);
  furn.bed(8, 11, 7); furn.shelf(24, 11, 15); furn.crate(18, 11, 21); furn.fridge(15, 11, 7); furn.machine(23, 11, 21);
  // 其他公寓（仅一层开放）
  bldg({ name: '公寓 1 号楼', x0: 58, z0: 6, x1: 76, z1: 20, floors: 3, wall: B.BRICK, doors: [['W', 12, 13], ['N', 70, 70]] });
  partX(67, 7, 19, 1, 4, 12, 14);
  furn.fridge(59, 1, 7); furn.shelf(66, 1, 7); furn.bed(60, 1, 17); furn.table(70, 1, 9); furn.crate(75, 1, 18); furn.sofa(70, 1, 16); furn.fridge(75, 1, 7);
  bldg({ name: '公寓 2 号楼', x0: 60, z0: 25, x1: 82, z1: 36, floors: 2, wall: B.CONC, doors: [['W', 30, 31], ['S', 75, 76]] });
  partX(71, 26, 35, 1, 4, 30, 31);
  furn.fridge(61, 1, 26); furn.shelf(70, 1, 26); furn.bed(62, 1, 33); furn.crate(80, 1, 34); furn.table(75, 1, 28); furn.sofa(76, 1, 33);
  // 小区花园
  for (let x = 29; x <= 39; x++) for (let z = 4; z <= 36; z++) if (r() < 0.06) G(x, z, B.DIRT);

  // ===== 2. 大型超市 =====
  const mart = bldg({ name: '大型超市', x0: 58, z0: 50, x1: 90, z1: 80, floors: 1, fh: 7, height: 7, wall: B.BRICK, trim: B.CONC2, doors: [['W', 63, 66], ['E', 70, 71]] });
  for (let z = 52; z <= 78; z++) for (let y = 1; y <= 4; y++) if (!(z >= 63 && z <= 66) && z % 2 === 0) V(58, y, z, B.GLASS);
  for (let z = 58; z <= 71; z++) V(57, 6, z, z % 3 === 0 ? B.SIGNB : B.SIGN); // 招牌灯条（无文字/商标）
  for (let z = 58; z <= 71; z++) V(57, 5, z, B.CONC2);
  for (const x of [64, 68, 72, 76, 80]) for (let z = 53; z <= 76; z += 2) { if (z >= 62 && z <= 67) continue; furn.mshelf(x, 1, z); }
  for (const z of [54, 57, 72, 75]) { const o = w.newObject('desk', 2, 'desk', '收银台'); w.put(o, 61, 1, z, B.CHECKOUT); w.put(o, 61, 1, z + 1, B.CHECKOUT); }
  partX(84, 51, 79, 1, 6, 64, 66);
  furn.crate(86, 1, 52); furn.crate(88, 1, 53); furn.crate(86, 1, 77); furn.fuel(88, 1, 58); furn.fuel(89, 1, 59); furn.machine(88, 1, 74); furn.shelf(89, 1, 62); furn.crate(87, 1, 68);
  // 停车场
  for (let x = 6; x <= 40; x++) for (let z = 48; z <= 80; z++) { G(x, z, B.ROAD); if ((x - 6) % 4 === 0 && z % 11 !== 0 && z !== 64) G(x, z, B.WALK); }
  for (const [x, z] of [[8, 50], [16, 52], [24, 50], [32, 55], [10, 66], [20, 70], [30, 68], [12, 76], [36, 76], [26, 60]]) car(w, r, x, z, 'z');
  for (let x = 10; x <= 38; x += 14) lamp(w, x, 64);

  // ===== 3. 警察局 =====
  const pol = bldg({ name: '警察局', x0: 8, z0: 94, x1: 36, z1: 118, floors: 1, fh: 6, height: 6, wall: B.POLICE, trim: B.CONC, doors: [['E', 104, 106], ['S', 20, 21]] });
  partZ(103, 9, 35, 1, 5, 21, 23); partZ(109, 9, 35, 1, 5, 25, 27); partX(18, 95, 102, 1, 5, 98, 99); partX(17, 110, 117, 1, 5, 112, 113);
  for (let z = 96; z <= 101; z += 2) furn.locker(9, 1, z);
  furn.locker(13, 1, 95); furn.locker(15, 1, 95);
  for (const [x, z] of [[22, 97], [26, 97], [30, 97], [22, 100], [30, 100]]) furn.desk(x, 1, z);
  furn.desk(24, 1, 112); furn.desk(29, 1, 114); furn.crate(34, 1, 116); furn.shelf(35, 1, 110);
  furn.locker(9, 1, 111); furn.locker(9, 1, 113); furn.crate(14, 1, 116); furn.crate(15, 1, 116);
  special('commsbox', '通讯设备柜', 10, 1, 116, B.LOCKER, 'comms'); V(10, 2, 116, B.LOCKER); w.put(w.specials[w.specials.length - 1], 10, 2, 116, B.LOCKER);
  for (let z = 104; z <= 106; z++) V(36, 4, z, B.SIGNB);
  // 警局前沙袋与警车
  for (let z = 98; z <= 112; z++) if (z < 103 || z > 107) V(39, 1, z, B.SAND);
  for (const [x, z, d] of [[56, 94, 'x'], [64, 100, 'x'], [58, 112, 'z'], [72, 106, 'x'], [80, 116, 'z']]) car(w, r, x, z, d, B.CAR_B);
  for (let x = 58; x <= 86; x += 7) { V(x, 1, 121, B.SAND); V(x + 1, 1, 121, B.SAND); }
  bldg({ name: '仓库', x0: 66, z0: 92, x1: 84, z1: 98, floors: 1, fh: 5, height: 5, wall: B.METAL, doors: [['N', 74, 76]] });
  furn.crate(68, 1, 93); furn.crate(82, 1, 94); furn.fuel(70, 1, 96); furn.machine(80, 1, 96);

  // ===== 4. 中心医院 =====
  const hosp = bldg({ name: '中心医院', x0: 56, z0: 132, x1: 88, z1: 156, floors: 3, open: true, wall: B.HOSP, trim: B.TILE, slab: B.TILE, floor: B.TILE, doors: [['W', 142, 145], ['S', 64, 65]], stairs: { sx: 78, sz: 150 } });
  for (const f of [0, 1, 2]) { const y = f * 5 + 1; partX(70, 133, 155, y, 4, 142, 145, B.HOSP); partZ(141, 57, 69, y, 4, 62, 64, B.HOSP); partZ(147, 71, 76, y, 4, 72, 74, B.HOSP); }
  // 红十字（方块拼成）
  for (let k = -2; k <= 2; k++) { V(55, 10 + 2, 144 + k, B.REDX); V(55, 10 + 2 + k, 144, B.REDX); }
  for (let k = -2; k <= 2; k++) { V(56 + 16 + k, 12, 131, B.REDX); V(72, 12 + k, 131, B.REDX); }
  // 1F 急诊大厅
  for (const [x, z] of [[58, 134], [62, 134], [66, 134]]) furn.bed(x, 1, z);
  furn.desk(60, 1, 146); furn.desk(64, 1, 146); furn.medcab(57, 1, 154); furn.medcab(69, 1, 154); furn.crate(86, 1, 134); furn.shelf(87, 1, 140);
  // 2F 病房 + 药品箱
  for (const [x, z] of [[58, 133], [62, 133], [66, 133], [73, 133], [77, 133], [81, 133]]) furn.bed(x, 6, z);
  furn.medcab(57, 6, 150); furn.medcab(69, 6, 150); furn.medcab(87, 6, 145); furn.crate(84, 6, 140);
  special('medkit', '急救药品箱', 74, 6, 140, B.MEDCAB, 'medkit'); w.put(w.specials[w.specials.length - 1], 74, 7, 140, B.MEDCAB);
  // 3F 医生办公室
  furn.desk(60, 11, 136); furn.desk(64, 11, 136); furn.medcab(57, 11, 140); furn.medcab(87, 11, 134); furn.medcab(87, 11, 137); furn.bed(73, 11, 134); furn.crate(66, 11, 154); furn.machine(85, 11, 144);
  // 医院西侧：救护车与临时帐篷
  for (const [x, z] of [[10, 134, 'x'], [20, 138, 'x'], [12, 150, 'z'], [30, 146, 'x']]) car(w, r, x, z[0] ? z : z, 'x', B.CAR_G);
  tent(w, 24, 152); tent(w, 34, 134);

  // ===== 5. 北部撤离区 =====
  for (let x = 2; x < W - 2; x++) if (x < AVE.x0 - 2 || x > AVE.x1 + 2) { V(x, 1, 168, B.FENCE); V(x, 2, 168, B.FENCE); }
  for (let x = 38; x <= 57; x++) for (let z = 170; z <= 189; z++) G(x, z, B.WALK);
  for (let x = 40; x <= 55; x++) for (let z = 172; z <= 187; z++) G(x, z, B.PAD);
  for (let z = 175; z <= 184; z++) { G(44, z, B.PADMARK); G(51, z, B.PADMARK); }
  for (let x = 44; x <= 51; x++) G(x, 179, B.PADMARK);
  for (let x = 40; x <= 55; x++) { G(x, 172, B.PADMARK); G(x, 187, B.PADMARK); }
  for (const [x0, z0, len, dir] of [[34, 170, 8, 'z'], [60, 170, 8, 'z'], [36, 189, 22, 'x'], [24, 176, 6, 'x'], [66, 176, 6, 'x']]) for (let i = 0; i < len; i++) { const x = dir === 'x' ? x0 + i : x0, z = dir === 'z' ? z0 + i : z0; V(x, 1, z, B.SAND); if (i % 3) V(x, 2, z, B.SAND); }
  tent(w, 12, 174); tent(w, 22, 182); tent(w, 70, 174); tent(w, 80, 182);
  for (const [x, z] of [[38, 170], [57, 170], [38, 189], [57, 188]]) lamp(w, x, z);
  furn.crate(14, 1, 180); furn.crate(72, 1, 180); furn.fuel(26, 1, 186); furn.crate(84, 1, 172);

  // ---------- 街道杂物 ----------
  const aveCars = [[45, 18, 'z'], [49, 30, 'z'], [45, 58, 'z'], [49, 72, 'z'], [45, 100, 'z'], [49, 114, 'z'], [45, 140, 'z'], [49, 152, 'z'], [20, 41, 'x'], [70, 41, 'x'], [28, 86, 'x'], [64, 86, 'x'], [16, 126, 'x'], [76, 126, 'x'], [30, 161, 'x'], [66, 162, 'x']];
  for (const [x, z, d] of aveCars) car(w, r, x, z, d);
  for (let z = 6; z < 166; z += 12) { lamp(w, AVE.x0, z); lamp(w, AVE.x1, z + 6); }
  // 燃烧的废车（火焰粒子由渲染层根据 w.fires 生成）
  w.fires = [];
  for (const [x, z] of [[49, 30], [20, 41], [45, 100], [76, 126]]) w.fires.push({ x: x + 0.5, y: 3, z: z + 1.5 });
  // 树
  const occupied = (x, z) => { for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) { const t = w.get(x + dx, 0, z + dz); if (t !== B.GRASS && t !== B.DIRT) return true; if (w.get(x + dx, 1, z + dz) !== B.AIR) return true; } return false; };
  let trees = 0, tries = 0;
  while (trees < 70 && tries++ < 6000) {
    const x = ri(r, 3, W - 4), z = ri(r, 3, D - 4);
    if (occupied(x, z)) continue;
    tree(w, r, x, z); trees++;
  }
  const free1 = (x, z) => w.get(x, 1, z) === B.AIR && w.get(x, 2, z) === B.AIR && SOLID[w.get(x, 0, z)] && w.get(x, 5, z) === B.AIR;
  const scatter = (n, fn) => { let k = 0, t = 0; while (k < n && t++ < 6000) { const x = ri(r, 2, W - 3), z = ri(r, 2, D - 3); if (!free1(x, z)) continue; if (w.get(x, 0, z) === B.PAD) continue; if (fn(x, z)) k++; } };
  scatter(40, (x, z) => { const o = w.newObject('crate', 2, 'crate', '物资箱'); w.put(o, x, 1, z, B.CRATE); if (r() < 0.3) w.put(o, x, 2, z, B.CRATE); return true; });
  scatter(22, (x, z) => { if (!free1(x + 1, z) || !free1(x, z + 1)) return false; const o = w.newObject('rubble', 3, 'rubble', '碎石堆'); w.put(o, x, 1, z, B.RUBBLE); w.put(o, x + 1, 1, z, B.RUBBLE); w.put(o, x, 1, z + 1, B.RUBBLE); if (r() < 0.5) w.put(o, x, 2, z, B.RUBBLE); return true; });
  scatter(16, (x, z) => { const o = w.newObject('barrel', 2, 'barrel', '储水桶'); w.put(o, x, 1, z, B.BARREL); return true; });
  scatter(16, (x, z) => { const o = w.newObject('bin', 2, 'bin', '垃圾箱'); w.put(o, x, 1, z, B.METAL); return true; });
  scatter(10, (x, z) => { const o = w.newObject('tire', 2, 'tire', '轮胎堆'); w.put(o, x, 1, z, B.TIRE); return true; });
  scatter(6, (x, z) => { const o = w.newObject('fuelcan', 1, 'fuelcan', '燃油桶'); w.put(o, x, 1, z, B.FUELCAN); return true; });
  // 屋顶细节：空调外机、水箱
  for (const b of BUILDINGS) {
    const ty = b.top + 1;
    for (let i = 0; i < 3; i++) { const x = ri(r, b.x0 + 2, b.x1 - 2), z = ri(r, b.z0 + 2, b.z1 - 2); if (w.get(x, ty, z) === B.AIR && SOLID[w.get(x, ty - 1, z)]) { V(x, ty, z, B.ACUNIT); if (i === 0) { V(x + 1, ty, z, B.ACUNIT); V(x, ty + 1, z, B.ACUNIT); } } }
  }
  w.buildings = BUILDINGS;
  w.version++;
  for (let cx = 0; cx < W / CH; cx++) for (let cz = 0; cz < D / CH; cz++) w.dirty.add(cx + cz * 100);
  void aptA; void mart; void pol; void hosp; void inner; void H;
  return w;
}

function car(w, r, x, z, dir, forceT) {
  const types = [B.CAR_R, B.CAR_B, B.CAR_G];
  const t = forceT || types[Math.floor(r() * 3)];
  const o = w.newObject('car', 6, 'car', '废弃汽车');
  const L = 4, Wd = 2;
  for (let i = 0; i < L; i++) for (let j = 0; j < Wd; j++) {
    const cx = dir === 'x' ? x + i : x + j, cz = dir === 'x' ? z + j : z + i;
    w.put(o, cx, 1, cz, t);
    if (i === 1 || i === 2) w.put(o, cx, 2, cz, B.GLASS);
  }
}
function lamp(w, x, z) {
  if (w.get(x, 1, z) !== B.AIR) return;
  for (let y = 1; y <= 4; y++) w.v[w.idx(x, y, z)] = B.METAL;
  w.v[w.idx(x, 5, z)] = B.LIGHT;
}
function tent(w, x, z) {
  for (let dx = 0; dx < 5; dx++) for (let dz = 0; dz < 4; dz++) {
    const h = dz === 0 || dz === 3 ? 1 : 2;
    if (dx === 0 && (dz === 1 || dz === 2)) continue; // 入口
    for (let y = 1; y <= h; y++) if (w.get(x + dx, y, z + dz) === B.AIR) w.v[w.idx(x + dx, y, z + dz)] = B.TENT;
  }
  const o = w.newObject('crate', 2, 'crate', '军用物资箱'); w.put(o, x + 3, 1, z + 1, B.CRATE);
}
function tree(w, r, x, z) {
  const o = w.newObject('tree', 4, 'tree', '树');
  const h = ri(r, 3, 5);
  for (let y = 1; y <= h; y++) w.put(o, x, y, z, B.TRUNK);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let y = h; y <= h + 2; y++) {
    if (dx === 0 && dz === 0 && y === h) continue;
    if (Math.abs(dx) + Math.abs(dz) === 2 && (y === h + 2 || r() < 0.3)) continue;
    w.put(o, x + dx, y, z + dz, B.LEAF);
  }
  w.put(o, x, h + 3, z, B.LEAF);
}
