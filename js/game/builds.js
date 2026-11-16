// 可建造工事定义与放置/损毁逻辑
import { B, W, D } from './voxels.js';

// cells: 相对底座 [dx,dy,dz,voxel]；h: 底座占用高度（导航判定）
export const BUILDS = [
  { id: 'wall', name: '木墙', cost: { wood: 4 }, hp: 120, cells: [[0, 0, 0, B.S_WALL], [0, 1, 0, B.S_WALL]], block: true, desc: '基础墙体' },
  { id: 'bar', name: '路障', cost: { wood: 3, metal: 2 }, hp: 280, cells: [[0, 0, 0, B.S_BAR], [0, 1, 0, B.S_BAR]], block: true, desc: '坚固，难以拆除' },
  { id: 'spike', name: '尖刺陷阱', cost: { metal: 2, stone: 2 }, hp: 90, cells: [[0, 0, 0, B.S_SPIKE]], block: false, desc: '伤害并减速' },
  { id: 'door', name: '门', cost: { wood: 5, metal: 1 }, hp: 200, cells: [[0, 0, 0, B.S_DOOR], [0, 1, 0, B.S_DOOR]], block: true, door: true, desc: '交互开关，感染者需破门' },
  { id: 'window', name: '窗', cost: { wood: 3, stone: 1 }, hp: 150, cells: [[0, 0, 0, B.S_WALL], [0, 1, 0, B.S_WIN]], block: true, desc: '可观察的加固窗' },
  { id: 'box', name: '储物箱', cost: { wood: 6 }, hp: 100, cells: [[0, 0, 0, B.S_BOX]], block: false, storage: 24, desc: '24 格存储' },
  { id: 'bench', name: '工作台', cost: { wood: 6, metal: 2 }, hp: 120, cells: [[0, 0, 0, B.S_BENCH]], block: false, bench: true, desc: '合成武器与补给' },
  {
    id: 'tower', name: '瞭望塔', cost: { wood: 12, metal: 3 }, hp: 320, block: true, tower: true, desc: '登高远望，感染者难以触及',
    cells: [[0, 0, 0, B.S_TOWER], [0, 1, 0, B.S_TOWER], [0, 2, 0, B.S_TOWER],
      ...[-1, 0, 1].flatMap(dx => [-1, 0, 1].map(dz => [dx, 3, dz, B.S_PLANK]))],
  },
  { id: 'gen', name: '发电机', cost: { metal: 6, parts: 2 }, hp: 160, cells: [[0, 0, 0, B.S_GEN]], block: false, gen: true, desc: '加燃油供电，点亮照明灯' },
  { id: 'lamp', name: '照明灯', cost: { metal: 2, parts: 1 }, hp: 80, cells: [[0, 0, 0, B.S_LAMP], [0, 1, 0, B.S_LAMPOFF]], block: true, lamp: true, desc: '通电后夜间驱赶/减速感染者' },
];
export const BUILD_BY_ID = Object.fromEntries(BUILDS.map(b => [b.id, b]));
export const GEN_RANGE = 14, LAMP_RADIUS = 6.5, FUEL_HOURS = 6;

export function structKey(x, y, z) { return x + z * W + y * W * D; }

export function canPlace(game, def, gx, gy, gz) {
  const w = game.world;
  if (gx < 1 || gz < 1 || gx >= W - 1 || gz >= D - 1) return '超出范围';
  if (!w.solid(gx, gy - 1, gz)) return '需要放在地面上';
  for (const [dx, dy, dz] of def.cells) {
    const x = gx + dx, y = gy + dy, z = gz + dz;
    if (w.get(x, y, z) !== B.AIR) return '位置被占用';
    if (w.cellStruct.has(w.idx(x, y, z))) return '位置被占用';
  }
  const solidCells = def.cells.filter(c => c[1] < 2 && c[3] !== B.S_SPIKE && c[3] !== B.S_PLANK);
  for (const [dx, , dz] of solidCells) if (game.overlapsEntity(gx + dx, gz + dz, gy)) return '有人站在这里';
  return '';
}

export function placeStruct(game, def, gx, gy, gz, hp) {
  const w = game.world;
  const s = { type: def.id, x: gx, y: gy, z: gz, hp: hp ?? def.hp, max: def.hp, cells: [], open: false, fuel: 0, inv: null };
  for (const [dx, dy, dz, t] of def.cells) {
    const x = gx + dx, y = gy + dy, z = gz + dz;
    w.set(x, y, z, t); s.cells.push([x, y, z, t]); w.cellStruct.set(w.idx(x, y, z), s);
  }
  w.structs.set(structKey(gx, gy, gz), s);
  return s;
}

export function removeStruct(game, s) {
  const w = game.world; const blocks = [];
  for (const [x, y, z] of s.cells) {
    const t = w.get(x, y, z);
    if (t !== B.AIR) blocks.push({ x, y, z, t });
    w.set(x, y, z, B.AIR); w.cellStruct.delete(w.idx(x, y, z));
  }
  w.structs.delete(structKey(s.x, s.y, s.z));
  return blocks;
}

export function setDoor(game, s, open) {
  s.open = open;
  for (const c of s.cells) { c[3] = open ? B.S_DOOR_O : B.S_DOOR; game.world.set(c[0], c[1], c[2], c[3]); }
}

export function setLamp(game, s, on) {
  if (s.lit === on) return;
  s.lit = on;
  const c = s.cells[1]; c[3] = on ? B.S_LAMPON : B.S_LAMPOFF; game.world.set(c[0], c[1], c[2], c[3]);
}
