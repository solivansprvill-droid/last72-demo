// 体素网格生成：输出与引擎无关的顶点数组（positions / normals / colors / indices）
import { W, H, D, CH, B, COLORS, SOLID, GLOW, STRUCT_TYPES } from './voxels.js';

export const FLIP = true;
export const CUSTOM = new Set([B.S_SPIKE, B.S_DOOR_O, B.S_BOX, B.S_BENCH, B.S_GEN, B.S_WIN, B.S_LAMP, B.WBENCH, B.RADIO, B.RADIO_ON, B.FENCE, B.FUELCAN, B.DESK, B.CHECKOUT]); // 若面朝向反了，切换此值

const FACES = [
  // [法线, 四个角(相对体素原点), 明暗]
  [[0, 1, 0], [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], 1.0],
  [[0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], 0.5],
  [[1, 0, 0], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], 0.8],
  [[-1, 0, 0], [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], 0.8],
  [[0, 0, 1], [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], 0.68],
  [[0, 0, -1], [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], 0.68],
];

export function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class GeoBuilder {
  constructor() { this.p = []; this.n = []; this.c = []; this.i = []; }
  quad(corners, normal, col) {
    const base = this.p.length / 3;
    for (const v of corners) { this.p.push(v[0], v[1], v[2]); this.n.push(normal[0], normal[1], normal[2]); this.c.push(col[0], col[1], col[2], 1); }
    if (FLIP) this.i.push(base, base + 2, base + 1, base, base + 3, base + 2);
    else this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  // 轴对齐盒子（模型用），col 为 [r,g,b]
  box(x0, y0, z0, x1, y1, z1, col, shadeOn = true) {
    const s = [x1 - x0, y1 - y0, z1 - z0];
    for (const [nrm, cs, sh] of FACES) {
      const k = shadeOn ? sh : 1;
      this.quad(cs.map(c => [x0 + c[0] * s[0], y0 + c[1] * s[1], z0 + c[2] * s[2]]), nrm, [col[0] * k, col[1] * k, col[2] * k]);
    }
  }
  data() { return { positions: this.p, normals: this.n, colors: this.c, indices: this.i }; }
}

function voxColor(t, x, y, z, world) {
  const c = COLORS[t] || [1, 0, 1];
  let n = 0.9 + hash3(x, y, z) * 0.2; // 像素噪点
  if (t === B.GLASS) n = 0.95 + hash3(x, y, z) * 0.1;
  let r = c[0] * n, g = c[1] * n, b = c[2] * n;
  if (STRUCT_TYPES.has(t)) {
    const ratio = world.structDamage(x, y, z);
    const dark = 0.45 + 0.55 * ratio;
    const crack = ratio < 0.7 && hash3(x * 3, y, z * 7) < (1 - ratio) ? 0.55 : 1;
    r *= dark * crack; g *= dark * crack; b *= dark * crack;
    if (ratio < 0.35) { r = r * 0.8 + 0.12; } // 濒临损毁：泛暗红
  }
  return [r, g, b];
}

export function buildChunk(world, cx, cz) {
  const solid = new GeoBuilder(), glow = new GeoBuilder();
  const x0 = cx * CH, z0 = cz * CH;
  for (let y = 0; y < H; y++) for (let z = z0; z < z0 + CH; z++) for (let x = x0; x < x0 + CH; x++) {
    const t = world.v[x + W * (z + D * y)];
    if (t === B.AIR) continue;
    if (t === B.S_SPIKE) { spikeGeo(solid, world, x, y, z); continue; }
    if (CUSTOM.has(t)) { customGeo(t === B.RADIO_ON ? glow : solid, world, t, x, y, z); continue; }
    const gb = GLOW.has(t) ? glow : solid;
    const col = voxColor(t, x, y, z, world);
    for (const [nrm, cs, sh] of FACES) {
      const nt = world.get(x + nrm[0], y + nrm[1], z + nrm[2]);
      if (SOLID[nt] && nt !== B.GLASS && !GLOW.has(nt) && !CUSTOM.has(nt)) continue;
      if (nt === t) continue;
      if (y === 0 && nrm[1] === -1) continue;
      const k = GLOW.has(t) ? 1 : sh;
      gb.quad(cs.map(c => [x + c[0], y + c[1], z + c[2]]), nrm, [col[0] * k, col[1] * k, col[2] * k]);
    }
  }
  return { solid: solid.data(), glow: glow.data() };
}

function spikeGeo(gb, world, x, y, z) {
  const ratio = world.structDamage(x, y, z);
  const k = 0.5 + 0.5 * ratio;
  const base = [0.30 * k, 0.28 * k, 0.26 * k];
  gb.box(x + 0.05, y, z + 0.05, x + 0.95, y + 0.12, z + 0.95, base);
  const m = COLORS[B.S_SPIKE];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const px = x + 0.18 + i * 0.29, pz = z + 0.18 + j * 0.29;
    const h = 0.35 + hash3(x + i, y, z + j) * 0.15;
    gb.box(px - 0.06, y + 0.12, pz - 0.06, px + 0.06, y + 0.12 + h, pz + 0.06, [m[0] * k, m[1] * k, m[2] * k]);
  }
}

function shade(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }
function customGeo(gb, world, t, x, y, z) {
  const ratio = world.structDamage(x, y, z);
  const k = (0.55 + 0.45 * ratio) * (0.92 + hash3(x, y, z) * 0.16);
  const c = shade(COLORS[t] || [1, 0, 1], k);
  const dark = shade(c, 0.6), metal = shade([0.3, 0.31, 0.33], k);
  // 门开着时：根据相邻方块决定贴墙方向
  switch (t) {
    case B.S_DOOR_O: {
      const ns = SOLID[world.get(x - 1, y, z)] || SOLID[world.get(x + 1, y, z)];
      if (ns) gb.box(x, y, z + 0.02, x + 0.14, y + 1, z + 0.98, c); else gb.box(x + 0.02, y, z, x + 0.98, y + 1, z + 0.14, c);
      break;
    }
    case B.S_WIN: // 木框 + 玻璃 + 横条
      gb.box(x, y, z, x + 1, y + 0.14, z + 1, c); gb.box(x, y + 0.86, z, x + 1, y + 1, z + 1, c);
      gb.box(x, y, z, x + 0.14, y + 1, z + 0.14, c); gb.box(x + 0.86, y, z, x + 1, y + 1, z + 0.14, c);
      gb.box(x, y, z + 0.86, x + 0.14, y + 1, z + 1, c); gb.box(x + 0.86, y, z + 0.86, x + 1, y + 1, z + 1, c);
      gb.box(x + 0.1, y + 0.14, z + 0.1, x + 0.9, y + 0.86, z + 0.9, [0.24 * k, 0.36 * k, 0.48 * k]);
      gb.box(x - 0.02, y + 0.42, z - 0.02, x + 1.02, y + 0.56, z + 1.02, dark);
      break;
    case B.S_BOX:
      gb.box(x + 0.06, y, z + 0.12, x + 0.94, y + 0.62, z + 0.88, c);
      gb.box(x + 0.04, y + 0.62, z + 0.1, x + 0.96, y + 0.78, z + 0.9, dark);
      gb.box(x + 0.44, y + 0.45, z + 0.06, x + 0.56, y + 0.66, z + 0.12, [0.85 * k, 0.7 * k, 0.3 * k]);
      break;
    case B.S_BENCH: case B.WBENCH:
      gb.box(x + 0.02, y + 0.7, z + 0.02, x + 0.98, y + 0.86, z + 0.98, c);
      for (const [a, b] of [[0.08, 0.08], [0.8, 0.08], [0.08, 0.8], [0.8, 0.8]]) gb.box(x + a, y, z + b, x + a + 0.12, y + 0.7, z + b + 0.12, dark);
      gb.box(x + 0.2, y + 0.86, z + 0.25, x + 0.45, y + 1.0, z + 0.4, metal); gb.box(x + 0.55, y + 0.86, z + 0.55, x + 0.85, y + 0.92, z + 0.7, [0.7 * k, 0.5 * k, 0.2 * k]);
      break;
    case B.S_GEN:
      gb.box(x + 0.08, y, z + 0.15, x + 0.92, y + 0.12, z + 0.85, metal);
      gb.box(x + 0.12, y + 0.12, z + 0.2, x + 0.88, y + 0.7, z + 0.8, c);
      gb.box(x + 0.2, y + 0.7, z + 0.3, x + 0.5, y + 0.85, z + 0.7, dark);
      gb.box(x + 0.62, y + 0.7, z + 0.42, x + 0.72, y + 1.0, z + 0.52, metal);
      break;
    case B.S_LAMP:
      gb.box(x + 0.4, y, z + 0.4, x + 0.6, y + 1, z + 0.6, c);
      gb.box(x + 0.25, y, z + 0.25, x + 0.75, y + 0.12, z + 0.75, dark);
      break;
    case B.RADIO: case B.RADIO_ON:
      gb.box(x + 0.1, y, z + 0.2, x + 0.9, y + 0.55, z + 0.8, t === B.RADIO_ON ? [0.25, 0.4, 0.3] : c);
      gb.box(x + 0.2, y + 0.15, z + 0.79, x + 0.5, y + 0.4, z + 0.82, t === B.RADIO_ON ? [0.5, 1.2, 0.6] : [0.15, 0.2, 0.16]);
      gb.box(x + 0.7, y + 0.55, z + 0.45, x + 0.76, y + 1.3, z + 0.51, metal);
      break;
    case B.FENCE:
      gb.box(x + 0.42, y, z + 0.42, x + 0.58, y + 1, z + 0.58, c);
      gb.box(x, y + 0.7, z + 0.45, x + 1, y + 0.8, z + 0.55, c); gb.box(x + 0.45, y + 0.7, z, x + 0.55, y + 0.8, z + 1, c);
      gb.box(x, y + 0.3, z + 0.45, x + 1, y + 0.4, z + 0.55, c);
      break;
    case B.FUELCAN:
      gb.box(x + 0.25, y, z + 0.3, x + 0.75, y + 0.6, z + 0.7, c); gb.box(x + 0.35, y + 0.6, z + 0.45, x + 0.65, y + 0.72, z + 0.55, dark);
      break;
    case B.DESK: case B.CHECKOUT:
      gb.box(x, y + 0.6, z, x + 1, y + 0.8, z + 1, c); gb.box(x + 0.05, y, z + 0.05, x + 0.95, y + 0.6, z + 0.3, dark);
      if (t === B.CHECKOUT) gb.box(x + 0.3, y + 0.8, z + 0.3, x + 0.7, y + 1.1, z + 0.6, [0.15, 0.2, 0.25]);
      break;
    default: gb.box(x, y, z, x + 1, y + 1, z + 1, c);
  }
}
