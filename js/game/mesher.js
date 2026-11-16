// 体素网格生成：输出与引擎无关的顶点数组（positions / normals / colors / indices）
import { W, H, D, CH, B, COLORS, SOLID, GLOW, STRUCT_TYPES } from './voxels.js';

export const FLIP = true; // 若面朝向反了，切换此值

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
    const ratio = world.structDamage(x, z);
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
    const gb = GLOW.has(t) ? glow : solid;
    const col = voxColor(t, x, y, z, world);
    for (const [nrm, cs, sh] of FACES) {
      const nt = world.get(x + nrm[0], y + nrm[1], z + nrm[2]);
      if (SOLID[nt] && nt !== B.GLASS && !GLOW.has(nt)) continue;
      if (nt === t) continue;
      if (y === 0 && nrm[1] === -1) continue;
      const k = GLOW.has(t) ? 1 : sh;
      gb.quad(cs.map(c => [x + c[0], y + c[1], z + c[2]]), nrm, [col[0] * k, col[1] * k, col[2] * k]);
    }
  }
  return { solid: solid.data(), glow: glow.data() };
}

function spikeGeo(gb, world, x, y, z) {
  const ratio = world.structDamage(x, z);
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
