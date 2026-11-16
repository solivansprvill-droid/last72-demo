// 体素世界数据（纯逻辑，无渲染依赖）
export const W = 64, H = 20, D = 64, CH = 16; // 世界尺寸与区块尺寸

// 方块类型
export const B = {
  AIR: 0, GRASS: 1, ROAD: 2, WALK: 3, LINE: 4, CONC: 5, CONC2: 6, GLASS: 7,
  TRUNK: 8, LEAF: 9, CAR_R: 10, CAR_B: 11, CAR_G: 12, CRATE: 13, RUBBLE: 14,
  WOOD: 15, ROOF: 16, FLOOR: 17, FRIDGE: 18, BED: 19, SOFA: 20, METAL: 21,
  DIRT: 22, LIGHT: 23, BARREL: 24, TIRE: 25, BARRIER: 26, PAD: 27, PADMARK: 28,
  S_WALL: 30, S_BAR: 31, S_SPIKE: 32, BORDER: 33, SHELF: 34, WHEEL: 35,
};

// 调色板：灰黑 / 暗红 / 冷蓝 / 橙黄
export const COLORS = {
  [B.GRASS]: [0.25, 0.30, 0.22], [B.ROAD]: [0.16, 0.16, 0.18], [B.WALK]: [0.42, 0.42, 0.44],
  [B.LINE]: [0.85, 0.62, 0.15], [B.CONC]: [0.50, 0.50, 0.53], [B.CONC2]: [0.30, 0.30, 0.33],
  [B.GLASS]: [0.22, 0.34, 0.48], [B.TRUNK]: [0.33, 0.22, 0.14], [B.LEAF]: [0.20, 0.32, 0.22],
  [B.CAR_R]: [0.52, 0.13, 0.12], [B.CAR_B]: [0.18, 0.30, 0.48], [B.CAR_G]: [0.40, 0.41, 0.43],
  [B.CRATE]: [0.80, 0.52, 0.16], [B.RUBBLE]: [0.38, 0.36, 0.34], [B.WOOD]: [0.50, 0.34, 0.20],
  [B.ROOF]: [0.20, 0.19, 0.21], [B.FLOOR]: [0.36, 0.28, 0.22], [B.FRIDGE]: [0.72, 0.74, 0.78],
  [B.BED]: [0.45, 0.14, 0.14], [B.SOFA]: [0.22, 0.30, 0.42], [B.METAL]: [0.28, 0.29, 0.31],
  [B.DIRT]: [0.30, 0.24, 0.18], [B.LIGHT]: [1.0, 0.80, 0.42], [B.BARREL]: [0.20, 0.42, 0.62],
  [B.TIRE]: [0.10, 0.10, 0.11], [B.BARRIER]: [0.55, 0.15, 0.12], [B.PAD]: [0.26, 0.27, 0.30],
  [B.PADMARK]: [0.95, 0.66, 0.15], [B.S_WALL]: [0.62, 0.43, 0.24], [B.S_BAR]: [0.45, 0.40, 0.36],
  [B.S_SPIKE]: [0.55, 0.57, 0.60], [B.BORDER]: [0.18, 0.18, 0.20], [B.SHELF]: [0.46, 0.32, 0.20],
  [B.WHEEL]: [0.08, 0.08, 0.09],
};
export const GLOW = new Set([B.LIGHT]);

export const SOLID = new Uint8Array(64).fill(1);
SOLID[B.AIR] = 0; SOLID[B.S_SPIKE] = 0;

export const STRUCT_TYPES = new Set([B.S_WALL, B.S_BAR, B.S_SPIKE]);

export class World {
  constructor() {
    this.v = new Uint8Array(W * H * D);
    this.obj = new Int16Array(W * H * D).fill(-1);
    this.objects = [];
    this.structs = new Map(); // key x+z*W -> {type,x,z,hp,max,h,voxel}
    this.dirty = new Set();
    this.version = 0; // 地形变化版本号（导航重算用）
  }
  idx(x, y, z) { return x + W * (z + D * y); }
  inside(x, y, z) { return x >= 0 && x < W && z >= 0 && z < D && y >= 0 && y < H; }
  get(x, y, z) {
    if (y < 0) return B.DIRT;
    if (y >= H) return B.AIR;
    if (x < 0 || z < 0 || x >= W || z >= D) return B.BORDER;
    return this.v[x + W * (z + D * y)];
  }
  solid(x, y, z) { return SOLID[this.get(x, y, z)] === 1; }
  set(x, y, z, t, objId = -1) {
    if (!this.inside(x, y, z)) return;
    const i = this.idx(x, y, z);
    this.v[i] = t; this.obj[i] = objId;
    this.markDirty(x, z);
    this.version++;
  }
  markDirty(x, z) {
    const cx = (x / CH) | 0, cz = (z / CH) | 0;
    this.dirty.add(cx + cz * 100);
    const lx = x % CH, lz = z % CH;
    if (lx === 0 && cx > 0) this.dirty.add(cx - 1 + cz * 100);
    if (lx === CH - 1 && cx < W / CH - 1) this.dirty.add(cx + 1 + cz * 100);
    if (lz === 0 && cz > 0) this.dirty.add(cx + (cz - 1) * 100);
    if (lz === CH - 1 && cz < D / CH - 1) this.dirty.add(cx + (cz + 1) * 100);
  }
  objAt(x, y, z) {
    if (!this.inside(x, y, z)) return null;
    const id = this.obj[this.idx(x, y, z)];
    return id >= 0 ? this.objects[id] : null;
  }
  newObject(kind, hits, loot, name) {
    const o = { id: this.objects.length, kind, hits, maxHits: hits, loot, name, cells: [], alive: true };
    this.objects.push(o);
    return o;
  }
  put(o, x, y, z, t) {
    if (!this.inside(x, y, z)) return;
    if (this.get(x, y, z) !== B.AIR && y > 0) return; // 不覆盖已有物体
    this.set(x, y, z, t, o ? o.id : -1);
    if (o) o.cells.push([x, y, z]);
  }
  removeObject(o) {
    o.alive = false;
    for (const [x, y, z] of o.cells) if (this.obj[this.idx(x, y, z)] === o.id) this.set(x, y, z, B.AIR, -1);
  }
  structAt(x, z) { return this.structs.get(x + z * W) || null; }
  structDamage(x, z) { const s = this.structAt(x, z); return s ? s.hp / s.max : 1; }
}

// ---------- 程序化生成：新曙光市住宅街区 ----------
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const ri = (r, a, b) => a + Math.floor(r() * (b - a + 1));

export function generateWorld(seed = 72) {
  const w = new World();
  const r = rng(seed);
  // 地面
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) w.v[w.idx(x, 0, z)] = r() < 0.12 ? B.DIRT : B.GRASS;
  const g = (x, z, t) => { w.v[w.idx(x, 0, z)] = t; };
  // 东西主路 z 28..35
  for (let x = 0; x < W; x++) {
    g(x, 28, B.WALK); g(x, 35, B.WALK);
    for (let z = 29; z <= 34; z++) g(x, z, B.ROAD);
    if (x % 4 < 2) { g(x, 31, B.LINE); }
  }
  // 南北路 x 29..34
  for (let z = 0; z < 54; z++) {
    if (z >= 28 && z <= 35) continue;
    g(29, z, B.WALK); g(34, z, B.WALK);
    for (let x = 30; x <= 33; x++) g(x, z, B.ROAD);
    if (z % 4 < 2) g(31, z, B.LINE);
  }
  // 北部撤离广场 + 停机坪
  for (let x = 22; x <= 41; x++) for (let z = 52; z <= 62; z++) g(x, z, B.WALK);
  for (let x = 27; x <= 36; x++) for (let z = 53; z <= 62; z++) g(x, z, B.PAD);
  // 停机坪 “H” 标记
  for (let z = 55; z <= 60; z++) { g(29, z, B.PADMARK); g(34, z, B.PADMARK); }
  for (let x = 29; x <= 34; x++) g(x, 57, B.PADMARK);
  for (let x = 27; x <= 36; x++) { g(x, 53, B.PADMARK); g(x, 62, B.PADMARK); }

  // 边界围墙（主路两端与南路口留出口供感染者涌入，但出口外为不可通行）
  for (let i = 0; i < W; i++) {
    for (let y = 1; y <= 3; y++) {
      if (!(i >= 28 && i <= 35)) { w.v[w.idx(0, y, i)] = B.BORDER; w.v[w.idx(W - 1, y, i)] = B.BORDER; }
      if (!(i >= 29 && i <= 34)) w.v[w.idx(i, y, 0)] = B.BORDER;
      w.v[w.idx(i, y, D - 1)] = B.BORDER;
    }
  }
  // 路障（暗红色）
  for (const z of [29, 34]) { w.v[w.idx(1, 1, z)] = B.BARRIER; w.v[w.idx(W - 2, 1, z)] = B.BARRIER; }

  // 公寓楼
  building(w, r, 4, 5, 19, 18, 'N', 11, 13);
  building(w, r, 40, 6, 57, 19, 'N', 47, 12);
  building(w, r, 5, 41, 20, 55, 'S', 12, 13);

  // 东北：小木棚 + 停车场
  for (let x = 44; x <= 49; x++) for (let z = 40; z <= 44; z++) {
    const edge = x === 44 || x === 49 || z === 40 || z === 44;
    g(x, z, B.FLOOR);
    if (edge && !(z === 40 && (x === 46 || x === 47))) for (let y = 1; y <= 3; y++) w.v[w.idx(x, y, z)] = B.WOOD;
    w.v[w.idx(x, 4, z)] = B.ROOF;
  }
  const shedShelf = w.newObject('shelf', 2, { wood: 2, food: 1 }, '木架');
  w.put(shedShelf, 48, 1, 43, B.SHELF); w.put(shedShelf, 48, 2, 43, B.SHELF);
  const shedCrate = w.newObject('crate', 2, 'crate', '物资箱'); w.put(shedCrate, 45, 1, 43, B.CRATE);

  // 车辆
  const cars = [[8, 25, 'x'], [16, 25, 'x'], [42, 25, 'x'], [52, 37, 'x'], [24, 32, 'x'], [38, 30, 'x'],
    [44, 47, 'z'], [48, 47, 'z'], [52, 47, 'z'], [56, 47, 'z'], [36, 12, 'z'], [26, 44, 'z']];
  for (const [x, z, dir] of cars) car(w, r, x, z, dir);

  // 路灯
  for (let x = 6; x < W - 4; x += 12) { lamp(w, x, 27); lamp(w, x + 6, 36); }

  // 树
  const occupied = (x, z) => { for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) { const t = w.get(x + dx, 0, z + dz); if (t !== B.GRASS && t !== B.DIRT) return true; if (w.get(x + dx, 1, z + dz) !== B.AIR) return true; } return false; };
  let trees = 0, tries = 0;
  while (trees < 26 && tries++ < 2000) {
    const x = ri(r, 3, W - 4), z = ri(r, 3, D - 4);
    if (occupied(x, z)) continue;
    tree(w, r, x, z); trees++;
  }
  // 物资箱 / 碎石 / 水桶 / 垃圾桶
  const free1 = (x, z) => w.get(x, 1, z) === B.AIR && w.get(x, 2, z) === B.AIR && SOLID[w.get(x, 0, z)];
  const scatter = (n, fn) => { let k = 0, t = 0; while (k < n && t++ < 3000) { const x = ri(r, 2, W - 3), z = ri(r, 2, D - 3); if (!free1(x, z)) continue; if (w.get(x, 0, z) === B.PAD) continue; if (fn(x, z)) k++; } };
  scatter(22, (x, z) => { const o = w.newObject('crate', 2, 'crate', '物资箱'); w.put(o, x, 1, z, B.CRATE); if (r() < 0.3) w.put(o, x, 2, z, B.CRATE); return true; });
  scatter(12, (x, z) => { if (!free1(x + 1, z) || !free1(x, z + 1)) return false; const o = w.newObject('rubble', 3, { stone: [3, 5], metal: [0, 1] }, '碎石堆'); w.put(o, x, 1, z, B.RUBBLE); w.put(o, x + 1, 1, z, B.RUBBLE); w.put(o, x, 1, z + 1, B.RUBBLE); if (r() < 0.5) w.put(o, x, 2, z, B.RUBBLE); return true; });
  scatter(8, (x, z) => { const o = w.newObject('barrel', 2, { water: [2, 3] }, '储水桶'); w.put(o, x, 1, z, B.BARREL); return true; });
  scatter(8, (x, z) => { const o = w.newObject('bin', 2, { metal: [1, 2], food: [0, 1] }, '垃圾箱'); w.put(o, x, 1, z, B.METAL); return true; });
  scatter(6, (x, z) => { const o = w.newObject('tire', 2, { metal: [1, 1], stone: [1, 2] }, '轮胎堆'); w.put(o, x, 1, z, B.TIRE); return true; });

  w.version++;
  for (let cx = 0; cx < W / CH; cx++) for (let cz = 0; cz < D / CH; cz++) w.dirty.add(cx + cz * 100);
  return w;
}

function building(w, r, x0, z0, x1, z1, doorSide, doorX, height) {
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    w.v[w.idx(x, 0, z)] = B.FLOOR;
    const edge = x === x0 || x === x1 || z === z0 || z === z1;
    for (let y = 1; y <= height; y++) {
      let t;
      if (y === height) t = B.ROOF;
      else if (y === 5) t = B.CONC2;
      else if (y > 5) t = edge ? B.CONC : B.CONC2; // 上层封闭
      else t = edge ? B.CONC : B.AIR;
      if (edge && t === B.CONC) {
        const along = (x === x0 || x === x1) ? z : x;
        const corner = (x === x0 || x === x1) && (z === z0 || z === z1);
        if (!corner && along % 3 === 1 && ((y >= 2 && y <= 3) || (y >= 7 && y <= 8) || (y >= 10 && y <= 11 && height > 11))) t = B.GLASS;
        if (y % 4 === 1 && y > 5) t = B.CONC2; // 楼层线
      }
      if (t !== B.AIR) w.v[w.idx(x, y, z)] = t;
    }
    if (edge) w.v[w.idx(x, height + 1, z)] = B.CONC2; // 女儿墙
  }
  // 门（2 宽 3 高）
  const dz = doorSide === 'N' ? z1 : z0;
  for (let x = doorX; x <= doorX + 1; x++) for (let y = 1; y <= 3; y++) w.v[w.idx(x, y, dz)] = B.AIR;
  // 侧门
  const sx = x1, sz = ((z0 + z1) / 2) | 0;
  for (let y = 1; y <= 3; y++) w.v[w.idx(sx, y, sz)] = B.AIR;
  // 内隔墙
  const mx = ((x0 + x1) / 2) | 0;
  for (let z = z0 + 1; z < z1; z++) for (let y = 1; y <= 4; y++) {
    const gap = Math.abs(z - ((z0 + z1) / 2 | 0)) <= 1 && y <= 3;
    if (!gap) w.v[w.idx(mx, y, z)] = B.CONC;
  }
  // 家具
  const iz = doorSide === 'N' ? z0 + 1 : z1 - 1; // 远离门的一侧
  const step = doorSide === 'N' ? 1 : -1;
  const bed = w.newObject('bed', 99, null, '床');
  for (let x = x0 + 1; x <= x0 + 2; x++) for (let k = 0; k < 3; k++) w.put(null, x, 1, iz + k * step, B.BED);
  const fr = w.newObject('fridge', 2, { food: [2, 3], water: [1, 2] }, '冰箱');
  w.put(fr, mx - 1, 1, iz, B.FRIDGE); w.put(fr, mx - 1, 2, iz, B.FRIDGE);
  const tb = w.newObject('table', 2, { wood: [2, 3] }, '桌子');
  w.put(tb, x0 + 4, 1, iz + 4 * step, B.WOOD); w.put(tb, x0 + 5, 1, iz + 4 * step, B.WOOD);
  const sh = w.newObject('shelf', 3, { wood: [2, 3], food: [1, 2], water: [0, 1] }, '储物柜');
  for (let y = 1; y <= 3; y++) w.put(sh, mx + 1, y, iz, B.SHELF);
  const fr2 = w.newObject('fridge', 2, { food: [1, 2], water: [2, 3] }, '冰箱');
  w.put(fr2, x1 - 1, 1, iz, B.FRIDGE); w.put(fr2, x1 - 1, 2, iz, B.FRIDGE);
  for (let x = mx + 3; x <= mx + 5 && x < x1; x++) w.put(null, x, 1, iz + 3 * step, B.SOFA);
  const cr = w.newObject('crate', 2, 'crate', '物资箱'); w.put(cr, x1 - 2, 1, iz + 5 * step, B.CRATE);
  const tb2 = w.newObject('table', 2, { wood: [2, 3] }, '桌子');
  w.put(tb2, mx + 3, 1, iz + 6 * step, B.WOOD);
  void bed;
}

function car(w, r, x, z, dir) {
  const types = [B.CAR_R, B.CAR_B, B.CAR_G];
  const t = types[Math.floor(r() * 3)];
  const o = w.newObject('car', 6, { metal: [4, 6], stone: [0, 1] }, '废弃汽车');
  const L = 4, Wd = 2;
  for (let i = 0; i < L; i++) for (let j = 0; j < Wd; j++) {
    const cx = dir === 'x' ? x + i : x + j, cz = dir === 'x' ? z + j : z + i;
    w.put(o, cx, 1, cz, (i === 0 || i === L - 1) && r() < 0.0 ? B.WHEEL : t);
    if (i === 1 || i === 2) w.put(o, cx, 2, cz, B.GLASS);
  }
}

function lamp(w, x, z) {
  if (w.get(x, 1, z) !== B.AIR) return;
  for (let y = 1; y <= 4; y++) w.v[w.idx(x, y, z)] = B.METAL;
  w.v[w.idx(x, 5, z)] = B.LIGHT;
}

function tree(w, r, x, z) {
  const o = w.newObject('tree', 4, { wood: [5, 7] }, '树');
  const h = ri(r, 3, 5);
  for (let y = 1; y <= h; y++) w.put(o, x, y, z, B.TRUNK);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let y = h; y <= h + 2; y++) {
    if (dx === 0 && dz === 0 && y === h) continue;
    if (Math.abs(dx) + Math.abs(dz) === 2 && (y === h + 2 || r() < 0.3)) continue;
    w.put(o, x + dx, y, z + dz, B.LEAF);
  }
  w.put(o, x, h + 3, z, B.LEAF);
}
