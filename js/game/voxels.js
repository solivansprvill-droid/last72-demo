// 体素世界数据（纯逻辑，无渲染依赖）
export const W = 96, H = 24, D = 192, CH = 16; // 世界尺寸与区块尺寸

// 方块类型
export const B = {
  AIR: 0, GRASS: 1, ROAD: 2, WALK: 3, LINE: 4, CONC: 5, CONC2: 6, GLASS: 7,
  TRUNK: 8, LEAF: 9, CAR_R: 10, CAR_B: 11, CAR_G: 12, CRATE: 13, RUBBLE: 14,
  WOOD: 15, ROOF: 16, FLOOR: 17, FRIDGE: 18, BED: 19, SOFA: 20, METAL: 21,
  DIRT: 22, LIGHT: 23, BARREL: 24, TIRE: 25, BARRIER: 26, PAD: 27, PADMARK: 28,
  S_WALL: 30, S_BAR: 31, S_SPIKE: 32, BORDER: 33, SHELF: 34, WHEEL: 35,
  S_DOOR: 36, S_DOOR_O: 37, S_WIN: 38, S_BOX: 39, S_BENCH: 40, S_TOWER: 41, S_PLANK: 42, S_GEN: 43,
  S_LAMP: 44, S_LAMPON: 45, S_LAMPOFF: 46, WBENCH: 47, RADIO: 48, RADIO_ON: 49, STAIR: 50, TILE: 51,
  MSHELF: 52, LOCKER: 53, MEDCAB: 54, DESK: 55, SAND: 56, POLICE: 57, HOSP: 58, REDX: 59, SIGN: 60,
  FUELCAN: 61, CHECKOUT: 62, TENT: 63, MACHINE: 64, BRICK: 65, ACUNIT: 66, FENCE: 67, SIGNB: 68, EMBER: 69,
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
  [B.S_DOOR]: [0.48, 0.30, 0.17], [B.S_DOOR_O]: [0.48, 0.30, 0.17], [B.S_WIN]: [0.55, 0.40, 0.24], [B.S_BOX]: [0.58, 0.42, 0.22],
  [B.S_BENCH]: [0.52, 0.36, 0.2], [B.S_TOWER]: [0.42, 0.29, 0.17], [B.S_PLANK]: [0.6, 0.44, 0.26], [B.S_GEN]: [0.75, 0.55, 0.12],
  [B.S_LAMP]: [0.3, 0.31, 0.33], [B.S_LAMPON]: [1.0, 0.92, 0.6], [B.S_LAMPOFF]: [0.35, 0.34, 0.3], [B.WBENCH]: [0.52, 0.36, 0.2],
  [B.RADIO]: [0.25, 0.32, 0.26], [B.RADIO_ON]: [0.4, 1.0, 0.55], [B.STAIR]: [0.46, 0.45, 0.44], [B.TILE]: [0.70, 0.72, 0.72],
  [B.MSHELF]: [0.62, 0.64, 0.68], [B.LOCKER]: [0.32, 0.38, 0.46], [B.MEDCAB]: [0.82, 0.86, 0.86], [B.DESK]: [0.42, 0.3, 0.2],
  [B.SAND]: [0.62, 0.55, 0.38], [B.POLICE]: [0.20, 0.28, 0.44], [B.HOSP]: [0.80, 0.81, 0.80], [B.REDX]: [0.85, 0.2, 0.18],
  [B.SIGN]: [1.0, 0.6, 0.2], [B.FUELCAN]: [0.78, 0.22, 0.14], [B.CHECKOUT]: [0.3, 0.34, 0.4], [B.TENT]: [0.30, 0.36, 0.24],
  [B.MACHINE]: [0.36, 0.40, 0.38], [B.BRICK]: [0.46, 0.26, 0.2], [B.ACUNIT]: [0.6, 0.62, 0.6], [B.FENCE]: [0.34, 0.35, 0.36],
  [B.SIGNB]: [0.45, 0.75, 1.0], [B.EMBER]: [1.0, 0.45, 0.12],
};
export const GLOW = new Set([B.LIGHT, B.S_LAMPON, B.RADIO_ON, B.SIGN, B.SIGNB, B.EMBER]);

export const SOLID = new Uint8Array(128).fill(1);
SOLID[B.AIR] = 0; SOLID[B.S_SPIKE] = 0; SOLID[B.S_DOOR_O] = 0;

export const STRUCT_TYPES = new Set([B.S_WALL, B.S_BAR, B.S_SPIKE, B.S_DOOR, B.S_DOOR_O, B.S_WIN, B.S_BOX, B.S_BENCH, B.S_TOWER, B.S_GEN, B.S_LAMP, B.S_LAMPON, B.S_LAMPOFF]);

export class World {
  constructor() {
    this.v = new Uint8Array(W * H * D);
    this.obj = new Int16Array(W * H * D).fill(-1);
    this.objects = [];
    this.structs = new Map(); // key structKey(x,y,z) -> struct
    this.cellStruct = new Map(); // 体素索引 -> struct
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
  structAt(x, z, y = 1) { return this.inside(x, y, z) ? this.cellStruct.get(this.idx(x, y, z)) || null : null; }
  structDamage(x, y, z) { const s = this.cellStruct.get(this.idx(x, y, z)); return s ? Math.max(0, s.hp) / s.max : 1; }
}

// 世界生成见 worldgen.js
